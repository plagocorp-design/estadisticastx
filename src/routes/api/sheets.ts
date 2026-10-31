import { createFileRoute } from "@tanstack/react-router";
import { aplicarFilasSheets } from "@/lib/sheets.server";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/sheets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as {
          secret?: string;
          accion?: string;
          hoja?: string;
          fila?: Record<string, string>;
          filas?: Record<string, string>[];
        } | null;
        const filas = body?.accion === "filas" ? body.filas : body?.accion === "fila" && body.fila ? [body.fila] : null;
        if (!body?.secret || !body.hoja || !filas?.length) {
          return Response.json({ ok: false, error: "datos" }, { status: 400 });
        }
        const sql = await getSql();
        const rows = await sql.query<{ secret: string }>(`select secret from sheets_config where id = 1`);
        if (!rows[0] || rows[0].secret !== body.secret) {
          return Response.json({ ok: false, error: "clave" }, { status: 401 });
        }
        const resultado = await aplicarFilasSheets(body.hoja, filas);
        return Response.json(resultado);
      },
    },
  },
});
