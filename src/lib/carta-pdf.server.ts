import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { DatosFirma } from "./firma.functions";
import { huecosFirma } from "./contrato-pdf.server";

const tinta = rgb(0.08, 0.1, 0.16);
const NIT_DESTINO = "860.531.135";

function seguro(value: string) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[^\x20-\x7E¡-ÿ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fechaLarga(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function fechaDia(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : new Date();
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}
function empresaReal(value: string) {
  const nombre = seguro(value);
  if (!nombre || /ninguna|vehiculo nuevo|vehículo nuevo/i.test(nombre)) return "";
  return nombre;
}

export async function montarCarta(
  datos: DatosFirma,
  firmas: { nombre: string; png: string }[],
  cuando?: string,
) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 740;

  function linea(texto: string, opts?: { bold?: boolean; size?: number; gap?: number }) {
    const size = opts?.size ?? 11;
    const cara = opts?.bold ? bold : font;
    const limpio = seguro(texto);
    if (!limpio) {
      y -= opts?.gap ?? 16;
      return;
    }
    const max = 500;
    const palabras = limpio.split(" ");
    let actual = "";
    const filas: string[] = [];
    for (const palabra of palabras) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (cara.widthOfTextAtSize(prueba, size) > max && actual) {
        filas.push(actual);
        actual = palabra;
      } else {
        actual = prueba;
      }
    }
    if (actual) filas.push(actual);
    for (const fila of filas) {
      page.drawText(fila, { x: 56, y, size, font: cara, color: tinta });
      y -= opts?.gap ?? 16;
    }
  }

  const nombre = seguro(datos.nombre);
  const cc = seguro(datos.cc);
  const placa = seguro(datos.placa).toUpperCase();
  const empresa = empresaReal(datos.empresa ?? "");
  const nit = seguro(datos.nitAnterior ?? "");
  const empresaTexto = empresa
    ? `Empresa afiliadora ${empresa}${nit ? `, identificada con NIT ${nit}` : ""}, para realizar la inclusión de la póliza a la empresa RADIO TAXI AEROPUERTO, con NIT ${NIT_DESTINO}.`
    : `Para realizar la inclusión de la póliza a la empresa RADIO TAXI AEROPUERTO, con NIT ${NIT_DESTINO}.`;

  linea(`Bogotá D.C., ${fechaLarga(cuando)}`, { gap: 28 });
  linea("Señores");
  linea("SEGUROS MUNDIAL", { bold: true });
  linea("Área de Seguros de Automóviles");
  linea("Ciudad Bogotá", { gap: 22 });
  linea(`Asunto: Solicitud de terminación y cancelación de pólizas de Responsabilidad Civil Contractual y Extracontractual. Vehículo de placa ${placa}.`, {
    bold: true,
    gap: 22,
  });
  linea(
    `${nombre}, mayor de edad, identificado(a) con cédula de ciudadanía No. ${cc}, en mi condición de propietario inscrito del vehículo citado, solicito la terminación y cancelación de las pólizas de responsabilidad civil contractual y extracontractual del vehículo de la referencia.`,
    { gap: 20 },
  );
  linea(empresaTexto, { gap: 36 });
  linea("Cordialmente,", { gap: 28 });

  const duenos = [
    { nombre, cc },
    ...(datos.propietarios?.length
      ? datos.propietarios.map((p) => ({ nombre: seguro(p.nombre), cc: seguro(p.cc) }))
      : datos.copropietario
        ? [{ nombre: seguro(datos.copropietario), cc: seguro(datos.cc2 ?? "") }]
        : []),
  ].filter((p) => p.nombre);
  const huecos = huecosFirma(Math.max(firmas.length, duenos.length, 1), 200, 80, 48);
  for (const [indice, firma] of firmas.entries()) {
    const base = firma.png.replace(/^data:image\/png;base64,/, "");
    if (base.length < 40) continue;
    const imagen = await doc.embedPng(Buffer.from(base, "base64"));
    const sitio = huecos[indice] ?? huecos[huecos.length - 1];
    page.drawImage(imagen, { x: 56, y: sitio.y, width: 180, height: sitio.h });
  }

  y = (huecos[huecos.length - 1]?.y ?? y) - 16;
  for (const dueno of duenos) {
    linea(dueno.nombre, { bold: true, gap: 12 });
    if (dueno.cc) linea(`C.C. ${dueno.cc}`, { gap: 10 });
  }

  return Buffer.from(await doc.save()).toString("base64");
}

