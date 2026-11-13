import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { hoyBogota } from "@/lib/casos";

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

export const exportarSql = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || (profile.role !== "lider" && profile.role !== "gerencia")) {
      throw new Error("Solo el líder descarga la base completa");
    }
    const sql = await getSql();
    const tablas = await sql.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`,
    );
    const nombres = tablas.map((tabla) => tabla.table_name).filter((nombre) => /^[a-z_][a-z0-9_]*$/i.test(nombre));
    const lineas: string[] = [
      "-- Vincula Libre. Respaldo completo, con PDF, firmas, llamadas, usuarios y lo demás.",
      "-- Primero carga vincula-libre-estructura.sql en una base vacía.",
      "-- Después corre este archivo con el usuario dueño de las tablas.",
      "BEGIN;",
      "SET session_replication_role = replica;",
      `TRUNCATE ${nombres.map(identificador).join(", ")} RESTART IDENTITY CASCADE;`,
    ];
    let filasTotal = 0;
    for (const nombre of nombres) {
      const filas = await sql.query<Record<string, unknown>>(`select * from ${identificador(nombre)}`);
      filasTotal += filas.length;
      lineas.push(`-- ${nombre}: ${filas.length}`);
      for (const fila of filas) {
        const columnas = Object.keys(fila);
        if (!columnas.length) continue;
        const valores = columnas.map((columna) => literal(fila[columna]));
        lineas.push(
          `INSERT INTO ${identificador(nombre)} (${columnas.map(identificador).join(", ")}) VALUES (${valores.join(", ")});`,
        );
      }
    }
    lineas.push(`
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
END $$;`);
    lineas.push("SET session_replication_role = origin;");
    lineas.push("COMMIT;");
    const cuerpo = lineas.join("\n");
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "exporto",
      entidad: "proceso",
      detalle: `Descargó la base completa: ${nombres.length} tablas, ${filasTotal} filas`,
      etiqueta: "SQL",
    });
    return {
      filename: `vincula-libre-datos-${hoyBogota()}.sql`,
      base64: Buffer.from(cuerpo, "utf8").toString("base64"),
    };
  });
