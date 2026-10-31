export const MODOS = [
  { id: "calle", label: "En la calle" },
  { id: "call", label: "En call" },
  { id: "mixto", label: "Calle y call" },
] as const;

export type ModoBitacora = (typeof MODOS)[number]["id"] | "";

export type Bitacora = {
  ownerId: string;
  ownerName: string;
  slug: string;
  fecha: string;
  modo: ModoBitacora;
  zonas: string;
  llamadas: number;
  visitas: number;
  dijoSi: number;
  polizas: number;
  queHizo: string;
  detalleCall: string;
  detalleCalle: string;
  trabas: string;
  manana: string;
};

export type BitacoraDraft = {
  fecha: string;
  modo: ModoBitacora;
  zonas: string;
  llamadas: number;
  visitas: number;
  dijoSi: number;
  polizas: number;
  queHizo: string;
  detalleCall: string;
  detalleCalle: string;
  trabas: string;
  manana: string;
};

export function horaBogota(ahora = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ahora);
  const hora = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minuto = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hora}:${minuto}`;
}

export function tardeParaBitacora(hora = horaBogota()) {
  return hora >= "16:30";
}

export function bitacoraHecha(row: Pick<Bitacora, "queHizo" | "llamadas" | "visitas" | "dijoSi" | "polizas"> | undefined) {
  if (!row) return false;
  return row.queHizo.trim().length >= 12 || row.llamadas + row.visitas + row.dijoSi + row.polizas > 0;
}

export function etiquetaModo(modo: string) {
  return MODOS.find((m) => m.id === modo)?.label ?? "Sin decir dónde";
}
