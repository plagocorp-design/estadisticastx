export const DOCS_PILOTO = [
  { id: "unificado", label: "Paquete completo" },
  { id: "cedula", label: "Cédula" },
  { id: "cedula_frente", label: "Cédula, frente" },
  { id: "cedula_reverso", label: "Cédula, reverso" },
  { id: "tarjeta_propiedad", label: "Tarjeta de propiedad" },
  { id: "tarjeta_propiedad_frente", label: "Tarjeta de propiedad, frente" },
  { id: "tarjeta_propiedad_reverso", label: "Tarjeta de propiedad, reverso" },
  { id: "tarjeta_operacion", label: "Tarjeta de operación" },
  { id: "soat", label: "SOAT" },
  { id: "tecnomecanica", label: "Tecnomecánica" },
  { id: "formulario", label: "Formulario" },
  { id: "contrato", label: "Contrato" },
  { id: "carta", label: "Carta de desvinculación" },
  { id: "autorizacion", label: "Carta de autorización del conductor" },
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

export const MARCAS_OP = [
  { id: "docs_bus", label: "Documentos pasados a VUS" },
  { id: "docs_movilidad", label: "Documentos pasados a movilidad" },
  { id: "pago_tarjeta", label: "Pago de la tarjeta de operación hecho" },
  { id: "tarjeta_proceso", label: "Tarjeta de operación en proceso" },
  { id: "tarjeta_recibida", label: "Tarjeta de operación recibida" },
] as const;

export const MARCAS_VIA = [
  { id: "carta_radicada", label: "Carta radicada" },
  { id: "link_expedido", label: "Link de pago expedido" },
  { id: "pago_recibido", label: "Pago recibido" },
  { id: "carta_firmada", label: "Carta firmada" },
  { id: "carta_devolucion", label: "Carta de devolución de días de póliza no usados" },
  { id: "recaudos", label: "Recaudos" },
  { id: "polizas_impresas", label: "Pólizas impresas, listas para recoger" },
  { id: "polizas_a_david", label: "Pólizas entregadas a David" },
] as const;

export const MARCAS_SERVICIO = [{ id: "atendido", label: "Atendido en servicio al cliente" }] as const;

const MARCA_IDS = new Set<string>([...MARCAS_OP, ...MARCAS_VIA, ...MARCAS_SERVICIO].map((m) => m.id));

export function marcasDe(value: unknown) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => MARCA_IDS.has(item));
}

export function etiquetaMarca(id: string, atencion = "") {
  if (id === "pago_recibido" && atencion === "presencial") return "Pago recibido en cajas";
  return [...MARCAS_OP, ...MARCAS_VIA, ...MARCAS_SERVICIO].find((m) => m.id === id)?.label ?? id;
}

export const TARJETAS_OP = [
  { id: "pagada", label: "Pagada" },
  { id: "bus", label: "En VUS" },
  { id: "movilidad", label: "En movilidad" },
  { id: "radicada", label: "Radicada" },
  { id: "expedida", label: "Expedida" },
  { id: "entregada", label: "Entregada" },
] as const;

export type Mano = "" | "via" | "operativa" | "servicio";
export type ViaEstado = "" | "pedido" | "enlace" | "comprobante" | "recibido" | "no_coincide";
export type OpTarjeta = "" | "pagada" | "bus" | "movilidad" | "radicada" | "expedida" | "entregada";

const DOC_IDS = new Set<string>(DOCS_PILOTO.map((d) => d.id));

export function tipoVisible(tipo: string) {
  if (tipo === "cedula_frente" || tipo === "cedula_reverso") return "cedula";
  if (tipo === "tarjeta_propiedad_frente" || tipo === "tarjeta_propiedad_reverso") return "tarjeta_propiedad";
  return tipo;
}

export function copiasAlImprimir(tipo: string) {
  return tipoVisible(tipo) === "tarjeta_propiedad" || tipo === "tarjeta_operacion" ? 2 : 1;
}

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

export function etiquetaOpTarjeta(id: string) {
  return TARJETAS_OP.find((t) => t.id === id)?.label ?? id;
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
