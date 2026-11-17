import ExcelJS from "exceljs";
import {
  ESTADOS_DISTINTIVO,
  estadoDistintivo,
  fechaIso,
  filasDesdeCsv,
  filasDesdeTabla,
  horaCita,
  normalizar,
  placaLimpia,
  type FilaCruda,
} from "@/lib/callcenter";

function textoCelda(valor: unknown): string {
  if (valor == null) return "";
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    if (valor.getUTCHours() === 0 && valor.getUTCMinutes() === 0 && valor.getUTCSeconds() === 0) return valor.toISOString().slice(0, 10);
    return valor.toISOString();
  }
  if (typeof valor === "number") {
    if (valor > 20000 && valor < 80000) {
      const utc = new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86400000);
      return utc.toISOString().slice(0, 10);
    }
    if (valor > 0 && valor < 1) return horaCita(valor);
    return String(valor);
  }
  if (typeof valor === "object") {
    const caja = valor as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof caja.text === "string") return caja.text;
    if (caja.richText) return caja.richText.map((parte) => parte.text).join("");
    if ("result" in caja) return textoCelda(caja.result);
    return "";
  }
  return String(valor);
}

function encabezadoDe(sheet: ExcelJS.Worksheet) {
  const tope = Math.min(15, sheet.rowCount || 15);
  let mejor: { fila: number; headers: string[]; puntaje: number } | null = null;
  for (let r = 1; r <= tope; r++) {
    const headers = (sheet.getRow(r).values as unknown[]).slice(1).map((item) => textoCelda(item).trim());
    const claves = headers.map((item) => normalizar(item));
    let puntaje = 0;
    if (claves.some((item) => item === "placa")) puntaje += 3;
    if (claves.some((item) => (item && item.includes("nombre completo")) || item === "nombre")) puntaje += 2;
    if (claves.some((item) => item && (item.includes("telefono") || item.includes("celular")))) puntaje += 2;
    if (claves.some((item) => item === "empresa")) puntaje += 1;
    if (puntaje >= 3 && (!mejor || puntaje > mejor.puntaje)) mejor = { fila: r, headers, puntaje };
  }
  return mejor;
}

function filasDeHoja(sheet: ExcelJS.Worksheet) {
  const cabeza = encabezadoDe(sheet);
  if (!cabeza) return [];
  const rows: string[][] = [];
  sheet.eachRow((row, numero) => {
    if (numero <= cabeza.fila) return;
    const celdas = cabeza.headers.map((_, indice) => textoCelda(row.getCell(indice + 1).value).trim());
    if (celdas.some(Boolean)) rows.push(celdas);
  });
  return filasDesdeTabla(cabeza.headers, rows);
}

function puntajeHoja(nombre: string) {
  const n = normalizar(nombre);
  if (n.includes("whatsapp") || n.includes("wasap") || n.includes("reporte")) return 0;
  if (n === "octubre" || n === "noviembre" || n.includes("tabla") || n.includes("grafico")) return 0;
  if (n === "empresas" || n.startsWith("datos")) return 0;
  if (n.includes("gestion") && n.includes("llamad")) return 130;
  if (n === "bd") return 100;
  if (n.includes("filtrada")) return 8;
  if (n.includes("original") || n.includes("completa")) return 45;
  if (n === "base") return 40;
  return 15;
}

export async function leerBaseArchivo(base64: string, nombre: string): Promise<FilaCruda[]> {
  const limpio = base64.replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
  const bajo = nombre.toLowerCase();
  if (bajo.endsWith(".csv") || bajo.endsWith(".txt")) {
    return filasDesdeCsv(Buffer.from(limpio, "base64").toString("utf8"));
  }
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(limpio, "base64") as never);
    const hojas = [...wb.worksheets].sort((a, b) => puntajeHoja(b.name) - puntajeHoja(a.name));
    let mejor: FilaCruda[] = [];
    for (const hoja of hojas) {
      const peso = puntajeHoja(hoja.name);
      if (peso <= 0) continue;
      const filas = filasDeHoja(hoja);
      if (peso >= 100 && filas.length > 0) return filas;
      if (peso >= 15 && filas.length > mejor.length) mejor = filas;
    }
    return mejor;
  } catch {
    return filasDesdeCsv(Buffer.from(limpio, "base64").toString("utf8"));
  }
}

function vacia(parcial: Partial<FilaCruda>): FilaCruda {
  return {
    nombre: "", estado: "", telefono: "", propietario: "", telPropietario: "", vehiculo: "",
    placa: "", anio: "", empresa: "", cc: "", fecha: "", agente: "", clasificacion: "",
    calificacion: "", sao: "", conductor: "", propietarioObs: "", intencion: "", proxima: "",
    fechaProxima: "", resultado: "", fechaAfiliacion: "", motivo: "", observacionFinal: "", canal: "",
    ...parcial,
  };
}

