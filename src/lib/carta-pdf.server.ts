import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
