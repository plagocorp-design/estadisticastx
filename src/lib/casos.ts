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
  capacidad: string;
  clase: string;
  carroceria: string;
  motor: string;
  serie: string;
  cilindraje: string;
  servicio: string;
  fechaFirma: string;
  fechaPoliza: string;
  fechaCompra: string;
  polizaFase: "" | "espera" | "recibida" | "avisada";
  polizaEntrega: "" | "pide_foto" | "pide_final" | "foto" | "final";
  mano: Mano;
  viaEstado: ViaEstado;
  viaEnlace: string;
  viaAtencion: "" | "presencial" | "virtual";
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
  areaMarcas: string;
  manoAsignado: string;
  devolucion: string;
  copropietarios: string;
  datosExtra: string;
  citaFecha: string;
  citaHora: string;
  entrega: string;
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
  capacidad?: string;
  clase?: string;
  carroceria?: string;
  motor?: string;
  serie?: string;
  cilindraje?: string;
  servicio?: string;
  fechaFirma?: string;
  contratoNombre?: string;
  contratoPdf?: string;
  firmaContrato?: boolean;
  ownerSlug?: string;
  copropietarios?: string;
};

export function otrosPropietarios(value: unknown) {
  try {
    const data = JSON.parse(String(value ?? "")) as { nombre?: string; cc?: string; correo?: string }[];
    if (!Array.isArray(data)) return [];
    return data
      .filter((parte) => parte && (String(parte.nombre ?? "").trim() || String(parte.cc ?? "").trim()))
      .slice(0, 11)
      .map((parte) => ({
        nombre: parte.nombre!.trim().slice(0, 80),
        cc: String(parte.cc ?? "").replace(/\D/g, "").slice(0, 20),
        correo: String(parte.correo ?? "").trim().slice(0, 80),
      }));
  } catch {
    return [];
  }
}

const NO_CUENTA = new Set<StepKey>(["soat", "tecnomecanica", "formulario", "documentos"]);

export function pasosQueCuentan() {
  return STEPS.filter((step) => !NO_CUENTA.has(step.key));
}

export const ENTREGA = [
  { id: "distintivos", label: "Distintivos recibidos de la jefe Asiyade: dos puertas y uno atrás" },
  { id: "pegada", label: "Carro en distintivos y planilla firmada" },
  { id: "carta", label: "Carta de autorización, si no viene el propietario" },
  { id: "tarjeta_nueva", label: "Tarjeta de operación nueva entregada" },
  { id: "tarjeton", label: "Tarjetón, si es conductor propietario" },
  { id: "bono_rodamiento", label: "Bono: año de rodamiento" },
  { id: "bono_app", label: "Bono: app de Taxis Libres" },
  { id: "bono_distintivos", label: "Bono de distintivos" },
  { id: "bono_equipo", label: "Bono de $100.000 para el equipo" },
  { id: "bono_espia", label: "Bono: dos meses de espía" },
] as const;

const ENTREGA_IDS = new Set<string>(ENTREGA.map((item) => item.id));

export function entregaIds(value: unknown) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => ENTREGA_IDS.has(item));
}

export function entregaLista(value: unknown) {
  return entregaIds(value).join(",");
}

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
  const pasos = pasosQueCuentan();
  const done = pasos.filter((step) => steps[step.key]).length;
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
    capacidad: String(row.capacidad ?? ""),
    clase: String(row.clase ?? ""),
    carroceria: String(row.carroceria ?? ""),
    motor: String(row.motor ?? ""),
    serie: String(row.serie ?? ""),
    cilindraje: String(row.cilindraje ?? ""),
    servicio: String(row.servicio ?? ""),
    fechaFirma: row.fecha_firma ?? "",
    fechaPoliza: row.fecha_poliza ?? "",
    fechaCompra: String(row.fecha_compra ?? ""),
    polizaFase: faseDe(row.poliza_fase),
    polizaEntrega: entregaDe(row.poliza_entrega),
    mano: manoDe(row.mano),
    viaEstado: viaEstadoDe(row.via_estado),
    viaEnlace: String(row.via_enlace ?? ""),
    viaAtencion: row.via_atencion === "presencial" || row.via_atencion === "virtual" ? row.via_atencion : "",
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
    areaMarcas: String(row.area_marcas ?? ""),
    manoAsignado: String(row.mano_asignado ?? ""),
    devolucion: String(row.devolucion ?? ""),
    copropietarios: String(row.copropietarios ?? ""),
    datosExtra: String(row.datos_extra ?? ""),
    citaFecha: String(row.cita_fecha ?? ""),
    citaHora: String(row.cita_hora ?? ""),
    entrega: entregaLista(row.entrega),
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
    avance: Math.round((done / pasos.length) * 100),
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
  if (c.cedula && c.tarjetaPropiedad && c.tarjetaOperacion) return "Documentos";
  if (c.dijoSi) return "Dijo sí";
  return "Nuevo";
}

