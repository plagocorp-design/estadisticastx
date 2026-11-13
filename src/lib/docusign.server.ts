import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

type Firmante = { email: string; name: string };
type Sitio = { pagina: number; x: number; y: number };

function limpiar(valor: string) {
  return valor.replace(/[{}]/g, "").trim();
}

async function entorno() {
  const deArchivo: Record<string, string> = {};
  try {
    const crudo = await readFile("/workspace/.env", "utf8");
    for (const linea of crudo.split("\n")) {
      const corte = linea.indexOf("=");
      if (corte < 1) continue;
      deArchivo[linea.slice(0, corte)] = linea.slice(corte + 1).replace(/^"|"$/g, "").replace(/\\n/g, "\n");
    }
  } catch {
    /* en el servidor publicado las claves vienen del entorno */
  }
  const leer = (clave: string) => (process.env[clave] || deArchivo[clave] || "").trim();
  const key = leer("DOCUSIGN_PRIVATE_KEY");
  const integracion = leer("DOCUSIGN_INTEGRATION_KEY");
  const usuario = leer("DOCUSIGN_USER_ID");
  const cuenta = leer("DOCUSIGN_ACCOUNT_ID");
  const base = leer("DOCUSIGN_BASE_URL") || "https://demo.docusign.net";
  const oauth = leer("DOCUSIGN_OAUTH_BASE") || "https://account-d.docusign.com";
  return { key, integracion, usuario, cuenta, base, oauth };
}

export async function docusignActivo() {
  const dato = await entorno();
  return Boolean(dato.key && dato.integracion && dato.usuario && dato.cuenta);
}

async function token() {
  const dato = await entorno();
  if (!dato.key || !dato.integracion || !dato.usuario) throw new Error("Faltan las claves de DocuSign");
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const cuerpo = Buffer.from(
    JSON.stringify({
      iss: dato.integracion,
      sub: dato.usuario,
      aud: "account-d.docusign.com",
      iat: ahora,
      exp: ahora + 3600,
      scope: "signature impersonation",
    }),
  ).toString("base64url");
  const firma = createSign("RSA-SHA256");
  firma.update(`${cabecera}.${cuerpo}`);
  const assertion = `${cabecera}.${cuerpo}.${firma.sign(dato.key).toString("base64url")}`;
  const respuesta = await fetch(`${dato.oauth}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const json = (await respuesta.json().catch(() => null)) as { access_token?: string; error?: string } | null;
  if (!respuesta.ok || !json?.access_token) {
    if (json?.error === "consent_required") throw new Error("DocuSign todavía pide el permiso. Ábrelo con la sesión de la cuenta demo.");
    throw new Error(json?.error || "DocuSign no dio acceso");
  }
  return { access: json.access_token, cuenta: dato.cuenta, base: dato.base };
}

export async function pedirFirmaDocusign(
  pdf: string,
  placa: string,
  firmantes: Firmante[],
  carta: string,
  asunto: string,
  cuerpo: string,
  sitio?: Sitio,
) {
  const gente = firmantes.filter((parte) => parte.email.includes("@") && parte.name.trim());
  if (!gente.length) throw new Error("Falta un correo válido para enviar la firma");
  const sesion = await token();
  const doc = await PDFDocument.load(Buffer.from(pdf, "base64"));
  const pagina = doc.getPages()[sitio?.pagina ?? 1] ?? doc.getPages()[0];
  const alto = pagina?.getHeight() ?? 792;
  const x = Math.max(0, Math.round(sitio?.x ?? 330));
  const baseY = sitio?.y ?? 300;
  const respuesta = await fetch(`${sesion.base}/restapi/v2.1/accounts/${sesion.cuenta}/envelopes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sesion.access}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      emailSubject: asunto.slice(0, 100) || `Contrato para firmar · ${placa}`,
      emailBlurb: cuerpo.slice(0, 4000),
      status: "sent",
      documents: [
        { documentBase64: pdf, name: `Contrato ${placa}`, fileExtension: "pdf", documentId: "1" },
        ...(carta ? [{ documentBase64: carta, name: `Carta ${placa}`, fileExtension: "pdf", documentId: "2" }] : []),
      ],
      recipients: {
        signers: gente.map((parte, indice) => ({
          email: parte.email,
          name: parte.name,
          recipientId: String(indice + 1),
          routingOrder: "1",
          tabs: {
            signHereTabs: [
              {
                documentId: "1",
                pageNumber: String((sitio?.pagina ?? 1) + 1),
                xPosition: String(x),
                yPosition: String(Math.max(40, Math.round(alto - (baseY - indice * 56) - 40))),
              },
            ],
          },
        })),
      },
    }),
  });
  const json = (await respuesta.json().catch(() => null)) as { envelopeId?: string; message?: string; errorCode?: string } | null;
  if (!respuesta.ok || !json?.envelopeId) throw new Error(json?.message || "DocuSign no recibió el contrato");
  return {
    id: json.envelopeId,
    partes: gente.map((parte) => ({ correo: parte.email, enlace: "" })),
  };
}

function hora(iso?: string | null) {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(fecha);
}

async function bajar(url: string, access: string) {
  const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  if (!respuesta.ok) return "";
  const bytes = Buffer.from(await respuesta.arrayBuffer());
  if (bytes.length < 80 || bytes.length > 8_000_000) return "";
  return bytes.toString("base64");
}

export async function leerDocusign(envioId: string) {
  const sesion = await token();
  const base = `${sesion.base}/restapi/v2.1/accounts/${sesion.cuenta}/envelopes/${encodeURIComponent(envioId)}`;
  const respuesta = await fetch(base, { headers: { Authorization: `Bearer ${sesion.access}` } });
  const json = (await respuesta.json().catch(() => null)) as {
    status?: string;
    recipients?: { signers?: { name?: string; email?: string; status?: string; signedDateTime?: string; deliveredDateTime?: string }[] };
  } | null;
  if (!respuesta.ok || !json) throw new Error("DocuSign no contestó");
  const partes = json.recipients?.signers ?? [];
  const resumen = partes
    .map((parte) => {
      const quien = limpiar(parte.name || parte.email || "Alguien");
      if (parte.status === "completed" || parte.signedDateTime) return `${quien} firmó ${hora(parte.signedDateTime)}`;
      if (parte.deliveredDateTime || parte.status === "delivered") return `${quien} abrió el correo y todavía no firma`;
      return `${quien} todavía no abre el correo`;
    })
    .join(". ");
  const listo = json.status === "completed";
  const [contrato, auditoria] = listo
    ? await Promise.all([
        bajar(`${base}/documents/combined`, sesion.access),
        bajar(`${base}/documents/certificate`, sesion.access),
      ])
    : ["", ""];
  return {
    listo,
    estado: listo ? "completed" : partes.some((parte) => parte.deliveredDateTime || parte.status === "delivered") ? "abierto" : "pendiente",
    contrato,
    carta: "",
    auditoria,
    resumen,
  };
}
