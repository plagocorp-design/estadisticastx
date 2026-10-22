import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { hoyBogota } from "@/lib/casos";
import { llevaProcesos, veElEquipo } from "@/lib/team.public";
import type { Bitacora, BitacoraDraft, ModoBitacora } from "@/lib/bitacora";
import { cambiosDe, textoPlano } from "@/lib/auditoria";

function fechaDe(fecha: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Fecha inválida");
  if (fecha > hoyBogota()) throw new Error("Ese día todavía no llega");
  return fecha;
}

function texto(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function numero(value: unknown) {
  const n = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(500, n));
}

function modoDe(value: unknown): ModoBitacora {
  return value === "calle" || value === "call" || value === "mixto" ? value : "";
}

export const listBitacoras = createServerFn({ method: "GET" })
  .validator((fecha: string) => fechaDe(fecha))
  .middleware([authMiddleware])
  .handler(async ({ context, data: fecha }): Promise<Bitacora[]> => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) return [];
    const sql = await getSql();
    const equipo = veElEquipo(profile.role);
    const rows = await sql.query<{
      owner_id: string;
      owner_name: string;
      slug: string;
      fecha: string;
      modo: string;
      zonas: string;
      llamadas: number;
      visitas: number;
      dijo_si: number;
      polizas: number;
      que_hizo: string;
      detalle_call: string;
      detalle_calle: string;
      trabas: string;
      manana: string;
    }>(
      `select b.owner_id, p.name as owner_name, p.slug, b.fecha, b.modo, b.zonas,
              b.llamadas, b.visitas, b.dijo_si, b.polizas, b.que_hizo, b.detalle_call, b.detalle_calle, b.trabas, b.manana
       from bitacoras b
       join profiles p on p.user_id = b.owner_id
       where b.fecha = $1 and ($2::boolean or b.owner_id = $3)
       order by p.name`,
      [fecha, equipo, context.userId],
    );
    return rows.map((row) => ({
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      slug: row.slug,
      fecha: row.fecha,
      modo: modoDe(row.modo),
      zonas: row.zonas,
      llamadas: Number(row.llamadas) || 0,
      visitas: Number(row.visitas) || 0,
      dijoSi: Number(row.dijo_si) || 0,
      polizas: Number(row.polizas) || 0,
      queHizo: row.que_hizo,
      detalleCall: row.detalle_call,
      detalleCalle: row.detalle_calle,
      trabas: row.trabas,
      manana: row.manana,
    }));
  });

export const listBitacorasRango = createServerFn({ method: "GET" })
  .validator((input: { desde: string; hasta: string }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.desde) || !/^\d{4}-\d{2}-\d{2}$/.test(input.hasta)) throw new Error("Fecha inválida");
    if (input.desde > input.hasta) throw new Error("El rango está al revés");
    return input;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<Bitacora[]> => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !veElEquipo(profile.role)) throw new Error("Los informes son de coordinación");
    const sql = await getSql();
    const rows = await sql.query<{
      owner_id: string;
      owner_name: string;
      slug: string;
      fecha: string;
      modo: string;
      zonas: string;
      llamadas: number;
      visitas: number;
      dijo_si: number;
      polizas: number;
      que_hizo: string;
      detalle_call: string;
      detalle_calle: string;
      trabas: string;
      manana: string;
    }>(
      `select b.owner_id, p.name as owner_name, p.slug, b.fecha, b.modo, b.zonas,
              b.llamadas, b.visitas, b.dijo_si, b.polizas, b.que_hizo, b.detalle_call, b.detalle_calle, b.trabas, b.manana
       from bitacoras b
       join profiles p on p.user_id = b.owner_id
       where b.fecha >= $1 and b.fecha <= $2
       order by b.fecha, p.name`,
      [data.desde, data.hasta],
    );
    return rows.map((row) => ({
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      slug: row.slug,
      fecha: row.fecha,
      modo: modoDe(row.modo),
      zonas: row.zonas,
      llamadas: Number(row.llamadas) || 0,
      visitas: Number(row.visitas) || 0,
      dijoSi: Number(row.dijo_si) || 0,
      polizas: Number(row.polizas) || 0,
      queHizo: row.que_hizo,
      detalleCall: row.detalle_call,
      detalleCalle: row.detalle_calle,
      trabas: row.trabas,
      manana: row.manana,
    }));
  });

