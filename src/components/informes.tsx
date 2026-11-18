import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { listBitacorasRango } from "@/lib/bitacora.functions";
import type { Bitacora } from "@/lib/bitacora";
import { enCurso, ORIGENES, siguientePaso, type Caso } from "@/lib/casos";
import { listDiasMeta, listMetas } from "@/lib/casos.functions";
import {
  calendarioDe,
  diaSemana,
  fechaDelLogro,
  finDeMes,
  META_DESDE,
  metaBaseDelMes,
  moverMes,
  rangoDelCorte,
  resumenMeta,
  sumarDia,
} from "@/lib/meta";
import { ASESORES } from "@/lib/team.public";
import { NINGUNA, unificarEmpresa } from "@/lib/empresas";

const EMBUTO = [
  { label: "Nuevo", estados: ["Nuevo"] },
  { label: "Dijo sí", estados: ["Dijo sí"] },
  { label: "Documentos", estados: ["Documentos"] },
  { label: "En firma", estados: ["En firma"] },
  { label: "En Vía Seguros", estados: ["En Vía Seguros"] },
  { label: "Póliza lista", estados: ["Póliza lista"] },
  { label: "Con David", estados: ["Pólizas con David", "Por aceptar", "Pólizas entregadas"] },
  { label: "En operativa", estados: ["En operativa"] },
  { label: "Tarjeta", estados: ["Tarjeta radicada", "Tarjeta expedida", "Entregada"] },
  { label: "Completado", estados: ["Completado"] },
] as const;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function dia(iso: string) {
  return iso.slice(0, 10);
}

function fechaBogota(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const fecha = new Date(value);
  if (Number.isNaN(fecha.getTime())) return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
}

function diasEntre(desde: string, hasta: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return 0;
  const [y, m, d] = desde.split("-").map(Number);
  const [Y, M, D] = hasta.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(Y, M - 1, D) - Date.UTC(y, m - 1, d)) / 86400000));
}

function enRango(iso: string, desde: string, hasta: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso >= desde && iso <= hasta;
}

function esSuyo(ownerName: string, asesorName: string) {
  const propio = ownerName.trim().toLowerCase();
  const asesor = asesorName.trim().toLowerCase();
  if (!propio || !asesor) return false;
  if (propio === asesor) return true;
  const primero = asesor.split(" ")[0];
  return propio === primero || propio.startsWith(primero + " ");
}