export function hechosDe(c: Record<StepKey, boolean>) {
  return pasosQueCuentan().filter((s) => c[s.key]).length;
}

export function conAvance<T extends Record<StepKey, boolean> & { estadoTarjeta: Caso["estadoTarjeta"]; motivoCierre?: string }>(c: T) {
  const hechos = hechosDe(c);
  return {
    ...c,
    avance: Math.round((hechos / pasosQueCuentan().length) * 100),
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

export function casosDeArea(rows: Caso[], role: string) {
  if (role === "via_seguros") {
    return rows.filter((c) => c.mano === "via");
  }
  if (role === "operativa") {
    return rows.filter((c) => c.mano === "operativa" || (!c.completado && (OPERATIVA_ESTADOS as readonly string[]).includes(c.estado)));
  }
  if (role === "servicio") {
    return rows.filter((c) => c.mano === "servicio" || c.completado || Boolean(c.citaFecha));
  }
  return rows;
}

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
  ["cedula", "cédula del propietario"],
  ["tarjetaPropiedad", "tarjeta de propiedad"],
  ["tarjetaOperacion", "tarjeta de operación"],
] as const;

export function siguientePaso(c: Pick<Caso, StepKey | "estadoTarjeta" | "motivoCierre" | "fechaCompra" | "polizaFase" | "polizaEntrega" | "citaFecha" | "entrega" | "areaMarcas" | "opTarjeta" | "tarjetaEntregada">) {
  if (c.completado) return "Proceso cerrado";
  if (c.motivoCierre.trim()) return c.motivoCierre.trim();
  if (!c.dijoSi) return "Confirmar que el propietario dijo sí";
  const falta = PEDIR.filter(([key]) => !c[key]).map(([, label]) => label);
  if (falta.length) return `Pedir ${falta.join(", ")}`;
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
  const recibida = c.areaMarcas.includes("tarjeta_recibida") || c.opTarjeta === "entregada" || c.tarjetaEntregada || c.estadoTarjeta === "Expedida";
  if (!recibida) {
    if (c.estadoTarjeta === "Radicada") return "Esperar a que la tarjeta quede expedida";
    if (c.estadoTarjeta === "Pendiente") return "Tarjeta pendiente en Operativa";
    if (!c.operativa) return "Pasar a Operativa";
    return "Dejar la tarjeta en pendiente, radicada o expedida";
  }
  if (!c.citaFecha) return "Agendar la cita de entrega";
  const tiene = new Set(entregaIds(c.entrega));
  if (!tiene.has("distintivos")) return "Recibir los distintivos con la jefe Asiyade";
  if (!tiene.has("pegada")) return "Dejar el carro en distintivos y que firmen la planilla";
  if (!tiene.has("tarjeta_nueva")) return "Entregar la tarjeta de operación nueva";
  if (!["bono_rodamiento", "bono_app", "bono_distintivos", "bono_equipo", "bono_espia"].every((id) => tiene.has(id))) {
    return "Entregar los bonos en servicio al cliente";
  }
  return "Bajar por el carro y marcar completado";
}

export function requisitosVia(c: Pick<Caso, StepKey>) {
  return c.cedula && c.tarjetaPropiedad && c.tarjetaOperacion && c.firmaCarta && c.firmaContrato && c.plataPoliza;
}

export function listoParaVia(c: Pick<Caso, StepKey>) {
  return requisitosVia(c) && !c.viaSeguros;
}

export function enCurso(c: { completado: boolean; motivoCierre: string }) {
  return !c.completado && !c.motivoCierre.trim();
}
