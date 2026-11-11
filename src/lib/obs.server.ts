import { createHash, createHmac, randomBytes } from "node:crypto";
import { env } from "@/lib/env.server";

type Obs = { ak: string; sk: string; host: string; bucket: string; region: string };

function regionDe(host: string) {
  const pedida = env("HUAWEI_OBS_REGION");
  if (pedida) return pedida;
  const partes = host.split(".");
  if (partes[0] === "obs" && partes[1]) return partes[1];
  return "";
}

export function obsConfig(): Obs | null {
  const ak = env("HUAWEI_OBS_AK");
  const sk = env("HUAWEI_OBS_SK");
  const crudo = env("HUAWEI_OBS_ENDPOINT");
  const bucket = env("HUAWEI_OBS_BUCKET");
  if (!ak || !sk || !crudo || !bucket) return null;
  const host = crudo.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const region = regionDe(host);
  if (!region) return null;
  return { ak, sk, host, bucket, region };
}

function sha256hex(data: Buffer | string) {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string) {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function encodeRfc(parte: string) {
  return encodeURIComponent(parte).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function firmar(method: string, uri: string, payloadHash: string, host: string, cfg: Obs) {
  const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const fecha = amzDate.slice(0, 8);
  const headers = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const firmados = "host;x-amz-content-sha256;x-amz-date";
  const canonico = [method, uri, "", headers, firmados, payloadHash].join("\n");
  const alcance = `${fecha}/${cfg.region}/s3/aws4_request`;
  const aFirmar = ["AWS4-HMAC-SHA256", amzDate, alcance, sha256hex(canonico)].join("\n");
  let llave: Buffer | string = `AWS4${cfg.sk}`;
  for (const paso of [fecha, cfg.region, "s3", "aws4_request"]) llave = hmac(llave, paso);
  const firma = createHmac("sha256", llave).update(aFirmar, "utf8").digest("hex");
  return {
    amzDate,
    authorization: `AWS4-HMAC-SHA256 Credential=${cfg.ak}/${alcance}, SignedHeaders=${firmados}, Signature=${firma}`,
  };
}

function claveValida(clave: string) {
  return /^vincula\/[A-Za-z0-9._/-]+$/.test(clave) && !clave.includes("..");
}

async function pedir(method: "PUT" | "GET" | "DELETE", clave: string, cuerpo?: Buffer) {
  const cfg = obsConfig();
  if (!cfg) throw new Error("OBS no está configurado");
  if (!claveValida(clave)) throw new Error("La ruta del archivo no es válida");
  const bytes = cuerpo ?? Buffer.alloc(0);
  const hash = sha256hex(bytes);
  const uri = `/${clave.split("/").map(encodeRfc).join("/")}`;
  const host = `${cfg.bucket}.${cfg.host}`;
  const firma = firmar(method, uri, hash, host, cfg);
  const res = await fetch(`https://${host}${uri}`, {
    method,
    headers: {
      Authorization: firma.authorization,
      "x-amz-content-sha256": hash,
      "x-amz-date": firma.amzDate,
    },
    body: method === "PUT" ? new Uint8Array(bytes) : undefined,
  });
  if (!res.ok) {
    const texto = (await res.text()).replace(/\s+/g, " ").slice(0, 180);
    throw new Error(`OBS respondió ${res.status}${texto ? `: ${texto}` : ""}`);
  }
  return res;
}

export async function guardarEnObs(nombre: string, archivo: string, placa = "") {
  const limpia = placa.replace(/[^A-Za-z0-9]/g, "").slice(0, 10) || "SIN-PLACA";
  const safe = nombre.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "archivo";
  const clave = `vincula/${limpia}/${randomBytes(4).toString("hex")}-${safe}`;
  await pedir("PUT", clave, Buffer.from(archivo, "base64"));
  return `obs:${clave}`;
}

export async function leerDeObs(id: string) {
  const clave = id.startsWith("obs:") ? id.slice(4) : "";
  if (!claveValida(clave)) return "";
  const res = await pedir("GET", clave);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

export async function borrarDeObs(id: string) {
  const clave = id.startsWith("obs:") ? id.slice(4) : "";
  if (!claveValida(clave)) return;
  await pedir("DELETE", clave);
}
