import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export type EstadoTarjetaOficial = {
  ok: boolean;
  estado: string;
  detalle: string;
  bloqueo: string;
};

function textoPlano(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function estadoDe(descripcion: string) {
  const bajo = descripcion.toLowerCase();
  if (!bajo) return "Sin estado";
  if (bajo.includes("entregad")) return "Entregada";
  if (bajo.includes("movilidad")) return "En movilidad";
  if (bajo.includes("vus") || /\bbus\b/.test(bajo)) return "En VUS";
  if (bajo.includes("radic")) return "Radicada";
  if (bajo.includes("exped")) return "Expedida";
  if (bajo.includes("impres")) return "Impresa";
  if (bajo.includes("proceso") || bajo.includes("tramite") || bajo.includes("trámite")) return "En trámite";
  return descripcion;
}

export const consultarTarjeta = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((placa: string) => placa)
  .handler(async ({ data }): Promise<EstadoTarjetaOficial> => {
    const placa = data.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (placa.length < 5) return { ok: false, estado: "", detalle: "La placa no está completa.", bloqueo: "" };
    let crudo = "";
    try {
      const respuesta = await fetch("https://www.taxislibres.com.co/intranet/to.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Referer: "https://www.taxislibres.com.co/intranet/estadoTo.php",
        },
        body: JSON.stringify({ placa }),
      });
      crudo = (await respuesta.text()).trim();
    } catch {
      return { ok: false, estado: "Sin respuesta", detalle: "No pude consultar la intranet de Taxis Libres.", bloqueo: "" };
    }
    if (!crudo) return { ok: false, estado: "Sin registro", detalle: "La intranet todavía no tiene esta placa.", bloqueo: "" };
    const inicio = crudo.indexOf("{");
    const fin = crudo.lastIndexOf("}");
    if (inicio >= 0 && fin > inicio) crudo = crudo.slice(inicio, fin + 1);
    let json: { descripcion?: unknown; bloqueo?: unknown; estadoblo?: unknown };
    try {
      json = JSON.parse(crudo) as { descripcion?: unknown; bloqueo?: unknown; estadoblo?: unknown };
    } catch {
      return { ok: false, estado: "Sin respuesta", detalle: "La intranet no contestó con un estado.", bloqueo: "" };
    }
    const detalle = textoPlano(json.descripcion);
    const codigo = textoPlano(json.estadoblo);
    const bloqueo = codigo ? textoPlano(json.bloqueo) : "";
    return { ok: Boolean(detalle), estado: estadoDe(detalle), detalle: detalle || "Sin estado", bloqueo };
  });
