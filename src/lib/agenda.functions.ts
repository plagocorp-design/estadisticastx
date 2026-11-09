import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { esTipoAgenda, etiquetaTipo, HASTA_DISTINTIVOS, HORAS_DISTINTIVO, type AgendaDraft, type AgendaItem, type TipoAgenda } from "@/lib/agenda";
import { ESTADOS_DISTINTIVO, FESTIVOS_2026 } from "@/lib/callcenter";
import { cambiosDe, textoPlano } from "@/lib/auditoria";
import { veElEquipo } from "@/lib/team.public";

type AgendaRow = {
  id: number;
  owner_id: string;
  owner_name: string;
  owner_slug: string;
  caso_id: number | null;
  placa: string;
  cliente: string;
  tipo: string;
  titulo: string;
  fecha: string;
  hora: string;
  nota: string;
  hecho: boolean;
  placa_agenda: string;
  conductor: string;
  cedula: string;
  promotor: string;
  estado: string;
};

function toItem(row: AgendaRow): AgendaItem {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    ownerSlug: row.owner_slug,
    casoId: row.caso_id,
    placa: row.placa_agenda || row.placa || "",
    cliente: row.cliente ?? "",
    tipo: (esTipoAgenda(row.tipo) ? row.tipo : "otro") as TipoAgenda,
    titulo: row.titulo,
    fecha: row.fecha,
    hora: row.hora ?? "",
    nota: row.nota ?? "",
    hecho: Boolean(row.hecho),
    conductor: row.conductor ?? "",
    cedula: row.cedula ?? "",
    promotor: row.promotor ?? "",
    estado: row.estado ?? "",
  };
}

const SELECT = `
  select a.id, a.owner_id, p.name as owner_name, p.slug as owner_slug,
         a.caso_id, coalesce(c.nombre, '') as cliente,
         a.tipo, a.titulo, a.fecha, a.hora, a.nota, a.hecho,
         coalesce(nullif(a.placa, ''), c.placa, '') as placa,
         coalesce(a.placa, '') as placa_agenda, coalesce(a.conductor, '') as conductor,
         coalesce(a.cedula, '') as cedula, coalesce(a.promotor, '') as promotor, coalesce(a.estado, '') as estado
  from agenda a
  join profiles p on p.user_id = a.owner_id
  left join casos c on c.id = a.caso_id
`;

function clean(value: string, max: number) {
  return value.trim().slice(0, max);
}

