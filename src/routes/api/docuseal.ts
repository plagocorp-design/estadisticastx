import { createFileRoute } from "@tanstack/react-router";
import { guardarFirmaDocuseal } from "@/lib/firma.functions";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/docuseal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as {
          event_type?: string;
          data?: { id?: number; submission_id?: number };
        } | null;
        const evento = String(body?.event_type ?? "");
        const data = body?.data;
        const envio = evento.startsWith("form.") ? data?.submission_id : data?.id ?? data?.submission_id;
        if (!envio) return Response.json({ ok: false }, { status: 400 });
        const sql = await getSql();
        const rows = await sql.query<{ id: number }>(`select id from casos where docuseal_id = $1`, [String(envio)]);
        if (!rows[0]) return Response.json({ ok: true, ignorado: true });
        const resultado = await guardarFirmaDocuseal(rows[0].id);
        return Response.json({ ok: true, ...resultado, contrato: undefined, auditoria: undefined });
      },
    },
  },
});
