export type Role = "asesor" | "lider" | "coordinadora";

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
];

export function veElEquipo(role: string | null | undefined) {
  return role === "coordinadora" || role === "lider";
}

export function configura(role: string | null | undefined) {
  return role === "lider";
}

export function llevaProcesos(role: string | null | undefined) {
  return role === "asesor" || role === "lider";
}

export function etiquetaRol(role: string | null | undefined) {
  if (role === "lider") return "Asesor líder";
  if (role === "coordinadora") return "Coordinación";
  return "Asesor";
}

export function nombreLista(person: { name: string; role: string }) {
  return person.role === "lider" ? `${person.name} · líder` : person.name;
}

export const ASESORES = TEAM_PUBLIC.filter((p) => llevaProcesos(p.role));
