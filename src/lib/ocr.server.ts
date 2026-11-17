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
  const contraste = await base().grayscale().normalize().linear(1.35, -15).sharpen().png().toBuffer();
  const binaria = await base().grayscale().normalize().threshold(140).png().toBuffer();
  return [contraste, binaria];
}

function fotosDePdf(data: Buffer) {
  const fotos: Buffer[] = [];
  for (let i = 0; i < data.length - 4; i += 1) {
    if (data[i] !== 0xff || data[i + 1] !== 0xd8 || data[i + 2] !== 0xff) continue;
    let fin = i + 2;
    while (fin < data.length - 1) {
      if (data[fin] === 0xff && data[fin + 1] === 0xd9) {
        fin += 2;
        break;
      }
      fin += 1;
    }
    if (fin - i > 12_000) fotos.push(data.subarray(i, fin));
    i = Math.max(i + 1, fin - 1);
  }
  return fotos.sort((a, b) => b.length - a.length).slice(0, 2);
}

async function textoDeBuffer(data: Buffer, esPdf: boolean) {
  if (!esPdf) return textoFoto(data);
  let texto = "";
  try {
    texto = await textoPdf(data);
  } catch {
    texto = "";
  }
  if (texto.trim().length >= 40) return texto;
  const partes = [texto];
  for (const foto of fotosDePdf(data)) {
    try {
      const leido = await textoFoto(foto);
      if (leido.trim()) partes.push(leido);
    } catch {
      /* la foto embebida no se pudo leer */
    }
  }
  return partes.filter((parte) => parte.trim()).join("\n");
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
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    const primero = await worker.recognize(imagenes[0]);
    let texto = primero.data.text || "";
    if (texto.trim().length < 70 && imagenes[1]) {
      const segundo = await worker.recognize(imagenes[1]);
      if ((segundo.data.text || "").trim().length > texto.trim().length) texto = segundo.data.text || "";
    }
    return texto;
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
    texto = await textoDeBuffer(data, esPdf);
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
      texto = await textoDeBuffer(data, esPdf);
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