function datos(input: AgendaDraft) {
  if (!esTipoAgenda(input.tipo)) throw new Error("Elige visita, llamada, escribir u otra");
  const fecha = clean(input.fecha, 10);
  const hora = clean(input.hora, 5);
  let titulo = clean(input.titulo, 120);
  const nota = clean(input.nota, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Pon la fecha");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error("Pon la hora");
  const casoId = input.casoId && input.casoId > 0 ? input.casoId : null;
  const placa = clean(input.placaLibre ?? "", 8).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const conductor = clean(input.conductor ?? "", 120);
  const cedula = clean(input.cedula ?? "", 20).replace(/\D/g, "");
  const promotor = clean(input.promotor ?? "", 120);
  let estado = clean(input.estado ?? "", 40);
  let hecho = Boolean(input.hecho);
  if (input.tipo === "distintivos") {
    if (fecha > HASTA_DISTINTIVOS) throw new Error("Los distintivos van hasta el 31 de diciembre de 2026");
    const festivo = FESTIVOS_2026[fecha];
    if (festivo) throw new Error(`Ese día es festivo (${festivo}). No se agenda.`);
    if (!HORAS_DISTINTIVO.includes(hora)) throw new Error("La hora va de 10:00 a 16:30, cada media hora");
    if (!placa && !conductor) throw new Error("Pon la placa o el conductor");
    if (!(ESTADOS_DISTINTIVO as readonly string[]).includes(estado)) estado = "Programados";
    if (hecho || estado === "Instalado") {
      estado = "Instalado";
      hecho = true;
    } else if (estado === "Instalado") {
      estado = "Programados";
    }
    if (!titulo) titulo = `Distintivos ${placa || conductor}`.slice(0, 120);
  } else if (!titulo) {
    throw new Error("Escribe qué hay que hacer");
  }
  return { tipo: input.tipo, fecha, hora, titulo, nota, casoId, hecho, placa, conductor, cedula, promotor, estado };
}

async function asesorId(slug: string) {
  const sql = await getSql();
  const rows = await sql.query<{ user_id: string }>(
    `select user_id from profiles where slug = $1 and role in ('asesor', 'lider') limit 1`,
    [slug],
  );
  if (!rows[0]) throw new Error("Elige el asesor");
  return rows[0].user_id;
}

async function casoDe(id: number) {
  const sql = await getSql();
  const rows = await sql.query<{ id: number; owner_id: string }>(
    `select id, owner_id from casos where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export const listAgenda = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AgendaItem[]> => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) return [];
    const sql = await getSql();
    const ciudad = profile.role === "gerencia" ? (profile.ciudad_vista ?? 0) : (profile.ciudad_id ?? 1);
    const rows =
      veElEquipo(profile.role)
        ? await sql.query<AgendaRow>(`${SELECT} where coalesce(p.ciudad_id, 1) = $1 order by a.fecha asc, a.hora asc, a.id asc`, [ciudad])
        : await sql.query<AgendaRow>(`${SELECT} where a.owner_id = $1 order by a.fecha asc, a.hora asc, a.id asc`, [
            context.userId,
          ]);
    return rows.map(toItem);
  });

export const saveAgenda = createServerFn({ method: "POST" })
  .validator((input: AgendaDraft) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const item = datos(data);
    const promotor = item.promotor || (item.tipo === "distintivos" ? profile.name : "");
    const sql = await getSql();

    let ownerId = context.userId;
    if (veElEquipo(profile.role)) ownerId = await asesorId(data.ownerSlug ?? "");
    if (item.casoId) {
      const caso = await casoDe(item.casoId);
      if (!caso) throw new Error("Ese proceso ya no está");
      if (!veElEquipo(profile.role) && caso.owner_id !== context.userId) {
        throw new Error("Ese proceso no es tuyo");
      }
      ownerId = caso.owner_id;
    }

    if (data.id) {
      const actuales = await sql.query<{ owner_id: string; tipo: string; titulo: string; fecha: string; hora: string; nota: string; hecho: boolean; caso_id: number | null }>(
        `select owner_id, tipo, titulo, fecha, hora, nota, hecho, caso_id from agenda where id = $1`,
        [data.id],
      );
      const actual = actuales[0];
      if (!actual) throw new Error("No encontré esa gestión");
      if (!veElEquipo(profile.role) && actual.owner_id !== context.userId) {
        throw new Error("Esa gestión no es tuya");
      }
      await sql.query(
        `update agenda
         set owner_id = $2, caso_id = $3, tipo = $4, titulo = $5, fecha = $6, hora = $7, nota = $8, hecho = $9,
             placa = $10, conductor = $11, cedula = $12, promotor = $13, estado = $14, updated_at = now()
         where id = $1`,
        [data.id, ownerId, item.casoId, item.tipo, item.titulo, item.fecha, item.hora, item.nota, item.hecho, item.placa, item.conductor, item.cedula, promotor, item.estado],
      );
      const cambio = cambiosDe([
        { label: "Tipo", antes: etiquetaTipo(esTipoAgenda(actual.tipo) ? actual.tipo : "otro"), despues: etiquetaTipo(item.tipo) },
        { label: "Título", antes: textoPlano(actual.titulo), despues: item.titulo },
        { label: "Fecha", antes: textoPlano(actual.fecha).slice(0, 10), despues: item.fecha },
        { label: "Hora", antes: textoPlano(actual.hora).slice(0, 5), despues: item.hora },
        { label: "Nota", antes: textoPlano(actual.nota), despues: item.nota },
        { label: "Hecho", antes: actual.hecho ? "Sí" : "No", despues: item.hecho ? "Sí" : "No" },
      ]);
      if (cambio.hubo) {
        const { anotar } = await import("./auditoria.server");
        await anotar(profile, {
          accion: "edito",
          entidad: "agenda",
          entidadId: data.id,
          etiqueta: item.titulo,
          detalle: cambio.detalle,
          antes: cambio.antes,
          despues: cambio.despues,
        });
      }
      const { notificarSheets } = await import("./sheets.server");
      await notificarSheets();
      return { id: data.id };
    }

    const rows = await sql.query<{ id: number }>(
      `insert into agenda (owner_id, caso_id, tipo, titulo, fecha, hora, nota, hecho, placa, conductor, cedula, promotor, estado)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       returning id`,
      [ownerId, item.casoId, item.tipo, item.titulo, item.fecha, item.hora, item.nota, item.hecho, item.placa, item.conductor, item.cedula, promotor, item.estado],
    );
    const nuevoId = rows[0]?.id ?? 0;
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "creo",
      entidad: "agenda",
      entidadId: nuevoId,
      etiqueta: item.titulo,
      detalle: `Agendó ${etiquetaTipo(item.tipo)}: ${item.titulo} el ${item.fecha} a las ${item.hora}`,
    });
    const { notificarSheets } = await import("./sheets.server");
    await notificarSheets();
    return { id: nuevoId };
  });

export const removeAgenda = createServerFn({ method: "POST" })
  .validator((id: number) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const sql = await getSql();
    const rows = await sql.query<{ owner_id: string; titulo: string; fecha: string }>(`select owner_id, titulo, fecha from agenda where id = $1`, [id]);
    const row = rows[0];
    if (!row) throw new Error("No encontré esa gestión");
    if (!veElEquipo(profile.role) && row.owner_id !== context.userId) {
      throw new Error("Esa gestión no es tuya");
    }
    await sql.query(`delete from agenda where id = $1`, [id]);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "borro",
      entidad: "agenda",
      entidadId: id,
      etiqueta: row.titulo,
      detalle: `Borró de la agenda «${row.titulo}» del ${String(row.fecha).slice(0, 10)}`,
    });
    const { notificarSheets } = await import("./sheets.server");
    await notificarSheets();
    return { ok: true };
  });
