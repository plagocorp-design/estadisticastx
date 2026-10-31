import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { casosDeArea, toCaso, type CasoRow } from "@/lib/casos";
import { CASO_COLS } from "@/lib/casos.functions";
import { esBandeja, manoDeRol, veElEquipo } from "@/lib/team.public";

export type Mensaje = {
  id: number;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  hora: string;
};

export type ChatResumen = {
  casoId: number;
  sinLeer: number;
  ultimo: string;
  ultimoDe: string;
  esperaAsesor: boolean;
};

async function casoVisible(userId: string, role: string, casoId: number) {
  const sql = await getSql();
  if (esBandeja(role)) {
    const rows = await sql.query<CasoRow>(
      `select ${CASO_COLS} from casos c join profiles p on p.user_id = c.owner_id where c.id = $1`,
      [casoId],
    );
    const caso = rows[0] ? toCaso(rows[0]) : null;
    if (!caso || casosDeArea([caso], role).length === 0) return null;
    return { id: caso.id, owner_id: caso.ownerId, placa: caso.placa };
  }
  const rows = await sql.query<{ id: number; owner_id: string; placa: string }>(
    veElEquipo(role)
      ? `select id, owner_id, placa from casos where id = $1`
      : `select id, owner_id, placa from casos where id = $1 and owner_id = $2`,
    veElEquipo(role) ? [casoId] : [casoId, userId],
  );
  return rows[0] ?? null;
}

export const resumenChat = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ChatResumen[]> => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) return [];
    const sql = await getSql();
    const equipo = veElEquipo(profile.role);
    const mano = manoDeRol(profile.role);
    const ultimos = await sql.query<{
      caso_id: number;
      body: string;
      author_id: string;
      ultimo_de: string;
      owner_id: string;
    }>(
      `select distinct on (m.caso_id)
         m.caso_id, m.body, m.author_id, p.name as ultimo_de, c.owner_id
       from mensajes m
       join casos c on c.id = m.caso_id
       join profiles p on p.user_id = m.author_id
       where ($1::boolean or ($3 <> '' and c.mano = $3) or ($3 = '' and c.owner_id = $2))
       order by m.caso_id, m.created_at desc, m.id desc`,
      [equipo, context.userId, mano],
    );
    const noLeidos = await sql.query<{ caso_id: number; sin_leer: number }>(
      `select m.caso_id, count(*)::int as sin_leer
       from mensajes m
       join casos c on c.id = m.caso_id
       left join chat_visto v on v.caso_id = m.caso_id and v.user_id = $2
       where m.author_id <> $2
         and m.created_at > coalesce(v.visto_at, '1970-01-01'::timestamptz)
         and ($1::boolean or ($3 <> '' and c.mano = $3) or ($3 = '' and c.owner_id = $2))
       group by m.caso_id`,
      [equipo, context.userId, mano],
    );
    const porCaso = new Map(noLeidos.map((row) => [Number(row.caso_id), Number(row.sin_leer)]));
    return ultimos.map((row) => ({
      casoId: Number(row.caso_id),
      sinLeer: porCaso.get(Number(row.caso_id)) ?? 0,
      ultimo: row.body,
      ultimoDe: row.ultimo_de,
      esperaAsesor: row.author_id !== row.owner_id,
    }));
  });

export const listMensajes = createServerFn({ method: "POST" })
  .validator((casoId: number) => casoId)
  .middleware([authMiddleware])
  .handler(async ({ context, data: casoId }): Promise<Mensaje[]> => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const caso = await casoVisible(context.userId, profile.role, casoId);
    if (!caso) throw new Error("No encontré ese proceso");
    const sql = await getSql();
    const rows = await sql.query<{
      id: number;
      author_id: string;
      author_name: string;
      author_role: string;
      body: string;
      hora: string;
    }>(
      `select m.id, m.author_id, p.name as author_name, p.role as author_role, m.body,
              to_char(m.created_at at time zone 'America/Bogota', 'DD/MM HH24:MI') as hora
       from mensajes m
       join profiles p on p.user_id = m.author_id
       where m.caso_id = $1
       order by m.created_at asc, m.id asc`,
      [casoId],
    );
    await sql.query(
      `insert into chat_visto (caso_id, user_id, visto_at)
       values ($1, $2, now())
       on conflict (caso_id, user_id) do update set visto_at = now()`,
      [casoId, context.userId],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      authorId: row.author_id,
      authorName: row.author_name,
      authorRole: row.author_role,
      body: row.body,
      hora: row.hora,
    }));
  });

export const enviarMensaje = createServerFn({ method: "POST" })
  .validator((input: { casoId: number; body: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const caso = await casoVisible(context.userId, profile.role, data.casoId);
    if (!caso) throw new Error("No encontré ese proceso");
    const body = data.body.trim().slice(0, 500);
    if (!body) throw new Error("Escribe el mensaje");
    const sql = await getSql();
    const rows = await sql.query<{ id: number }>(
      `insert into mensajes (caso_id, author_id, body) values ($1, $2, $3) returning id`,
      [data.casoId, context.userId, body],
    );
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "escribio",
      entidad: "chat",
      entidadId: data.casoId,
      etiqueta: caso.placa,
      detalle: `Escribió en el chat de ${caso.placa}: ${body}`,
      despues: body,
    });
    await sql.query(
      `insert into chat_visto (caso_id, user_id, visto_at)
       values ($1, $2, now())
       on conflict (caso_id, user_id) do update set visto_at = now()`,
      [data.casoId, context.userId],
    );
    return { id: Number(rows[0]?.id ?? 0) };
  });

export const marcarChatsLeidos = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const sql = await getSql();
    const mano = manoDeRol(profile.role);
    await sql.query(
      `insert into chat_visto (caso_id, user_id, visto_at)
       select distinct m.caso_id, $2, now()
       from mensajes m
       join casos c on c.id = m.caso_id
       where ($1::boolean or ($3 <> '' and c.mano = $3) or ($3 = '' and c.owner_id = $2))
       on conflict (caso_id, user_id) do update set visto_at = now()`,
      [veElEquipo(profile.role), context.userId, mano],
    );
    return { ok: true };
  });
