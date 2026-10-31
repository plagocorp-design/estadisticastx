import { useEffect, useMemo, useState, type ReactNode } from "react";
import { listBitacorasRango } from "@/lib/bitacora.functions";
import type { Bitacora } from "@/lib/bitacora";
import { enCurso, hoyBogota, ORIGENES, siguientePaso, type Caso } from "@/lib/casos";
import { listDiasMeta, listMetas } from "@/lib/casos.functions";
import {
  calendarioDe,
  diaSemana,
  fechaDelLogro,
  META_DESDE,
  metaBaseDelMes,
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

function Barra({ n, total }: { n: number; total: number }) {
  const pct = total === 0 ? 0 : Math.max(4, Math.round((n / total) * 100));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-paper">
      <div className="h-full rounded-full bg-navy" style={{ width: n === 0 ? "0%" : `${pct}%` }} />
    </div>
  );
}

function Bloque({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-card p-4">
      <h3 className="text-base font-semibold">{titulo}</h3>
      {nota ? <p className="mt-1 text-sm text-ink-soft">{nota}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Informes({ casos, hoy }: { casos: Caso[]; hoy: string }) {
  const [corte, setCorte] = useState<"semana" | "mes" | "desde" | "fechas">("desde");
  const [desdeManual, setDesdeManual] = useState(META_DESDE);
  const [hastaManual, setHastaManual] = useState(hoy);
  const [bitacoras, setBitacoras] = useState<Bitacora[]>([]);
  const [metas, setMetas] = useState<Record<string, number>>({});
  const [dias, setDias] = useState<{ slug: string; fecha: string; cuenta: boolean | null }[]>([]);
  const [aviso, setAviso] = useState("");

  const desde = corte === "semana" ? inicioSemana(hoy) : corte === "mes" ? `${hoy.slice(0, 7)}-01` : corte === "desde" ? META_DESDE : desdeManual;
  const hasta = corte === "fechas" ? hastaManual : hoy;
  const mes = hasta.slice(0, 7);

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
    Promise.all([listMetas({ data: mes }), listDiasMeta({ data: mes })])
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
  }, [mes]);

  const foto = useMemo(() => {
    const cuenta = (estados: readonly string[]) => casos.filter((c) => estados.includes(c.estado)).length;
    const embudo = EMBUTO.map((paso) => ({ ...paso, n: cuenta(paso.estados) }));
    const caidosHoy = casos.filter((c) => c.estado === "No se concretó").length;
    const abiertos = casos.filter((c) => enCurso(c));
    const demorados = abiertos
      .map((c) => {
        const empezo = diasEntre(c.fechaInicio, hoy);
        const toque = fechaBogota(c.actualizadoEn);
        const quieto = diasEntre(toque || c.fechaInicio, hoy);
        return { c, empezo, quieto, toque };
      })
      .sort((a, b) => b.empezo - a.empezo || a.c.placa.localeCompare(b.c.placa));
    const citas = abiertos
      .filter((c) => c.fechaProxima && c.fechaProxima < hoy)
      .sort((a, b) => a.fechaProxima.localeCompare(b.fechaProxima));
    return { embudo, caidosHoy, demorados, citas, total: casos.length };
  }, [casos, hoy]);

  const periodo = useMemo(() => {
    const delPeriodo = casos.filter((c) => enRango(c.fechaInicio, desde, hasta));
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
    const ranking = [...empresas.values()].sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre));
    const origenes = ORIGENES.map((nombre) => {
      const filas = delPeriodo.filter((c) => c.origen === nombre);
      return { nombre, n: filas.length, polizas: filas.filter((c) => c.polizasSubidas).length };
    });
    const sinOrigen = delPeriodo.filter((c) => !(ORIGENES as readonly string[]).includes(c.origen));
    const motivos = new Map<string, { texto: string; n: number }>();
    for (const c of casos) {
      const texto = c.motivoCierre.trim();
      const cuando = c.fechaCierre || fechaBogota(c.actualizadoEn);
      if (!texto || !enRango(cuando, desde, hasta)) continue;
      const id = clave(texto);
      const previa = motivos.get(id) ?? { texto, n: 0 };
      motivos.set(id, { texto: previa.texto, n: previa.n + 1 });
    }
    const caidas = [...motivos.values()].sort((a, b) => b.n - a.n || a.texto.localeCompare(b.texto));
    const defecto = metaBaseDelMes(mes);
    const corteMes = rangoDelCorte(mes);
    const logros = casos
      .filter((c) => c.polizasSubidas)
      .map((c) => ({
        ownerName: c.ownerName,
        placa: c.placa,
        nombre: c.nombre,
        fecha: fechaDelLogro(c.fechaPoliza, c.fechaFirma, c.fechaInicio, hoy),
      }));
    const tocadas = dias.map((d) => d.fecha);
    const equipo = ASESORES.map((asesor) => {
      const suyos = casos.filter((c) => esSuyo(c.ownerName, asesor.name));
      const bits = bitacoras.filter((b) => b.slug === asesor.slug);
      const excepciones: Record<string, boolean> = {};
      for (const row of dias) if (row.slug === asesor.slug && row.cuenta != null) excepciones[row.fecha] = row.cuenta;
      const celdas = calendarioDe(
        logros,
        asesor.name,
        corteMes[0] ?? META_DESDE,
        corteMes[corteMes.length - 1] ?? hoy,
        hoy,
        metas[asesor.slug] ?? defecto,
        excepciones,
      );
      const resumen = resumenMeta(celdas, hoy, tocadas);
      return {
        nombre: asesor.name.split(" ")[0],
        abiertos: suyos.filter((c) => enCurso(c)).length,
        polizas: suyos.filter((c) => c.polizasSubidas && enRango(fechaDelLogro(c.fechaPoliza, c.fechaFirma, c.fechaInicio, hoy), desde, hasta)).length,
        completados: suyos.filter((c) => c.completado && enRango(c.fechaPoliza || fechaBogota(c.actualizadoEn), desde, hasta)).length,
        caidos: suyos.filter((c) => c.motivoCierre.trim() && enRango(c.fechaCierre || fechaBogota(c.actualizadoEn), desde, hasta)).length,
        llamadas: bits.reduce((n, b) => n + b.llamadas, 0),
        visitas: bits.reduce((n, b) => n + b.visitas, 0),
        dijoSi: bits.reduce((n, b) => n + b.dijoSi, 0),
        meta: resumen.meta,
        hechas: resumen.hechas,
        pct: resumen.pct,
      };
    });
    return { ranking, sinEmpresa, origenes, sinOrigen: { n: sinOrigen.length, polizas: sinOrigen.filter((c) => c.polizasSubidas).length }, caidas, equipo, entraron: delPeriodo.length };
  }, [bitacoras, casos, desde, dias, hasta, hoy, mes, metas]);

  const maxEmpresa = periodo.ranking[0]?.n ?? 1;
  const [anio, numero] = mes.split("-").map(Number);

  return (
    <div className="mt-4 grid gap-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["semana", "Esta semana"],
            ["mes", "Este mes"],
            ["desde", "Desde el 7 de octubre"],
            ["fechas", "Otras fechas"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setCorte(id)}
            className={"h-10 rounded-full border px-4 text-sm font-semibold " + (corte === id ? "border-navy bg-navy text-paper" : "border-line bg-card")}
          >
            {label}
          </button>
        ))}
      </div>
      {corte === "fechas" ? (
        <div className="flex flex-wrap gap-2">
          <input type="date" min={META_DESDE} max={hoyBogota()} value={desdeManual} onChange={(e) => setDesdeManual(e.target.value || META_DESDE)} className="h-11 rounded-2xl border border-line px-3" />
          <input type="date" min={desdeManual} max={hoyBogota()} value={hastaManual} onChange={(e) => setHastaManual(e.target.value || hoy)} className="h-11 rounded-2xl border border-line px-3" />
        </div>
      ) : null}
      <p className="text-sm text-ink-soft">
        Del {dia(desde)} al {dia(hasta)}. Cómo van, los demorados y las citas vencidas son la foto de hoy: no se esconden si empezaron antes.
      </p>
      {aviso ? <p className="text-sm text-danger">{aviso}</p> : null}

      <Bloque titulo="Cómo van" nota={`${foto.total} procesos en total. La barra es la parte de ese total.`}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem]">
          <ul className="grid gap-2">
            {foto.embudo.map((paso) => (
              <li key={paso.label} className="grid grid-cols-[9.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm">
                <span>{paso.label}</span>
                <Barra n={paso.n} total={foto.total} />
                <span className="text-right font-semibold tabular-nums">{paso.n}</span>
              </li>
            ))}
          </ul>
          <div className="rounded-2xl border border-line bg-paper px-3 py-3">
            <p className="text-2xl font-semibold tabular-nums">{foto.caidosHoy}</p>
            <p className="text-sm text-ink-soft">No se concretaron</p>
          </div>
        </div>
      </Bloque>

      <Bloque titulo="Los más demorados" nota="Verde hasta 7 días, ámbar de 8 a 15, rojo de 16. El color usa los días desde que empezó.">
        {foto.demorados.length === 0 ? (
          <p className="text-sm text-ink-soft">No hay procesos abiertos.</p>
        ) : (
          <ul className="grid max-h-[32rem] gap-2 overflow-auto">
            {foto.demorados.map(({ c, empezo, quieto }) => (
              <li key={c.id} className="rounded-2xl border border-line px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">
                    {c.placa} · {c.nombre}
                  </p>
                  <p className={"font-semibold " + tono(empezo)}>{empezo} días desde que empezó</p>
                </div>
                <p className="mt-1 text-ink-soft">
                  {c.ownerName.split(" ")[0]} · {c.estado} · {siguientePaso(c)}
                </p>
                <p className={"mt-1 " + tono(quieto)}>{quieto} días quieto, sin que nadie lo toque</p>
              </li>
            ))}
          </ul>
        )}
      </Bloque>

      <Bloque titulo="De qué empresa salieron" nota={`${periodo.entraron} empezaron en este periodo. La póliza y el completado son de esos mismos.`}>
        {periodo.ranking.length === 0 ? (
          <p className="text-sm text-ink-soft">En este periodo nadie trae empresa escrita.</p>
        ) : (
          <ul className="grid gap-2">
            {periodo.ranking.map((fila) => (
              <li key={fila.nombre} className="grid gap-1 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold">{fila.nombre}</span>
                  <span className="tabular-nums text-ink-soft">
                    {fila.n} vehículos · {fila.polizas} con póliza · {fila.listos} completados
                  </span>
                </div>
                <Barra n={fila.n} total={maxEmpresa} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-ink-soft">
          Sin empresa o vehículo nuevo: {periodo.sinEmpresa.n} vehículos · {periodo.sinEmpresa.polizas} con póliza · {periodo.sinEmpresa.listos} completados
        </p>
      </Bloque>

      <Bloque titulo="Por dónde llegaron" nota="De los que empezaron en el periodo, cuántos ya tienen la póliza pagada.">
        <ul className="grid gap-2 sm:grid-cols-2">
          {periodo.origenes.map((fila) => (
            <li key={fila.nombre} className="rounded-2xl border border-line px-3 py-2 text-sm">
              <p className="font-semibold">{fila.nombre}</p>
              <p className="text-ink-soft">
                {fila.n} entraron · {fila.polizas} con póliza
              </p>
            </li>
          ))}
          <li className="rounded-2xl border border-line px-3 py-2 text-sm">
            <p className="font-semibold">Sin origen</p>
            <p className="text-ink-soft">
              {periodo.sinOrigen.n} entraron · {periodo.sinOrigen.polizas} con póliza
            </p>
          </li>
        </ul>
      </Bloque>

      <Bloque titulo={`Meta de ${MESES[numero - 1]}`} nota="Es el mismo corte de la meta: lo que debía al día de hoy y lo que ya marcó como póliza pagada. No cambia el calendario.">
        <ul className="grid gap-2">
          {periodo.equipo.map((fila) => (
            <li key={fila.nombre} className="grid grid-cols-[6rem_minmax(0,1fr)_8rem] items-center gap-2 text-sm">
              <span className="font-semibold">{fila.nombre}</span>
              <Barra n={fila.hechas} total={Math.max(fila.meta, fila.hechas, 1)} />
              <span className="text-right tabular-nums">
                {fila.hechas} de {fila.meta} · {fila.pct}%
              </span>
            </li>
          ))}
        </ul>
      </Bloque>

      <Bloque titulo="El equipo en el periodo" nota="Abiertos es ahora. Pólizas, completados y no concretados son del periodo. Llamadas, visitas y dijeron sí salen de la bitácora.">
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
              {periodo.equipo.map((fila) => (
                <tr key={fila.nombre} className="border-t border-line">
                  <td className="px-2 py-2 font-semibold">{fila.nombre}</td>
                  <td className="px-2 py-2 tabular-nums">{fila.abiertos}</td>
                  <td className="px-2 py-2 tabular-nums">{fila.polizas}</td>
                  <td className="px-2 py-2 tabular-nums">{fila.completados}</td>
                  <td className="px-2 py-2 tabular-nums">{fila.caidos}</td>
                  <td className="px-2 py-2 tabular-nums">{fila.llamadas}</td>
                  <td className="px-2 py-2 tabular-nums">{fila.visitas}</td>
                  <td className="px-2 py-2 tabular-nums">{fila.dijoSi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloque>

      <Bloque titulo="Por qué se cayeron" nota="Agrupado por el texto del cierre, de los que se cayeron en el periodo.">
        {periodo.caidas.length === 0 ? (
          <p className="text-sm text-ink-soft">En este periodo no hay cierres.</p>
        ) : (
          <ul className="grid gap-2">
            {periodo.caidas.map((fila) => (
              <li key={fila.texto} className="flex justify-between gap-3 text-sm">
                <span>{fila.texto}</span>
                <span className="font-semibold tabular-nums">{fila.n}</span>
              </li>
            ))}
          </ul>
        )}
      </Bloque>

      <Bloque titulo="Citas vencidas" nota="Procesos abiertos cuya próxima fecha ya pasó.">
        {foto.citas.length === 0 ? (
          <p className="text-sm text-ink-soft">No hay citas vencidas.</p>
        ) : (
          <ul className="grid gap-2">
            {foto.citas.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-semibold">
                  {c.placa} · {c.ownerName.split(" ")[0]}
                </span>
                <span className="text-ink-soft">
                  {" "}
                  · {c.fechaProxima} · hace {diasEntre(c.fechaProxima, hoy)} días · {c.proxima || c.estado}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Bloque>
    </div>
  );
}