function clave(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function tono(dias: number) {
  if (dias <= 7) return "text-[#4f6b09]";
  if (dias <= 15) return "text-[#8a5a00]";
  return "text-danger";
}

function inicioSemana(hoy: string) {
  const dow = diaSemana(hoy);
  return sumarDia(hoy, dow === 0 ? -6 : 1 - dow);
}

function tituloMes(ym: string) {
  const [anio, numero] = ym.split("-").map(Number);
  const nombre = MESES[numero - 1];
  return nombre ? `${nombre} ${anio}` : ym;
}

function mesesEntre(desdeYm: string, hastaYm: string) {
  const lista: string[] = [];
  let cursor = desdeYm;
  while (cursor <= hastaYm && lista.length < 36) {
    lista.push(cursor);
    cursor = moverMes(cursor, 1);
  }
  return lista;
}

function inicioDe(c: Caso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(c.fechaInicio) ? c.fechaInicio : fechaBogota(c.actualizadoEn);
}

function cierreDe(c: Caso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(c.fechaCierre) ? c.fechaCierre : fechaBogota(c.actualizadoEn);
}

function corto(nombre: string) {
  return nombre.length > 28 ? `${nombre.slice(0, 26)}…` : nombre;
}

function textoMeta(hechas: number, meta: number, pct: number) {
  if (meta <= 0 && hechas === 0) return "Sin días que cuenten";
  return `${hechas} de ${meta} · ${pct}%`;
}

function pasaCaso(c: Caso, asesor: string, empresa: string, origen: string, estado: string) {
  if (asesor && !esSuyo(c.ownerName, asesor)) return false;
  if (empresa && unificarEmpresa(c.empresa) !== empresa) return false;
  if (origen && (c.origen.trim() || "Sin origen") !== origen) return false;
  if (estado && c.estado !== estado) return false;
  return true;
}

function bajarCsv(nombre: string, filas: string[][]) {
  const texto = filas.map((fila) => fila.map((celda) => `"${String(celda ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + texto], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

function Barra({ n, total }: { n: number; total: number }) {
  const pct = total === 0 ? 0 : Math.max(4, Math.round((n / total) * 100));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-paper">
      <div className="h-full rounded-full bg-navy" style={{ width: n === 0 ? "0%" : `${pct}%` }} />
    </div>
  );
}

function Grafico({ datos }: { datos: { nombre: string; valor: number }[] }) {
  if (datos.length === 0) return <p className="text-sm text-ink-soft">Sin datos con ese filtro.</p>;
  return (
    <div style={{ height: Math.max(180, datos.length * 32) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="nombre" width={132} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="valor" name="Procesos" fill="#1b3a4b" radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Bloque({ titulo, nota, abierto = false, children }: { titulo: string; nota?: string; abierto?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(abierto);
  return (
    <section className="rounded-card border border-line bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-3 p-4 text-left">
        <span>
          <span className="block text-base font-semibold">{titulo}</span>
          {nota ? <span className="mt-1 block text-sm font-normal text-ink-soft">{nota}</span> : null}
        </span>
        <span className="shrink-0 text-sm font-semibold text-navy">{open ? "Plegar" : "Ver"}</span>
      </button>
      {open ? <div className="border-t border-line px-4 py-3">{children}</div> : null}
    </section>
  );
}

function SelectFiltro({ label, value, opciones, todos, onChange }: { label: string; value: string; opciones: string[]; todos: string; onChange: (v: string) => void }) {
  return (
    <label className="text-xs font-semibold">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-line bg-card px-3 text-sm font-normal">
        <option value="">{todos}</option>
        {opciones.map((op) => <option key={op} value={op}>{op}</option>)}
      </select>
    </label>
  );
}

export function Informes({ casos, hoy }: { casos: Caso[]; hoy: string }) {
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoy);
  const [asesor, setAsesor] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [origen, setOrigen] = useState("");
  const [estado, setEstado] = useState("");
  const [mesMeta, setMesMeta] = useState(hoy.slice(0, 7));
  const [bitacoras, setBitacoras] = useState<Bitacora[]>([]);
  const [metas, setMetas] = useState<Record<string, number>>({});
  const [dias, setDias] = useState<{ slug: string; fecha: string; cuenta: boolean | null }[]>([]);
  const [aviso, setAviso] = useState("");

  const primera = useMemo(() => {
    let min = hoy;
    for (const c of casos) {
      for (const fecha of [c.fechaInicio, c.fechaCierre]) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha >= "2020-01-01" && fecha < min) min = fecha;
      }
    }
    return min;
  }, [casos, hoy]);

  useEffect(() => {
    let vivo = true;
    listBitacorasRango({ data: { desde, hasta } })
      .then((rows) => {
        if (vivo) setBitacoras(rows);
      })
      .catch(() => {
        if (vivo) setAviso("No pude cargar las bitácoras del periodo.");
      });
    return () => {
      vivo = false;
    };
  }, [desde, hasta]);

  useEffect(() => {
    let vivo = true;
    Promise.all([listMetas({ data: mesMeta }), listDiasMeta({ data: mesMeta })])
      .then(([filas, marcas]) => {
        if (!vivo) return;
        const map: Record<string, number> = {};
        for (const fila of filas) map[fila.slug] = fila.meta;
        setMetas(map);
        setDias(marcas);
      })
      .catch(() => {
        if (vivo) setAviso("No pude cargar la meta del mes.");
      });
    return () => {
      vivo = false;
    };
  }, [mesMeta]);

  const opciones = useMemo(() => {
    const extras = [...new Set(casos.map((c) => c.ownerName.trim()).filter(Boolean))].filter((nombre) => !ASESORES.some((a) => esSuyo(nombre, a.name)));
    const asesores = [...ASESORES.map((a) => a.name), ...extras].sort((a, b) => a.localeCompare(b, "es"));
    const empresas = [...new Set(casos.map((c) => unificarEmpresa(c.empresa)).filter((nombre) => nombre && nombre !== NINGUNA))].sort((a, b) => a.localeCompare(b, "es"));
    const origenes = [...ORIGENES];
    for (const c of casos) {
      const nombre = c.origen.trim();
      if (nombre && !origenes.includes(nombre as (typeof ORIGENES)[number])) origenes.push(nombre as (typeof ORIGENES)[number]);
    }
    if (casos.some((c) => !c.origen.trim())) origenes.push("Sin origen" as (typeof ORIGENES)[number]);
    const estados = [...new Set(casos.map((c) => c.estado).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    return { asesores, empresas, origenes: [...origenes], estados };
  }, [casos]);

  const vista = useMemo(() => {
    const pasa = (c: Caso) => pasaCaso(c, asesor, empresa, origen, estado);
    const delPeriodo = casos.filter((c) => pasa(c) && enRango(inicioDe(c), desde, hasta));
    const embudo = EMBUTO.map((paso) => ({ ...paso, n: delPeriodo.filter((c) => (paso.estados as readonly string[]).includes(c.estado)).length }));
    const noConcretados = delPeriodo.filter((c) => c.estado === "No se concretó").length;
    const abiertos = delPeriodo.filter((c) => enCurso(c));
    const demorados = abiertos
      .map((c) => {
        const empezo = diasEntre(inicioDe(c), hoy);
        const toque = fechaBogota(c.actualizadoEn);
        const quieto = diasEntre(toque || inicioDe(c), hoy);
        return { c, empezo, quieto, toque };
      })
      .sort((a, b) => b.empezo - a.empezo || a.c.placa.localeCompare(b.c.placa));
    const citas = abiertos
      .filter((c) => c.fechaProxima && c.fechaProxima < hoy)
      .sort((a, b) => a.fechaProxima.localeCompare(b.fechaProxima));

    const empresas = new Map<string, { nombre: string; n: number; polizas: number; listos: number }>();
    let sinEmpresa = { n: 0, polizas: 0, listos: 0 };
    for (const c of delPeriodo) {
      const nombre = unificarEmpresa(c.empresa);
      const poliza = c.polizasSubidas ? 1 : 0;
      const listo = c.completado ? 1 : 0;
      if (!nombre || nombre === NINGUNA) {
        sinEmpresa = { n: sinEmpresa.n + 1, polizas: sinEmpresa.polizas + poliza, listos: sinEmpresa.listos + listo };
        continue;
      }
      const id = clave(nombre);
      const previa = empresas.get(id) ?? { nombre, n: 0, polizas: 0, listos: 0 };
      empresas.set(id, { nombre: previa.nombre, n: previa.n + 1, polizas: previa.polizas + poliza, listos: previa.listos + listo });
    }
    const ranking = [...empresas.values()].sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, "es"));

    const origenMap = new Map<string, { nombre: string; n: number; polizas: number }>();
    for (const c of delPeriodo) {
      const nombre = c.origen.trim() || "Sin origen";
      const previa = origenMap.get(nombre) ?? { nombre, n: 0, polizas: 0 };
      origenMap.set(nombre, { nombre, n: previa.n + 1, polizas: previa.polizas + (c.polizasSubidas ? 1 : 0) });
    }
    const origenes = [...origenMap.values()].sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, "es"));

    const motivos = new Map<string, { texto: string; n: number }>();
    for (const c of casos) {
      const texto = c.motivoCierre.trim();
      if (!texto || !pasa(c) || !enRango(cierreDe(c), desde, hasta)) continue;
      const id = clave(texto);
      const previa = motivos.get(id) ?? { texto, n: 0 };
      motivos.set(id, { texto: previa.texto, n: previa.n + 1 });
    }
    const caidas = [...motivos.values()].sort((a, b) => b.n - a.n || a.texto.localeCompare(b.texto, "es"));

    const finMeta = finDeMes(mesMeta);
    const corteMeta = finMeta < hoy ? finMeta : hoy;
    const defecto = metaBaseDelMes(mesMeta);
    const corteMes = rangoDelCorte(mesMeta);
    const ocultaBitacora = Boolean(empresa || origen || estado);
    const logros = casos
      .filter((c) => c.polizasSubidas && pasaCaso(c, "", empresa, origen, estado))
      .map((c) => ({
        ownerName: c.ownerName,
        placa: c.placa,
        nombre: c.nombre,
        fecha: fechaDelLogro(c.fechaPoliza, c.fechaFirma, c.fechaInicio, hoy),
      }));
    const personas = asesor
      ? ASESORES.filter((a) => a.name === asesor || esSuyo(asesor, a.name))
      : [...ASESORES];
    if (asesor && personas.length === 0) personas.push({ slug: "", name: asesor, email: "", role: "asesor" });

    const equipo = personas.map((persona) => {
      const suyos = (c: Caso) => esSuyo(c.ownerName, persona.name) && pasaCaso(c, "", empresa, origen, estado);
      const bits = ocultaBitacora || !persona.slug ? [] : bitacoras.filter((b) => b.slug === persona.slug);
      let meta: number | null = null;
      let hechas = 0;
      let pct: number | null = null;
      if (persona.slug) {
        const excepciones: Record<string, boolean> = {};
        for (const row of dias) if (row.slug === persona.slug && row.cuenta != null) excepciones[row.fecha] = row.cuenta;
        const celdas = calendarioDe(
          logros,
          persona.name,
          corteMes[0] ?? META_DESDE,
          corteMes[corteMes.length - 1] ?? corteMeta,
          corteMeta,
          metas[persona.slug] ?? defecto,
          excepciones,
        );
        const resumen = resumenMeta(celdas, corteMeta);
        meta = resumen.meta;
        hechas = resumen.hechas;
        pct = resumen.pct;
      } else {
        hechas = logros.filter((l) => esSuyo(l.ownerName, persona.name) && l.fecha >= `${mesMeta}-01` && l.fecha <= corteMeta).length;
      }
      return {
        nombre: persona.name.split(" ")[0],
        completo: persona.name,
        abiertos: casos.filter((c) => suyos(c) && enCurso(c) && enRango(inicioDe(c), desde, hasta)).length,
        polizas: casos.filter((c) => suyos(c) && c.polizasSubidas && enRango(fechaDelLogro(c.fechaPoliza, c.fechaFirma, c.fechaInicio, hoy), desde, hasta)).length,
        completados: casos.filter((c) => suyos(c) && c.completado && enRango(c.fechaPoliza || fechaBogota(c.actualizadoEn), desde, hasta)).length,
        caidos: casos.filter((c) => suyos(c) && c.motivoCierre.trim() && enRango(cierreDe(c), desde, hasta)).length,
        llamadas: ocultaBitacora || !persona.slug ? null : bits.reduce((n, b) => n + b.llamadas, 0),
        visitas: ocultaBitacora || !persona.slug ? null : bits.reduce((n, b) => n + b.visitas, 0),
        dijoSi: ocultaBitacora || !persona.slug ? null : bits.reduce((n, b) => n + b.dijoSi, 0),
        meta,
        hechas,
        pct,
      };
    });

    return { embudo, noConcretados, demorados, citas, ranking, sinEmpresa, origenes, caidas, equipo, entraron: delPeriodo.length, corteMeta, ocultaBitacora };
  }, [asesor, bitacoras, casos, desde, dias, empresa, estado, hasta, hoy, mesMeta, metas, origen]);

  const maxEmpresa = vista.ranking[0]?.n ?? 1;
  const mesCerrado = finDeMes(mesMeta) < hoy;
  const preset = desde === inicioSemana(hoy) && hasta === hoy
    ? "semana"
    : desde === `${hoy.slice(0, 7)}-01` && hasta === hoy
      ? "mes"
      : desde === `${moverMes(hoy.slice(0, 7), -1)}-01` && hasta === finDeMes(moverMes(hoy.slice(0, 7), -1))
        ? "pasado"
        : desde === META_DESDE && hasta === hoy
          ? "desde"
          : desde === primera && hasta === hoy
            ? "todo"
            : "";

  function aplicar(id: "semana" | "mes" | "pasado" | "desde" | "todo") {
    if (id === "semana") {
      setDesde(inicioSemana(hoy));
      setHasta(hoy);
    } else if (id === "mes") {
      setDesde(`${hoy.slice(0, 7)}-01`);
      setHasta(hoy);
    } else if (id === "pasado") {
      const ym = moverMes(hoy.slice(0, 7), -1);
      setDesde(`${ym}-01`);
      setHasta(finDeMes(ym));
    } else if (id === "desde") {
      setDesde(META_DESDE);
      setHasta(hoy);
    } else {
      setDesde(primera);
      setHasta(hoy);
    }
  }

  function limpiar() {
    setAsesor("");
    setEmpresa("");
    setOrigen("");
    setEstado("");
  }

  function csv() {
    const filas: string[][] = [
      ["Desde", desde],
      ["Hasta", hasta],
      ["Asesor", asesor || "Todos"],
      ["Empresa", empresa || "Todas"],
      ["Origen", origen || "Todos"],
      ["Estado", estado || "Todos"],
      ["Mes de la meta", tituloMes(mesMeta)],
      [],
      ["Paso", "Procesos"],
      ...vista.embudo.map((paso) => [paso.label, String(paso.n)]),
      ["No se concretó, de los que empezaron", String(vista.noConcretados)],
      [],
      ["Empresa", "Vehículos", "Con póliza", "Completados"],
      ...vista.ranking.map((fila) => [fila.nombre, String(fila.n), String(fila.polizas), String(fila.listos)]),
      [],
      ["Origen", "Entraron", "Con póliza"],
      ...vista.origenes.map((fila) => [fila.nombre, String(fila.n), String(fila.polizas)]),
      [],
      ["Asesor", "Abiertos", "Pólizas", "Completados", "No concretados", "Llamadas", "Visitas", "Dijeron sí", "Hechas", "Meta", "%"],
      ...vista.equipo.map((fila) => [
        fila.completo,
        String(fila.abiertos),
        String(fila.polizas),
        String(fila.completados),
        String(fila.caidos),
        fila.llamadas == null ? "" : String(fila.llamadas),
        fila.visitas == null ? "" : String(fila.visitas),
        fila.dijoSi == null ? "" : String(fila.dijoSi),
        String(fila.hechas),
        fila.meta == null ? "" : String(fila.meta),
        fila.pct == null ? "" : String(fila.pct),
      ]),
      [],
      ["Por qué se cayó", "Cantidad"],
      ...vista.caidas.map((fila) => [fila.texto, String(fila.n)]),
    ];
    bajarCsv(`informe-${desde}-a-${hasta}.csv`, filas);
  }

  const chips = [
    ["semana", "Esta semana"],
    ["mes", "Este mes"],
    ["pasado", "Mes pasado"],
    ["desde", "Desde el 7 de octubre"],
    ["todo", "Todo"],
  ] as const;

  return (
    <div className="mt-4 grid gap-3">
      <div className="rounded-card border border-line bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-semibold text-navy">Filtros</p>
            <p className="mt-1 text-xs text-ink-soft">El periodo, el asesor, la empresa, el origen y el estado cortan las mismas listas. La meta usa el mes de abajo, no estas fechas.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={limpiar} className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold">Limpiar</button>
            <button type="button" onClick={csv} className="h-10 rounded-2xl bg-navy px-3 text-sm font-semibold text-paper">Informe CSV</button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map(([id, label]) => (
            <button key={id} type="button" onClick={() => aplicar(id)} className={"h-10 rounded-full border px-4 text-sm font-semibold " + (preset === id ? "border-navy bg-navy text-paper" : "border-line bg-paper")}>
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="text-xs font-semibold">
            Desde
            <input type="date" max={hasta || hoy} value={desde} onChange={(e) => setDesde(e.target.value || primera)} className="mt-1 block h-11 rounded-2xl border border-line px-3 text-sm font-normal" />
          </label>
          <label className="text-xs font-semibold">
            Hasta
            <input type="date" min={desde} max={hoy} value={hasta} onChange={(e) => setHasta(e.target.value || hoy)} className="mt-1 block h-11 rounded-2xl border border-line px-3 text-sm font-normal" />
          </label>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SelectFiltro label="Asesor" value={asesor} opciones={opciones.asesores} todos="Todos" onChange={setAsesor} />
          <SelectFiltro label="Empresa" value={empresa} opciones={opciones.empresas} todos="Todas" onChange={setEmpresa} />
          <SelectFiltro label="Origen" value={origen} opciones={opciones.origenes} todos="Todos" onChange={setOrigen} />
          <SelectFiltro label="Estado" value={estado} opciones={opciones.estados} todos="Todos" onChange={setEstado} />
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          Del {dia(desde)} al {dia(hasta)}. {vista.entraron} procesos empezaron en este corte
          {asesor || empresa || origen || estado ? " y coinciden con el filtro" : ""}. Cómo van, los demorados y las citas son esos procesos. Las caídas usan la fecha en que se cerraron.
        </p>
        {aviso ? <p className="mt-2 text-sm text-danger">{aviso}</p> : null}
      </div>

      <Bloque titulo="Cómo van" nota={`${vista.entraron} empezaron en el corte. ${vista.noConcretados} de esos ya no se concretaron.`} abierto>
        <Grafico datos={vista.embudo.map((paso) => ({ nombre: paso.label, valor: paso.n }))} />
        <ul className="mt-3 grid gap-2">
          {vista.embudo.map((paso) => (
            <li key={paso.label} className="grid grid-cols-[9.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm">
              <span>{paso.label}</span>
              <Barra n={paso.n} total={Math.max(vista.entraron, 1)} />
              <span className="text-right font-semibold tabular-nums">{paso.n}</span>
            </li>
          ))}
        </ul>
      </Bloque>

      <Bloque titulo="Los más demorados" nota={`${vista.demorados.length} abiertos que empezaron en el corte. Verde hasta 7 días, ámbar de 8 a 15, rojo de 16.`}>
        {vista.demorados.length === 0 ? (
          <p className="text-sm text-ink-soft">No hay procesos abiertos con ese filtro.</p>
        ) : (
          <ul className="grid max-h-[32rem] gap-2 overflow-auto">
            {vista.demorados.map(({ c, empezo, quieto }) => (
              <li key={c.id} className="rounded-2xl border border-line px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{c.placa} · {c.nombre}</p>
                  <p className={"font-semibold " + tono(empezo)}>{empezo} días desde que empezó</p>
                </div>
                <p className="mt-1 text-ink-soft">{c.ownerName.split(" ")[0]} · {c.estado} · {siguientePaso(c)}{c.empresa ? ` · ${unificarEmpresa(c.empresa) || c.empresa}` : ""}</p>
                <p className={"mt-1 " + tono(quieto)}>{quieto} días quieto, sin que nadie lo toque</p>
              </li>
            ))}
          </ul>
        )}
      </Bloque>

      <Bloque titulo="De qué empresa salieron" nota={`${vista.entraron} empezaron en este periodo. La póliza y el completado son de esos mismos.`}>
        <Grafico datos={vista.ranking.slice(0, 12).map((fila) => ({ nombre: corto(fila.nombre), valor: fila.n }))} />
        {vista.ranking.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">En este periodo nadie trae empresa escrita.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {vista.ranking.map((fila) => (
              <li key={fila.nombre} className="grid gap-1 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold">{fila.nombre}</span>
                  <span className="tabular-nums text-ink-soft">{fila.n} vehículos · {fila.polizas} con póliza · {fila.listos} completados</span>
                </div>
                <Barra n={fila.n} total={maxEmpresa} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-ink-soft">Sin empresa o vehículo nuevo: {vista.sinEmpresa.n} vehículos · {vista.sinEmpresa.polizas} con póliza · {vista.sinEmpresa.listos} completados</p>
      </Bloque>

      <Bloque titulo="Por dónde llegaron" nota="De los que empezaron en el periodo, cuántos ya tienen la póliza pagada.">
        <Grafico datos={vista.origenes.map((fila) => ({ nombre: corto(fila.nombre), valor: fila.n }))} />
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {vista.origenes.map((fila) => (
            <li key={fila.nombre} className="rounded-2xl border border-line px-3 py-2 text-sm">
              <p className="font-semibold">{fila.nombre}</p>
              <p className="text-ink-soft">{fila.n} entraron · {fila.polizas} con póliza</p>
            </li>
          ))}
          {vista.origenes.length === 0 ? <li className="text-sm text-ink-soft">Nadie empezó en este corte.</li> : null}
        </ul>
      </Bloque>

      <Bloque titulo={`Meta de ${tituloMes(mesMeta)}`} nota={mesCerrado ? "Ese mes ya cerró: cuenta todos sus días. La cuota no cambia. Si filtras empresa, origen o estado, las pólizas sí se recortan." : "Cuenta hasta hoy. La cuota no cambia. Si filtras empresa, origen o estado, las pólizas sí se recortan."} abierto>
        <label className="text-xs font-semibold">
          Mes de la meta
          <select value={mesMeta} onChange={(e) => setMesMeta(e.target.value)} className="mt-1 h-11 w-full max-w-xs rounded-2xl border border-line bg-card px-3 text-sm font-normal">
            {mesesEntre(META_DESDE.slice(0, 7), hoy.slice(0, 7)).map((item) => <option key={item} value={item}>{tituloMes(item)}</option>)}
          </select>
        </label>
        <ul className="mt-3 grid gap-2">
          {vista.equipo.map((fila) => (
            <li key={fila.completo} className="grid grid-cols-[6rem_minmax(0,1fr)_11rem] items-center gap-2 text-sm">
              <span className="font-semibold">{fila.nombre}</span>
              <Barra n={fila.hechas} total={Math.max(fila.meta ?? 0, fila.hechas, 1)} />
              <span className="text-right tabular-nums">{fila.meta == null ? `${fila.hechas} pólizas · sin meta` : textoMeta(fila.hechas, fila.meta, fila.pct ?? 0)}</span>
            </li>
          ))}
        </ul>
      </Bloque>

      <Bloque titulo="El equipo en el periodo" nota={vista.ocultaBitacora ? "Abiertos, pólizas, completados y no concretados sí respetan el filtro. Llamadas, visitas y dijeron sí salen de la bitácora y no tienen empresa, origen ni estado: por eso quedan en blanco." : "Abiertos, pólizas, completados y no concretados son del periodo y del filtro. Llamadas, visitas y dijeron sí salen de la bitácora."}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-ink-soft">
              <tr>
                {["Asesor", "Abiertos", "Pólizas", "Completados", "No concretados", "Llamadas", "Visitas", "Dijeron sí"].map((col) => (
                  <th key={col} className="px-2 py-1 font-medium">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vista.equipo.map((fila) => (
                <tr key={fila.completo} className="border-t border-line">
                  <td className="px-2 py-2 font-semibold">{fila.nombre}</td>
                  <td className="px-2 py-2 tabular-nums">{fila.abiertos}</td>
                  <td className="px-2 py-2 tabular-nums">{fila.polizas}</td>
                  <td className="px-2 py-2 tabular-nums">{fila.completados}</td>
                  <td className="px-2 py-2 tabular-nums">{fila.caidos}</td>
                  <td className="px-2 py-2 tabular-nums">{fila.llamadas ?? "—"}</td>
                  <td className="px-2 py-2 tabular-nums">{fila.visitas ?? "—"}</td>
                  <td className="px-2 py-2 tabular-nums">{fila.dijoSi ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloque>

      <Bloque titulo="Por qué se cayeron" nota={`${vista.caidas.reduce((n, fila) => n + fila.n, 0)} cierres con fecha dentro del periodo.`}>
        <Grafico datos={vista.caidas.slice(0, 12).map((fila) => ({ nombre: corto(fila.texto), valor: fila.n }))} />
        {vista.caidas.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">En este periodo no hay cierres con ese filtro.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {vista.caidas.map((fila) => (
              <li key={fila.texto} className="flex justify-between gap-3 text-sm">
                <span>{fila.texto}</span>
                <span className="font-semibold tabular-nums">{fila.n}</span>
              </li>
            ))}
          </ul>
        )}
      </Bloque>

      <Bloque titulo="Citas vencidas" nota={`${vista.citas.length} procesos de este corte cuya próxima fecha ya pasó.`}>
        {vista.citas.length === 0 ? (
          <p className="text-sm text-ink-soft">No hay citas vencidas con ese filtro.</p>
        ) : (
          <ul className="grid gap-2">
            {vista.citas.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-semibold">{c.placa} · {c.ownerName.split(" ")[0]}</span>
                <span className="text-ink-soft"> · {c.fechaProxima} · hace {diasEntre(c.fechaProxima, hoy)} días · {c.proxima || c.estado}</span>
              </li>
            ))}
          </ul>
        )}
      </Bloque>
    </div>
  );
}
