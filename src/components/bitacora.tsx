import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { guardarBitacora, listBitacoras } from "@/lib/bitacora.functions";
import {
  bitacoraHecha,
  MODOS,
  type Bitacora,
  type BitacoraDraft,
  type ModoBitacora,
} from "@/lib/bitacora";
import { ASESORES, llevaProcesos, veElEquipo } from "@/lib/team.public";
import { META_LLAMADAS } from "@/lib/callcenter";
import type { Me } from "@/lib/casos.functions";

const VACIO: Omit<BitacoraDraft, "fecha"> = {
  modo: "",
  zonas: "",
  llamadas: 0,
  visitas: 0,
  dijoSi: 0,
  polizas: 0,
  queHizo: "",
  detalleCall: "",
  detalleCalle: "",
  trabas: "",
  manana: "",
};

function deFila(row: Bitacora | undefined): Omit<BitacoraDraft, "fecha"> {
  if (!row) return VACIO;
  return {
    modo: row.modo,
    zonas: row.zonas,
    llamadas: row.llamadas,
    visitas: row.visitas,
    dijoSi: row.dijoSi,
    polizas: row.polizas,
    queHizo: row.queHizo,
    detalleCall: row.detalleCall,
    detalleCalle: row.detalleCalle,
    trabas: row.trabas,
    manana: row.manana,
  };
}

