import { analizarTexto, type LecturaDoc } from "@/lib/ocr";

function bytesDe(base64: string) {
  const limpio = base64.replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
  return Buffer.from(limpio, "base64");
}

async function textoPdf(data: Buffer) {
  const { extractText } = await import("unpdf");
  const extraido = await extractText(new Uint8Array(data), { mergePages: true });
  return Array.isArray(extraido.text) ? extraido.text.join("\n") : extraido.text;
}

let lector: Promise<{ recognize: (image: Buffer) => Promise<{ data: { text: string } }> }> | null = null;

async function textoFoto(data: Buffer) {
  const { createWorker, PSM } = await import("tesseract.js");
  let lista = data;
  try {
    const cargado = await import("sharp");
    const sharp = typeof cargado.default === "function" ? cargado.default : (cargado as unknown as typeof cargado.default);
    lista = await sharp(data, { failOn: "none" })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .grayscale()
      .normalize()
      .png()
      .toBuffer();
  } catch {
    if (data.length > 8_000_000) return "";
  }
  if (!lector) {
    lector = createWorker("spa", 1, { cachePath: "/tmp/tessdata" }).then(async (worker) => {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      return worker;
    });
  }
  try {
    const worker = await lector;
    const { data: leido } = await worker.recognize(lista);
    return leido.text || "";
  } catch (err) {
    lector = null;
    throw err;
  }
}

export async function leerArchivo(nombre: string, archivo: string, tipo: string, actual: Record<string, string>): Promise<LecturaDoc> {
  const data = bytesDe(archivo);
  const esPdf = nombre.toLowerCase().endsWith(".pdf") || data.subarray(0, 5).toString() === "%PDF-";
  let texto = "";
  try {
    texto = esPdf ? await textoPdf(data) : await textoFoto(data);
  } catch {
    texto = "";
  }
  return analizarTexto(tipo, texto, actual);
}
