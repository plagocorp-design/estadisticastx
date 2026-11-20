import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { UnauthorizedError, requireUserId } from "@/lib/auth/verify.server";
import { lineasRespaldo, nombreRespaldo } from "@/lib/respaldo.functions";

export const Route = createFileRoute("/api/respaldo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || undefined;
          const userId = await requireUserId(bearer);
          const { profileFor } = await import("@/lib/team.server");
          const profile = await profileFor(userId);
          if (!profile || (profile.role !== "lider" && profile.role !== "gerencia")) {
            return new Response("Solo el líder descarga el backup completo", { status: 403 });
          }
          const sql = await getSql();
          const encoder = new TextEncoder();
          const cuerpo = new ReadableStream({
            async start(controller) {
              const gen = lineasRespaldo(sql);
              try {
                let resumen = { tablas: 0, filas: 0, archivos: 0, faltan: 0 };
                while (true) {
                  const paso = await gen.next();
                  if (paso.done) {
                    resumen = paso.value;
                    break;
                  }
                  controller.enqueue(encoder.encode(paso.value));
                }
                const { anotar } = await import("@/lib/auditoria.server");
                await anotar(profile, {
                  accion: "exporto",
                  entidad: "proceso",
                  detalle: `Descargó el backup completo: ${resumen.tablas} tablas, ${resumen.filas} filas, ${resumen.archivos} archivos, ${resumen.faltan} sin leer`,
                  etiqueta: "SQL",
                });
                controller.enqueue(
                  encoder.encode(
                    `-- FIN ${resumen.tablas} tablas, ${resumen.filas} filas, ${resumen.archivos} archivos, ${resumen.faltan} sin leer\n`,
                  ),
                );
              } catch (err) {
                const mensaje = err instanceof Error ? err.message : "error";
                controller.enqueue(encoder.encode(`\n-- CORTE ${mensaje.replace(/\s+/g, " ").slice(0, 300)}\n`));
              } finally {
                controller.close();
              }
            },
          });
          return new Response(cuerpo, {
            headers: {
              "Content-Type": "application/sql; charset=utf-8",
              "Content-Disposition": `attachment; filename="${nombreRespaldo()}"`,
              "Cache-Control": "no-store",
            },
          });
        } catch (err) {
          if (err instanceof UnauthorizedError) return new Response("Entra con tu usuario", { status: 401 });
          const mensaje = err instanceof Error ? err.message : "No pude armar el backup";
          return new Response(mensaje, { status: 500 });
        }
      },
    },
  },
});
