import { leerBase64, prepararParaLeer } from "@/lib/archivo";

export async function paginasDe(file: File) {
  const esPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!esPdf) {
    if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|bmp)$/i.test(file.name)) {
      throw new Error("Sube una foto o un PDF");
    }
    if (file.size <= 1_400_000 && /image\/(jpeg|jpg|png|webp)/i.test(file.type || "")) {
      const base = file.name.replace(/\.[^.]+$/, "") || "foto";
      return { paginas: [{ nombre: `${base}.jpg`, archivo: await leerBase64(file) }], sobraron: 0 };
    }
    const lista = await prepararParaLeer(file);
    return { paginas: [lista], sobraron: 0 };
  }
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const binario = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: binario }).promise;
  const total = Math.min(doc.numPages, 8);
  const base = file.name.replace(/\.pdf$/i, "") || "documento";
  const paginas: { nombre: string; archivo: string }[] = [];
  for (let numero = 1; numero <= total; numero++) {
    const hoja = await doc.getPage(numero);
    const natural = hoja.getViewport({ scale: 1 });
    const vista = hoja.getViewport({ scale: Math.min(2.4, 2000 / natural.width) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(vista.width));
    canvas.height = Math.max(1, Math.floor(vista.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No pude abrir el PDF");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await hoja.render({ canvasContext: ctx, viewport: vista }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((item) => resolve(item), "image/jpeg", 0.92));
    if (!blob) throw new Error("No pude leer una página del PDF");
    paginas.push({ nombre: `${base}-p${numero}.jpg`, archivo: await leerBase64(blob) });
  }
  return { paginas, sobraron: Math.max(0, doc.numPages - total) };
}