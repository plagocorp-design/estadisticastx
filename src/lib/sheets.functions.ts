import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { APPS_SCRIPT } from "@/lib/sheets.script";
import { configura } from "@/lib/team.public";

function callbackDe() {
  const req = getRequest();
  const origin = req.headers.get("origin");
  if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/$/, "");
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      /* sigue con el host */
    }
  }
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || "";
  return `${proto}://${host}`;
}

export const estadoSheetsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const { estadoSheets } = await import("./sheets.server");
    const estado = await estadoSheets();
    return { ...estado, script: configura(profile.role) ? APPS_SCRIPT : "" };
  });

export const conectarSheetsFn = createServerFn({ method: "POST" })
  .validator((input: { webappUrl: string; spreadsheetUrl: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !configura(profile.role)) throw new Error("Solo David configura el documento");
    const { conectarSheets } = await import("./sheets.server");
    const listo = await conectarSheets(data.webappUrl, data.spreadsheetUrl, callbackDe());
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, { accion: "conecto", entidad: "sheets", etiqueta: "Documento", detalle: "Conectó el documento de Google Sheets" });
    return listo;
  });

export const traerSheetsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) return { cambios: 0, conectado: false, error: "", spreadsheetUrl: "" };
    const { traerSheets } = await import("./sheets.server");
    const resultado = await traerSheets();
    if (resultado.cambios > 0) {
      const { anotar } = await import("./auditoria.server");
      await anotar(profile, {
        accion: "trajo",
        entidad: "sheets",
        etiqueta: "Documento",
        detalle: `Trajo ${resultado.cambios} cambio${resultado.cambios === 1 ? "" : "s"} desde Google Sheets`,
      });
    }
    return resultado;
  });

export const enviarSheetsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !configura(profile.role)) throw new Error("Solo David envía el documento");
    const { escribirSheets } = await import("./sheets.server");
    await escribirSheets();
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, { accion: "envio", entidad: "sheets", etiqueta: "Documento", detalle: "Envió los datos al documento de Google Sheets" });
    return { ok: true };
  });
