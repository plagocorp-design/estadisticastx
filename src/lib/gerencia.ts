import { STEPS } from "@/lib/casos";
import { DOCS_PILOTO, MARCAS_OP, MARCAS_SERVICIO, MARCAS_VIA, copiasAlImprimir } from "@/lib/piloto";

export type DocConfig = {
  id: string;
  label: string;
  obligatorio: boolean;
  copias: number;
  vigencia: boolean;
  activo: boolean;
  parte: string;
};

export type PasoConfig = {
  key: string;
  label: string;
  grupo: string;
  activo: boolean;
};

export type FlujoConfig = {
  operativaAntesDePago: boolean;
};

export type CampoContrato = {
  id?: string;
  campo: string;
  pagina: number;
  x: number;
  y: number;
  size: number;
  fuente?: string;
};

export type CiudadConfig = {
  documentos: DocConfig[];
  pasos: PasoConfig[];
  textos: Record<string, string>;
  flujo: FlujoConfig;
  contratoNombre: string;
  contratoNota: string;
  contratoCampos: CampoContrato[];
};

export const TEXTOS_BASE: { clave: string; label: string; valor: string }[] = [
  { clave: "bitacora_aviso", label: "Aviso de bitácora", valor: "Son más de las 4:30. Falta tu bitácora de hoy." },
  { clave: "enviar_operativa", label: "Botón de operativa", valor: "Enviar a operativa" },
  { clave: "whatsapp_pago", label: "WhatsApp del enlace de pago", valor: "Hola. Le comparto el enlace para el pago de la póliza." },
  { clave: "siguiente_vacio", label: "Cuando no hay siguiente paso", valor: "Nada pendiente en el proceso." },
];

const NO_PIDEN = new Set(["soat", "tecnomecanica", "formulario"]);

export function parteDeDoc(id: string) {
  if (id === "contrato" || id === "carta" || id === "autorizacion") return "Firma";
  if (id === "poliza" || id === "comprobante") return "Póliza";
  return "Documentos";
}

export const DATOS_CONTRATO: { campo: string; label: string; viene: string }[] = [
  { campo: "nombre", label: "Nombre", viene: "Cédula, frente" },
  { campo: "cc", label: "Cédula", viene: "Cédula, frente" },
  { campo: "direccion", label: "Dirección", viene: "Formulario inicial" },
  { campo: "telefono", label: "Teléfono", viene: "Formulario inicial" },
  { campo: "correo", label: "Correo", viene: "Formulario inicial" },
  { campo: "placa", label: "Placa", viene: "Tarjeta de propiedad" },
  { campo: "marca", label: "Marca", viene: "Tarjeta de propiedad" },
  { campo: "linea", label: "Línea", viene: "Tarjeta de propiedad" },
  { campo: "clase", label: "Clase", viene: "Tarjeta de propiedad" },
  { campo: "modelo", label: "Modelo", viene: "Tarjeta de propiedad" },
  { campo: "motor", label: "Número de motor", viene: "Tarjeta de propiedad" },
  { campo: "serie", label: "Número de serie", viene: "Tarjeta de propiedad" },
  { campo: "carroceria", label: "Carrocería", viene: "Tarjeta de propiedad" },
  { campo: "cilindraje", label: "Cilindraje", viene: "Tarjeta de propiedad" },
  { campo: "servicio", label: "Tipo de servicio", viene: "Tarjeta de operación" },
  { campo: "capacidad", label: "Pasajeros", viene: "Tarjeta de operación" },
  { campo: "dia", label: "Día de la firma", viene: "Fecha de firma" },
  { campo: "mes", label: "Mes de la firma", viene: "Fecha de firma" },
  { campo: "ano", label: "Año de la firma", viene: "Fecha de firma" },
  { campo: "firma", label: "Firma del vinculado", viene: "Firma" },
];

