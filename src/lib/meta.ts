export const META_DESDE = "2026-10-07";
export const META_ENTRE_SEMANA = 2;
export const META_SABADO = 2;

const FESTIVOS: Record<string, string> = {
  "2026-10-12": "Festivo",
  "2026-11-02": "Festivo",
  "2026-11-16": "Festivo",
  "2026-12-08": "Festivo",
  "2026-12-25": "Festivo",
  "2027-01-01": "Festivo",
  "2027-01-11": "Festivo",
  "2027-03-22": "Festivo",
  "2027-03-25": "Festivo",
  "2027-03-26": "Festivo",
  "2027-05-01": "Festivo",
  "2027-05-10": "Festivo",
  "2027-05-31": "Festivo",
  "2027-06-07": "Festivo",
  "2027-07-05": "Festivo",
  "2027-07-12": "Festivo",
  "2027-07-20": "Festivo",
  "2027-08-07": "Festivo",
  "2027-08-16": "Festivo",
  "2027-10-18": "Festivo",
  "2027-11-01": "Festivo",
  "2027-11-15": "Festivo",
  "2027-12-08": "Festivo",
  "2027-12-25": "Festivo",
};

export type Logro = {
  ownerName: string;
  placa: string;
  nombre: string;
  fecha: string;
};

export type PlacaMeta = { placa: string; nombre: string };

export type CeldaMeta = {
  iso: string;
  meta: number;
  labor: boolean;
  porque: string;
  cuenta: number;
  placas: PlacaMeta[];
  falta: number;
  cubiertoPor: string | null;
  cuentaQueCubre: number;
  placasQueCubren: PlacaMeta[];
  cubre: string[];
};

export function fechaDelLogro(fechaPoliza: string, fechaFirma: string, fechaInicio: string, hoy: string) {
  const valida = (fecha: string) => /^\d{4}-\d{2}-\d{2}$/.test(fecha);
  if (valida(fechaPoliza)) return fechaPoliza;
  if (valida(fechaFirma) && fechaFirma >= META_DESDE && fechaFirma <= hoy) return fechaFirma;
  if (valida(fechaInicio) && fechaInicio >= META_DESDE && fechaInicio <= hoy) return fechaInicio;
  return hoy;
}

