import { pendingMigrations } from "../../scripts/migration-plan.mjs";
import type { Sql } from "@/lib/db";
import { hoyBogota } from "@/lib/casos";

export type ResumenRespaldo = {
  tablas: number;
  filas: number;
  archivos: number;
  faltan: number;
};

function texto(valor: string) {
  let marca = "vl";
  while (valor.includes(`$${marca}$`)) marca += "x";
  return `$${marca}$${valor}$${marca}$`;
}

function literal(valor: unknown): string {
  if (valor == null) return "NULL";
  if (typeof valor === "boolean") return valor ? "TRUE" : "FALSE";
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : "NULL";
  if (typeof valor === "bigint") return valor.toString();
  if (valor instanceof Uint8Array) return `'\\x${Buffer.from(valor).toString("hex")}'`;
  if (valor instanceof Date) return texto(valor.toISOString());
  if (typeof valor === "object") return texto(JSON.stringify(valor));
  return texto(String(valor));
}

function identificador(nombre: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(nombre)) throw new Error("Tabla no válida");
  return `"${nombre}"`;
}

function tablaDe(reg: string) {
  const sinEsquema = reg.includes(".") ? reg.slice(reg.lastIndexOf(".") + 1) : reg;
  return sinEsquema.replace(/"/g, "");
}

function ordenDeInsercion(nombres: string[], fks: { child: string; parent: string }[]) {
  const pendientes = new Set(nombres);
  const padres = new Map<string, Set<string>>();
  for (const nombre of nombres) padres.set(nombre, new Set());
  for (const fk of fks) {
    const hijo = tablaDe(fk.child);
    const padre = tablaDe(fk.parent);
    if (hijo === padre || !pendientes.has(hijo) || !pendientes.has(padre)) continue;
    padres.get(hijo)?.add(padre);
  }
  const orden: string[] = [];
  while (pendientes.size) {
    const libres = [...pendientes]
      .filter((nombre) => [...(padres.get(nombre) ?? [])].every((padre) => !pendientes.has(padre)))
      .sort();
    if (!libres.length) {
      orden.push(...[...pendientes].sort());
      break;
    }
    for (const nombre of libres) {
      orden.push(nombre);
      pendientes.delete(nombre);
    }
  }
  return orden;
}

function esquema() {
  const archivos = import.meta.glob("/migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const piezas = ["-- Estructura. Sale de las migraciones, no de un SQL viejo."];
  for (const { name, path } of pendingMigrations(Object.keys(archivos), [])) {
    piezas.push(`-- ===== ${name} =====`);
    piezas.push(archivos[path] ?? "");
  }
  return piezas.join("\n");
}

export function nombreRespaldo() {
  return `vincula-libre-todo-${hoyBogota()}.sql`;
}

/** Un solo SQL: tablas vacías + cada fila + los PDF que estaban en la nube. */
export async function* lineasRespaldo(sql: Sql): AsyncGenerator<string, ResumenRespaldo> {
  const tablas = await sql.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`,
  );
  const nombres = tablas.map((tabla) => tabla.table_name).filter((nombre) => /^[a-z_][a-z0-9_]*$/i.test(nombre));
  const fks = await sql.query<{ child: string; parent: string }>(
    `select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent
     from pg_constraint c
     join pg_namespace n on n.oid = c.connamespace
     where c.contype = 'f' and n.nspname = 'public'`,
  );
  const orden = ordenDeInsercion(nombres, fks);
  const resumen: ResumenRespaldo = { tablas: orden.length, filas: 0, archivos: 0, faltan: 0 };
  yield [
    "-- Vincula Libre. Backup completo.",
    "-- Trae la estructura, los datos y los archivos que estaban en OBS o Drive.",
    "-- En una base vacía, con la connection string directa:",
    "--   psql \"postgresql://...\" -v ON_ERROR_STOP=1 -f este-archivo.sql",
    "-- Sirve si la última línea dice -- FIN. Si dice -- CORTE, no lo uses.",
    "",
    esquema(),
    "",
    "BEGIN;",
    orden.length ? `TRUNCATE ${orden.map(identificador).join(", ")} RESTART IDENTITY CASCADE;` : "-- sin tablas",
    "",
  ].join("\n") + "\n";

  const { leerDeDrive } = await import("./drive.server");
  for (const nombre of orden) {
    const filas = await sql.query<Record<string, unknown>>(`select * from ${identificador(nombre)}`);
    yield `-- ${nombre}: ${filas.length}\n`;
    resumen.filas += filas.length;
    for (const fila of filas) {
      if (nombre === "documentos") {
        const archivo = typeof fila.archivo === "string" ? fila.archivo.trim() : "";
        const drive = typeof fila.drive_id === "string" ? fila.drive_id.trim() : "";
        if (!archivo && drive) {
          let bajado = "";
          try {
            bajado = await leerDeDrive(drive);
          } catch {
            bajado = "";
          }
          if (bajado) {
            fila.archivo = bajado;
            resumen.archivos += 1;
          } else {
            resumen.faltan += 1;
            yield `-- FALTA documento ${String(fila.id ?? "")} ${drive}\n`;
          }
        }
      }
      const columnas = Object.keys(fila);
      if (!columnas.length) continue;
      const valores = columnas.map((columna) => literal(fila[columna]));
      yield `INSERT INTO ${identificador(nombre)} (${columnas.map(identificador).join(", ")}) VALUES (${valores.join(", ")});\n`;
    }
  }

  yield `
DO $$
DECLARE r record;
DECLARE seq text;
BEGIN
  FOR r IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_default LIKE 'nextval%'
  LOOP
    seq := pg_get_serial_sequence(format('%I.%I', 'public', r.table_name), r.column_name);
    IF seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I), 1), true)', seq, r.column_name, 'public', r.table_name);
    END IF;
  END LOOP;
END $$;
COMMIT;
`;
  return resumen;
}
