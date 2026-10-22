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
  if (data.length > 8_000_000) return "";
  const { createWorker } = await import("tesseract.js");
  if (!lector) lector = createWorker("spa", 1, { cachePath: "/tmp/tessdata" });
  try {
    const worker = await lector;
    const { data: leido } = await worker.recognize(data);
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
