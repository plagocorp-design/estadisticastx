const LISTA: [string, string][] = [
  ["RADIO TAXI AEROPUERTO S.A.", "860531135"],
  ["RADIO TAXI AEROPUERTO JURIDICA", "860531135"],
  ["TAX EXPRESS S.A.", "800174909"],
  ["RADIO TAXI AUTOLAGOS S.A.S", "800145640"],
  ["AUTOLAGOS S.A.", "800145640"],
  ["TAXIS VERDES S.A.", "860007701"],
  ["ALO TAXIS S.A.", "900076006"],
  ["TAXIS LIBRES BOGOTA S.A.", "900060655"],
  ["SUPER TAXI S.A.", "800081143"],
  ["SUPERTAXI JURIDICA", "800081143"],
  ["TELECOPER SAS", "860535504"],
  ["TAXIS TELECOPER SAS", "900382572"],
  ["CITY TAXI S.A.", "830136587"],
  ["TAXATELITE S.A.", "860531777"],
  ["TAXI IMPERIAL S.A.S", "900529865"],
  ["AUTO TAXI EJECUTIVO S.A.", "800027662"],
  ["MEGATAXI V.I.P SAS", "901036111"],
  ["FONTICOCHES SAS", "800210814"],
  ["COOPERATIVA RADIO TAXI LTDA", "860030632"],
  ["RADIO TAXIS AMARILLOS LTDA", "800249814"],
  ["ASTAXDORADO S.A.", "800015898"],
  ["TRANS. RADIO TAXI CONFORT S.A.", "800007282"],
  ["NUEVO TAXI MIO S.A.", "860035920"],
  ["SMART TAXI COLOMBIA SAS", "901083838"],
  ["TAXIS LOS DOS S.A.", "900291342"],
  ["TAXIS LOS DOS SAS", "900291342"],
  ["AIR TAXIS S.A.", "900029030"],
  ["TAXIS CABALLEROS AMARILLOS SAS", "900937145"],
  ["CELUTAX AEROPUERTO S.A.S", "900032610"],
];

function plano(valor: string) {
  return valor.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function nitDe(empresa: string) {
  const buscado = plano(empresa);
  if (buscado.length < 6) return "";
  const exacto = LISTA.find(([nombre]) => plano(nombre) === buscado);
  if (exacto) return exacto[1];
  let mejor = "";
  let largo = 0;
  for (const [nombre, nit] of LISTA) {
    const limpio = plano(nombre);
    if (buscado.includes(limpio) && limpio.length > largo) {
      mejor = nit;
      largo = limpio.length;
    }
  }
  return mejor;
}

export function conNit(extra: string, empresa: string) {
  const nit = nitDe(empresa);
  let mapa: Record<string, string> = {};
  try {
    const leido = JSON.parse(extra || "{}") as Record<string, string>;
    if (leido && typeof leido === "object") mapa = leido;
  } catch {
    mapa = {};
  }
  if (!nit) {
    if (!mapa.nitAnterior) return extra;
    delete mapa.nitAnterior;
    return JSON.stringify(mapa);
  }
  if (mapa.nitAnterior === nit) return extra || JSON.stringify(mapa);
  return JSON.stringify({ ...mapa, nitAnterior: nit });
}
