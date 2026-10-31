import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { EventoAuditoria } from "@/lib/auditoria";
import { configura, veElEquipo } from "@/lib/team.public";

export const listAuditoria = createServerFn({ method: "GET" })
  .validator((input?: { antes?: number; entidad?: string; q?: string }) => input ?? {})
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<EventoAuditoria[]> => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !veElEquipo(profile.role)) throw new Error("El registro completo lo ve coordinación");
    const antes = Number(data.antes) || 0;
    const entidad = (data.entidad ?? "").slice(0, 40);
    const q = (data.q ?? "").trim().slice(0, 80);
    const sql = await getSql();
    const rows = await sql.query<{
      id: number;
      created_at: string;
      actor_name: string;
      actor_slug: string;
      accion: string;
      entidad: string;
      entidad_id: string;
      etiqueta: string;
      detalle: string;
      antes: string;
      despues: string;
    }>(
      `select id, created_at, actor_name, actor_slug, accion, entidad, entidad_id, etiqueta, detalle, antes, despues
       from auditoria
       where ($1 = 0 or id < $1)
         and ($2 = '' or entidad = $2)
         and ($3 = '' or detalle ilike $4 or etiqueta ilike $4 or actor_name ilike $4)
         and ($5::boolean or entidad <> 'clave')
       order by id desc
       limit 200`,
      [antes, entidad, q, `%${q}%`, configura(profile.role)],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      cuando: String(row.created_at),
      actor: row.actor_name,
      actorSlug: row.actor_slug,
      accion: row.accion,
      entidad: row.entidad,
      entidadId: row.entidad_id,
      etiqueta: row.etiqueta,
      detalle: row.detalle,
      antes: row.antes,
      despues: row.despues,
    }));
  });
