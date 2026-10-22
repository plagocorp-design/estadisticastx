import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";
import { STEPS } from "@/lib/casos";
import type { Actor } from "@/lib/auditoria.server";

const DB: Record<string, string> = {
  dijoSi: "dijo_si",
  cedula: "cedula",
  tarjetaPropiedad: "tarjeta_propiedad",
  tarjetaOperacion: "tarjeta_operacion",
  soat: "soat",
  tecnomecanica: "tecnomecanica",
  formulario: "formulario",
  documentos: "documentos",
  firmaCarta: "firma_carta",
  firmaContrato: "firma_contrato",
  plataPoliza: "plata_poliza",
  viaSeguros: "via_seguros",
  polizasSubidas: "polizas_subidas",
  operativa: "operativa",
  tarjetaEntregada: "tarjeta_entregada",
  completado: "completado",
};

const WIN: Record<string, string> = {
  "á": "\\341", "é": "\\351", "í": "\\355", "ó": "\\363", "ú": "\\372",
  "Á": "\\301", "É": "\\311", "Í": "\\315", "Ó": "\\323", "Ú": "\\332",
  "ñ": "\\361", "Ñ": "\\321", "ü": "\\374", "Ü": "\\334",
  "¿": "\\277", "¡": "\\241", "—": "-", "–": "-", "·": "-",
};

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function si(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "t" || value === "true";
}

function limpio(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || "—";
}

