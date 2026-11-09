export const TIPOS_AGENDA = [
  { id: "visita", label: "Visita" },
  { id: "llamada", label: "Llamar" },
  { id: "escribir", label: "Escribir" },
  { id: "distintivos", label: "Distintivos" },
  { id: "otro", label: "Otra" },
] as const;

export type TipoAgenda = (typeof TIPOS_AGENDA)[number]["id"];

export type AgendaItem = {
  id: number;
  ownerId: string;
  ownerName: string;
  ownerSlug: string;
  casoId: number | null;
  placa: string;
  cliente: string;
  tipo: TipoAgenda;
  titulo: string;
  fecha: string;
  hora: string;
  nota: string;
  hecho: boolean;
  conductor: string;
  cedula: string;
  promotor: string;
  estado: string;
};

export type AgendaDraft = {
  id?: number;
  tipo: TipoAgenda;
  titulo: string;
  fecha: string;
  hora: string;
  nota: string;
  casoId: number | null;
  hecho?: boolean;
  ownerSlug?: string;
  placaLibre?: string;
  conductor?: string;
  cedula?: string;
  promotor?: string;
  estado?: string;
};

const TIPOS = new Set<string>(TIPOS_AGENDA.map((t) => t.id));

export function esTipoAgenda(value: string): value is TipoAgenda {
  return TIPOS.has(value);
}

export function etiquetaTipo(tipo: TipoAgenda) {
  return TIPOS_AGENDA.find((t) => t.id === tipo)?.label ?? "Otra";
}

export const HORAS_DISTINTIVO = Array.from({ length: 14 }, (_, i) => {
  const min = 10 * 60 + i * 30;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
});

export const HASTA_DISTINTIVOS = "2026-12-31";

export function diasDelMes(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = (first.getUTCDay() + 6) % 7;
  const total = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<{ iso: string } | null> = Array.from({ length: start }, () => null);
  for (let day = 1; day <= total; day += 1) {
    cells.push({ iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
