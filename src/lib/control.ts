import { metaDe } from "@/lib/meta";

export type MarcaTipo = "ingreso" | "salida" | "break" | "almuerzo" | "visita" | "otro" | "actividad";
export type EstadoControl = "sin_llegar" | "adentro" | "break" | "almuerzo" | "visita" | "otro" | "actividad" | "se_fue";

export type AtencionControl = {
  id: number;
  contacto: string;
  telefono: string;
  placaLibre: string;
  nota: string;
  hora: string;
};

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
  tipoId: number | null;
  nombreTipo: string;
  contacto: string;
  telefono: string;
  placaLibre: string;
  sinProceso: boolean;
  cupo: number;
  paralela: boolean;
  atenciones: AtencionControl[];
};

export type TipoActividad = {
  id: number;
  nombre: string;
  pideContacto: boolean;
  pideProceso: boolean;
  unaVez: boolean;
  minutos: number;
  predeterminada: boolean;
  paralela: boolean;
  todos: boolean;
  slugs: string[];
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
  acceso?: string;
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

export function cuentaRegresiva(desde: string, cupoMin: number, ahora = new Date()) {
  const [h, m] = desde.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m) || cupoMin <= 0) return "";
  const inicio = new Date(ahora);
  inicio.setHours(h, m, 0, 0);
  const resta = Math.round((inicio.getTime() + cupoMin * 60_000 - ahora.getTime()) / 1000);
  const abs = Math.abs(resta);
  const mm = Math.floor(abs / 60);
  const ss = String(abs % 60).padStart(2, "0");
  return resta >= 0 ? `Quedan ${mm}:${ss}` : `Te pasaste ${mm}:${ss}`;
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

export type FotoControl = {
  estado: EstadoControl;
  desde: string;
  marca: MarcaControl | null;
  paralelas: MarcaControl[];
};

const ABIERTAS = new Set(["break", "almuerzo", "visita", "otro", "actividad"]);

export function atencionesDe(marca: MarcaControl): AtencionControl[] {
  if (marca.atenciones.length > 0) return marca.atenciones;
  if (marca.contacto || marca.telefono || marca.placaLibre) {
    return [{
      id: 0,
      contacto: marca.contacto,
      telefono: marca.telefono,
      placaLibre: marca.placaLibre,
      nota: marca.nota,
      hora: marca.hora,
    }];
  }
  return [];
}

export function estadoDe(marcas: MarcaControl[]): FotoControl {
  const orden = porHora(marcas);
  const abiertas = orden.filter((m) => !m.horaFin && ABIERTAS.has(m.tipo));
  const exclusiva = [...abiertas].reverse().find((m) => !m.paralela) ?? null;
  const paralelas = abiertas.filter((m) => m.paralela);
  if (exclusiva) return { estado: exclusiva.tipo as EstadoControl, desde: exclusiva.hora, marca: exclusiva, paralelas: [] };
  const ultimo = [...orden].reverse().find((m) => m.tipo === "ingreso" || m.tipo === "salida");
  if (!ultimo) return { estado: "sin_llegar", desde: "", marca: null, paralelas: [] };
  if (ultimo.tipo === "salida") return { estado: "se_fue", desde: ultimo.hora, marca: ultimo, paralelas: [] };
  const vuelta = orden
    .filter((m) => ABIERTAS.has(m.tipo) && !m.paralela && m.horaFin && m.horaFin >= ultimo.hora)
    .map((m) => m.horaFin)
    .sort()
    .at(-1);
  return {
    estado: "adentro",
    desde: vuelta && vuelta > ultimo.hora ? vuelta : ultimo.hora,
    marca: ultimo,
    paralelas,
  };
}

export function etiquetaEstado(estado: EstadoControl) {
  if (estado === "sin_llegar") return "Sin llegar";
  if (estado === "adentro") return "Adentro";
  if (estado === "break") return "En break";
  if (estado === "almuerzo") return "En almuerzo";
  if (estado === "visita") return "Con un cliente";
  if (estado === "actividad") return "En una tarea";
  if (estado === "otro") return "Afuera";
  return "Ya se fue";
}

export function leToca(tipo: TipoActividad, slug: string) {
  return tipo.todos || tipo.slugs.includes(slug);
}
