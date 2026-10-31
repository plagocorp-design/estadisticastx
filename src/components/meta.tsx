import { useEffect, useState } from "react";
import { calendarioDe, fechaDelLogro, finDeMes, META_DESDE, metaBaseDelMes, metaDe, moverMes, rangoDelCorte, resumenMeta, type CeldaMeta, type Logro } from "@/lib/meta";
import { guardarDiasMeta, guardarMetas, listDiasMeta, listMetas, miCuota } from "@/lib/casos.functions";
import { ASESORES, llevaProcesos } from "@/lib/team.public";
import type { Caso } from "@/lib/casos";
import { Informes } from "@/components/informes";
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const META_ULTIMO = "2027-12";

function diaDe(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function corta(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1].slice(0, 3)}`;
}

function logrosDe(casos: Caso[], hoy: string): Logro[] {
  return casos
    .filter((c) => c.polizasSubidas)
    .map((c) => ({
      ownerName: c.ownerName,
      placa: c.placa,
      nombre: c.nombre,
      fecha: fechaDelLogro(c.fechaPoliza, c.fechaFirma, c.fechaInicio, hoy),
    }));
}

export function MetaEquipo({
  casos,
  hoy,
  edita,
  gente,
}: {
  casos: Caso[];
  hoy: string;
  edita: boolean;
  gente?: { slug: string; name: string; role: string; activo?: boolean }[];
}) {
  const [mes, setMes] = useState(hoy.slice(0, 7) < META_DESDE.slice(0, 7) ? META_DESDE.slice(0, 7) : hoy.slice(0, 7));
  const defecto = metaBaseDelMes(mes);
  const [guardadas, setGuardadas] = useState<Record<string, number>>({});
  const [edicion, setEdicion] = useState<Record<string, number> | null>(null);
  const [parejo, setParejo] = useState(defecto);
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [dias, setDias] = useState<{ slug: string; fecha: string; cuenta: boolean | null }[]>([]);
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  const [guardandoDia, setGuardandoDia] = useState(false);
  const [parte, setParte] = useState<"meta" | "informes">("meta");

  useEffect(() => {
    let vivo = true;
    setEdicion(null);
    setParejo(defecto);
    setAviso("");
    listMetas({ data: mes })
      .then((rows) => {
        if (!vivo) return;
        const map: Record<string, number> = {};
        for (const row of rows) map[row.slug] = row.meta;
        setGuardadas(map);
      })
      .catch(() => {
        if (vivo) setAviso("No pude cargar las metas.");
      });
    return () => {
      vivo = false;
    };
  }, [mes, defecto]);

  useEffect(() => {
    let vivo = true;
    setDiaAbierto(null);
    listDiasMeta({ data: mes })
      .then((rows) => {
        if (vivo) setDias(rows);
      })
      .catch(() => {
        if (vivo) setAviso("No pude cargar los días.");
      });
    return () => {
      vivo = false;
    };
  }, [mes]);

  function excepcionesDe(slug: string) {
    const map: Record<string, boolean> = {};
    for (const row of dias) if (row.slug === slug && row.cuenta != null) map[row.fecha] = row.cuenta;
    return map;
  }

  function cuentaEseDia(slug: string, iso: string) {
    const row = dias.find((d) => d.slug === slug && d.fecha === iso);
    if (row && row.cuenta != null) return row.cuenta;
    return metaDe(iso).labor;
  }

  async function cambiarDia(fecha: string, accion: "uno" | "todos" | "nadie" | "normal", slug?: string, cuenta?: boolean) {
    setGuardandoDia(true);
    setAviso("");
    try {
      const rows = await guardarDiasMeta({ data: { fecha, accion, slug, cuenta } });
      setDias(rows);
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No pude guardar el día");
    } finally {
      setGuardandoDia(false);
    }
  }

  const lista = (gente && gente.length ? gente : ASESORES).filter((p) => llevaProcesos(p.role) && (!("activo" in p) || p.activo !== false));

  function metaAsesor(slug: string) {
    if (edicion && slug in edicion) return edicion[slug];
    if (slug in guardadas) return guardadas[slug];
    return defecto;
  }

  function cambiarMeta(slug: string, valor: number) {
    const siguiente: Record<string, number> = {};
    for (const asesor of lista) siguiente[asesor.slug] = metaAsesor(asesor.slug);
    siguiente[slug] = valor;
    setEdicion(siguiente);
  }

  const delMes = rangoDelCorte(mes);
  const desde = delMes[0] ?? META_DESDE;
  const hasta = delMes[delMes.length - 1] ?? finDeMes(mes);
  const logros = logrosDe(casos, hoy);
  const tocadas = dias.map((d) => d.fecha);
  const filas = lista.map((asesor) => {
    const celdas = calendarioDe(logros, asesor.name, desde, hasta, hoy, metaAsesor(asesor.slug), excepcionesDe(asesor.slug));
    return { asesor, celdas, resumen: resumenMeta(celdas, hoy, tocadas) };
  });
  const futuro = mes > hoy.slice(0, 7);
  const hechasEquipo = filas.reduce((suma, fila) => suma + fila.resumen.hechas, 0);
  const metaEquipoHoy = filas.reduce((suma, fila) => suma + fila.resumen.meta, 0);
  const metaEquipoMes = filas.reduce((suma, fila) => suma + metaAsesor(fila.asesor.slug), 0);
  const pctEquipo = metaEquipoHoy === 0 ? 0 : Math.round((hechasEquipo / metaEquipoHoy) * 100);
  const faltanEquipo = Math.max(0, metaEquipoHoy - hechasEquipo);
  const alDia = filas.filter((fila) => fila.resumen.meta > 0 && fila.resumen.hechas >= fila.resumen.meta);
  const atrasados = filas.filter((fila) => fila.resumen.meta > 0 && fila.resumen.hechas < fila.resumen.meta);
  const [anio, numero] = mes.split("-").map(Number);
  const titulo = `${MESES[numero - 1]} ${anio}`;
  const [elegida, setElegida] = useState<{ nombre: string; iso: string } | null>(null);
  const detalle = elegida
    ? filas.find((f) => f.asesor.name === elegida.nombre)?.celdas.find((c) => c.iso === elegida.iso)
    : null;
  const columnas = filas[0]?.celdas ?? [];

  return (
    <section className="mt-5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setParte("meta")}
          className={"h-10 rounded-full px-4 text-sm font-semibold " + (parte === "meta" ? "bg-navy text-paper" : "border border-line bg-card")}
        >
          Meta
        </button>
        <button
          type="button"
          onClick={() => setParte("informes")}
          className={"h-10 rounded-full px-4 text-sm font-semibold " + (parte === "informes" ? "bg-navy text-paper" : "border border-line bg-card")}
        >
          Informes
        </button>
      </div>
      {parte === "informes" ? <Informes casos={casos} hoy={hoy} /> : null}
      {parte === "meta" ? (
      <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={mes <= META_DESDE.slice(0, 7)}
          onClick={() => setMes(moverMes(mes, -1))}
          className="h-10 rounded-full border border-line bg-card px-4 text-sm font-semibold disabled:opacity-40"
        >
          Anterior
        </button>
        <h2 className="min-w-40 text-center text-lg font-semibold capitalize">{titulo}</h2>
        <button
          type="button"
          disabled={mes >= META_ULTIMO}
          onClick={() => setMes(moverMes(mes, 1))}
          className="h-10 rounded-full border border-line bg-card px-4 text-sm font-semibold disabled:opacity-40"
        >
          Siguiente
        </button>
      </div>
      <p className="mt-2 max-w-3xl text-sm text-ink-soft">
        Corte de {titulo}. Del 7 de octubre en adelante, cada día de trabajo vale 2, sábado incluido. Domingo y
        festivo no cuentan. Toca el número del día para decir quién trabaja: si alguien no viene, ese día no le baja
        el cumplimiento. Octubre suma {defecto} por asesor {edita ? "si no lo cambias" : "si David no la cambia"}. Lo de un mes no pasa al otro. Cuenta
        el día en que marcan Pólizas pagadas.
      </p>
      {edita ? (
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm font-medium">
          Meta igual para cada asesor
          <input
            type="number"
            min={0}
            value={parejo}
            onChange={(e) => setParejo(Number(e.target.value))}
            className="mt-1 block h-10 w-28 rounded-2xl border border-line px-3"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            const n = Math.max(0, Math.round(Number(parejo) || 0));
            const siguiente: Record<string, number> = {};
            for (const asesor of lista) siguiente[asesor.slug] = n;
            setEdicion(siguiente);
          }}
          className="h-10 rounded-full border border-line bg-card px-4 text-sm font-semibold"
        >
          Repartir igual
        </button>
        <button
          type="button"
          disabled={guardando}
          onClick={async () => {
            setGuardando(true);
            setAviso("");
            const items = lista.map((asesor) => ({ slug: asesor.slug, meta: metaAsesor(asesor.slug) }));
            try {
              await guardarMetas({ data: { mes, items } });
              const map: Record<string, number> = {};
              for (const item of items) map[item.slug] = item.meta;
              setGuardadas(map);
              setEdicion(null);
              setAviso("Metas guardadas.");
            } catch {
              setAviso("No pude guardar las metas.");
            }
            setGuardando(false);
          }}
          className="h-10 rounded-full bg-navy px-4 text-sm font-semibold text-paper disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Guardar metas"}
        </button>
        {aviso ? <p className="text-sm text-ink-soft">{aviso}</p> : null}
      </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-card border border-line bg-card px-3 py-3">
          <p className="text-2xl font-semibold tabular-nums">{futuro ? "0" : hechasEquipo}</p>
          <p className="text-sm text-ink-soft">{futuro ? "Aún no empieza" : `de ${metaEquipoHoy} al día de hoy`}</p>
        </div>
        <div className="rounded-card border border-line bg-card px-3 py-3">
          <p className="text-2xl font-semibold tabular-nums">{futuro ? "–" : `${pctEquipo}%`}</p>
          <p className="text-sm text-ink-soft">Cumplimiento del equipo</p>
        </div>
        <div className="rounded-card border border-line bg-card px-3 py-3">
          <p className="text-2xl font-semibold tabular-nums">{futuro ? "–" : faltanEquipo}</p>
          <p className="text-sm text-ink-soft">Faltan para ir al día</p>
        </div>
        <div className="rounded-card border border-line bg-card px-3 py-3">
          <p className="text-2xl font-semibold tabular-nums">{metaEquipoMes}</p>
          <p className="text-sm text-ink-soft">Meta del mes, {filas.length} asesores</p>
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        {futuro
          ? "Este mes todavía no arranca."
          : alDia.length === filas.length
            ? "Todo el equipo va al día."
            : alDia.length === 0
              ? `Nadie va al día. Atrasados: ${atrasados.map((f) => f.asesor.name.split(" ")[0]).join(", ")}.`
              : `Al día: ${alDia.map((f) => f.asesor.name.split(" ")[0]).join(", ")}. Atrasados: ${atrasados.map((f) => f.asesor.name.split(" ")[0]).join(", ")}.`}
      </p>

      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
        <li className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-lime text-xs font-semibold text-ink">2</span>
          Verde: hizo las del día
        </li>
        <li className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-navy text-xs font-semibold text-paper">1</span>
          Azul: ese día faltó, otro día lo cubrió
        </li>
        <li className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-paper text-xs font-semibold text-danger">0</span>
          Rojo: no llegó y sigue debiendo
        </li>
        <li className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-card text-xs font-semibold">0</span>
          Con borde: ese día todavía no llega
        </li>
        <li className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-paper text-xs font-semibold text-ink-soft">–</span>
          Raya: domingo, festivo o ese asesor no trabaja
        </li>
      </ul>

      {diaAbierto ? (
        <div className="mt-3 rounded-card border border-line bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold capitalize">
              {DIAS[diaDe(diaAbierto)]} {corta(diaAbierto)}
            </p>
            <p className="text-sm text-ink-soft">
              {metaDe(diaAbierto).labor
                ? `Normalmente cuenta. ${metaDe(diaAbierto).porque}.`
                : `Normalmente no cuenta. ${metaDe(diaAbierto).porque}.`}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={guardandoDia}
              onClick={() => void cambiarDia(diaAbierto, "todos")}
              className="h-10 rounded-full bg-navy px-4 text-sm font-semibold text-paper disabled:opacity-60"
            >
              Todos cuentan
            </button>
            <button
              type="button"
              disabled={guardandoDia}
              onClick={() => void cambiarDia(diaAbierto, "nadie")}
              className="h-10 rounded-full border border-line px-4 text-sm font-semibold disabled:opacity-60"
            >
              Nadie cuenta
            </button>
            <button
              type="button"
              disabled={guardandoDia}
              onClick={() => void cambiarDia(diaAbierto, "normal")}
              className="h-10 rounded-full border border-line px-4 text-sm font-semibold disabled:opacity-60"
            >
              Volver a lo normal
            </button>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {lista.map((asesor) => {
              const cuenta = cuentaEseDia(asesor.slug, diaAbierto);
              return (
                <li key={asesor.slug}>
                  <button
                    type="button"
                    disabled={guardandoDia}
                    onClick={() => void cambiarDia(diaAbierto, "uno", asesor.slug, !cuenta)}
                    className="flex h-11 w-full items-center justify-between rounded-2xl border border-line px-3 text-sm font-semibold disabled:opacity-60"
                  >
                    <span>
                      {asesor.name.split(" ")[0]}
                      {asesor.role === "lider" ? " · líder" : ""}
                    </span>
                    <span className={cuenta ? "text-navy" : "text-ink-soft"}>{cuenta ? "Cuenta" : "No cuenta"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">Toca un día de la tabla para elegir quién trabaja.</p>
      )}

      <div className="mt-4 overflow-x-auto rounded-card border border-line bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-semibold">Asesor</th>
              {columnas.map((c) => {
                const tocado = dias.some((d) => d.fecha === c.iso);
                return (
                <th key={c.iso} className={"px-1 py-2 text-center font-medium " + (metaDe(c.iso).labor ? "" : "text-ink-soft")}>
                    <button
                      type="button"
                      onClick={() => setDiaAbierto((prev) => (prev === c.iso ? null : c.iso))}
                      className={"mx-auto block rounded-lg px-1 " + (diaAbierto === c.iso ? "bg-navy text-paper" : "")}
                    >
                      <span className="block text-xs">{DIAS[diaDe(c.iso)]}</span>
                      {Number(c.iso.slice(-2))}
                      {tocado ? <span className={"block text-[10px] leading-none " + (diaAbierto === c.iso ? "text-paper" : "text-navy")}>•</span> : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.asesor.slug} className="border-t border-line">
                <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-semibold whitespace-nowrap">
                  {fila.asesor.name.split(" ")[0]}
                  {fila.asesor.role === "lider" ? " · líder" : ""}
                  <span className="mt-0.5 block text-xs font-medium text-ink-soft">
                    {futuro ? `0 de ${metaAsesor(fila.asesor.slug)}` : `${fila.resumen.hechas} de ${fila.resumen.meta} · ${fila.resumen.pct}%`}
                  </span>
                  {edita ? (
                  <input
                    type="number"
                    min={0}
                    aria-label={`Meta de ${fila.asesor.name}`}
                    value={metaAsesor(fila.asesor.slug)}
                    onChange={(e) => cambiarMeta(fila.asesor.slug, Number(e.target.value))}
                    className="mt-1 h-8 w-16 rounded-lg border border-line bg-card px-2 text-xs font-medium text-ink"
                  />
                  ) : (
                    <span className="mt-1 block text-xs text-ink-soft">Meta {metaAsesor(fila.asesor.slug)}</span>
                  )}
                </th>
                {fila.celdas.map((celda) => (
                  <td key={celda.iso} className="px-1 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => setElegida({ nombre: fila.asesor.name, iso: celda.iso })}
                      className={"mx-auto grid h-10 w-10 place-items-center rounded-xl text-sm font-semibold " + tono(celda, hoy)}
                    >
                      {celda.labor || celda.cuenta > 0 ? celda.cuenta : "–"}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-line">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-semibold whitespace-nowrap">
                Equipo
                <span className="mt-0.5 block text-xs font-medium text-ink-soft">
                  {futuro ? `0 de ${metaEquipoMes}` : `${hechasEquipo} de ${metaEquipoHoy} · ${pctEquipo}%`}
                </span>
              </th>
              {columnas.map((columna) => {
                const total = filas.reduce((suma, fila) => {
                  const celda = fila.celdas.find((c) => c.iso === columna.iso);
                  return suma + (celda?.cuenta ?? 0);
                }, 0);
                return (
                  <td key={columna.iso} className="px-1 py-2 text-center text-sm font-semibold">
                    {filas.some((fila) => fila.celdas.find((c) => c.iso === columna.iso)?.labor) ? total : "–"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {detalle && elegida ? (
        <div className="mt-3 rounded-card border border-line bg-card p-4">
          <p className="font-semibold">
            {elegida.nombre.split(" ")[0]} · {corta(detalle.iso)}
            {detalle.iso === hoy ? " · hoy" : ""}
          </p>
          <p className="text-sm text-ink-soft">
            {detalle.labor ? `Meta ${detalle.meta}` : detalle.porque + ", no cuenta"}
          </p>
          {detalle.labor ? <Nota celda={detalle} /> : null}
          {detalle.placas.length > 0 ? (
            <ul className="mt-2 text-sm">
              {detalle.placas.map((p) => (
                <li key={p.placa}>
                  {p.placa} · {p.nombre}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">Este día no tiene pólizas compradas.</p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">Toca un día para ver las placas y si quedó cubierto por otro.</p>
      )}
      </>
      ) : null}
    </section>
  );
}

function Nota({ celda }: { celda: CeldaMeta }) {
  if (celda.cubiertoPor) {
    const placas = celda.placasQueCubren.map((p) => p.placa).join(", ");
    return (
      <p className="mt-2 text-sm">
        Día cubierto por el {corta(celda.cubiertoPor)} con {celda.cuentaQueCubre}{" "}
        {celda.cuentaQueCubre === 1 ? "afiliación" : "afiliaciones"}
        {placas ? `. Placas: ${placas}` : ""}.
      </p>
    );
  }
  if (celda.cubre.length > 0) {
    return (
      <p className="mt-2 text-sm">
        Estas {celda.cuenta} afiliaciones cubren el {[...celda.cubre].sort().map(corta).join(" y el ")}.
      </p>
    );
  }
  if (celda.falta > 0 && celda.iso) {
    return (
      <p className="mt-2 text-sm font-semibold text-danger">
        Falta {celda.falta} para la meta de este día.
      </p>
    );
  }
  if (celda.cuenta >= celda.meta) return <p className="mt-2 text-sm">Cumplió la meta de este día.</p>;
  return null;
}

function tono(celda: CeldaMeta, hoy: string) {
  if (!celda.labor) return "bg-paper text-ink-soft";
  if (celda.iso > hoy) return "border border-line bg-card text-ink";
  if (celda.falta === 0 && celda.cuenta >= celda.meta) return "bg-lime text-ink";
  if (celda.falta === 0) return "bg-navy text-paper";
  return "bg-paper text-danger";
}

export function MetaMia({ casos, hoy, nombre }: { casos: Caso[]; hoy: string; nombre: string }) {
  const mes = hoy.slice(0, 7) < META_DESDE.slice(0, 7) ? META_DESDE.slice(0, 7) : hoy.slice(0, 7);
  const defecto = metaBaseDelMes(mes);
  const [cuota, setCuota] = useState<number | null>(null);
  const [excepciones, setExcepciones] = useState<Record<string, boolean>>({});
  const [tocadas, setTocadas] = useState<string[]>([]);
  useEffect(() => {
    let vivo = true;
    miCuota({ data: mes })
      .then((row) => {
        if (vivo) setCuota(row.meta);
      })
      .catch(() => {
        if (vivo) setCuota(null);
      });
    const yo = ASESORES.find((a) => a.name === nombre);
    listDiasMeta({ data: mes })
      .then((rows) => {
        if (!vivo) return;
        const map: Record<string, boolean> = {};
        for (const row of rows) {
          if (row.cuenta == null) continue;
          if (!yo || row.slug === yo.slug) map[row.fecha] = row.cuenta;
        }
        setExcepciones(map);
        setTocadas(rows.map((row) => row.fecha));
      })
      .catch(() => {
        if (vivo) {
          setExcepciones({});
          setTocadas([]);
        }
      });
    return () => {
      vivo = false;
    };
  }, [mes, nombre]);
  const total = cuota ?? defecto;
  const dias = rangoDelCorte(mes);
  const desde = dias[0] ?? META_DESDE;
  const hasta = dias[dias.length - 1] ?? finDeMes(mes);
  const celdas = calendarioDe(logrosDe(casos, hoy), nombre, desde, hasta, hoy, total, excepciones);
  const resumen = resumenMeta(celdas, hoy, tocadas);
  const hoyCelda = celdas.find((c) => c.iso === hoy);
  const hechasMes = celdas.reduce((suma, c) => suma + c.cuenta, 0);
  const falta = Math.max(0, resumen.meta - resumen.hechas);
  const recientes = celdas.filter((c) => c.labor && c.iso <= hoy).slice(-8).reverse();
  const [anio, numero] = mes.split("-").map(Number);

  return (
    <section className="mt-5">
      <h1 className="text-lg font-semibold">Tu meta · {MESES[numero - 1]}</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Cuenta el día en que marcas Pólizas pagadas. Cada día de trabajo vale 2, sábado incluido. Domingo y festivo no
        cuentan. La meta del mes la pone coordinación.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-card border border-line bg-card px-3 py-3">
          <p className="text-2xl font-semibold tabular-nums">
            {hoyCelda?.labor ? `${hoyCelda.cuenta}/${hoyCelda.meta}` : "—"}
          </p>
          <p className="text-sm text-ink-soft">{hoyCelda?.labor ? "Hoy" : hoyCelda?.porque || "Hoy no cuenta"}</p>
        </div>
        <div className="rounded-card border border-line bg-card px-3 py-3">
          <p className="text-2xl font-semibold tabular-nums">
            {resumen.hechas}/{resumen.meta}
          </p>
          <p className="text-sm text-ink-soft">Al día de hoy</p>
        </div>
        <div className="rounded-card border border-line bg-card px-3 py-3">
          <p className="text-2xl font-semibold tabular-nums">{resumen.pct}%</p>
          <p className="text-sm text-ink-soft">Cumplimiento</p>
        </div>
        <div className="rounded-card border border-line bg-card px-3 py-3">
          <p className="text-2xl font-semibold tabular-nums">
            {hechasMes}/{total}
          </p>
          <p className="text-sm text-ink-soft">Mes {anio}</p>
        </div>
      </div>
      <p className={"mt-3 text-sm font-semibold " + (falta === 0 ? "text-navy" : "text-danger")}>
        {falta === 0 ? "Vas al día." : `Vas atrasado: te faltan ${falta} para ir al día.`}
      </p>
      <ul className="mt-3 grid gap-2">
        {recientes.map((celda) => (
          <li key={celda.iso} className="flex items-center justify-between gap-3 rounded-card border border-line bg-card px-4 py-3">
            <span>
              <span className="font-semibold">{corta(celda.iso)}</span>
              <span className="mt-0.5 block text-sm text-ink-soft">
                {celda.placas.length ? celda.placas.map((p) => p.placa).join(", ") : "Sin afiliaciones"}
              </span>
            </span>
            <span className={"shrink-0 rounded-full px-3 py-1 text-xs font-semibold " + tono(celda, hoy)}>
              {celda.cuenta}/{celda.meta}
              {celda.falta > 0 ? ` · falta ${celda.falta}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
