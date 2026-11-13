import { readFile } from "node:fs/promises";

const DESDE = "vinculaciones@taxislibres.com.co";

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
  return {
    clientId: leer("GMAIL_CLIENT_ID"),
    secret: leer("GMAIL_CLIENT_SECRET"),
    refresh: leer("GMAIL_REFRESH_TOKEN"),
    from: leer("GMAIL_FROM") || DESDE,
  };
}

function encoded(valor: string) {
  return /^[\x00-\x7F]*$/.test(valor) ? valor : `=?UTF-8?B?${Buffer.from(valor, "utf8").toString("base64")}?=`;
}

function mensaje(desde: string, para: string, asunto: string, texto: string) {
  const raw = [
    `From: Vinculaciones Taxis Libres <${desde}>`,
    `To: ${para}`,
    `Subject: ${encoded(asunto)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    texto,
  ].join("\r\n");
  return Buffer.from(raw, "utf8").toString("base64url");
}

async function acceso() {
  const dato = await credenciales();
  if (!dato.clientId || !dato.secret || !dato.refresh) throw new Error("Falta el permiso de Gmail de vinculaciones@");
  const respuesta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: dato.clientId,
      client_secret: dato.secret,
      refresh_token: dato.refresh,
      grant_type: "refresh_token",
    }),
  });
  const json = (await respuesta.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!respuesta.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Google no renovó el permiso de vinculaciones@");
  }
  return { token: json.access_token, from: dato.from };
}

export async function enviarGmail(input: { to: string; subject: string; text: string }) {
  const para = input.to.trim();
  if (!para.includes("@")) throw new Error("Ese correo no es válido");
  const dato = await acceso();
  const respuesta = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${dato.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: mensaje(dato.from, para, input.subject, input.text) }),
  });
  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(detalle.slice(0, 220) || "Gmail no envió el correo");
  }
}
