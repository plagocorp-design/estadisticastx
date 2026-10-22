import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { veElEquipo } from "@/lib/team.public";

export const certificadoProceso = createServerFn({ method: "POST" })
  .validator((id: number) => {
    if (!Number.isFinite(id)) throw new Error("Proceso inválido");
    return id;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const sql = await getSql();
    const dueños = await sql.query<{ owner_id: string; placa: string }>(`select owner_id, placa from casos where id = $1`, [id]);
    const caso = dueños[0];
    if (!caso) throw new Error("No encontré ese proceso");
    if (!veElEquipo(profile.role) && caso.owner_id !== context.userId) throw new Error("Ese proceso no es tuyo");
    const { certificadoDe } = await import("./certificado.server");
    const archivo = await certificadoDe(id, profile);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "certifico",
      entidad: "proceso",
      entidadId: id,
      etiqueta: caso.placa,
      detalle: `Generó el certificado de auditoría ${archivo.codigo}`,
    });
    return archivo;
  });
