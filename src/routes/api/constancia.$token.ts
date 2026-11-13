import { createFileRoute } from "@tanstack/react-router";
import { constanciaPorToken } from "@/lib/firma.functions";

export const Route = createFileRoute("/api/constancia/$token")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = decodeURIComponent(new URL(request.url).pathname.split("/").pop() || "");
        const archivo = await constanciaPorToken(token);
        if (!archivo) return new Response("Todavía no hay una firma con ese enlace.", { status: 404 });
        const bytes = Buffer.from(archivo.base64, "base64");
        return new Response(bytes, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${archivo.nombre}"`,
          },
        });
      },
    },
  },
});