function fechaLarga(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "—";
  const texto = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${texto} -05`;
}

function fase(value: string) {
  if (value === "espera") return "En espera de impresión";
  if (value === "recibida") return "Impresas, recibidas por David";
  if (value === "avisada") return "Avisadas al asesor";
  return value || "—";
}

function entrega(value: string) {
  if (value === "pide_foto") return "David va a entregarlas para la foto";
  if (value === "pide_final") return "David va a entregarlas definitivas";
  if (value === "foto") return "El asesor aceptó la foto";
  if (value === "final") return "El asesor aceptó la entrega definitiva";
  return value || "—";
}

function pdfTexto(value: string) {
  let out = "";
  for (const ch of value) {
    if (WIN[ch]) out += WIN[ch];
    else if (ch === "\\") out += "\\\\";
    else if (ch === "(") out += "\\(";
    else if (ch === ")") out += "\\)";
    else if (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126) out += ch;
    else out += "?";
  }
  return out;
}

class Pdf {
  private pages: string[] = [];
  private ops: string[] = [];
  private y = 750;

  private corte() {
    if (this.ops.length) this.pages.push(this.ops.join("\n"));
    this.ops = [];
    this.y = 750;
  }

  private espacio(alto: number) {
    if (this.y - alto < 48) this.corte();
  }

  private linea(texto: string, size: number) {
    this.espacio(size + 4);
    this.ops.push(`BT /F1 ${size} Tf 40 ${this.y} Td (${pdfTexto(texto)}) Tj ET`);
    this.y -= size + 4;
  }

  parrafo(texto: string, size = 11) {
    const ancho = Math.max(20, Math.floor(520 / (size * 0.52)));
    const words = texto.split(/\s+/).filter(Boolean);
    let line = "";
    const rows: string[] = [];
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > ancho && line) {
        rows.push(line);
        line = word;
      } else line = next;
    }
    if (line) rows.push(line);
    for (const row of rows.length ? rows : ["—"]) this.linea(row, size);
  }

  titulo(texto: string) {
    this.y -= 8;
    this.linea(texto.toUpperCase(), 10);
  }

  bytes() {
    this.corte();
    const objects: string[] = [];
    const pageIds: number[] = [];
    let id = 3;
    for (const content of this.pages) {
      pageIds.push(id);
      id += 2;
    }
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((n) => `${n} 0 R`).join(" ")}] >>`;
    this.pages.forEach((content, index) => {
      const pageId = pageIds[index];
      const streamId = pageId + 1;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${streamId} 0 R /Resources << /Font << /F1 ${id} 0 R >> >> >>`;
      objects[streamId] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
    });
    objects[id] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    let body = "%PDF-1.4\n";
    const offsets = [0];
    for (let n = 1; n <= id; n += 1) {
      offsets[n] = Buffer.byteLength(body);
      body += `${n} 0 obj\n${objects[n]}\nendobj\n`;
    }
    const xref = Buffer.byteLength(body);
    body += `xref\n0 ${id + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= id; n += 1) body += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
    body += `trailer << /Size ${id + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(body);
  }
}

type Evento = {
  id: number;
  created_at: string;
  actor_name: string;
  actor_slug: string;
  accion: string;
  entidad: string;
  detalle: string;
  antes: string;
  despues: string;
  hash: string;
};

export async function certificadoDe(casoId: number, actor: Actor) {
  const sql = await getSql();
  const casos = await sql.query<Record<string, unknown>>(
    `select c.*, p.name as owner_name, p.slug as owner_slug
     from casos c join profiles p on p.user_id = c.owner_id
     where c.id = $1`,
    [casoId],
  );
  const caso = casos[0];
  if (!caso) throw new Error("No encontré ese proceso");
  const eventosRaw = await sql.query<{
    id: number;
    created_at: string;
    actor_name: string;
    actor_slug: string;
    accion: string;
    entidad: string;
    detalle: string;
    antes: string;
    despues: string;
  }>(
    `select id, created_at, actor_name, actor_slug, accion, entidad, detalle, antes, despues
     from auditoria
     where entidad in ('proceso', 'poliza', 'contrato', 'chat') and entidad_id = $1
     order by id`,
    [String(casoId)],
  );

  const ficha = [
    `placa=${limpio(caso.placa)}`,
    `cc=${limpio(caso.cc)}`,
    `nombre=${limpio(caso.nombre)}`,
    `telefono=${limpio(caso.telefono)}`,
    `direccion=${limpio(caso.direccion)}`,
    `correo=${limpio(caso.correo)}`,
    `empresa=${limpio(caso.empresa)}`,
    `marca=${limpio(caso.marca)}`,
    `linea=${limpio(caso.linea)}`,
    `modelo=${limpio(caso.modelo)}`,
    `asesor=${limpio(caso.owner_name)}`,
    ...STEPS.map((step) => `${step.key}=${si(caso[DB[step.key]]) ? "si" : "no"}`),
    `poliza_fase=${limpio(caso.poliza_fase)}`,
    `poliza_entrega=${limpio(caso.poliza_entrega)}`,
    `motivo=${limpio(caso.motivo_cierre)}`,
  ].join("\n");
  const hashFicha = sha256(ficha);
  const pdfGuardado = String(caso.contrato_pdf ?? "");
  const hashPdf = pdfGuardado.length > 80 ? sha256(Buffer.from(pdfGuardado.replace(/^data:application\/pdf;base64,/i, ""), "base64")) : "";

  let previo = hashFicha;
  const eventos: Evento[] = eventosRaw.map((row) => {
    const hash = sha256(
      [previo, row.id, row.created_at, row.actor_slug, row.accion, row.entidad, row.detalle, row.antes, row.despues].join("\n"),
    );
    previo = hash;
    return { ...row, id: Number(row.id), hash };
  });
  const ahora = new Date();
  const sello = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(ahora)
    .replace(/\D/g, "");
  const codigo = `VL-${limpio(caso.placa)}-${casoId}-${sello}`;

  const pdf = new Pdf();
  pdf.parrafo("VINCULA LIBRE  ·  CERTIFICADO DE AUDITORIA", 16);
  pdf.parrafo(codigo, 10);
  pdf.parrafo(`Generado el ${fechaLarga(ahora.toISOString())} por ${actor.name}. Hora de Bogotá.`, 11);
  pdf.parrafo("Cada evento se encadena con el hash del anterior. Si se cambia una letra, el hash de la cadena ya no coincide.", 11);
  pdf.titulo("Integridad");
  pdf.parrafo(`SHA-256 de la ficha: ${hashFicha}`, 9);
  pdf.parrafo(`SHA-256 del contrato PDF: ${hashPdf || "Este proceso no tiene el PDF guardado"}`, 9);
  pdf.parrafo(`SHA-256 de la cadena: ${previo}`, 9);
  pdf.titulo("Vinculado y vehiculo");
  for (const [label, value] of [
    ["Propietario", limpio(caso.nombre)],
    ["Identificación", limpio(caso.cc)],
    ["Teléfono", limpio(caso.telefono)],
    ["Dirección", limpio(caso.direccion)],
    ["Correo", limpio(caso.correo)],
    ["Empresa", limpio(caso.empresa)],
    ["Placa", limpio(caso.placa)],
    ["Marca", limpio(caso.marca)],
    ["Línea", limpio(caso.linea)],
    ["Modelo", limpio(caso.modelo)],
    ["Asesor", limpio(caso.owner_name)],
    ["Origen", limpio(caso.origen)],
  ] as const) {
    pdf.parrafo(`${label}: ${value}`, 11);
  }
  pdf.titulo("Estado al generar el certificado");
  for (const step of STEPS) pdf.parrafo(`${step.label}: ${si(caso[DB[step.key]]) ? "Sí" : "No"}`, 11);
  pdf.parrafo(`Tarjeta: ${limpio(caso.estado_tarjeta)}`, 11);
  pdf.parrafo(`Póliza: ${fase(String(caso.poliza_fase ?? ""))}`, 11);
  pdf.parrafo(`Entrega: ${entrega(String(caso.poliza_entrega ?? ""))}`, 11);
  pdf.parrafo(`Cierre: ${limpio(caso.motivo_cierre)}`, 11);
  pdf.parrafo(`Observación: ${limpio(caso.observacion)}`, 11);
  pdf.titulo(`Cadena de eventos (${eventos.length})`);
  if (eventos.length === 0) pdf.parrafo("Todavía no hay movimientos registrados sobre este proceso.", 11);
  eventos.forEach((evento, index) => {
    pdf.parrafo(`${index + 1}. ${fechaLarga(String(evento.created_at))} · ${evento.actor_name}`, 10);
    pdf.parrafo(evento.detalle, 11);
    if (evento.antes || evento.despues) {
      pdf.parrafo(`Antes: ${evento.antes || "—"}`, 9);
      pdf.parrafo(`Después: ${evento.despues || "—"}`, 9);
    }
    pdf.parrafo(`Hash ${evento.hash}`, 8);
  });
  pdf.titulo("Nota");
  pdf.parrafo(
    "Este certificado es el registro interno de Vincula Libre. No es una firma digital certificada ni un sobre de DocuSeal. Sirve para ver quién cambió qué, a qué hora, y para comprobar que la cadena no fue alterada.",
    10,
  );

  return {
    filename: `certificado-${limpio(caso.placa)}.pdf`.replace(/[^\w.\-]+/g, "_"),
    base64: pdf.bytes().toString("base64"),
    codigo,
  };
}
