export type Role = "asesor" | "lider" | "coordinadora" | "via_seguros" | "operativa" | "servicio" | "gerencia";

export const TEAM_PUBLIC: { slug: string; name: string; email: string; role: Role }[] = [
  { slug: "david", name: "David Jaimes", email: "david@vinculalibre.app", role: "lider" },
  { slug: "alison", name: "Alison Moreno", email: "alison@vinculalibre.app", role: "asesor" },
  { slug: "patricia", name: "Patricia", email: "patricia@vinculalibre.app", role: "asesor" },
  { slug: "laura", name: "Laura", email: "laura@vinculalibre.app", role: "asesor" },
  { slug: "jose", name: "José", email: "jose@vinculalibre.app", role: "asesor" },
  { slug: "viviana", name: "Viviana", email: "viviana@vinculalibre.app", role: "coordinadora" },
  { slug: "estefania", name: "Estefanía", email: "estefania@vinculalibre.app", role: "coordinadora" },
  { slug: "franz", name: "Franz", email: "franz@vinculalibre.app", role: "coordinadora" },
  { slug: "asiyade", name: "Asiyade", email: "asiyade@vinculalibre.app", role: "coordinadora" },
  { slug: "pablo", name: "Pablo", email: "pablo@vinculalibre.app", role: "coordinadora" },
  { slug: "gerencia", name: "Gerencia Taxis Libres", email: "gerencia@vinculalibre.app", role: "gerencia" },
];

export function esGerencia(role: string | null | undefined) {
  return role === "gerencia";
}

export function veElEquipo(role: string | null | undefined) {
  return role === "coordinadora" || role === "lider" || role === "gerencia";
}

export function configura(role: string | null | undefined) {
  return role === "lider";
}

export function llevaProcesos(role: string | null | undefined) {
  return role === "asesor" || role === "lider";
}

export function etiquetaRol(role: string | null | undefined) {
  if (role === "gerencia") return "Gerencia";
  if (role === "lider") return "Asesor líder";
  if (role === "coordinadora") return "Coordinación";
  if (role === "via_seguros") return "Vía Seguros";
  if (role === "operativa") return "Operativa";
  if (role === "servicio") return "Servicio al cliente";
  return "Asesor";
}

export function esBandeja(role: string | null | undefined) {
  return role === "via_seguros" || role === "operativa" || role === "servicio";
}

export function manoDeRol(role: string | null | undefined) {
  if (role === "via_seguros") return "via";
  if (role === "operativa") return "operativa";
  if (role === "servicio") return "servicio";
  return "";
}

export function nombreLista(person: { name: string; role: string }) {
  return person.role === "lider" ? `${person.name} · líder` : person.name;
}

export const ASESORES = TEAM_PUBLIC.filter((p) => llevaProcesos(p.role));

export const SECCIONES_APP = [
  { id: "procesos", label: "Procesos" },
  { id: "agenda", label: "Agenda" },
  { id: "meta", label: "Meta" },
  { id: "bitacora", label: "Bitácora" },
  { id: "control", label: "Control" },
  { id: "llamadas", label: "Llamar" },
  { id: "equipo", label: "Equipo" },
  { id: "auditoria", label: "Registro" },
  { id: "formato", label: "Ciudad" },
] as const;

export const PODERES_APP = [
  { id: "propios", label: "Lleva sus procesos, horario, meta y llamadas" },
  { id: "ver_equipo", label: "Ve el trabajo de todo el equipo" },
  { id: "configurar", label: "Configura: crea perfiles, claves, metas y tipificaciones" },
] as const;

export const AREAS_APP = [
  { id: "", label: "Ninguna. No es de un área" },
  { id: "via_seguros", label: "Vía Seguros" },
  { id: "operativa", label: "Operativa" },
  { id: "servicio", label: "Servicio al cliente" },
] as const;

export type Acceso = { secciones: string[]; poderes: string[]; area: string };

const IDS_SECCION = new Set<string>(SECCIONES_APP.map((item) => item.id));
const IDS_PODER = new Set<string>(PODERES_APP.map((item) => item.id));

export function accesoVacio(): Acceso {
  return {
    secciones: ["procesos", "agenda", "meta", "bitacora", "control", "llamadas"],
    poderes: ["propios"],
    area: "",
  };
}

export function accesoDe(role: string, raw?: string | null): Acceso {
  if (raw && raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Partial<Acceso>;
      const secciones = Array.isArray(parsed.secciones) ? parsed.secciones.filter((id) => IDS_SECCION.has(id)) : [];
      const poderes = Array.isArray(parsed.poderes) ? parsed.poderes.filter((id) => IDS_PODER.has(id)) : [];
      const area = AREAS_APP.some((item) => item.id === parsed.area) ? String(parsed.area) : "";
      if (secciones.length > 0) return conFormato(role, { secciones, poderes, area });
    } catch {
      /* el texto viejo no cuenta */
    }
  }
  if (role === "gerencia" || role === "lider") {
    return conFormato(role, { secciones: SECCIONES_APP.map((item) => item.id), poderes: ["propios", "ver_equipo", "configurar"], area: "" });
  }
  if (role === "coordinadora") {
    return conFormato(role, { secciones: SECCIONES_APP.map((item) => item.id), poderes: ["ver_equipo"], area: "" });
  }
  if (role === "via_seguros" || role === "operativa" || role === "servicio") {
    return { secciones: ["procesos"], poderes: [], area: role };
  }
  return accesoVacio();
}

export function rolDeAcceso(acceso: Acceso): Role {
  if (acceso.area === "via_seguros" || acceso.area === "operativa" || acceso.area === "servicio") return acceso.area;
  if (acceso.poderes.includes("configurar")) return "lider";
  if (acceso.poderes.includes("ver_equipo")) return "coordinadora";
  return "asesor";
}

function conFormato(role: string, acceso: Acceso): Acceso {
  if ((role === "lider" || role === "coordinadora") && !acceso.secciones.includes("formato")) {
    return { ...acceso, secciones: [...acceso.secciones, "formato"] };
  }
  return acceso;
}

export function accesoJson(acceso: Acceso) {
  const limpio = accesoDe(rolDeAcceso(acceso), JSON.stringify(acceso));
  return JSON.stringify(limpio);
}
