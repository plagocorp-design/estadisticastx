import { getSql } from "@/lib/db";

export type Actor = { user_id: string; slug: string; name: string };

export const ACTOR_SHEETS: Actor = { user_id: "sheets", slug: "sheets", name: "Google Sheets" };

export async function anotar(
  actor: Actor,
  evento: {
    accion: string;
    entidad: string;
    entidadId?: string | number;
    etiqueta?: string;
    detalle: string;
    antes?: string;
    despues?: string;
  },
) {
  const detalle = evento.detalle.trim();
  if (!detalle) return;
  try {
    const sql = await getSql();
    await sql.query(
      `insert into auditoria (actor_id, actor_slug, actor_name, accion, entidad, entidad_id, etiqueta, detalle, antes, despues)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        actor.user_id,
        actor.slug,
        actor.name,
        evento.accion,
        evento.entidad,
        String(evento.entidadId ?? ""),
        (evento.etiqueta ?? "").slice(0, 160),
        detalle,
        evento.antes ?? "",
        evento.despues ?? "",
      ],
    );
  } catch (err) {
    console.error("auditoria", err);
  }
}
