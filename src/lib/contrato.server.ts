import { extractText, extractTextItems } from "unpdf";
import { contratoDesdeItems, contratoDesdeTexto, type ContratoLeido } from "./contrato";

function pdfBytes(base64: string) {
  const clean = base64.replace(/^data:application\/pdf;base64,/i, "").replace(/\s/g, "");
  const bytes = Buffer.from(clean, "base64");
  if (bytes.length < 80 || bytes.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("Sube el contrato en PDF");
  }
  if (bytes.length > 8_000_000) throw new Error("El PDF pesa más de 8 MB");
  return new Uint8Array(bytes);
}

function firmaDigital(data: Uint8Array) {
  const raw = Buffer.from(data).toString("latin1");
  return raw.includes("/Type/Sig") && (raw.includes("adbe.pkcs7") || raw.includes("DocuSeal"));
}

function conFirma(leido: ContratoLeido, data: Uint8Array) {
  if (!leido.firmado && firmaDigital(data)) leido.firmado = true;
  return leido;
}

export async function leerPdfContrato(base64: string): Promise<ContratoLeido> {
  const data = pdfBytes(base64);
  const { items } = await extractTextItems(data);
  const porLugar = contratoDesdeItems(items);
  if (porLugar) return conFirma(porLugar, data);
  const extraido = await extractText(data, { mergePages: true });
  const plano = Array.isArray(extraido.text) ? extraido.text.join("\n") : extraido.text;
  const porTexto = contratoDesdeTexto(plano);
  if (porTexto) return conFirma(porTexto, data);
  throw new Error("No encontré placa, nombre y cédula en ese PDF. Llénalos a mano.");
}
