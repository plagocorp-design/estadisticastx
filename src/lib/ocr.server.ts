import { analizarTexto, asignarLados, type LecturaDoc } from "@/lib/ocr";

function bytesDe(base64: string) {
  const limpio = base64.replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
  return Buffer.from(limpio, "base64");
}

async function textoPdf(data: Buffer) {
  const { extractText } = await import("unpdf");
  const extraido = await extractText(new Uint8Array(data), { mergePages: true });
  return Array.isArray(extraido.text) ? extraido.text.join("\n") : extraido.text;
}

type Lector = {
  recognize: (image: Buffer) => Promise<{ data: { text: string } }>;
  setParameters: (params: Record<string, string | number>) => Promise<unknown>;
};

let lector: Promise<Lector> | null = null;

async function prepararFotos(data: Buffer) {
  const cargado = await import("sharp");
  const sharp = typeof cargado.default === "function" ? cargado.default : (cargado as unknown as typeof cargado.default);
  const base = () => sharp(data, { failOn: "none" }).rotate().resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: false });
  const normal = await base().grayscale().normalize().sharpen().png().toBuffer();
  const contraste = await base().grayscale().linear(1.5, -30).normalize().sharpen().png().toBuffer();
  return [normal, contraste];
}

async function textoFoto(data: Buffer) {
  const { createWorker, PSM } = await import("tesseract.js");
  let imagenes = [data];
  try {
    imagenes = await prepararFotos(data);
  } catch {
    if (data.length > 8_000_000) return "";
  }
  if (!lector) {
    lector = createWorker("spa", 1, { cachePath: "/tmp/tessdata" }).then(async (worker) => {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      return worker as Lector;
    });
  }
  try {
    const worker = await lector;
    if (!worker) throw new Error("No pude leer la foto");
    const partes: string[] = [];
    for (const imagen of imagenes) {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      const primero = await worker.recognize(imagen);
      let texto = primero.data.text || "";
      if (texto.trim().length < 24) {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        const segundo = await worker.recognize(imagen);
        if ((segundo.data.text || "").trim().length > texto.trim().length) texto = segundo.data.text || "";
      }
      if (texto.trim()) partes.push(texto);
    }
    return partes.join("\n");
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

export async function leerVarias(
  paginas: { nombre: string; archivo: string }[],
  preferido: string,
  actual: Record<string, string>,
) {
  const textos: string[] = [];
  for (const pagina of paginas.slice(0, 8)) {
    const data = bytesDe(pagina.archivo);
    let texto = "";
    try {
      const esPdf = pagina.nombre.toLowerCase().endsWith(".pdf") || data.subarray(0, 5).toString() === "%PDF-";
      texto = esPdf ? await textoPdf(data) : await textoFoto(data);
    } catch {
      texto = "";
    }
    textos.push(texto);
  }
  const lados = asignarLados(textos, preferido);
  return paginas.slice(0, 8).map((pagina, indice) => {
    const tipo = lados[indice] || "";
    const lectura = analizarTexto(tipo || preferido || "foto", textos[indice], actual);
    return { indice, tipo, nombre: pagina.nombre, lectura };
  });
}
