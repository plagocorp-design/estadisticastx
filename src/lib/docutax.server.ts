import { readFile } from "node:fs/promises";

const BASE = "https://docutax.grok.me";

async function credenciales() {
  const deArchivo: Record<string, string> = {};
  try {
    const crudo = await readFile("/workspace/.env", "utf8");
    for (const linea of crudo.split("\n")) {
      const corte = linea.indexOf("=");
      if (corte < 1 || linea.startsWith("#")) continue;
      deArchivo[linea.slice(0, corte)] = linea.slice(corte + 1).replace(/^"|"$/g, "");
    }
  } catch {
    /* en el servidor publicado las claves vienen del entorno */
  }
  const leer = (clave: string) => (process.env[clave] || deArchivo[clave] || "").trim();
  const key = leer("DOCUTAX_API_KEY");
  const base = (leer("DOCUTAX_BASE_URL") || BASE).replace(/\/$/, "");
  if (!key) throw new Error("Falta la llave de DocuTax");
  return { key, base };
}

type Firmante = { name: string; email: string; role?: string; phone?: string };
type SobreCreado = {
  id: string;
  status: string;
  signers: { name: string; email: string; signing_url?: string; signing_path?: string }[];
};

async function pedir(ruta: string, init?: RequestInit) {
  const dato = await credenciales();
  const respuesta = await fetch(`${dato.base}${ruta}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${dato.key}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  return respuesta;
}

export async function crearSobreDocutax(input: {
  title: string;
  body: string;
  signers: Firmante[];
  sendEmail: boolean;
}) {
  const cuerpo = input.body.trim();
  if (cuerpo.length < 20) throw new Error("El texto para firmar quedó muy corto");
  const respuesta = await pedir("/api/v1/envelopes", {
    method: "POST",
    body: JSON.stringify({
      title: input.title.slice(0, 140),
      body: cuerpo,
      signers: input.signers.map((parte) => ({
        name: parte.name,
        email: parte.email,
        role: parte.role || "Propietario",
        ...(parte.phone ? { phone: parte.phone } : {}),
      })),
      send_email: input.sendEmail,
      send_sms: false,
      expires_in_days: 15,
    }),
  });
  const json = (await respuesta.json()) as SobreCreado & { error?: { message?: string } };
  if (!respuesta.ok || !json.id) throw new Error(json.error?.message || "DocuTax no abrió el sobre");
  return {
    id: json.id,
    status: json.status,
    partes: (json.signers || []).map((parte) => ({
      correo: parte.email,
      enlace: parte.signing_url || (parte.signing_path ? `${BASE}${parte.signing_path}` : ""),
    })),
  };
}

export async function leerSobreDocutax(id: string) {
  const respuesta = await pedir(`/api/v1/envelopes/${encodeURIComponent(id)}`);
  const json = (await respuesta.json()) as {
    id?: string;
    status?: string;
    sealedAt?: string | null;
    signers?: { status?: string; signedAt?: string | null }[];
    error?: { message?: string };
  };
  if (!respuesta.ok) throw new Error(json.error?.message || "DocuTax no contestó");
  const firmados = (json.signers || []).filter((parte) => parte.status === "signed" || parte.signedAt).length;
  const total = json.signers?.length || 0;
  const listo = json.status === "sealed" || json.status === "completed" || (total > 0 && firmados === total);
  return { estado: json.status || "", listo, firmados, total };
}

export async function certificadoDocutax(id: string) {
  const dato = await credenciales();
  const respuesta = await fetch(`${dato.base}/api/v1/envelopes/${encodeURIComponent(id)}/certificate`, {
    headers: { Authorization: `Bearer ${dato.key}` },
  });
  if (!respuesta.ok) return "";
  const tipo = respuesta.headers.get("content-type") || "";
  const bytes = Buffer.from(await respuesta.arrayBuffer());
  if (!bytes.length) return "";
  if (tipo.includes("json")) return "";
  return bytes.toString("base64");
}
