export const DOCS_PILOTO = [
  { id: "unificado", label: "PDF con todo" },
  { id: "cedula", label: "Cédula" },
  { id: "tarjeta_propiedad", label: "Tarjeta de propiedad" },
  { id: "tarjeta_operacion", label: "Tarjeta de operación" },
  { id: "soat", label: "SOAT" },
  { id: "tecnomecanica", label: "Tecnomecánica" },
  { id: "formulario", label: "Formulario" },
  { id: "contrato", label: "Contrato" },
  { id: "carta", label: "Carta de desvinculación" },
  { id: "comprobante", label: "Comprobante de pago" },
  { id: "poliza", label: "Póliza" },
] as const;

export type DocTipo = (typeof DOCS_PILOTO)[number]["id"];

export const BENEFICIOS = [
  { id: "rodamiento", label: "Rodamiento" },
  { id: "app", label: "App, 3 meses" },
  { id: "afiliacion", label: "Afiliación" },
  { id: "tarjeta", label: "Tarjeta de operación" },
  { id: "distintivos", label: "Distintivos" },
] as const;

export const TARJETAS_OP = [
  { id: "pagada", label: "Pagada" },
  { id: "bus", label: "En bus" },
  { id: "movilidad", label: "En movilidad" },
  { id: "radicada", label: "Radicada" },
  { id: "expedida", label: "Expedida" },
  { id: "entregada", label: "Entregada" },
] as const;

export type Mano = "" | "via" | "operativa" | "servicio";
export type ViaEstado = "" | "pedido" | "enlace" | "comprobante" | "recibido" | "no_coincide";
export type OpTarjeta = "" | "pagada" | "bus" | "movilidad" | "radicada" | "expedida" | "entregada";

const DOC_IDS = new Set<string>(DOCS_PILOTO.map((d) => d.id));

export function docsDe(value: unknown) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => DOC_IDS.has(item));
}

export function etiquetaDoc(id: string) {
  return DOCS_PILOTO.find((d) => d.id === id)?.label ?? id;
}

export function manoDe(value: unknown): Mano {
  return value === "via" || value === "operativa" || value === "servicio" ? value : "";
}

export function viaEstadoDe(value: unknown): ViaEstado {
  return value === "pedido" || value === "enlace" || value === "comprobante" || value === "recibido" || value === "no_coincide"
    ? value
    : "";
}

export function opTarjetaDe(value: unknown): OpTarjeta {
  return value === "pagada" || value === "bus" || value === "movilidad" || value === "radicada" || value === "expedida" || value === "entregada"
    ? value
    : "";
}

export function etiquetaMano(mano: string) {
  if (mano === "via") return "En Vía Seguros";
  if (mano === "operativa") return "En operativa";
  if (mano === "servicio") return "En servicio al cliente";
  return "Con el asesor";
}

export function etiquetaVia(estado: string) {
  if (estado === "pedido") return "Falta el enlace de pago";
  if (estado === "enlace") return "Enlace listo. Falta el pago";
  if (estado === "comprobante") return "Comprobante por revisar";
  if (estado === "recibido") return "Pago recibido";
  if (estado === "no_coincide") return "El pago no coincide";
  return "Sin solicitar";
}