export type DatosDevolucion = {
  ciudad: string;
  empresa: string;
  nit: string;
  direccionEmpresa: string;
  correoEmpresa: string;
  propietario: string;
  cc: string;
  telefono: string;
  correo: string;
  placa: string;
  marca: string;
  modelo: string;
  aseguradora: string;
  poliza: string;
  desde: string;
  liquidacion: string;
  fecha: string;
};

function hoja(doc: PDFDocument, font: PDFFont, bold: PDFFont) {
  let page = doc.addPage([612, 792]);
  let y = 740;
  function nueva() {
    page = doc.addPage([612, 792]);
    y = 740;
  }
  function linea(texto: string, opts?: { bold?: boolean; size?: number; gap?: number }) {
    const size = opts?.size ?? 11;
    const cara = opts?.bold ? bold : font;
    const limpio = seguro(texto);
    const gap = opts?.gap ?? 15;
    if (!limpio) {
      y -= gap;
      return;
    }
    const palabras = limpio.split(" ");
    let actual = "";
    const filas: string[] = [];
    for (const palabra of palabras) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (cara.widthOfTextAtSize(prueba, size) > 500 && actual) {
        filas.push(actual);
        actual = palabra;
      } else actual = prueba;
    }
    if (actual) filas.push(actual);
    for (const fila of filas) {
      if (y < 64) nueva();
      page.drawText(fila, { x: 56, y, size, font: cara, color: tinta });
      y -= gap;
    }
  }
  return {
    linea,
    espacio(min: number) {
      if (y < min) nueva();
    },
  };
}

function cierre(datos: DatosDevolucion, linea: (texto: string, opts?: { bold?: boolean; size?: number; gap?: number }) => void, espacio: (min: number) => void) {
  espacio(170);
  linea("Atentamente,", { gap: 36 });
  linea("_______________________________", { gap: 16 });
  linea(seguro(datos.propietario), { bold: true, gap: 14 });
  if (seguro(datos.cc)) linea(`C.C. ${seguro(datos.cc)}`, { gap: 14 });
  if (seguro(datos.telefono)) linea(`Celular: ${seguro(datos.telefono)}`, { gap: 14 });
  if (seguro(datos.correo)) linea(`Correo: ${seguro(datos.correo)}`, { gap: 14 });
}