type Reconocimiento = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function dictadoDisponible() {
  const w = window as unknown as {
    SpeechRecognition?: new () => Reconocimiento;
    webkitSpeechRecognition?: new () => Reconocimiento;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function Dictado({ onTexto }: { onTexto: (texto: string) => void }) {
  const [oyendo, setOyendo] = useState(false);
  const [aviso, setAviso] = useState("");
  const rec = useRef<Reconocimiento | null>(null);

  function hablar() {
    const SR = dictadoDisponible();
    if (!SR) {
      setAviso("Aquí no hay dictado. En el celular usa el micrófono del teclado.");
      return;
    }
    if (oyendo && rec.current) {
      rec.current.stop();
      setOyendo(false);
      return;
    }
    const oido = new SR();
    oido.lang = "es-CO";
    oido.interimResults = false;
    oido.continuous = false;
    oido.onresult = (ev) => {
      const texto = ev.results[0]?.[0]?.transcript?.trim() ?? "";
      if (texto) onTexto(texto);
      setOyendo(false);
    };
    oido.onerror = (ev) => {
      setOyendo(false);
      setAviso(ev.error === "not-allowed" ? "Permite el micrófono para dictar." : "No pude oír. Intenta otra vez o escribe.");
    };
    oido.onend = () => setOyendo(false);
    rec.current = oido;
    setAviso("");
    setOyendo(true);
    oido.start();
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={hablar}
        className={"inline-flex h-9 items-center gap-1 rounded-full border px-3 text-xs font-semibold " + (oyendo ? "border-danger text-danger" : "border-line")}
      >
        <Mic className="size-3.5" />
        {oyendo ? "Escuchando…" : "Dictar"}
      </button>
      {aviso ? <span className="mt-1 max-w-48 text-right text-xs font-normal text-danger">{aviso}</span> : null}
    </span>
  );
}

function unir(actual: string, extra: string) {
  const a = actual.trim();
  const b = extra.trim();
  if (!b) return actual;
  return a ? `${a} ${b}` : b;
}

function Caja({
  label,
  hint,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="flex items-start justify-between gap-3">
        <span>
          <span className="text-sm font-medium">{label}</span>
          {hint ? <span className="mt-0.5 block text-sm font-normal text-ink-soft">{hint}</span> : null}
        </span>
        <Dictado onTexto={(texto) => onChange(unir(value, texto))} />
      </span>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full resize-y rounded-2xl border border-line px-3 py-2 text-sm"
      />
    </label>
  );
}

function corta(iso: string) {
  const [, m, d] = iso.split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(d)} ${meses[Number(m) - 1]}`;
}

export function BitacoraVista({
  me,
  hoy,
  tarde,
  verEquipo,
  noTrabajan = [],
  onSaved,
}: {
  me: Me;
  hoy: string;
  tarde: boolean;
  verEquipo: boolean;
  noTrabajan?: string[];
  onSaved: () => void;
}) {
  const escribe = llevaProcesos(me.role);
  const veTodos = veElEquipo(me.role);
  const [fecha, setFecha] = useState(hoy);
  const [filas, setFilas] = useState<Bitacora[]>([]);
  const [form, setForm] = useState<Omit<BitacoraDraft, "fecha">>(VACIO);
  const [enviada, setEnviada] = useState(false);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    listBitacoras({ data: fecha })
      .then((rows) => {
        if (!vivo) return;
        setFilas(rows);
        if (escribe) {
          const mia = rows.find((r) => r.ownerId === me.id);
          setForm(deFila(mia));
          setEnviada(Boolean(mia?.enviada));
        }
      })
      .catch(() => {
        if (vivo) setError("No pude cargar la bitácora.");
      });
    return () => {
      vivo = false;
    };
  }, [fecha, me.id, escribe]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setAviso("");
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function guardar(definitiva = false) {
    if (!form.modo) {
      setError("Primero marca dónde estuviste.");
      return;
    }
    const enCall = form.modo === "call" || form.modo === "mixto";
    const enCalle = form.modo === "calle" || form.modo === "mixto";
    const data = {
      fecha,
      ...form,
      llamadas: enCall ? form.llamadas : 0,
      visitas: enCalle ? form.visitas : 0,
      detalleCall: enCall ? form.detalleCall : "",
      detalleCalle: enCalle ? form.detalleCalle : "",
      definitiva,
    };
    setGuardando(true);
    setError("");
    try {
      await guardarBitacora({ data });
      const rows = await listBitacoras({ data: fecha });
      setFilas(rows);
      const mia = rows.find((r) => r.ownerId === me.id);
      setForm(deFila(mia));
      setEnviada(Boolean(mia?.enviada));
      setAviso(definitiva ? "Definitiva enviada. Las llamadas nuevas ya no la reescriben." : "Cambios guardados. Puedes seguir corrigiendo antes de enviarla.");
      if (fecha === hoy) onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude guardar");
    } finally {
      setGuardando(false);
    }
  }

  const hoyVista = fecha === hoy;
  const numeros: ["llamadas" | "visitas" | "dijoSi" | "polizas", string][] = [];
  if (form.modo !== "calle") numeros.push(["llamadas", "Llamadas"]);
  if (form.modo !== "call") numeros.push(["visitas", "Visitas"]);
  numeros.push(["dijoSi", "Dijeron sí"], ["polizas", "Compraron póliza"]);

  return (
    <section className="flex flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{verEquipo ? "Bitácoras del equipo" : "Tu bitácora"}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Una por día. Cuéntalo como se lo contarías al jefe: dónde estuviste, a quién llamaste, a quién viste y qué
            te trabó. Desde las 4:30, si no está, sale en rojo.
          </p>
        </div>
        <label className="text-sm font-medium">
          Día
          <input
            type="date"
            max={hoy}
            value={fecha}
            onChange={(e) => {
              setAviso("");
              setFecha(e.target.value || hoy);
            }}
            className="mt-1 block h-11 rounded-2xl border border-line px-3"
          />
        </label>
      </div>

      {escribe ? (
        <div className={"grid max-w-3xl gap-4 rounded-card border border-line bg-card p-4 " + (veTodos && verEquipo ? "order-2 mt-5" : "mt-4")}>
          <p className="text-sm font-semibold">{verEquipo ? "La tuya" : hoyVista ? "Hoy" : corta(fecha)}</p>
          <p className="text-sm text-ink-soft">
            {enviada
              ? "Definitiva enviada. Si la corriges, vuelve a guardar."
              : "Se arma sola con las tipificaciones del call. Revísala, cámbiala si hace falta y envía la definitiva."}
          </p>
          <div>
            <p className="text-sm font-medium">Dónde estuviste</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {MODOS.map((modo) => (
                <button
                  key={modo.id}
                  type="button"
                  onClick={() => set("modo", form.modo === modo.id ? "" : (modo.id as ModoBitacora))}
                  className={
                    "h-10 rounded-full border px-4 text-sm font-semibold " +
                    (form.modo === modo.id ? "border-navy bg-navy text-paper" : "border-line bg-card")
                  }
                >
                  {modo.label}
                </button>
              ))}
            </div>
          </div>
          {!form.modo ? (
            <p className="text-sm text-ink-soft">Primero marca dónde estuviste. El resto del formulario cambia según eso.</p>
          ) : (
            <>
              <Caja
                label={form.modo === "call" ? "Desde dónde llamaste" : form.modo === "calle" ? "Dónde estuviste en la calle" : "Zonas y bases"}
                hint={
                  form.modo === "call"
                    ? "La base, la oficina o si llamaste desde la casa."
                    : form.modo === "calle"
                      ? "Barrios, conjuntos o porterías."
                      : "Barrios donde caminaste y la base desde donde llamaste."
                }
                value={form.zonas}
                onChange={(v) => set("zonas", v)}
                rows={2}
              />
              <div className={"grid gap-2 " + (numeros.length > 3 ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
                {numeros.map(([key, label]) => (
                  <label key={key} className="text-sm font-medium">
                    {label}
                    <input
                      type="number"
                      min={0}
                      value={form[key]}
                      onChange={(e) => set(key, Number(e.target.value))}
                      className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
                    />
                  </label>
                ))}
              </div>
              <Caja
                label={form.modo === "call" ? "Qué hiciste en el call" : form.modo === "calle" ? "Qué hiciste en la calle" : "Qué hiciste"}
                hint={
                  form.modo === "call"
                    ? "A quién llamaste, quién contestó y en qué quedó. Puedes dictarlo."
                    : form.modo === "calle"
                      ? "A quién viste, si el carro estaba y qué acordaron. Puedes dictarlo."
                      : "Primero la calle y después las llamadas, o al revés. Puedes dictarlo."
                }
                value={form.queHizo}
                onChange={(v) => set("queHizo", v)}
                rows={4}
              />
              {form.modo === "call" || form.modo === "mixto" ? (
                <Caja
                  label="Llamadas que importan"
                  hint="Nombre, si contestó y si quedó citado, con plata o pendiente."
                  value={form.detalleCall}
                  onChange={(v) => set("detalleCall", v)}
                />
              ) : null}
              {form.modo === "calle" || form.modo === "mixto" ? (
                <Caja
                  label="Visitas que importan"
                  hint="Nombre, barrio y si el carro estaba en el sitio."
                  value={form.detalleCalle}
                  onChange={(v) => set("detalleCalle", v)}
                />
              ) : null}
              <Caja
                label="Qué te trabó"
                hint={
                  form.modo === "call"
                    ? "No contestó, pidió que llames después, no tenía la plata de la póliza…"
                    : form.modo === "calle"
                      ? "No estaba, el carro en el taller, no tenía la plata de la póliza…"
                      : "No contestó, no estaba, el carro en el taller, no tenía la plata…"
                }
                value={form.trabas}
                onChange={(v) => set("trabas", v)}
              />
              <Caja label="Mañana, lo primero" value={form.manana} onChange={(v) => set("manana", v)} rows={2} />
            </>
          )}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {aviso ? <p className="text-sm font-semibold text-navy">{aviso}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={guardando}
              onClick={() => void guardar(false)}
              className="h-11 rounded-2xl border border-line px-4 font-semibold disabled:opacity-60"
            >
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              disabled={guardando || enviada}
              onClick={() => void guardar(true)}
              className="h-11 rounded-2xl bg-navy px-4 font-semibold text-paper disabled:opacity-60"
            >
              {enviada ? "Definitiva enviada" : "Enviar definitiva"}
            </button>
          </div>
        </div>
      ) : null}

      {veTodos && verEquipo ? (
        <div className={escribe ? "order-1 mt-4" : "mt-4"}>
          <h2 className="text-sm font-semibold">El equipo · {corta(fecha)}</h2>
          <ul className="mt-2 grid gap-2">
            {ASESORES.map((asesor) => {
              const row = filas.find((f) => f.slug === asesor.slug);
              const libre = hoyVista && noTrabajan.includes(asesor.slug);
              const hecha = bitacoraHecha(row);
              const rojo = !hecha && hoyVista && tarde && !libre;
              return (
                <li
                  key={asesor.slug}
                  className={"rounded-card border bg-card px-4 py-3 " + (rojo ? "border-danger" : "border-line")}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">
                      {asesor.name.split(" ")[0]}
                      {asesor.role === "lider" ? " · líder" : ""}
                    </p>
                    <p className={"text-sm font-semibold " + (rojo ? "text-danger" : "text-ink-soft")}>
                      {(row?.llamadas ?? 0)} de {META_LLAMADAS}
                      {row?.enviada ? " · definitiva" : hecha ? "" : libre ? " · no trabaja" : rojo ? " · falta" : ""}
                    </p>
                  </div>
                  {hecha && row ? (
                    <>
                      <p className="mt-1 text-sm text-ink-soft">
                        {row.modo !== "calle" ? `${row.llamadas} llamadas · ` : ""}
                        {row.modo !== "call" ? `${row.visitas} visitas · ` : ""}
                        {row.dijoSi} dijeron sí · {row.polizas} compraron póliza
                        {row.zonas ? ` · ${row.zonas}` : ""}
                      </p>
                      {row.queHizo ? <p className="mt-2 text-sm">{row.queHizo}</p> : null}
                      {row.detalleCall ? <p className="mt-2 text-sm"><span className="font-semibold">Call. </span>{row.detalleCall}</p> : null}
                      {row.detalleCalle ? <p className="mt-2 text-sm"><span className="font-semibold">Calle. </span>{row.detalleCalle}</p> : null}
                      {row.trabas ? <p className="mt-2 text-sm"><span className="font-semibold">Traba. </span>{row.trabas}</p> : null}
                      {row.manana ? <p className="mt-2 text-sm"><span className="font-semibold">Mañana. </span>{row.manana}</p> : null}
                    </>
                  ) : (
                    <p className={"mt-1 text-sm " + (rojo ? "text-danger" : "text-ink-soft")}>
                      {libre ? "Hoy no trabaja, no le pedimos bitácora." : "Todavía no cuenta el día."}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
