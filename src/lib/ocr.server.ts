import { analizarTexto, asignarLados, fundirIA, type LecturaDoc } from "@/lib/ocr";

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
  return conVision(data, esPdf, analizarTexto(tipo, texto, actual));
}

const PEDIDO_IA = `Lee esta foto de un trámite de taxi en Colombia. Puede ser cédula, licencia de tránsito, tarjeta de operación, extracto o póliza RCC/RCE.
Responde solo JSON con estas claves, en blanco si no se ve: placa, cc, nombre, telefono, direccion, correo, marca, linea, modelo, empresa, capacidad, clase, carroceria, motor, serie, chasis, cilindraje, servicio, combustible, nit, aseguradora, poliza, inicioPoliza, vencePoliza, valorPoliza, alerta.
Reglas: motor, serie, chasis, línea, cilindraje y clase salen de la licencia de tránsito, nunca de la tarjeta de operación. La empresa sale de la razón social de la tarjeta de operación. Nombre y cédula salen de la cédula. Cilindraje sin puntos. NIT solo dígitos. Fechas de la póliza en YYYY-MM-DD. No inventes. Si la cédula y la licencia no coinciden, dilo en alerta.`;

function jsonDe(texto: string) {
  const limpio = texto.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return null;
  try {
    const valor = JSON.parse(limpio.slice(inicio, fin + 1)) as unknown;
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
    const salida: Record<string, string> = {};
    for (const [clave, item] of Object.entries(valor)) salida[clave] = String(item ?? "");
    return salida;
  } catch {
    return null;
  }
}

function textoRespuesta(cuerpo: unknown) {
  if (!cuerpo || typeof cuerpo !== "object") return "";
  const obj = cuerpo as { output_text?: string; output?: { content?: { text?: string }[] }[]; choices?: { message?: { content?: string } }[] };
  if (typeof obj.output_text === "string" && obj.output_text.trim()) return obj.output_text;
  const partes: string[] = [];
  for (const item of obj.output ?? []) {
    for (const bloque of item.content ?? []) if (bloque.text) partes.push(bloque.text);
  }
  if (partes.length) return partes.join("\n");
  return obj.choices?.[0]?.message?.content ?? "";
}

let iaFuera = false;

async function leerConIA(imagen: Buffer) {
  const apiKey = process.env.XAI_API_KEY;
  if (iaFuera || !apiKey) return null;
  let jpeg = imagen;
  try {
    const cargado = await import("sharp");
    const sharp = typeof cargado.default === "function" ? cargado.default : (cargado as unknown as typeof cargado.default);
    jpeg = await sharp(imagen, { failOn: "none" }).rotate().resize({ width: 1400, height: 1400, fit: "inside" }).jpeg({ quality: 68 }).toBuffer();
  } catch {
    return null;
  }
  if (jpeg.length < 800 || jpeg.length > 1_600_000) return null;
  const respuesta = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(22000),
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0,
      max_output_tokens: 700,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: PEDIDO_IA },
            { type: "input_image", image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}` },
          ],
        },
      ],
    }),
  });
  if (respuesta.status === 401 || respuesta.status === 402 || respuesta.status === 403) iaFuera = true;
  if (!respuesta.ok) return null;
  return jsonDe(textoRespuesta(await respuesta.json()));
}

async function conVision(data: Buffer, esPdf: boolean, lectura: LecturaDoc) {
  const utiles = Object.values(lectura.datos ?? {}).filter((valor) => String(valor ?? "").trim()).length;
  const poliza = Boolean(lectura.extra?.numeroPoliza || lectura.extra?.aseguradora);
  if (utiles >= 3 || poliza) return lectura;
  let imagen = data;
  if (esPdf) {
    const fotos = fotosDePdf(data);
    if (!fotos[0]) return lectura;
    imagen = fotos[0];
  }
  try {
    const crudo = await leerConIA(imagen);
    if (!crudo) return lectura;
    return fundirIA(lectura, crudo);
  } catch {
    return lectura;
  }
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