export function diaSemana(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function metaDe(iso: string) {
  if (iso < META_DESDE) return { meta: 0, labor: false, porque: "Antes de empezar" };
  const festivo = FESTIVOS[iso];
  if (festivo) return { meta: 0, labor: false, porque: festivo };
  const dow = diaSemana(iso);
  if (dow === 0) return { meta: 0, labor: false, porque: "Domingo" };
  if (dow === 6) return { meta: META_SABADO, labor: true, porque: "Sábado" };
  return { meta: META_ENTRE_SEMANA, labor: true, porque: "Entre semana" };
}

export function sumarDia(iso: string, dias: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d + dias));
  const yy = fecha.getUTCFullYear();
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function finDeMes(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

export function moverMes(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function rangoDelCorte(ym: string) {
  const desde = `${ym}-01` < META_DESDE ? META_DESDE : `${ym}-01`;
  const hasta = finDeMes(ym);
  if (desde > hasta) return [];
  return rangoDias(desde, hasta);
}

export function metaBaseDelMes(ym: string) {
  return rangoDelCorte(ym).filter((iso) => metaDe(iso).labor).length * META_ENTRE_SEMANA;
}

export function repartir(dias: string[], total: number) {
  const map: Record<string, number> = {};
  if (dias.length === 0) return map;
  const seguro = Math.max(0, Math.round(total));
  const base = Math.floor(seguro / dias.length);
  const extra = seguro - base * dias.length;
  dias.forEach((iso, index) => {
    map[iso] = base + (index < extra ? 1 : 0);
  });
  return map;
}

export function rangoDias(desde: string, hasta: string) {
  const dias: string[] = [];
  let cursor = desde;
  while (cursor <= hasta && dias.length < 400) {
    dias.push(cursor);
    cursor = sumarDia(cursor, 1);
  }
  return dias;
}

function esDelAsesor(ownerName: string, asesorName: string) {
  const propio = ownerName.trim().toLowerCase();
  const asesor = asesorName.trim().toLowerCase();
  if (!propio || !asesor) return false;
  if (propio === asesor) return true;
  const primero = asesor.split(" ")[0];
  return propio === primero || propio.startsWith(primero + " ");
}

export function reglaPara(iso: string, cuenta?: boolean) {
  const base = metaDe(iso);
  if (cuenta === undefined) return base;
  if (cuenta) return { meta: base.meta || META_ENTRE_SEMANA, labor: true, porque: base.labor ? base.porque : "Habilitado" };
  return { meta: 0, labor: false, porque: base.labor ? "No trabaja" : base.porque };
}

export function calendarioDe(
  logros: Logro[],
  ownerName: string,
  desde: string,
  hasta: string,
  hoy: string,
  cuota?: number,
  excepciones?: Record<string, boolean>,
) {
  const propios = logros.filter((l) => esDelAsesor(l.ownerName, ownerName) && l.fecha >= desde && l.fecha <= hasta);
  const dias = rangoDias(desde, hasta);
  const regla = (iso: string) => reglaPara(iso, excepciones?.[iso]);
  const baseLabor = dias.filter((iso) => metaDe(iso).labor);
  const labor = dias.filter((iso) => regla(iso).labor);
  const baseCuota = cuota ?? baseLabor.length * META_ENTRE_SEMANA;
  const valor = baseLabor.length ? baseCuota / baseLabor.length : META_ENTRE_SEMANA;
  const cupo = repartir(labor, Math.round(labor.length * valor));
  const celdas: CeldaMeta[] = dias.map((iso) => {
    const dia = regla(iso);
    const placas = propios
      .filter((l) => l.fecha === iso)
      .map((l) => ({ placa: l.placa, nombre: l.nombre }));
    return {
      iso,
      meta: dia.labor ? (cupo[iso] ?? 0) : 0,
      labor: dia.labor,
      porque: dia.porque,
      cuenta: placas.length,
      placas,
      falta: 0,
      cubiertoPor: null,
      cuentaQueCubre: 0,
      placasQueCubren: [],
      cubre: [],
    };
  });

  const pendientes: CeldaMeta[] = [];
  for (const celda of celdas) {
    if (celda.iso > hoy) continue;
    let sobra = celda.labor ? Math.max(0, celda.cuenta - celda.meta) : celda.cuenta;
    if (celda.labor) celda.falta = Math.max(0, celda.meta - celda.cuenta);
    while (sobra > 0 && pendientes.length > 0) {
      const viejo = pendientes[pendientes.length - 1];
      const toma = Math.min(sobra, viejo.falta);
      viejo.falta -= toma;
      sobra -= toma;
      if (viejo.falta === 0) {
        viejo.cubiertoPor = celda.iso;
        viejo.cuentaQueCubre = celda.cuenta;
        viejo.placasQueCubren = celda.placas;
        celda.cubre.push(viejo.iso);
        pendientes.pop();
      }
    }
    if (celda.labor && celda.falta > 0) pendientes.push(celda);
  }
  return celdas;
}

export function resumenMeta(celdas: CeldaMeta[], hoy: string, _fechasTocadas?: Iterable<string>) {
  const vencidas = celdas.filter((c) => c.labor && c.iso <= hoy);
  const hechas = celdas.filter((c) => c.iso <= hoy).reduce((suma, c) => suma + c.cuenta, 0);
  const meta = vencidas.reduce((suma, c) => suma + c.meta, 0);
  return {
    cubiertos: vencidas.filter((c) => c.falta === 0).length,
    dias: vencidas.length,
    hechas,
    meta,
    pct: meta === 0 ? (hechas > 0 ? 100 : 0) : Math.round((hechas / meta) * 100),
  };
}
