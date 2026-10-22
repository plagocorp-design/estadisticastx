import { metaDe } from "@/lib/meta";

export type MarcaTipo = "ingreso" | "salida" | "break" | "almuerzo" | "visita" | "otro";
export type EstadoControl = "sin_llegar" | "adentro" | "break" | "almuerzo" | "visita" | "otro" | "se_fue";

export type MarcaControl = {
  id: number;
  slug: string;
  tipo: MarcaTipo;
  fecha: string;
  hora: string;
  horaFin: string;
  casoId: number | null;
  placa: string;
  cliente: string;
  nota: string;
};

export type PersonaEquipo = {
  slug: string;
  name: string;
  role: string;
  activo: boolean;
  empieza: string;
  entrada: string;
  salida: string;
  trabajaHoy: boolean;
  clave?: string;
};

export const CUPO_MINUTOS: Record<"break" | "almuerzo", number> = {
  break: 10,
  almuerzo: 60,
};

export function trabajaElDia(opts: { hoy: string; empieza: string; activo: boolean; cuenta: boolean | null }) {
  if (!opts.activo) return false;
  if (opts.empieza && opts.hoy < opts.empieza) return false;
  if (opts.cuenta != null) return opts.cuenta;
  return metaDe(opts.hoy).labor;
}

export function minutosEntre(desde: string, hasta: string) {
  const [h1, m1] = desde.split(":").map(Number);
  const [h2, m2] = hasta.split(":").map(Number);
  if ([h1, m1, h2, m2].some((n) => Number.isNaN(n))) return 0;
  return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1));
}

export function porHora(marcas: MarcaControl[]) {
  return [...marcas].sort((a, b) => a.hora.localeCompare(b.hora) || a.id - b.id);
}

export function estadoDe(marcas: MarcaControl[]) {
  const orden = porHora(marcas);
  const abierta = [...orden].reverse().find((m) => !m.horaFin && (m.tipo === "break" || m.tipo === "almuerzo" || m.tipo === "visita" || m.tipo === "otro"));
  if (abierta) return { estado: abierta.tipo as EstadoControl, desde: abierta.hora, marca: abierta };
  const ultimo = [...orden].reverse().find((m) => m.tipo === "ingreso" || m.tipo === "salida");
  if (!ultimo) return { estado: "sin_llegar" as const, desde: "", marca: null };
  if (ultimo.tipo === "salida") return { estado: "se_fue" as const, desde: ultimo.hora, marca: ultimo };
  return { estado: "adentro" as const, desde: ultimo.hora, marca: ultimo };
}

export function etiquetaEstado(estado: EstadoControl) {
  if (estado === "sin_llegar") return "Sin llegar";
  if (estado === "adentro") return "Adentro";
  if (estado === "break") return "En break";
  if (estado === "almuerzo") return "En almuerzo";
  if (estado === "visita") return "Con un cliente";
  if (estado === "otro") return "Afuera";
  return "Ya se fue";
}
