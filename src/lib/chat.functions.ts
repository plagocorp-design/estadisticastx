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
  urgente: boolean;
  privado: boolean;
  paraNombre: string;
  paraMi: boolean;
};

export type ChatResumen = {
  casoId: number;
  sinLeer: number;
  ultimo: string;
  ultimoDe: string;
  esperaAsesor: boolean;
  urgente: boolean;
};

export type PersonaChat = {
  slug: string;
  name: string;
  role: string;
};

async function columnasChat() {
  const sql = await getSql();
  await sql.query(`alter table mensajes add column if not exists urgente integer not null default 0`);
  await sql.query(`alter table mensajes add column if not exists privado integer not null default 0`);
  await sql.query(`alter table mensajes add column if not exists para_id text not null default ''`);
  return sql;
}

async function casoVisible(userId: string, role: string, casoId: number) {
  const sql = await columnasChat();
  if (esBandeja(role)) {
    const rows = await sql.query<CasoRow>(
      `select ${CASO_COLS} from casos c join profiles p on p.user_id = c.owner_id where c.id = $1`,
      [casoId],
    );
    const caso = rows[0] ? toCaso(rows[0]) : null;
    if (!caso) return null;
    if (casosDeArea([caso], role).length > 0) return { id: caso.id, owner_id: caso.ownerId, placa: caso.placa };
    const llamado = await sql.query<{ id: number }>(
      `select id from mensajes where caso_id = $1 and para_id = $2 limit 1`,
      [casoId, userId],
    );
    if (!llamado[0]) return null;
    return { id: caso.id, owner_id: caso.ownerId, placa: caso.placa };
  }
  const rows = await sql.query<{ id: number; owner_id: string; placa: string }>(
    veElEquipo(role)
      ? `select id, owner_id, placa from casos where id = $1`
      : `select id, owner_id, placa from casos where id = $1 and (
           owner_id = $2
           or exists (select 1 from mensajes m where m.caso_id = casos.id and m.para_id = $2)
         )`,
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
    const sql = await columnasChat();
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
       where (
           $1::boolean
           or ($3 <> '' and c.mano = $3)
           or ($3 = '' and c.owner_id = $2)
           or m.para_id = $2
         )
         and (m.privado = 0 or m.author_id = $2 or m.para_id = $2)
       order by m.caso_id, m.created_at desc, m.id desc`,
      [equipo, context.userId, mano],
    );
    const noLeidos = await sql.query<{ caso_id: number; sin_leer: number; urgente: boolean }>(
      `select m.caso_id, count(*)::int as sin_leer,
              bool_or(m.urgente = 1 and m.para_id = $2) as urgente
       from mensajes m
       join casos c on c.id = m.caso_id
       left join chat_visto v on v.caso_id = m.caso_id and v.user_id = $2
       where m.author_id <> $2
         and m.created_at > coalesce(v.visto_at, '1970-01-01'::timestamptz)
         and (m.privado = 0 or m.para_id = $2)
         and (
           $1::boolean
           or ($3 <> '' and c.mano = $3)
           or ($3 = '' and c.owner_id = $2)
           or m.para_id = $2
         )
       group by m.caso_id`,
      [equipo, context.userId, mano],
    );
    const porCaso = new Map(noLeidos.map((row) => [Number(row.caso_id), row]));
    return ultimos.map((row) => {
      const aviso = porCaso.get(Number(row.caso_id));
      return {
        casoId: Number(row.caso_id),
        sinLeer: aviso ? Number(aviso.sin_leer) : 0,
        ultimo: row.body,
        ultimoDe: row.ultimo_de,
        esperaAsesor: row.author_id !== row.owner_id,
        urgente: aviso?.urgente === true || Number(aviso?.urgente) === 1,
      };
    });
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
    const sql = await columnasChat();
    const rows = await sql.query<{
      id: number;
      author_id: string;
      author_name: string;
      author_role: string;
      body: string;
      hora: string;
      urgente: number;
      privado: number;
      para_id: string;
      para_nombre: string;
    }>(
      `select m.id, m.author_id, p.name as author_name, p.role as author_role, m.body,
              to_char(m.created_at at time zone 'America/Bogota', 'DD/MM HH24:MI') as hora,
              m.urgente, m.privado, m.para_id, coalesce(para.name, '') as para_nombre
       from mensajes m
       join profiles p on p.user_id = m.author_id
       left join profiles para on para.user_id = m.para_id
       where m.caso_id = $1
         and (m.privado = 0 or m.author_id = $2 or m.para_id = $2)
       order by m.created_at asc, m.id asc`,
      [casoId, context.userId],
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
      urgente: Number(row.urgente) === 1,
      privado: Number(row.privado) === 1,
      paraNombre: row.para_nombre,
      paraMi: row.para_id === context.userId,
    }));
  });

export const enviarMensaje = createServerFn({ method: "POST" })
  .validator((input: { casoId: number; body: string; privado?: boolean; paraSlug?: string }) => ({
    casoId: Number(input.casoId),
    body: String(input.body ?? ""),
    privado: Boolean(input.privado),
    paraSlug: String(input.paraSlug ?? "").trim().toLowerCase(),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const caso = await casoVisible(context.userId, profile.role, data.casoId);
    if (!caso) throw new Error("No encontré ese proceso");
    const body = data.body.trim().slice(0, 500);
    if (!body) throw new Error("Escribe el mensaje");
    const sql = await columnasChat();
    const ciudad = profile.role === "gerencia" ? profile.ciudad_vista || profile.ciudad_id || 1 : profile.ciudad_id || 1;
    const gente = await sql.query<{ user_id: string; slug: string; name: string }>(
      `select user_id, slug, name from profiles
       where user_id <> $1 and coalesce(ciudad_id, ciudad_vista, 1) = $2
       order by length(slug) desc`,
      [context.userId, ciudad],
    );
    const para = personaMencionada(body, gente, data.paraSlug);
    if (data.privado && !para) throw new Error("Un privado necesita a quién. Elige a la persona o escribe @ y su nombre.");
    if (data.paraSlug && !para) throw new Error("Esa persona no está en tu ciudad");
    const rows = await sql.query<{ id: number }>(
      `insert into mensajes (caso_id, author_id, body, urgente, privado, para_id)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [data.casoId, context.userId, body, para ? 1 : 0, data.privado ? 1 : 0, para?.user_id ?? ""],
    );
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "escribio",
      entidad: "chat",
      entidadId: data.casoId,
      etiqueta: caso.placa,
      detalle: `${data.privado ? "Escribió en privado" : "Escribió"} en el chat de ${caso.placa}${para ? ` y llamó a ${para.name}` : ""}: ${body}`,
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

function sinTilde(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function personaMencionada(
  body: string,
  gente: { user_id: string; slug: string; name: string }[],
  paraSlug: string,
) {
  if (paraSlug) {
    const directa = gente.find((persona) => sinTilde(persona.slug) === sinTilde(paraSlug));
    if (directa) return directa;
  }
  const texto = sinTilde(body);
  return gente.find((persona) => {
    const slug = sinTilde(persona.slug);
    if (slug && texto.includes(`@${slug}`)) return true;
    return sinTilde(persona.name)
      .split(/\s+/)
      .filter((palabra) => palabra.length >= 3)
      .some((palabra) => texto.includes(`@${palabra}`));
  });
}

export const listGenteChat = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PersonaChat[]> => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) return [];
    const sql = await getSql();
    const ciudad = profile.role === "gerencia" ? profile.ciudad_vista || profile.ciudad_id || 1 : profile.ciudad_id || 1;
    const rows = await sql.query<PersonaChat>(
      `select slug, name, role from profiles
       where user_id <> $1 and role <> 'gerencia' and coalesce(ciudad_id, 1) = $2
       order by name`,
      [context.userId, ciudad],
    );
    return rows;
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