export async function montarCartaDevolucion(datos: DatosDevolucion) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { linea, espacio } = hoja(doc, font, bold);
  const placa = seguro(datos.placa).toUpperCase();
  const aseguradora = seguro(datos.aseguradora);
  const poliza = seguro(datos.poliza);
  const seguroTxt = [aseguradora ? `con la aseguradora ${aseguradora}` : "", poliza ? `póliza No. ${poliza}` : ""].filter(Boolean).join(", ");
  const vehiculo = [seguro(datos.marca) ? `marca ${seguro(datos.marca)}` : "", seguro(datos.modelo) ? `modelo ${seguro(datos.modelo)}` : ""].filter(Boolean).join(", ");

  linea(`${seguro(datos.ciudad) || "Bogotá D.C."}, ${fechaDia(datos.fecha)}`, { gap: 22 });
  linea("Señores");
  linea(empresaReal(datos.empresa) || "EMPRESA DE TRANSPORTE", { bold: true });
  if (seguro(datos.nit)) linea(`NIT ${seguro(datos.nit)}`);
  if (seguro(datos.direccionEmpresa)) linea(seguro(datos.direccionEmpresa));
  if (seguro(datos.correoEmpresa)) linea(seguro(datos.correoEmpresa));
  linea("Ciudad", { gap: 18 });
  linea("Asunto: Solicitud de exclusión del vehículo y devolución de prima no devengada de pólizas RCC y RCE", { bold: true, gap: 18 });
  linea("Respetados señores:", { gap: 16 });
  linea(
    `Yo, ${seguro(datos.propietario)}, identificado con cédula de ciudadanía No. ${seguro(datos.cc) || "__________"}, propietario del vehículo de placas ${placa}${vehiculo ? `, ${vehiculo}` : ""}, vinculado a su empresa, me permito solicitar lo siguiente:`,
    { gap: 16 },
  );
  linea(
    `1. Que se proceda a la exclusión del vehículo de placas ${placa} de las pólizas de Responsabilidad Civil Contractual (RCC) y Responsabilidad Civil Extracontractual (RCE) vigentes${seguroTxt ? ` ${seguroTxt}` : ""}, a partir del día ${fechaDia(datos.desde)}.`,
    { gap: 16 },
  );
  linea(
    "2. Que se realice la devolución de la prima no devengada (días no utilizados) correspondiente al periodo comprendido entre la fecha de exclusión y la fecha de vencimiento de las pólizas, de conformidad con los artículos 1070 y 1071 del Código de Comercio y la Circular Externa 20254000000597 del Ministerio de Transporte.",
    { gap: 16 },
  );
  linea("3. Que el valor a devolver sea consignado en la cuenta bancaria que aparece en la certificación bancaria que adjunto.", { gap: 16 });
  if (seguro(datos.liquidacion)) linea(seguro(datos.liquidacion), { gap: 16 });
  linea("Fundamento mi solicitud en:", { gap: 15 });
  linea("- La obligación legal de devolver la prima no devengada cuando el riesgo deja de correr.", { gap: 15 });
  linea("- La prohibición de cobrar valores superiores al costo real de la prima (Circular 20254000000597).", { gap: 15 });
  linea("- El deber de transparencia en los extractos mensuales y la prohibición de cobros indebidos (Decreto 1001 de 2026).", { gap: 16 });
  linea("Solicito respuesta dentro de los quince (15) días hábiles siguientes, indicando el valor exacto a devolver y la fecha de consignación.", { gap: 16 });
  linea("Anexo:", { gap: 14 });
  linea("- Certificación bancaria", { gap: 14 });
  linea("- Copia de cédula", { gap: 14 });
  linea("- Copia de tarjeta de propiedad", { gap: 14 });
  linea("- Soporte del pago o extracto, si se tiene", { gap: 18 });
  cierre(datos, linea, espacio);
  return Buffer.from(await doc.save()).toString("base64");
}

export async function montarCartaAseguradora(datos: DatosDevolucion) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { linea, espacio } = hoja(doc, font, bold);
  const placa = seguro(datos.placa).toUpperCase();
  const empresa = empresaReal(datos.empresa) || "la empresa de transporte tomadora";
  const poliza = seguro(datos.poliza);

  linea(`${seguro(datos.ciudad) || "Bogotá D.C."}, ${fechaDia(datos.fecha)}`, { gap: 22 });
  linea("Señores");
  linea(seguro(datos.aseguradora) || "COMPAÑÍA DE SEGUROS", { bold: true });
  linea("Ciudad", { gap: 18 });
  linea(`Asunto: Exclusión del vehículo de placas ${placa} y liquidación de la prima no devengada. Pólizas RCC y RCE${poliza ? `. Póliza No. ${poliza}` : ""}.`, { bold: true, gap: 18 });
  linea("Respetados señores:", { gap: 16 });
  linea(
    `Yo, ${seguro(datos.propietario)}, identificado con cédula de ciudadanía No. ${seguro(datos.cc) || "__________"}, propietario del vehículo de placas ${placa}, vinculado a ${empresa}${seguro(datos.nit) ? `, NIT ${seguro(datos.nit)}` : ""}, solicito que a partir del ${fechaDia(datos.desde)} se excluya ese vehículo de las pólizas de Responsabilidad Civil Contractual y Extracontractual tomadas por esa empresa.`,
    { gap: 16 },
  );
  linea(
    "Solicito también la liquidación de la prima no devengada de ese vehículo, conforme al artículo 1070 del Código de Comercio, y que ese valor se informe a la empresa tomadora para que me sea reintegrado. Esta carta es independiente de la que presento a la empresa, para que el trámite no quede detenido si la empresa no responde.",
    { gap: 16 },
  );
  if (seguro(datos.liquidacion)) linea(seguro(datos.liquidacion), { gap: 16 });
  linea("Anexo copia de la cédula y de la tarjeta de propiedad.", { gap: 18 });
  cierre(datos, linea, espacio);
  return Buffer.from(await doc.save()).toString("base64");
}

