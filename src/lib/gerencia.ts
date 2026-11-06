import { STEPS } from "@/lib/casos";
import { DOCS_PILOTO, copiasAlImprimir } from "@/lib/piloto";

export type DocConfig = {
  id: string;
  label: string;
  obligatorio: boolean;
  copias: number;
  vigencia: boolean;
  activo: boolean;
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

export function configBase(): CiudadConfig {
  return {
    documentos: DOCS_PILOTO.map((doc) => ({
      id: doc.id,
      label: doc.label,
      obligatorio: doc.id === "cedula" || doc.id === "tarjeta_propiedad" || doc.id === "tarjeta_operacion",
      copias: copiasAlImprimir(doc.id),
      vigencia: doc.id === "soat" || doc.id === "tecnomecanica" || doc.id === "tarjeta_operacion" || doc.id === "poliza",
      activo: true,
    })),
    pasos: STEPS.map((paso) => ({ key: paso.key, label: paso.label, grupo: paso.group, activo: true })),
    textos: Object.fromEntries(TEXTOS_BASE.map((item) => [item.clave, item.valor])),
    flujo: { operativaAntesDePago: true },
    contratoNombre: "",
    contratoNota: "Nombre, cédula, dirección, teléfono, placa, marca, línea, modelo y la firma de cada propietario.",
    contratoCampos: CAMPOS_CONTRATO,
  };
}

export const CAMPOS_CONTRATO: CampoContrato[] = [
  { campo: "nombre", pagina: 0, x: 60, y: 852, size: 10 },
  { campo: "cc", pagina: 0, x: 350, y: 852, size: 10 },
  { campo: "direccion", pagina: 0, x: 112, y: 799, size: 8 },
  { campo: "telefono", pagina: 0, x: 398, y: 799, size: 8 },
  { campo: "marca", pagina: 0, x: 92, y: 733, size: 8 },
  { campo: "linea", pagina: 0, x: 262, y: 733, size: 7 },
  { campo: "modelo", pagina: 0, x: 98, y: 715, size: 8 },
  { campo: "placa", pagina: 0, x: 92, y: 678, size: 9 },
  { campo: "correo", pagina: 1, x: 126, y: 376, size: 8 },
  { campo: "firma", pagina: 1, x: 330, y: 300, size: 8 },
];

export function mezclarConfig(raw: Partial<CiudadConfig> | null): CiudadConfig {
  const base = configBase();
  if (!raw) return base;
  return {
    documentos: raw.documentos?.length ? raw.documentos : base.documentos,
    pasos: raw.pasos?.length ? raw.pasos : base.pasos,
    textos: { ...base.textos, ...(raw.textos ?? {}) },
    flujo: { ...base.flujo, ...(raw.flujo ?? {}) },
    contratoNombre: raw.contratoNombre ?? "",
    contratoNota: raw.contratoNota || base.contratoNota,
    contratoCampos: raw.contratoCampos?.length ? raw.contratoCampos : base.contratoCampos,
  };
}
