const LISTA: [string, string][] = [
  ["RADIO TAXI AEROPUERTO S.A.", "860531135"],
  ["RADIO TAXI AEROPUERTO JURIDICA", "860531135"],
];

function plano(valor: string) {
  return valor.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function nitDe(empresa: string) {
  const buscado = plano(empresa);
  if (buscado.length < 6) return "";
  const hallado = LISTA.find(([nombre]) => plano(nombre) === buscado || buscado.includes(plano(nombre)) || plano(nombre).includes(buscado));
  return hallado?.[1] ?? "";
}

export function conNit(extra: string, empresa: string) {
  const nit = nitDe(empresa);
  if (!nit) return extra;
  let mapa: Record<string, string> = {};
  try {
    const leido = JSON.parse(extra || "{}") as Record<string, string>;
    if (leido && typeof leido === "object") mapa = leido;
  } catch {
    mapa = {};
  }
  if (mapa.nitAnterior === nit) return extra || JSON.stringify(mapa);
  return JSON.stringify({ ...mapa, nitAnterior: nit });
}