export const CAMPOS_CONTRATO: CampoContrato[] = [
  { id: "nombre", campo: "nombre", pagina: 0, x: 60, y: 852, size: 10 },
  { id: "cc", campo: "cc", pagina: 0, x: 350, y: 852, size: 10 },
  { id: "direccion", campo: "direccion", pagina: 0, x: 112, y: 799, size: 8 },
  { id: "telefono", campo: "telefono", pagina: 0, x: 398, y: 799, size: 8 },
  { id: "marca", campo: "marca", pagina: 0, x: 92, y: 733, size: 8 },
  { id: "linea", campo: "linea", pagina: 0, x: 262, y: 733, size: 7 },
  { id: "clase", campo: "clase", pagina: 0, x: 424, y: 733, size: 8 },
  { id: "modelo", campo: "modelo", pagina: 0, x: 98, y: 715, size: 8 },
  { id: "motor", campo: "motor", pagina: 0, x: 280, y: 715, size: 7 },
  { id: "servicio", campo: "servicio", pagina: 0, x: 470, y: 715, size: 8 },
  { id: "serie", campo: "serie", pagina: 0, x: 100, y: 696, size: 7 },
  { id: "carroceria", campo: "carroceria", pagina: 0, x: 292, y: 696, size: 7 },
  { id: "cilindraje", campo: "cilindraje", pagina: 0, x: 446, y: 696, size: 8 },
  { id: "placa", campo: "placa", pagina: 0, x: 92, y: 678, size: 9 },
  { id: "correo", campo: "correo", pagina: 1, x: 126, y: 376, size: 8 },
  { id: "dia", campo: "dia", pagina: 1, x: 110, y: 346, size: 8 },
  { id: "mes", campo: "mes", pagina: 1, x: 193, y: 346, size: 8 },
  { id: "ano", campo: "ano", pagina: 1, x: 281, y: 346, size: 8 },
  { id: "firma", campo: "firma", pagina: 1, x: 330, y: 300, size: 8 },
];

export function configBase(): CiudadConfig {
  return {
    documentos: DOCS_PILOTO.map((doc) => ({
      id: doc.id,
      label: doc.label,
      obligatorio: doc.id === "cedula" || doc.id === "tarjeta_propiedad" || doc.id === "tarjeta_operacion",
      copias: copiasAlImprimir(doc.id),
      vigencia: doc.id === "soat" || doc.id === "tecnomecanica" || doc.id === "tarjeta_operacion" || doc.id === "poliza",
      activo: !NO_PIDEN.has(doc.id),
      parte: parteDeDoc(doc.id),
    })),
    pasos: [
      ...STEPS.map((paso) => ({
        key: paso.key,
        label: paso.label,
        grupo: paso.group,
        activo: !NO_PIDEN.has(paso.key) && paso.key !== "documentos",
      })),
      ...MARCAS_OP.map((marca) => ({ key: marca.id, label: marca.label, grupo: "Operativa", activo: true })),
      ...MARCAS_VIA.map((marca) => ({ key: marca.id, label: marca.label, grupo: "Vía Seguros", activo: true })),
      ...MARCAS_SERVICIO.map((marca) => ({ key: marca.id, label: marca.label, grupo: "Servicio", activo: true })),
    ],
    textos: Object.fromEntries(TEXTOS_BASE.map((item) => [item.clave, item.valor])),
    flujo: { operativaAntesDePago: true },
    contratoNombre: "",
    contratoNota: "Nombre, cédula, dirección, teléfono, placa, marca, línea, modelo y la firma de cada propietario.",
    contratoCampos: CAMPOS_CONTRATO,
  };
}

function docGuardado(doc: Partial<DocConfig> & { id: string }): DocConfig {
  const base = configBase().documentos.find((item) => item.id === doc.id);
  const tieneParte = typeof doc.parte === "string" && doc.parte.length > 0;
  return {
    id: doc.id,
    label: doc.label || base?.label || doc.id,
    obligatorio: doc.obligatorio ?? base?.obligatorio ?? false,
    copias: doc.copias || base?.copias || 1,
    vigencia: doc.vigencia ?? base?.vigencia ?? false,
    activo: tieneParte ? doc.activo !== false : NO_PIDEN.has(doc.id) ? false : doc.activo !== false,
    parte: tieneParte ? String(doc.parte) : parteDeDoc(doc.id),
  };
}

export function mezclarConfig(raw: Partial<CiudadConfig> | null): CiudadConfig {
  const base = configBase();
  if (!raw) return base;
  const documentos = (raw.documentos?.length ? raw.documentos : base.documentos).map((doc) => docGuardado(doc));
  for (const doc of base.documentos) if (!documentos.some((item) => item.id === doc.id)) documentos.push(doc);
  const guardados = new Map((raw.pasos ?? []).map((paso) => [paso.key, paso]));
  const pasos = base.pasos.map((paso) => guardados.get(paso.key) ?? paso);
  for (const paso of raw.pasos ?? []) if (!pasos.some((item) => item.key === paso.key)) pasos.push(paso);
  const campos = raw.contratoCampos?.length ? raw.contratoCampos : base.contratoCampos;
  return {
    documentos,
    pasos,
    textos: { ...base.textos, ...(raw.textos ?? {}) },
    flujo: { ...base.flujo, ...(raw.flujo ?? {}) },
    contratoNombre: raw.contratoNombre ?? "",
    contratoNota: raw.contratoNota || base.contratoNota,
    contratoCampos: campos.map((campo, index) => ({ ...campo, id: campo.id || `${campo.campo}-${index}` })),
  };
}
