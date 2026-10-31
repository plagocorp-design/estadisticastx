import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PLANTILLA } from "./contrato-plantilla";
import type { DatosFirma } from "./firma.functions";

const tinta = rgb(0.07, 0.13, 0.22);

export function huecosFirma(cantidad: number, techo: number, piso: number, altoBase = 52) {
  const n = Math.max(cantidad, 1);
  const alto = n <= 2 ? altoBase : n <= 4 ? Math.min(40, altoBase) : n <= 6 ? 30 : 22;
  const paso = alto + 10;
  const inicio = Math.min(techo, piso + (n - 1) * paso);
  return Array.from({ length: n }, (_, i) => ({ y: Math.round(inicio - i * paso), h: alto }));
}

function duenosDe(datos: DatosFirma) {
  const extras = datos.propietarios?.length
    ? datos.propietarios
    : datos.copropietario
      ? [{ nombre: datos.copropietario, cc: datos.cc2 ?? "" }]
      : [];
  return [{ nombre: datos.nombre, cc: datos.cc }, ...extras.filter((p) => p.nombre)];
}

function seguro(value: string) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[^\x20-\x7E¡-ÿ]/g, "")
    .trim();
}

function fechaBogota(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const partes = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "long",
    year: "2-digit",
  }).formatToParts(d);
  const tomar = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return { dia: tomar("day"), mes: tomar("month"), ano: tomar("year") };
}

export async function montarContrato(
  datos: DatosFirma,
  firmas: { nombre: string; png: string }[],
  cuando?: string,
) {
  const doc = await PDFDocument.load(Buffer.from(PLANTILLA, "base64"));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const [pagina, firma, datosPersonales] = doc.getPages();
  const fecha = fechaBogota(cuando);

  function texto(page: (typeof pagina), value: string, x: number, y: number, size = 8) {
    const limpio = seguro(value);
    if (!limpio) return;
    page.drawText(limpio, { x, y, size, font, color: tinta });
  }

  const duenos = duenosDe(datos);
  const nombres = duenos.map((p) => p.nombre).filter(Boolean).join("  /  ");
  const cedulas = duenos.map((p) => p.cc).filter(Boolean).join("  /  ");
  texto(pagina, nombres, 60, 852, nombres.length > 42 ? 8 : 10);
  texto(pagina, cedulas, 350, 852, cedulas.length > 24 ? 8 : 10);
  texto(pagina, datos.direccion, 112, 799, 8);
  texto(pagina, datos.telefono, 398, 799, 8);
  texto(pagina, datos.marca, 92, 733, 8);
  texto(pagina, datos.linea, 262, 733, 7);
  texto(pagina, datos.clase, 424, 733, 8);
  texto(pagina, datos.modelo, 98, 715, 8);
  texto(pagina, datos.motor, 280, 715, 7);
  texto(pagina, datos.servicio, 470, 715, 8);
  texto(pagina, datos.serie, 100, 696, 7);
  texto(pagina, datos.carroceria, 292, 696, 7);
  texto(pagina, datos.cilindraje, 446, 696, 8);
  texto(pagina, datos.placa, 92, 678, 9);

  texto(firma, datos.correo, 126, 376, 8);
  texto(firma, fecha.dia, 110, 346, 8);
  texto(firma, fecha.mes, 193, 346, 8);
  texto(firma, fecha.ano, 281, 346, 8);

  texto(datosPersonales, fecha.dia, 209, 510, 10);
  texto(datosPersonales, fecha.mes, 313, 510, 10);
  texto(datosPersonales, fecha.ano, 423, 510, 10);
  texto(datosPersonales, datos.telefono, 102, 471, 10);
  texto(datosPersonales, datos.direccion, 108, 446, 9);

  const huecos = huecosFirma(Math.max(firmas.length, 1), 300, 36);
  const huecosDatos = huecosFirma(Math.max(firmas.length, 1), 360, 48);
  for (const [indice, firmaHecha] of firmas.entries()) {
    const base = firmaHecha.png.replace(/^data:image\/png;base64,/, "");
    if (base.length < 40) continue;
    const imagen = await doc.embedPng(Buffer.from(base, "base64"));
    const sitio = huecos[indice] ?? huecos[huecos.length - 1];
    const sitioDatos = huecosDatos[indice] ?? huecosDatos[huecosDatos.length - 1];
    firma.drawImage(imagen, { x: 330, y: sitio.y, width: 170, height: sitio.h });
    texto(firma, firmaHecha.nombre, 330, sitio.y - 10, 7);
    datosPersonales.drawImage(imagen, { x: 60, y: sitioDatos.y, width: 180, height: sitioDatos.h });
    texto(datosPersonales, firmaHecha.nombre, 60, sitioDatos.y - 10, 8);
  }

  return Buffer.from(await doc.save()).toString("base64");
}
