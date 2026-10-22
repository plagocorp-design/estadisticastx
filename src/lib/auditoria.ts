export type EventoAuditoria = {
  id: number;
  cuando: string;
  actor: string;
  actorSlug: string;
  accion: string;
  entidad: string;
  entidadId: string;
  etiqueta: string;
  detalle: string;
  antes: string;
  despues: string;
};

export type Cambio = { label: string; antes: string; despues: string };

export function cambiosDe(pares: Cambio[]) {
  const cambios = pares.filter((p) => p.antes !== p.despues);
  return {
    detalle: cambios.map((p) => `${p.label}: «${p.antes || "—"}» → «${p.despues || "—"}»`).join(" · "),
    antes: cambios.map((p) => `${p.label}: ${p.antes || "—"}`).join("\n"),
    despues: cambios.map((p) => `${p.label}: ${p.despues || "—"}`).join("\n"),
    hubo: cambios.length > 0,
  };
}

export function siNo(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "t" || value === "true" ? "Sí" : "No";
}

export function textoPlano(value: unknown) {
  return String(value ?? "").trim();
}

export function cuando(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export const ENTIDADES = [
  { id: "", label: "Todo" },
  { id: "proceso", label: "Procesos" },
  { id: "poliza", label: "Pólizas" },
  { id: "agenda", label: "Agenda" },
  { id: "bitacora", label: "Bitácora" },
  { id: "control", label: "Control" },
  { id: "equipo", label: "Equipo" },
  { id: "meta", label: "Meta" },
  { id: "chat", label: "Chat" },
  { id: "contrato", label: "Contratos" },
  { id: "sheets", label: "Sheets" },
  { id: "clave", label: "Claves" },
] as const;