function tipificarWhatsapp(tipo: string, nota = "") {
  const elegir = (fuente: string) => {
    if (!fuente) return null;
    if (fuente.includes("no efectivo") || fuente.includes("sin respuesta") || fuente.includes("sin rta")) {
      return { clasificacion: "Contacto No Efectivo", calificacion: "No Contestan", resultado: "", proxima: "WhatsApp" };
    }
    if (fuente.includes("presencial")) return { clasificacion: "Contacto Efectivo", calificacion: "Recibe Informacion", resultado: "En proceso", proxima: "Agendar" };
    if (fuente.includes("distintivo") || fuente.includes("acompan")) return { clasificacion: "Contacto Efectivo", calificacion: "Continua con la Vinculacion", resultado: "Entrega TO - Promotor", proxima: "Agendar" };
    if (fuente.includes("radic")) return { clasificacion: "Contacto Efectivo", calificacion: "Continua con la Vinculacion", resultado: "Radicacion TO", proxima: "WhatsApp" };
    if (fuente.includes("poliza") || fuente.includes("compro")) return { clasificacion: "Contacto Efectivo", calificacion: "Continua con la Vinculacion", resultado: "Compra Polizas", proxima: "WhatsApp" };
    if (fuente.includes("pendiente") || fuente.includes("document")) return { clasificacion: "Contacto Efectivo", calificacion: "Continua con la Vinculacion", resultado: "Documentación", proxima: "WhatsApp" };
    if (fuente.includes("interes")) return { clasificacion: "Contacto Efectivo", calificacion: "Recibe Informacion", resultado: "En proceso", proxima: "WhatsApp" };
    return null;
  };
  const t = normalizar(tipo);
  const n = normalizar(nota);
  return elegir(t) || elegir(n) || { clasificacion: tipo ? "Contacto Efectivo" : "", calificacion: "Recibe Informacion", resultado: "En proceso", proxima: "WhatsApp" };
}

function columnasWhatsapp(hoja: ExcelJS.Worksheet) {
  const tope = Math.min(12, hoja.rowCount || 12);
  for (let r = 1; r <= tope; r++) {
    const raw = (hoja.getRow(r).values as unknown[]) || [];
    const vals: string[] = [];
    for (let c = 1; c < raw.length; c++) vals[c] = normalizar(textoCelda(raw[c]));
    const placa = vals.findIndex((item) => item === "placa");
    if (placa < 1) continue;
    const cerca = (pred: (item: string) => boolean, desde: number, dir: -1 | 1) => {
      for (let c = desde; c >= 1 && c < vals.length; c += dir) {
        if (vals[c] && pred(vals[c])) return c;
      }
      return 0;
    };
    const tipo = cerca((item) => item.includes("tipo de gestion"), placa - 1, -1);
    const fecha = cerca((item) => item === "fecha", placa - 1, -1);
    if (!tipo || !fecha) continue;
    return {
      fila: r,
      fecha,
      nombre: cerca((item) => item.includes("nombre"), placa - 1, -1),
      telefono: cerca((item) => item.includes("telefono") || item.includes("celular"), placa - 1, -1),
      tipo,
      placa,
      rol: cerca((item) => item.includes("rol"), placa + 1, 1),
      nota: cerca((item) => item.includes("observ"), placa + 1, 1),
      sigue: cerca((item) => item.includes("seguimiento"), placa + 1, 1),
    };
  }
  return null;
}

/** Hoja WhatsApp del Excel del asesor. Solo filas con placa real. */
export async function leerWhatsappArchivo(base64: string, agente: string): Promise<FilaCruda[]> {
  const limpio = base64.replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(limpio, "base64") as never);
    const hoja = wb.worksheets.find((item) => normalizar(item.name).includes("whatsapp") || normalizar(item.name).includes("wasap"));
    if (!hoja) return [];
    const cols = columnasWhatsapp(hoja);
    if (!cols) return [];
    const salida: FilaCruda[] = [];
    hoja.eachRow((row, numero) => {
      if (numero <= cols.fila) return;
      const tomar = (c: number) => (c ? textoCelda(row.getCell(c).value).trim() : "");
      const fecha = tomar(cols.fecha);
      const nombre = tomar(cols.nombre);
      const telefono = tomar(cols.telefono);
      const tipo = tomar(cols.tipo);
      const placa = placaLimpia(tomar(cols.placa));
      const rol = tomar(cols.rol);
      const nota = tomar(cols.nota);
      const sigue = fechaIso(tomar(cols.sigue));
      if (!/^[A-Z]{3}\d{2,4}[A-Z]?$/.test(placa) || !tipo) return;
      const tip = tipificarWhatsapp(tipo, nota);
      salida.push(vacia({
        nombre, telefono, placa, fecha, agente,
        clasificacion: tip.clasificacion,
        calificacion: tip.calificacion,
        resultado: tip.resultado,
        proxima: tip.proxima,
        fechaProxima: sigue,
        propietarioObs: rol,
        observacionFinal: [tipo, nota].filter(Boolean).join(". "),
        canal: "whatsapp",
      }));
    });
    return salida;
  } catch {
    return [];
  }
}

