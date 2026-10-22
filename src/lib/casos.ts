import { manoDe, opTarjetaDe, viaEstadoDe, type Mano, type OpTarjeta, type ViaEstado } from "@/lib/piloto";

export const STEPS = [
  { key: "dijoSi", label: "Dijo sí", group: "Inicio" },
  { key: "cedula", label: "Cédula", group: "Documentos" },
  { key: "tarjetaPropiedad", label: "Tarjeta de propiedad", group: "Documentos" },
  { key: "tarjetaOperacion", label: "Tarjeta de operación", group: "Documentos" },
  { key: "soat", label: "SOAT", group: "Documentos" },
  { key: "tecnomecanica", label: "Tecnomecánica", group: "Documentos" },
  { key: "formulario", label: "Formulario", group: "Documentos" },
  { key: "documentos", label: "Documentos subidos", group: "Documentos" },
  { key: "firmaCarta", label: "Firma de la carta", group: "Firma" },
  { key: "firmaContrato", label: "Firma del contrato", group: "Firma" },
  { key: "plataPoliza", label: "Tiene la plata de la póliza", group: "Póliza" },
  { key: "viaSeguros", label: "Pasado a Vía Seguros", group: "Póliza" },
  { key: "polizasSubidas", label: "Pólizas pagadas", group: "Póliza" },
  { key: "operativa", label: "Pasado a Operativa", group: "Tarjeta" },
  { key: "tarjetaEntregada", label: "Tarjeta entregada", group: "Tarjeta" },
  { key: "completado", label: "Completado", group: "Tarjeta" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

export const ORIGENES = ["Trabajo de campo", "Base de datos (Call)", "Referido"] as const;

export type Caso = {
  id: number;
  ownerId: string;
  ownerName: string;
  placa: string;
  cc: string;
  nombre: string;
  telefono: string;
  empresa: string;
  origen: string;
  direccion: string;
  correo: string;
  marca: string;
  linea: string;
  modelo: string;
  fechaFirma: string;
  fechaPoliza: string;
  fechaCompra: string;
  polizaFase: "" | "espera" | "recibida" | "avisada";
  polizaEntrega: "" | "pide_foto" | "pide_final" | "foto" | "final";
  mano: Mano;
  viaEstado: ViaEstado;
  viaEnlace: string;
  viaNota: string;
  viaPideCarta: boolean;
  viaPideContrato: boolean;
  opPolizas: boolean;
  opImpreso: boolean;
  opPedido: string;
  opTarjeta: OpTarjeta;
  docsOcultos: string;
  servicioNota: string;
  bonos: string;
  beneficios: string;
  contratoNombre: string;
  docusealId: string;
  docusealEstado: string;
  auditoriaNombre: string;
  fechaInicio: string;
  estadoTarjeta: "" | "Pendiente" | "Radicada" | "Expedida";
  observacion: string;
  proxima: string;
  fechaProxima: string;
  motivoCierre: string;
  fechaCierre: string;
  avance: number;
  estado: string;
  actualizadoEn: string;
  actualizadoPor: string;
} & Record<StepKey, boolean>;

export type CasoDraft = {
  placa: string;
  cc: string;
  nombre: string;
  telefono: string;
  empresa: string;
  origen?: string;
  direccion?: string;
  correo?: string;
  marca?: string;
  linea?: string;
  modelo?: string;
  fechaFirma?: string;
  contratoNombre?: string;
  contratoPdf?: string;
  firmaContrato?: boolean;
  ownerSlug?: string;
};

const DB: Record<StepKey, string> = {
  dijoSi: "dijo_si",
  cedula: "cedula",
  tarjetaPropiedad: "tarjeta_propiedad",
  tarjetaOperacion: "tarjeta_operacion",
  soat: "soat",
  tecnomecanica: "tecnomecanica",
  formulario: "formulario",
  documentos: "documentos",
  firmaCarta: "firma_carta",
  firmaContrato: "firma_contrato",
  plataPoliza: "plata_poliza",
  viaSeguros: "via_seguros",
  polizasSubidas: "polizas_subidas",
  operativa: "operativa",
  tarjetaEntregada: "tarjeta_entregada",
  completado: "completado",
};

export type CasoRow = {
  id: number;
  owner_id: string;
  owner_name: string;
  placa: string;
  cc: string;
  nombre: string;
  telefono: string;
  empresa: string;
  origen: string;
  direccion: string;
  correo: string;
  marca: string;
  linea: string;
  modelo: string;
  fecha_firma: string;
  fecha_poliza: string;
  contrato_nombre: string;
  fecha_inicio: string;
  estado_tarjeta: string;
  observacion: string;
  proxima: string;
  fecha_proxima: string;
  motivo_cierre?: string;
  fecha_cierre?: string;
} & Record<string, boolean | string | number>;

export function toCaso(row: CasoRow): Caso {
  const steps = {} as Record<StepKey, boolean>;
  for (const step of STEPS) steps[step.key] = Boolean(row[DB[step.key]]);
  const done = STEPS.filter((s) => steps[s.key]).length;
  const tarjeta = (["Pendiente", "Radicada", "Expedida"].includes(row.estado_tarjeta)
    ? row.estado_tarjeta
    : "") as Caso["estadoTarjeta"];
  const motivoCierre = String(row.motivo_cierre ?? "").trim();
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    placa: row.placa,
    cc: row.cc,
    nombre: row.nombre,
    telefono: row.telefono,
    empresa: row.empresa,
    origen: row.origen ?? "",
    direccion: row.direccion ?? "",
    correo: row.correo ?? "",
    marca: row.marca ?? "",
    linea: row.linea ?? "",
    modelo: row.modelo ?? "",
    fechaFirma: row.fecha_firma ?? "",
    fechaPoliza: row.fecha_poliza ?? "",
    fechaCompra: String(row.fecha_compra ?? ""),
    polizaFase: faseDe(row.poliza_fase),
    polizaEntrega: entregaDe(row.poliza_entrega),
    mano: manoDe(row.mano),
    viaEstado: viaEstadoDe(row.via_estado),
    viaEnlace: String(row.via_enlace ?? ""),
    viaNota: String(row.via_nota ?? ""),
    viaPideCarta: Boolean(row.via_pide_carta),
    viaPideContrato: Boolean(row.via_pide_contrato),
    opPolizas: Boolean(row.op_polizas),
    opImpreso: Boolean(row.op_impreso),
    opPedido: String(row.op_pedido ?? ""),
    opTarjeta: opTarjetaDe(row.op_tarjeta),
    docsOcultos: String(row.docs_ocultos ?? ""),
    servicioNota: String(row.servicio_nota ?? ""),
    bonos: String(row.bonos ?? ""),
    beneficios: String(row.beneficios ?? ""),
    contratoNombre: row.contrato_nombre ?? "",
    docusealId: String(row.docuseal_id ?? ""),
    docusealEstado: String(row.docuseal_estado ?? ""),
    auditoriaNombre: String(row.auditoria_nombre ?? ""),
    fechaInicio: row.fecha_inicio,
    estadoTarjeta: tarjeta,
    observacion: row.observacion,
    proxima: row.proxima,
    fechaProxima: row.fecha_proxima,
    motivoCierre,
    fechaCierre: String(row.fecha_cierre ?? ""),
    avance: Math.round((done / STEPS.length) * 100),
    estado: estadoDe({ ...steps, estadoTarjeta: tarjeta, motivoCierre, polizaFase: faseDe(row.poliza_fase), polizaEntrega: entregaDe(row.poliza_entrega) }),
    actualizadoEn: String(row.updated_at ?? ""),
    actualizadoPor: String(row.actualizado_por ?? ""),
    ...steps,
  };
}

export function faseDe(value: unknown): Caso["polizaFase"] {
  return value === "espera" || value === "recibida" || value === "avisada" ? value : "";
}

export function entregaDe(value: unknown): Caso["polizaEntrega"] {
  return value === "pide_foto" || value === "pide_final" || value === "foto" || value === "final" ? value : "";
}

export function estadoDe(c: Record<StepKey, boolean> & { estadoTarjeta: string; motivoCierre?: string; polizaFase?: string; polizaEntrega?: string }) {
  if (c.completado) return "Completado";
  if ((c.motivoCierre ?? "").trim()) return "No se concretó";
  if (c.tarjetaEntregada) return "Entregada";
  if (c.estadoTarjeta === "Expedida") return "Tarjeta expedida";
  if (c.estadoTarjeta === "Radicada") return "Tarjeta radicada";
  if (c.operativa) return "En operativa";
  if (c.polizasSubidas) {
    if (c.polizaEntrega === "pide_foto" || c.polizaEntrega === "pide_final") return "Por aceptar";
    if (c.polizaEntrega === "foto" || c.polizaEntrega === "final") return "Pólizas entregadas";
    if (c.polizaFase) return "Pólizas con David";
    return "Póliza lista";
  }
  if (c.viaSeguros) return "En Vía Seguros";
  if (c.firmaCarta || c.firmaContrato) return "En firma";
  if (c.documentos) return "Documentos";
  if (c.dijoSi) return "Dijo sí";
  return "Nuevo";
}

export function hechosDe(c: Record<StepKey, boolean>) {
  return STEPS.filter((s) => c[s.key]).length;
}

export function conAvance<T extends Record<StepKey, boolean> & { estadoTarjeta: Caso["estadoTarjeta"]; motivoCierre?: string }>(c: T) {
  const hechos = hechosDe(c);
  return {
    ...c,
    avance: Math.round((hechos / STEPS.length) * 100),
    estado: estadoDe(c),
    hechos,
  };
}

export function hoyBogota() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const POLIZA_ESTADOS = ["En Vía Seguros", "Póliza lista", "Pólizas con David", "Por aceptar", "Pólizas entregadas"] as const;

export const OPERATIVA_ESTADOS = ["En operativa", "Tarjeta radicada", "Tarjeta expedida", "Entregada"] as const;

export function tableroDe(rows: Caso[]) {
  return {
    procesos: rows.filter((c) => enCurso(c)).length,
    dijoSi: rows.filter((c) => c.estado === "Dijo sí").length,
    documentos: rows.filter((c) => c.estado === "Documentos").length,
    firma: rows.filter((c) => c.estado === "En firma").length,
    poliza: rows.filter((c) => (POLIZA_ESTADOS as readonly string[]).includes(c.estado)).length,
    operativa: rows.filter((c) => (OPERATIVA_ESTADOS as readonly string[]).includes(c.estado)).length,
    completados: rows.filter((c) => c.completado).length,
    cerrados: rows.filter((c) => !c.completado && c.motivoCierre.trim()).length,
  };
}

const PEDIR = [
  ["cedula", "cédula"],
  ["tarjetaPropiedad", "tarjeta de propiedad"],
  ["tarjetaOperacion", "tarjeta de operación"],
  ["soat", "SOAT"],
  ["tecnomecanica", "tecnomecánica"],
] as const;

export function siguientePaso(c: Pick<Caso, StepKey | "estadoTarjeta" | "motivoCierre" | "fechaCompra" | "polizaFase" | "polizaEntrega">) {
  if (c.completado) return "Proceso cerrado";
  if (c.motivoCierre.trim()) return c.motivoCierre.trim();
  if (!c.dijoSi) return "Confirmar que el propietario dijo sí";
  const falta = PEDIR.filter(([key]) => !c[key]).map(([, label]) => label);
  if (falta.length) return `Pedir ${falta.join(", ")}`;
  if (!c.formulario) return "Llenar el formulario";
  if (!c.documentos) return "Subir los documentos";
  if (!c.firmaCarta) return "Firmar la carta";
  if (!c.firmaContrato) return "Firmar el contrato";
  if (!c.plataPoliza) return "Confirmar la plata de la póliza";
  if (!c.fechaCompra) return "Cuadrar la fecha para comprar las pólizas";
  if (!c.viaSeguros) return "Llevarlo a Vía Seguros";
  if (!c.polizasSubidas) return "Marcar las pólizas como pagadas";
  if (!c.operativa && !c.estadoTarjeta && !c.tarjetaEntregada) {
    if (!c.polizaFase) return "David: dejar las pólizas en espera de impresión";
    if (c.polizaFase === "espera") return "David: marcar que recibió las pólizas impresas";
    if (c.polizaFase === "recibida") return "David: avisar que ya recibió las pólizas";
    if (c.polizaEntrega === "pide_foto" || c.polizaEntrega === "pide_final") return "Aceptar las pólizas que David va a entregar";
    if (!c.polizaEntrega) return "David: decir que va a entregar las pólizas";
  }
  if (c.tarjetaEntregada) return "Marcar completado";
  if (c.estadoTarjeta === "Expedida") return "Entregar la tarjeta al propietario";
  if (c.estadoTarjeta === "Radicada") return "Esperar a que la tarjeta quede expedida";
  if (c.estadoTarjeta === "Pendiente") return "Tarjeta pendiente en Operativa";
  if (!c.operativa) return "Pasar a Operativa";
  return "Dejar la tarjeta en pendiente, radicada o expedida";
}

export function requisitosVia(c: Pick<Caso, StepKey>) {
  return (
    c.cedula &&
    c.tarjetaPropiedad &&
    c.tarjetaOperacion &&
    c.soat &&
    c.tecnomecanica &&
    c.formulario &&
    c.documentos &&
    c.firmaCarta &&
    c.firmaContrato &&
    c.plataPoliza
  );
}

export function listoParaVia(c: Pick<Caso, StepKey>) {
  return requisitosVia(c) && !c.viaSeguros;
}

export function enCurso(c: { completado: boolean; motivoCierre: string }) {
  return !c.completado && !c.motivoCierre.trim();
}