export const guardarBitacora = createServerFn({ method: "POST" })
  .validator((input: BitacoraDraft) => ({
    ...input,
    fecha: fechaDe(input.fecha),
    modo: modoDe(input.modo),
    zonas: texto(input.zonas, 240),
    llamadas: numero(input.llamadas),
    visitas: numero(input.visitas),
    dijoSi: numero(input.dijoSi),
    polizas: numero(input.polizas),
    queHizo: texto(input.queHizo, 2000),
    detalleCall: texto(input.detalleCall, 2000),
    detalleCalle: texto(input.detalleCalle, 2000),
    trabas: texto(input.trabas, 1000),
    manana: texto(input.manana, 1000),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !llevaProcesos(profile.role)) throw new Error("La bitácora la escriben los asesores");
    const sql = await getSql();
    const previas = await sql.query<Record<string, unknown>>(
      `select modo, zonas, llamadas, visitas, dijo_si, polizas, que_hizo, detalle_call, detalle_calle, trabas, manana
       from bitacoras where owner_id = $1 and fecha = $2`,
      [context.userId, data.fecha],
    );
    await sql.query(
      `insert into bitacoras (
         owner_id, fecha, modo, zonas, llamadas, visitas, dijo_si, polizas, que_hizo, detalle_call, detalle_calle, trabas, manana, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
       on conflict (owner_id, fecha) do update set
         modo = excluded.modo,
         zonas = excluded.zonas,
         llamadas = excluded.llamadas,
         visitas = excluded.visitas,
         dijo_si = excluded.dijo_si,
         polizas = excluded.polizas,
         que_hizo = excluded.que_hizo,
         detalle_call = excluded.detalle_call,
         detalle_calle = excluded.detalle_calle,
         trabas = excluded.trabas,
         manana = excluded.manana,
         updated_at = now()`,
      [
        context.userId,
        data.fecha,
        data.modo,
        data.zonas,
        data.llamadas,
        data.visitas,
        data.dijoSi,
        data.polizas,
        data.queHizo,
        data.detalleCall,
        data.detalleCalle,
        data.trabas,
        data.manana,
      ],
    );
    const previa = previas[0];
    const cambio = previa
      ? cambiosDe([
          { label: "Dónde estuvo", antes: textoPlano(previa.modo), despues: data.modo },
          { label: "Zonas", antes: textoPlano(previa.zonas), despues: data.zonas },
          { label: "Llamadas", antes: textoPlano(previa.llamadas), despues: String(data.llamadas) },
          { label: "Visitas", antes: textoPlano(previa.visitas), despues: String(data.visitas) },
          { label: "Dijo sí", antes: textoPlano(previa.dijo_si), despues: String(data.dijoSi) },
          { label: "Pólizas", antes: textoPlano(previa.polizas), despues: String(data.polizas) },
          { label: "Qué hizo", antes: textoPlano(previa.que_hizo), despues: data.queHizo },
          { label: "Call", antes: textoPlano(previa.detalle_call), despues: data.detalleCall },
          { label: "Calle", antes: textoPlano(previa.detalle_calle), despues: data.detalleCalle },
          { label: "Trabas", antes: textoPlano(previa.trabas), despues: data.trabas },
          { label: "Mañana", antes: textoPlano(previa.manana), despues: data.manana },
        ])
      : null;
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: previa ? "edito" : "creo",
      entidad: "bitacora",
      entidadId: data.fecha,
      etiqueta: `${profile.name} ${data.fecha}`,
      detalle: !previa ? `Creó la bitácora del ${data.fecha}` : cambio?.hubo ? `Bitácora ${data.fecha}: ${cambio.detalle}` : "",
      antes: cambio?.antes,
      despues: cambio?.despues,
    });
    return { ok: true };
  });