export async function montarCartaDesvinculacion(datos: DatosDevolucion) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { linea, espacio } = hoja(doc, font, bold);
  const placa = seguro(datos.placa).toUpperCase();
  const vehiculo = [seguro(datos.marca) ? `marca ${seguro(datos.marca)}` : "", seguro(datos.modelo) ? `modelo ${seguro(datos.modelo)}` : ""].filter(Boolean).join(", ");

  linea(`${seguro(datos.ciudad) || "Bogotá D.C."}, ${fechaDia(datos.fecha)}`, { gap: 22 });
  linea("Señores");
  linea(empresaReal(datos.empresa) || "EMPRESA DE TRANSPORTE", { bold: true });
  if (seguro(datos.nit)) linea(`NIT ${seguro(datos.nit)}`);
  if (seguro(datos.direccionEmpresa)) linea(seguro(datos.direccionEmpresa));
  if (seguro(datos.correoEmpresa)) linea(seguro(datos.correoEmpresa));
  linea("Ciudad", { gap: 18 });
  linea(`Asunto: Solicitud de desvinculación del vehículo de placas ${placa} y retiro del sistema`, { bold: true, gap: 18 });
  linea("Respetados señores:", { gap: 16 });
  linea(
    `Yo, ${seguro(datos.propietario)}, identificado con cédula de ciudadanía No. ${seguro(datos.cc) || "__________"}, propietario del vehículo de placas ${placa}${vehiculo ? `, ${vehiculo}` : ""}, vinculado a su empresa, de manera libre y directa solicito lo siguiente:`,
    { gap: 16 },
  );
  linea(
    `1. La desvinculación del vehículo de placas ${placa} de su empresa, a partir del ${fechaDia(datos.desde)}. Esta petición la hago yo, como propietario. No depende de una carta de otra empresa ni de un requisito distinto.`,
    { gap: 16 },
  );
  linea(
    "2. Que saquen el vehículo del sistema de la empresa, lo retiren de las planillas de viaje y cancelen el tarjetón o la tarjeta de control que esté vigente, para que deje de figurar como activo y no pueda seguir siendo planillado.",
    { gap: 16 },
  );
  linea("3. Que informen la desvinculación a la autoridad de transporte y me entreguen la constancia por escrito.", { gap: 16 });
  linea("Fundamento mi solicitud en el Decreto 1079 de 2015, modificado por el Decreto 1001 del 4 de agosto de 2026:", { gap: 15 });
  linea("- La desvinculación o el cambio de empresa se puede pedir en cualquier momento durante la vigencia del contrato, y la empresa tiene quince (15) días hábiles para responder (artículo 2.2.1.3.6.5).", { gap: 15 });
  linea("- No se puede condicionar la desvinculación a requisitos que le quiten al propietario la libertad de escoger otra empresa (parágrafo 5 del mismo artículo).", { gap: 15 });
  linea("- No se puede cobrar por permitir la desvinculación, por la tarjeta de operación ni por la planilla, y el paz y salvo no es condición para los trámites de tránsito o transporte (parágrafo 4 del artículo 2.2.1.3.6.3).", { gap: 16 });
  linea("Si la empresa considera que hay un saldo a su favor, puede indicarlo en la respuesta, con el soporte. Esa discusión no detiene el retiro del sistema ni la cancelación del tarjetón y de las planillas.", { gap: 16 });
  linea("Solicito respuesta dentro de los quince (15) días hábiles siguientes.", { gap: 16 });
  linea("Anexo:", { gap: 14 });
  linea("- Copia de la cédula", { gap: 14 });
  linea("- Copia de la tarjeta de propiedad", { gap: 18 });
  cierre(datos, linea, espacio);
  return Buffer.from(await doc.save()).toString("base64");
}

export async function juntarPdfs(partes: string[]) {
  const out = await PDFDocument.create();
  for (const parte of partes) {
    if (!parte || parte.length < 80) continue;
    const src = await PDFDocument.load(Buffer.from(parte, "base64"));
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const hoja of pages) out.addPage(hoja);
  }
  return Buffer.from(await out.save()).toString("base64");
}
