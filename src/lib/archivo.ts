export const TOPE_ENVIO = 600_000;

export function leerBase64(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      resolve(raw.includes(",") ? raw.split(",")[1] : raw);
    };
    reader.onerror = () => reject(new Error("No pude leer el archivo"));
    reader.readAsDataURL(file);
  });
}

async function comprimirImagen(file: File) {
  const bitmap = await createImageBitmap(file);
  const maxLado = 1800;
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No pude preparar la foto");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  let calidad = 0.72;
  let blob: Blob | null = null;
  for (; calidad >= 0.4; calidad -= 0.12) {
    blob = await new Promise((resolve) => canvas.toBlob((item) => resolve(item), "image/jpeg", calidad));
    if (blob && blob.size <= 480_000) break;
  }
  if (!blob) throw new Error("No pude preparar la foto");
  return blob;
}

export async function prepararArchivo(file: File) {
  if (file.size > 30 * 1024 * 1024) throw new Error("El archivo pesa más de 30 MB");
  if (file.type.startsWith("image/")) {
    try {
      const blob = await comprimirImagen(file);
      const base = file.name.replace(/\.[^.]+$/, "") || "foto";
      return { nombre: `${base}.jpg`, archivo: await leerBase64(blob) };
    } catch {
      /* un formato que el navegador no abre se manda por partes */
    }
  }
  return { nombre: file.name || "archivo", archivo: await leerBase64(file) };
}

export async function enviarEnTrozos(archivo: string, mandar: (orden: number, datos: string, fin: boolean) => Promise<void>) {
  const n = Math.max(1, Math.ceil(archivo.length / TOPE_ENVIO) || 1);
  for (let i = 0; i < n; i++) {
    await mandar(i, archivo.slice(i * TOPE_ENVIO, (i + 1) * TOPE_ENVIO), i === n - 1);
  }
}

export async function traerPorTrozos(total: number, pedir: (desde: number) => Promise<string>) {
  let archivo = "";
  let desde = 0;
  while (desde < total) {
    const parte = await pedir(desde);
    if (!parte) break;
    archivo += parte;
    desde += parte.length;
  }
  return archivo;
}