export type CitaDistintivo = {
  fecha: string;
  hora: string;
  placa: string;
  conductor: string;
  cedula: string;
  promotor: string;
  estado: string;
  nota: string;
};

export async function leerAgendaDistintivos(base64: string): Promise<CitaDistintivo[]> {
  const limpio = base64.replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(limpio, "base64") as never);
  const hoja = wb.worksheets.find((item) => normalizar(item.name) === "agenda") ?? wb.worksheets[0];
  if (!hoja) return [];
  let filaCabeza = 0;
  let mapa = new Map<string, number>();
  const tope = Math.min(12, hoja.rowCount || 12);
  for (let r = 1; r <= tope; r++) {
    const headers = (hoja.getRow(r).values as unknown[]).slice(1).map((item) => normalizar(textoCelda(item)));
    if (headers.includes("placa") && headers.includes("fecha")) {
      filaCabeza = r;
      mapa = new Map();
      headers.forEach((item, i) => {
        if (item) mapa.set(item, i + 1);
      });
      break;
    }
  }
  if (!filaCabeza) return [];
  function col(...nombres: string[]) {
    for (const nombre of nombres) {
      const idx = mapa.get(nombre);
      if (idx) return idx;
    }
    return 0;
  }
  const cFecha = col("fecha");
  const cHora = col("hora");
  const cPlaca = col("placa");
  const cConductor = col("conductor");
  const cCedula = col("cedula", "cédula");
  const cPromotor = col("promotor");
  const cEstado = col("estado");
  const cNota = col("observaciones", "observacion");
  const citas: CitaDistintivo[] = [];
  hoja.eachRow((row, numero) => {
    if (numero <= filaCabeza) return;
    const tomar = (c: number) => (c ? textoCelda(row.getCell(c).value).trim() : "");
    const placa = tomar(cPlaca).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    const conductor = tomar(cConductor).replace(/\s+/g, " ").trim().slice(0, 120);
    const estado = estadoDistintivo(tomar(cEstado)) || (placa || conductor ? "Programados" : "");
    if (!placa && !conductor && !estado) return;
    if (estado && !ESTADOS_DISTINTIVO.includes(estado as (typeof ESTADOS_DISTINTIVO)[number]) && !placa) return;
    const fecha = fechaIso(tomar(cFecha));
    if (!fecha) return;
    citas.push({
      fecha,
      hora: horaCita(cHora ? row.getCell(cHora).value : tomar(cHora)),
      placa,
      conductor,
      cedula: tomar(cCedula).replace(/\D/g, "").slice(0, 20),
      promotor: tomar(cPromotor).replace(/\s+/g, " ").trim().slice(0, 120),
      estado: estado || "Programados",
      nota: tomar(cNota).slice(0, 400),
    });
  });
  return citas;
}

export async function excelGestiones(filas: Record<string, string>[], resumen: Record<string, string | number>[], placas: Record<string, string>[] = []) {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet("Gestiones");
  const headers = filas[0] ? Object.keys(filas[0]) : ["Placa"];
  hoja.addRow(headers);
  for (const fila of filas) hoja.addRow(headers.map((clave) => fila[clave] ?? ""));
  hoja.getRow(1).font = { bold: true };
  const otra = wb.addWorksheet("Resumen");
  const claves = resumen[0] ? Object.keys(resumen[0]) : ["Dato"];
  otra.addRow(claves);
  for (const fila of resumen) otra.addRow(claves.map((clave) => fila[clave] ?? ""));
  otra.getRow(1).font = { bold: true };
  if (placas.length) {
    const cruce = wb.addWorksheet("De la base");
    const cols = Object.keys(placas[0]);
    cruce.addRow(cols);
    for (const fila of placas) cruce.addRow(cols.map((clave) => fila[clave] ?? ""));
    cruce.getRow(1).font = { bold: true };
  }
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer).toString("base64");
}
