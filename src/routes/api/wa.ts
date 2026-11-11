import { createFileRoute } from "@tanstack/react-router";
import { recibirWhatsapp } from "@/lib/wa.server";

export const Route = createFileRoute("/api/wa")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as Parameters<typeof recibirWhatsapp>[0];
        const resultado = await recibirWhatsapp(body);
        return Response.json(resultado, { status: resultado.ok ? 200 : 400 });
      },
    },
  },
});
