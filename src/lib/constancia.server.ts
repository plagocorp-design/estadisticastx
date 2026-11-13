import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const navy = rgb(0.106, 0.227, 0.294);
const tinta = rgb(0.063, 0.125, 0.2);
const suave = rgb(0.36, 0.42, 0.48);

function limpio(valor: string) {
  return String(valor || "—")
    .normalize("NFC")
    .replace(/[^\x20-\x7E¡-ÿ]/g, "")
    .slice(0, 180);
}

export async function pdfConstancia(dato: {
  nombre: string;
  cc: string;
  placa: string;
  correo: string;
  cuando: string;
  ip: string;
  agente: string;
  huella: string;
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 0, y: 748, width: 595, height: 94, color: navy });
  page.drawRectangle({ x: 0, y: 742, width: 595, height: 6, color: rgb(0.776, 0.91, 0.29) });
  try {
    const rutas = ["/workspace/public/taxis-libres-blanco.png", "public/taxis-libres-blanco.png"];
    let bytes: Buffer | null = null;
    for (const ruta of rutas) {
      try {
        bytes = await readFile(ruta);
        break;
      } catch {
        bytes = null;
      }
    }
    if (bytes) {
      const logo = await pdf.embedPng(bytes);
      const ancho = 168;
      const alto = (logo.height / logo.width) * ancho;
      page.drawImage(logo, { x: 40, y: 768, width: ancho, height: alto });
    }
  } catch {
    /* el certificado sale igual si el logo no está en el servidor */
  }
  page.drawText("CONSTANCIA DE FIRMA", { x: 40, y: 690, size: 22, font: bold, color: tinta });
  page.drawText("Vinculaciones · Radio Taxi Aeropuerto", { x: 40, y: 666, size: 11, font: regular, color: suave });
  const filas: [string, string][] = [
    ["Propietario", dato.nombre],
    ["Cédula", dato.cc || "—"],
    ["Placa", dato.placa],
    ["Correo", dato.correo],
    ["Firmó", dato.cuando],
    ["Desde", dato.ip || "Conexión sin IP visible"],
    ["Navegador", dato.agente || "—"],
    ["Huella", dato.huella || "—"],
  ];
  let y = 620;
  for (const [etiqueta, valor] of filas) {
    page.drawText(etiqueta.toUpperCase(), { x: 40, y, size: 9, font: bold, color: suave });
    page.drawText(limpio(valor), { x: 150, y, size: 12, font: regular, color: tinta });
    y -= 28;
  }
  const nota =
    "Esta constancia registra que la persona leyó el contrato, se tomó una foto de frente con la cédula y firmó en la pantalla. La huella ata el nombre, la placa, la firma y la foto. No reemplaza a una entidad de certificación acreditada.";
  const palabras = nota.split(" ");
  let linea = "";
  y -= 8;
  for (const palabra of palabras) {
    const siguiente = linea ? `${linea} ${palabra}` : palabra;
    if (siguiente.length > 78) {
      page.drawText(linea, { x: 40, y, size: 10, font: regular, color: suave });
      y -= 14;
      linea = palabra;
    } else linea = siguiente;
  }
  if (linea) page.drawText(linea, { x: 40, y, size: 10, font: regular, color: suave });
  return Buffer.from(await pdf.save()).toString("base64");
}
