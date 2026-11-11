import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";

const CARPETA = "17SLkljfjJCOLdBFmgQ-B4EijUdifLawT";

async function scriptConfig() {
  const sql = await getSql();
  const rows = await sql.query<{ webapp_url: string; secret: string }>(
    `select webapp_url, secret from sheets_config where id = 1`,
  );
  const row = rows[0];
  if (!row?.webapp_url || !row.secret) return null;
  return row;
}

async function postScript(body: Record<string, unknown>) {
  const cfg = await scriptConfig();
  if (!cfg) return null;
  const res = await fetch(cfg.webapp_url, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify({ ...body, secret: cfg.secret }),
    signal: AbortSignal.timeout(120000),
  });
  const text = await res.text();
  if (!text || text.trim().startsWith("<")) return null;
  return JSON.parse(text) as { ok?: boolean; id?: string; archivo?: string; error?: string };
}

async function porConector(nombre: string, archivo: string) {
  const { callTool, ConnectorType } = await import("./app-data/client.server");
  const safe = nombre.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "archivo";
  const rel = `/vincula-docs/${randomBytes(4).toString("hex")}-${safe}`;
  await mkdir("/workspace/artifacts/vincula-docs", { recursive: true });
  await writeFile(`/workspace/artifacts${rel}`, Buffer.from(archivo, "base64"));
  const result = await callTool(
    "google_drive_upload_artifact",
    { artifact_path: rel, file_name: safe, folder_id: CARPETA },
    { connectorType: ConnectorType.GoogleDrive },
  );
  if (!result.ok || !result.data) return "";
  const data = result.data as { file_id?: string };
  return data.file_id ?? "";
}

async function bajarConector(driveId: string) {
  const { callTool, ConnectorType } = await import("./app-data/client.server");
  const rel = `/vincula-docs/bajar-${driveId.slice(0, 8)}`;
  const result = await callTool(
    "google_drive_download_artifact",
    { file_id: driveId, dest_path: rel },
    { connectorType: ConnectorType.GoogleDrive },
  );
  if (!result.ok) return "";
  const bytes = await readFile(`/workspace/artifacts${rel}`);
  return bytes.toString("base64");
}

export async function guardarEnDrive(nombre: string, archivo: string, placa = "") {
  const limpia = placa.replace(/[^A-Za-z0-9]/g, "").slice(0, 10) || "SIN-PLACA";
  try {
    const { obsConfig, guardarEnObs } = await import("./obs.server");
    if (obsConfig()) {
      const id = await guardarEnObs(nombre, archivo, limpia);
      if (id) return { id, enLaNube: true };
    }
  } catch (err) {
    console.error("[obs] no pude guardar", err instanceof Error ? err.message : err);
  }
  try {
    const data = await postScript({ accion: "archivo", nombre, archivo, placa: limpia });
    if (data?.ok && data.id) return { id: data.id, enLaNube: true };
  } catch {
    /* el script viejo no tiene esta acción */
  }
  try {
    const id = await porConector(nombre, archivo);
    if (id) return { id, enLaNube: false };
  } catch {
    /* sin conexión a Drive en este momento */
  }
  return { id: "", enLaNube: false };
}

export async function borrarDeDrive(driveId: string) {
  if (!driveId) return;
  if (driveId.startsWith("obs:")) {
    try {
      const { borrarDeObs } = await import("./obs.server");
      await borrarDeObs(driveId);
    } catch (err) {
      console.error("[obs] no pude borrar", err instanceof Error ? err.message : err);
    }
    return;
  }
  try {
    const data = await postScript({ accion: "borrar", id: driveId });
    if (data?.ok) return;
  } catch {
    /* el script viejo no borra en Drive */
  }
  try {
    const { callTool, ConnectorType } = await import("./app-data/client.server");
    await callTool("google_drive_trash_file", { file_id: driveId }, { connectorType: ConnectorType.GoogleDrive });
  } catch {
    /* el archivo sigue en Drive, pero ya no sale en el proceso */
  }
}

export async function leerDeDrive(driveId: string) {
  if (!driveId) return "";
  if (driveId.startsWith("obs:")) {
    try {
      const { leerDeObs } = await import("./obs.server");
      return await leerDeObs(driveId);
    } catch (err) {
      console.error("[obs] no pude leer", err instanceof Error ? err.message : err);
      return "";
    }
  }
  try {
    const data = await postScript({ accion: "bajar", id: driveId });
    if (data?.ok && data.archivo) return data.archivo;
  } catch {
    /* sigue el otro camino */
  }
  try {
    return await bajarConector(driveId);
  } catch {
    return "";
  }
}
