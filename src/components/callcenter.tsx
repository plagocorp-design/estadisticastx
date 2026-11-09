import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { enviarEnTrozos, prepararArchivo } from "@/lib/archivo";
import {
  CALIFICACIONES,
  CLASIFICACIONES,
  CHIPS,
  INTENCIONES,
  MOTIVOS,
  PROXIMAS,
  RESULTADOS,
  META_LLAMADAS,
  duracionTexto,
  type ContactoCall,
  type LlamadaDraft,
  type TipoPersona,
} from "@/lib/callcenter";
import {
  abrirProcesoCall,
  borrarBase,
  buscarCall,
  colaCall,
  exportarCall,
  guardarBriefing,
  guardarEmpresa,
  guardarLlamada,
  listBases,
  listBriefing,
  listEmpresas,
  listSeguimiento,
  resumenCall,
  statsCall,
  trozoBase,
  trozoGestiones,
  type AsesorMini,
  type BaseCall,
  type BriefingItem,
  type EmpresaCall,
  type SeguimientoCall,
  type StatsCall,
} from "@/lib/callcenter.functions";
import type { Me } from "@/lib/casos.functions";
import { hoyBogota } from "@/lib/casos";
import { llevaProcesos } from "@/lib/team.public";

type Tab = "llamar" | "seguimiento" | "bases" | "empresas" | "stats" | "briefing";

type Voz = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function reconocedor() {
  const w = window as unknown as { SpeechRecognition?: new () => Voz; webkitSpeechRecognition?: new () => Voz };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

function bajarExcel(base64: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function subirEnTrozos(file: File) {
  const { archivo, nombre } = await prepararArchivo(file);
  const cargaId = crypto.randomUUID();
  let ultimo: { aviso?: string; filas?: number } = {};
  await enviarEnTrozos(archivo, async (orden, datos, fin) => {
    const res = await trozoBase({ data: { cargaId, orden, datos, fin, nombre } });
    if (fin) ultimo = { aviso: res.aviso, filas: res.filas };
  });
  return ultimo;
}

async function subirGestiones(file: File) {
  const { archivo, nombre } = await prepararArchivo(file);
  const cargaId = crypto.randomUUID();
  let ultimo: { aviso?: string; filas?: number } = {};
  await enviarEnTrozos(archivo, async (orden, datos, fin) => {
    const res = await trozoGestiones({ data: { cargaId, orden, datos, fin, nombre } });
    if (fin) ultimo = { aviso: res.aviso, filas: res.filas };
  });
  return ultimo;
}

function CargarGestiones({ onError, onListo }: { onError: (t: string) => void; onListo?: () => void }) {
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="rounded-card border border-line bg-card p-4">
      <p className="font-semibold text-navy">Gestiones de un asesor</p>
      <p className="mt-1 text-xs text-ink-soft">Sube el Excel del asesor, el de la hoja BD. La base original no trae tipificación: este archivo la escribe sobre la misma placa. Si la placa está en la base, la clasificación queda ahí y entra a Estadísticas.</p>
      <label className={"mt-3 flex h-11 cursor-pointer items-center justify-center rounded-2xl bg-lime text-sm font-semibold text-navy " + (ocupado ? "opacity-60" : "")}>
        {ocupado ? "Escribiendo la tipificación en la base…" : "Cruzar gestiones con la base"}
        <input type="file" accept=".xlsx,.csv,.txt" className="sr-only" disabled={ocupado} onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setOcupado(true);
          setAviso("");
          subirGestiones(file)
            .then((res) => { setAviso(res.aviso || "Listo. Revisa Estadísticas."); onListo?.(); })
            .catch((err: Error) => onError(err.message))
            .finally(() => setOcupado(false));
        }} />
      </label>
      {aviso ? <p className="mt-2 text-sm">{aviso}</p> : null}
    </div>
  );
}

export function CallCenterVista({ me, verEquipo = false, onProceso }: { me: Me; verEquipo?: boolean; onProceso: (id: number) => void }) {
  const [tab, setTab] = useState<Tab>("llamar");
  const [resumen, setResumen] = useState<Awaited<ReturnType<typeof resumenCall>> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (tab !== "llamar" && tab !== "empresas" && tab !== "seguimiento") return;
    resumenCall()
      .then(setResumen)
      .catch((err: Error) => setError(err.message));
  }, [tab]);

  const coordina = verEquipo && (resumen?.coordina ?? me.role !== "asesor");
  const llama = !verEquipo && (resumen?.llama ?? llevaProcesos(me.role));
  const tabs: { id: Tab; label: string }[] = [
    { id: "llamar", label: verEquipo ? "Colas" : "Llamar" },
    { id: "seguimiento", label: "Seguimiento" },
    ...(coordina
      ? [
          { id: "bases" as const, label: "Bases" },
          { id: "empresas" as const, label: "Empresas" },
          { id: "stats" as const, label: "Estadísticas" },
        ]
      : []),
    { id: "briefing", label: "Briefing" },
  ];

  return (
    <div className="rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-navy">Call center</h2>
          <p className="text-sm text-ink-soft">
            {resumen
              ? llama
                ? `Hoy ${resumen.hoy} de ${META_LLAMADAS}${resumen.hoy >= META_LLAMADAS ? " · meta cumplida" : ` · faltan ${META_LLAMADAS - resumen.hoy}`}`
                : verEquipo
                  ? "Ves las colas, el seguimiento y las empresas. Tú no estás tipificando."
                  : `${resumen.activas} empresas activas`
              : "Cargando la cola…"}
          </p>
        </div>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => { setTab(item.id); setError(""); }}
            className={"h-10 shrink-0 rounded-2xl px-4 text-sm font-semibold " + (tab === item.id ? "bg-navy text-paper" : "border border-line bg-card")}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-4">
        {tab === "llamar" ? (
          <Llamar
            me={me}
            llama={llama}
            propio={!verEquipo}
            asesores={resumen?.asesores ?? []}
            onProceso={onProceso}
            onError={setError}
            onCola={(pendientes, hoy, hoySegundos) =>
              setResumen((prev) => (prev ? { ...prev, pendientes, hoy, hoySegundos } : prev))
            }
          />
        ) : null}
        {tab === "seguimiento" ? <Seguimiento llama={llama || verEquipo} onError={setError} /> : null}
        {tab === "bases" && coordina ? <Bases onError={setError} /> : null}
        {tab === "empresas" && coordina ? <Empresas onError={setError} /> : null}
        {tab === "stats" && coordina ? <Estadisticas onError={setError} /> : null}
        {tab === "briefing" ? <Briefing edita={coordina} onError={setError} /> : null}
      </div>
    </div>
  );
}

function Llamar({ me, llama, propio, asesores, onProceso, onError, onCola }: { me: Me; llama: boolean; propio: boolean; asesores: AsesorMini[]; onProceso: (id: number) => void; onError: (t: string) => void; onCola: (pendientes: number, hoy: number, segundos: number) => void }) {
  const [slug, setSlug] = useState(propio ? me.slug : "");
  const [contacto, setContacto] = useState<ContactoCall | null>(null);
  const [aviso, setAviso] = useState("");
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [hallados, setHallados] = useState<{ id: number; placa: string; nombre: string; telefono: string; empresa: string; hecho: boolean; dueno?: string }[]>([]);

  async function abrir(contactoId = 0, asesor = slug) {
    setCargando(true);
    try {
      const res = await colaCall({ data: { contactoId, slug: asesor } });
      setContacto(res.contacto);
      setAviso(res.aviso);
      setHallados([]);
      if (res.contacto) onCola(res.contacto.pendientes, res.contacto.hoyLlamadas, res.contacto.hoySegundos);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No pude abrir la cola");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    const inicial = propio ? me.slug : (asesores.find((p) => p.slug !== me.slug)?.slug || asesores[0]?.slug || "");
    if (!slug && inicial) setSlug(inicial);
    void abrir(0, inicial || slug);
  }, [asesores.length, propio]);

  return (
    <div>
    <div>
      {!propio ? (
        <label className="mb-3 block text-sm">
          Ver la cola de
          <select
            value={slug}
            onChange={(e) => { setSlug(e.target.value); void abrir(0, e.target.value); }}
            className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
          >
            {asesores.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
          <span className="mt-1 block text-xs text-ink-soft">Cada placa es de una sola persona. Esta cola no comparte contactos con las demás.</span>
        </label>
      ) : <p className="mb-3 text-xs text-ink-soft">Tu cola es solo tuya. La misma placa no le sale a otro asesor.</p>}
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar placa, nombre o teléfono"
          className="h-11 min-w-0 flex-1 rounded-2xl border border-line px-3"
        />
        <button
          type="button"
          className="h-11 rounded-2xl border border-line bg-card px-4 text-sm font-semibold"
          onClick={() => {
            buscarCall({ data: { q, slug } }).then(setHallados).catch((err: Error) => onError(err.message));
          }}
        >
          Buscar
        </button>
      </div>
      {hallados.length > 0 ? (
        <ul className="mt-2 overflow-hidden rounded-card border border-line bg-card">
          {hallados.map((item) => (
            <li key={item.id}>
              <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => {
                if (item.dueno) {
                  setAviso(`Esa placa la tiene ${item.dueno}. Cada asesor llama placas distintas.`);
                  setHallados([]);
                  return;
                }
                void abrir(item.id);
              }}>
                <span><b>{item.placa || "Sin placa"}</b> · {item.nombre || "Sin nombre"} · {item.telefono}</span>
                <span className="text-ink-soft">{item.dueno ? `La tiene ${item.dueno}` : item.hecho ? "Ya llamado" : "Pendiente"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {cargando ? <p className="mt-4 text-sm text-ink-soft">Abriendo el siguiente…</p> : null}
      {!cargando && !contacto ? <p className="mt-4 rounded-card border border-line bg-card p-4 text-sm">{aviso || "No hay contactos en la cola."}</p> : null}
      {contacto ? (
        <Ficha
          key={contacto.id}
          contacto={contacto}
          llama={llama}
          aviso={aviso}
          onAviso={setAviso}
          onIr={(id) => void abrir(id)}
          onGuardado={(siguiente, texto) => {
            setContacto(siguiente);
            setAviso(texto);
            if (siguiente) onCola(siguiente.pendientes, siguiente.hoyLlamadas, siguiente.hoySegundos);
          }}
          onProceso={onProceso}
          onError={onError}
        />
      ) : null}
    </div>
    <GuionFlotante onError={onError} />
    </div>
  );
}

function Ficha({
  contacto, llama, aviso, onAviso, onIr, onGuardado, onProceso, onError,
}: {
  contacto: ContactoCall;
  llama: boolean;
  aviso: string;
  onAviso: (t: string) => void;
  onIr: (id: number) => void;
  onGuardado: (c: ContactoCall | null, aviso: string) => void;
  onProceso: (id: number) => void;
  onError: (t: string) => void;
}) {
  const g = contacto.gestion;
  const tipoInicial: TipoPersona = g?.tipoPersona === "propietario" || g?.tipoPersona === "desconocido" ? g.tipoPersona : "conductor";
  const [tipo, setTipo] = useState<TipoPersona>(tipoInicial);
  const [nombre, setNombre] = useState(tipoInicial === "propietario" ? g?.nombre || contacto.propietario || contacto.nombreLista : g?.nombre || contacto.propietario);
  const [cc, setCc] = useState(g?.cc || contacto.cc);
  const [tel, setTel] = useState(tipoInicial === "propietario" ? g?.tel || contacto.telPropietario || contacto.telefonoLista : g?.tel || contacto.telPropietario);
  const [tieneNuevo, setTieneNuevo] = useState(Boolean(g?.tieneNuevo));
  const [nuevoNombre, setNuevoNombre] = useState(g?.nuevoNombre || "");
  const [nuevoTel, setNuevoTel] = useState(g?.nuevoTel || "");
  const [solo, setSolo] = useState(Boolean(g?.soloPropietario));
  const [clasificacion, setClasificacion] = useState(g?.clasificacion || "");
  const [calificacion, setCalificacion] = useState(g?.calificacion || "");
  const [conductor, setConductor] = useState(g?.conductor || "");
  const [propietario, setPropietario] = useState(g?.propietario || "");
  const [intencion, setIntencion] = useState(g?.intencion || "");
  const [proxima, setProxima] = useState(g?.proxima || "");
  const [fechaProxima, setFechaProxima] = useState(g?.fechaProxima || "");
  const [noAplicaProxima, setNoAplicaProxima] = useState(Boolean(g?.noAplicaProxima));
  const [resultado, setResultado] = useState(g?.resultado || "");
  const [fechaAfiliacion, setFechaAfiliacion] = useState(g?.fechaAfiliacion || "");
  const [noAplicaAfiliacion, setNoAplicaAfiliacion] = useState(Boolean(g?.noAplicaAfiliacion));
  const [motivo, setMotivo] = useState(g?.motivo || "");
  const [observacionFinal, setObservacionFinal] = useState(g?.observacionFinal || "");
  const [segundos, setSegundos] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const inicio = useRef(Date.now());
  const rec = useRef<Voz | null>(null);
  const [mic, setMic] = useState("");

  useEffect(() => {
    inicio.current = Date.now();
    const id = window.setInterval(() => setSegundos(Math.min(7200, Math.round((Date.now() - inicio.current) / 1000))), 1000);
    return () => window.clearInterval(id);
  }, [contacto.id]);

  function aplicarTipo(valor: TipoPersona) {
    setTipo(valor);
    if (valor === "propietario") {
      setNombre(contacto.nombreLista || contacto.propietario);
      setTel(contacto.telefonoLista || contacto.telPropietario);
    }
    if (valor === "conductor") {
      setNombre(contacto.propietario);
      setTel(contacto.telPropietario);
    }
  }

  function chip(campo: "conductor" | "propietario" | "observacionFinal", texto: string) {
    const actual = campo === "conductor" ? conductor : campo === "propietario" ? propietario : observacionFinal;
    const poner = (v: string) => (campo === "conductor" ? setConductor(v) : campo === "propietario" ? setPropietario(v) : setObservacionFinal(v));
    if (!actual) poner(texto);
    else if (!actual.includes(texto)) poner(`${actual}. ${texto}`);
  }

  function dictar(campo: "conductor" | "propietario") {
    const SR = reconocedor();
    if (!SR) {
      onAviso("Este navegador no dicta aquí. En el celular usa el micrófono del teclado.");
      return;
    }
    if (rec.current && mic === campo) {
      rec.current.stop();
      return;
    }
    rec.current?.stop();
    const reconocimiento = new SR();
    reconocimiento.lang = "es-CO";
    reconocimiento.continuous = true;
    reconocimiento.interimResults = true;
    const base = campo === "conductor" ? conductor : propietario;
    let armado = base;
    reconocimiento.onresult = (ev) => {
      let extra = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const frase = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) armado = `${armado} ${frase}`.replace(/\s+/g, " ").trim();
        else extra += frase;
      }
      const texto = extra ? `${armado} ${extra}`.replace(/\s+/g, " ").trim() : armado;
      if (campo === "conductor") setConductor(texto);
      else setPropietario(texto);
    };
    reconocimiento.onend = () => { if (rec.current === reconocimiento) { rec.current = null; setMic(""); } };
    reconocimiento.onerror = () => setMic("");
    rec.current = reconocimiento;
    setMic(campo);
    reconocimiento.start();
  }

  async function guardar() {
    if (!llama) return;
    setGuardando(true);
    const draft: LlamadaDraft = {
      contactoId: contacto.id,
      segundos,
      tipoPersona: tipo,
      nombre,
      cc,
      tel,
      tieneNuevo,
      nuevoNombre,
      nuevoTel,
      soloPropietario: solo,
      clasificacion,
      calificacion,
      conductor: solo && !/no se hizo contacto con el conductor/i.test(conductor)
        ? (conductor ? `${conductor}. No se hizo contacto con el conductor, ya que el propietario contestó` : "No se hizo contacto con el conductor, ya que el propietario contestó")
        : conductor,
      propietario,
      intencion,
      proxima,
      fechaProxima,
      noAplicaProxima,
      resultado,
      fechaAfiliacion,
      noAplicaAfiliacion,
      motivo,
      observacionFinal,
      agendar: Boolean(fechaProxima) && !noAplicaProxima,
    };
    try {
      const res = await guardarLlamada({ data: draft });
      onGuardado(res.contacto, res.aviso);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No pude guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function abrir() {
    try {
      const res = await abrirProcesoCall({ data: { contactoId: contacto.id, nombre, cc, telefono: tel || contacto.telefonoLista } });
      onAviso(res.aviso);
      if (res.casoId) onProceso(res.casoId);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No pude abrir el proceso");
    }
  }

  const telLista = (tipo === "propietario" ? tel || contacto.telefonoLista : contacto.telefonoLista).replace(/\D/g, "");
  const telProp = tel.replace(/\D/g, "");

  return (
    <div className="mt-4">
      <div className="sticky top-0 z-10 -mx-4 bg-paper px-4 pb-3 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-2">
          <button type="button" disabled={!contacto.anteriorId} onClick={() => contacto.anteriorId && onIr(contacto.anteriorId)} className="h-10 flex-1 rounded-2xl border border-line bg-card text-sm font-semibold disabled:opacity-40">Atrás</button>
          <strong className="min-w-28 text-center text-sm text-navy">{contacto.hoyLlamadas} de {META_LLAMADAS}</strong>
          <button type="button" disabled={!contacto.siguienteId} onClick={() => contacto.siguienteId && onIr(contacto.siguienteId)} className="h-10 flex-1 rounded-2xl border border-line bg-card text-sm font-semibold disabled:opacity-40">Adelante</button>
        </div>
        <p className="mt-1 text-center text-xs text-ink-soft">{contacto.hoyLlamadas >= META_LLAMADAS ? "Meta del día cumplida" : `Faltan ${META_LLAMADAS - contacto.hoyLlamadas} para la meta`} · {duracionTexto(segundos)} en esta llamada{aviso ? ` · ${aviso}` : ""}</p>
        {contacto.hoyLlamadas >= META_LLAMADAS - 5 ? (
          <p className="mt-2 rounded-2xl bg-lime px-3 py-2 text-center text-sm font-semibold text-navy">
            {contacto.hoyLlamadas >= META_LLAMADAS
              ? `Llegaste a ${META_LLAMADAS}. Coordinación te asigna otra base.`
              : `Te faltan ${META_LLAMADAS - contacto.hoyLlamadas}. Al llegar a ${META_LLAMADAS} se te asigna otra base.`}
          </p>
        ) : null}
        <div className={"mt-2 grid gap-2 " + (tipo === "propietario" ? "grid-cols-1" : "sm:grid-cols-2")}>
          {tipo !== "propietario" ? <Tarjeta titulo="Conductor · base" nombre={contacto.nombreLista} tel={telLista} placa={contacto.placa} /> : null}
          <Tarjeta titulo={tipo === "propietario" ? "Conductor y propietario" : "Propietario"} nombre={nombre || "Sin nombre"} tel={tipo === "propietario" ? telLista || telProp : telProp} placa={tipo === "propietario" ? contacto.placa : ""} />
          {tieneNuevo && nuevoTel ? <Tarjeta titulo="Nuevo propietario" nombre={nuevoNombre} tel={nuevoTel.replace(/\D/g, "")} placa="" /> : null}
        </div>
      </div>

      <div className="mt-3 rounded-card border border-line bg-card p-4 text-sm">
        <p className="font-semibold text-navy">{contacto.placa || "Sin placa"} · {contacto.vehiculo} {contacto.anio}</p>
        <p className="text-ink-soft">{contacto.empresa}{contacto.estado ? ` · ${contacto.estado}` : ""}{contacto.duplicado ? " · hay otro número con esta placa" : ""}</p>
      </div>

      <fieldset className="mt-3 rounded-card border border-line bg-card p-4" disabled={!llama}>
        <legend className="px-1 text-sm font-semibold">¿Quién es la persona de la lista?</legend>
        {([
          ["conductor", "Es solo el conductor. Cargo el propietario aparte"],
          ["propietario", "Es el propietario. Es la misma persona"],
          ["desconocido", "No se pudo confirmar"],
        ] as const).map(([valor, etiqueta]) => (
          <label key={valor} className="mt-2 flex items-start gap-2 text-sm">
            <input type="radio" className="mt-1" checked={tipo === valor} onChange={() => aplicarTipo(valor)} />
            {etiqueta}
          </label>
        ))}
      </fieldset>

      <div className="mt-3 grid gap-3 rounded-card border border-line bg-card p-4">
        <Campo label="Nombre del propietario" value={nombre} onChange={setNombre} disabled={!llama} />
        <Campo label="Cédula del propietario" value={cc} onChange={setCc} disabled={!llama} />
        <Campo label="Teléfono del propietario" value={tel} onChange={setTel} disabled={!llama} />
      </div>

      <div className="mt-3 rounded-card border border-amber-200 bg-amber-50 p-4">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={tieneNuevo} disabled={!llama} onChange={(e) => setTieneNuevo(e.target.checked)} />
          Me dieron datos del nuevo propietario (vendió el vehículo)
        </label>
        {tieneNuevo ? (
          <div className="mt-3 grid gap-3">
            <Campo label="Nombre del nuevo propietario" value={nuevoNombre} onChange={setNuevoNombre} disabled={!llama} />
            <Campo label="Teléfono del nuevo propietario" value={nuevoTel} onChange={setNuevoTel} disabled={!llama} />
          </div>
        ) : null}
      </div>

      <label className="mt-3 flex items-start gap-2 rounded-card border border-line bg-card p-4 text-sm">
        <input type="checkbox" className="mt-1" checked={solo} disabled={!llama} onChange={(e) => {
          setSolo(e.target.checked);
          if (e.target.checked) chip("conductor", "No se hizo contacto con el conductor, ya que el propietario contestó");
        }} />
        Solo se contactó al propietario
      </label>

      <div className="mt-3 grid gap-3 rounded-card border border-line bg-card p-4 sm:grid-cols-2">
        <Select label="Clasificación" value={clasificacion} opciones={CLASIFICACIONES} onChange={setClasificacion} disabled={!llama} />
        <Select label="Calificación" value={calificacion} opciones={CALIFICACIONES} onChange={setCalificacion} disabled={!llama} />
      </div>

      <div className="mt-3 grid gap-3 rounded-card border border-line bg-card p-4">
        <Nota label="Observación con el conductor" value={conductor} onChange={setConductor} disabled={!llama} mic={mic === "conductor"} onMic={() => dictar("conductor")} chips={CHIPS.conductor} onChip={(t) => chip("conductor", t)} />
        <Nota label="Observación con el propietario" value={propietario} onChange={setPropietario} disabled={!llama} mic={mic === "propietario"} onMic={() => dictar("propietario")} chips={CHIPS.propietario} onChip={(t) => chip("propietario", t)} />
      </div>

      <div className="mt-3 grid gap-3 rounded-card border border-line bg-card p-4 sm:grid-cols-2">
        <Select label="Intención de afiliación" value={intencion} opciones={INTENCIONES} onChange={setIntencion} disabled={!llama} />
        <Select label="Próxima gestión" value={proxima} opciones={PROXIMAS} onChange={setProxima} disabled={!llama} />
        <label className="text-sm font-semibold">
          Fecha próxima gestión
          <input type="date" value={fechaProxima} disabled={!llama || noAplicaProxima} onChange={(e) => setFechaProxima(e.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-line px-3 font-normal" />
          <span className="mt-2 flex items-center gap-2 font-normal"><input type="checkbox" checked={noAplicaProxima} disabled={!llama} onChange={(e) => setNoAplicaProxima(e.target.checked)} /> No aplica</span>
        </label>
        <Select label="Resultado final" value={resultado} opciones={RESULTADOS} onChange={setResultado} disabled={!llama} />
        <label className="text-sm font-semibold">
          Fecha de afiliación
          <input type="date" value={fechaAfiliacion} disabled={!llama || noAplicaAfiliacion} onChange={(e) => setFechaAfiliacion(e.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-line px-3 font-normal" />
          <span className="mt-2 flex items-center gap-2 font-normal"><input type="checkbox" checked={noAplicaAfiliacion} disabled={!llama} onChange={(e) => setNoAplicaAfiliacion(e.target.checked)} /> No aplica</span>
        </label>
        <Select label="Motivo de no afiliación" value={motivo} opciones={MOTIVOS} onChange={setMotivo} disabled={!llama} />
      </div>

      <div className="mt-3 rounded-card border border-line bg-card p-4">
        <Nota label="Observación final" value={observacionFinal} onChange={setObservacionFinal} disabled={!llama} chips={CHIPS.observacionFinal} onChip={(t) => chip("observacionFinal", t)} />
      </div>

      {llama ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={guardando} onClick={() => void guardar()} className="h-12 rounded-2xl bg-navy font-semibold text-paper disabled:opacity-60">
            {guardando ? "Guardando…" : "Guardar y pasar al siguiente"}
          </button>
          <button type="button" onClick={() => void abrir()} className="h-12 rounded-2xl border border-line bg-card font-semibold">
            {contacto.casoId ? "Abrir el proceso" : "Abrirle proceso"}
          </button>
        </div>
      ) : <p className="mt-3 text-sm text-ink-soft">La tipificación la guarda el asesor. Desde aquí se revisa la cola.</p>}
      <p className="mt-2 text-xs text-ink-soft">Si la próxima gestión es WhatsApp, queda en Control sin cerrar las llamadas, y la bitácora del día se llena sola. Si hay fecha, también queda en la agenda.</p>
    </div>
  );
}

function Tarjeta({ titulo, nombre, tel, placa }: { titulo: string; nombre: string; tel: string; placa: string }) {
  return (
    <div className="rounded-2xl bg-navy p-3 text-paper">
      <span className="text-xs text-paper/80">{titulo}</span>
      <b className="mt-1 block text-sm">{nombre || "Sin nombre"}</b>
      {tel ? <a href={`tel:${tel}`} className="text-lg font-semibold">{tel}</a> : <span className="text-sm">Sin teléfono</span>}
      <div className="mt-1 flex flex-wrap gap-2">
        {tel ? <button type="button" className="rounded-full border border-paper/40 px-2 text-xs" onClick={() => void navigator.clipboard.writeText(tel)}>Copiar</button> : null}
        {placa ? <button type="button" className="rounded-full border border-paper/40 px-2 text-xs" onClick={() => void navigator.clipboard.writeText(placa)}>{placa} · copiar</button> : null}
      </div>
    </div>
  );
}

function Campo({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-line px-3 font-normal" />
    </label>
  );
}

function Select({ label, value, opciones, onChange, disabled }: { label: string; value: string; opciones: readonly string[]; onChange: (v: string) => void; disabled?: boolean }) {
  const extra = value && !opciones.includes(value) ? [value] : [];
  return (
    <label className="text-sm font-semibold">
      {label}
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-line px-3 font-normal">
        <option value="" />
        {[...extra, ...opciones].map((op) => <option key={op} value={op}>{op}</option>)}
      </select>
    </label>
  );
}

function Nota({ label, value, onChange, disabled, mic, onMic, chips, onChip }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; mic?: boolean; onMic?: () => void; chips: [string, string][]; onChip: (t: string) => void }) {
  return (
    <div>
      <label className="text-sm font-semibold">
        {label}
        <textarea value={value} disabled={disabled} rows={2} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-2xl border border-line px-3 py-2 font-normal" />
      </label>
      {onMic ? <button type="button" disabled={disabled} onClick={onMic} className={"mt-2 h-9 rounded-full px-3 text-xs font-semibold text-paper " + (mic ? "bg-danger" : "bg-navy")}>{mic ? "Detener dictado" : "Dictar"}</button> : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chips.map(([corto, largo]) => (
          <button key={corto} type="button" disabled={disabled} onClick={() => onChip(largo)} className="rounded-full border border-line bg-paper px-2 py-1 text-xs">{corto}</button>
        ))}
      </div>
    </div>
  );
}

function Bases({ onError }: { onError: (t: string) => void }) {
  const [bases, setBases] = useState<BaseCall[]>([]);
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  function cargar() { listBases().then(setBases).catch((err: Error) => onError(err.message)); }
  useEffect(() => { cargar(); }, []);
  return (
    <div>
      <CargarGestiones onError={onError} onListo={cargar} />
      <label className={"mt-3 flex h-12 cursor-pointer items-center justify-center rounded-2xl bg-navy text-sm font-semibold text-paper " + (ocupado ? "opacity-60" : "")}>
        {ocupado ? "Organizando la base… puede tardar si es la completa" : "Subir Excel o CSV"}
        <input type="file" accept=".xlsx,.csv,.txt" className="sr-only" disabled={ocupado} onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setOcupado(true);
          setAviso("");
          subirEnTrozos(file)
            .then((res) => { setAviso(res.aviso || "Lista."); cargar(); })
            .catch((err: Error) => onError(err.message))
            .finally(() => setOcupado(false));
        }} />
      </label>
      <p className="mt-2 text-xs text-ink-soft">La base original solo trae placa, nombre, teléfono y empresa. No trae clasificación. Después, en «Cruzar gestiones con la base», sube el Excel de cada asesor para escribir la tipificación sobre esas placas.</p>
      {aviso ? <p className="mt-2 text-sm">{aviso}</p> : null}
      <ul className="mt-4 grid gap-2">
        {bases.map((base) => (
          <li key={base.id} className="rounded-card border border-line bg-card p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{base.nombre}</p>
                <p className="text-ink-soft">{base.creado} · {base.subidoPor}</p>
                <p className="mt-1">{base.filas} contactos · {base.empresas} empresas · {base.separados} separados · {base.repetidos} ya estaban</p>
              </div>
              <button type="button" className="text-sm font-semibold text-danger" onClick={() => {
                if (!confirm("¿Borrar esta base y sus contactos?")) return;
                borrarBase({ data: base.id }).then(cargar).catch((err: Error) => onError(err.message));
              }}>Borrar</button>
            </div>
          </li>
        ))}
        {bases.length === 0 ? <li className="text-sm text-ink-soft">Todavía no hay bases cargadas.</li> : null}
      </ul>
    </div>
  );
}

function Empresas({ onError }: { onError: (t: string) => void }) {
  const [empresas, setEmpresas] = useState<EmpresaCall[]>([]);
  const [asesores, setAsesores] = useState<AsesorMini[]>([]);
  const [q, setQ] = useState("");
  const [abierta, setAbierta] = useState("");
  function cargar() {
    listEmpresas().then((res) => { setEmpresas(res.empresas); setAsesores(res.asesores); }).catch((err: Error) => onError(err.message));
  }
  useEffect(() => { cargar(); }, []);
  const lista = useMemo(() => empresas.filter((e) => e.empresa.toLowerCase().includes(q.trim().toLowerCase())), [empresas, q]);
  function guardar(empresa: EmpresaCall, activa: boolean, slugs: string[]) {
    guardarEmpresa({ data: { empresa: empresa.empresa, activa, slugs } })
      .then(() => setEmpresas((prev) => prev.map((item) => item.empresa === empresa.empresa ? { ...item, activa, slugs } : item)))
      .catch((err: Error) => onError(err.message));
  }
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar empresa" className="h-11 w-full rounded-2xl border border-line px-3" />
      <p className="mt-2 text-xs text-ink-soft">Activa la empresa para que entre a la cola. El cruce es por placa y empresa: si el asesor ya tipificó esa placa, cuenta como llamada. Sin llamar son las que todavía no tienen gestión.</p>
      <ul className="mt-3 grid gap-2">
        {lista.slice(0, 80).map((empresa) => (
          <li key={empresa.empresa} className="rounded-card border border-line bg-card p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setAbierta(abierta === empresa.empresa ? "" : empresa.empresa)}>
                <b className="block truncate">{empresa.empresa}</b>
                <span className="text-ink-soft">{empresa.total} placas · {empresa.llamadas} ya llamadas · {Math.max(0, empresa.total - empresa.llamadas)} sin llamar{empresa.slugs.length ? ` · ${empresa.slugs.length} asesores` : " · todos"}</span>
              </button>
              <button type="button" onClick={() => guardar(empresa, !empresa.activa, empresa.slugs)} className={"h-9 rounded-full px-3 text-xs font-semibold " + (empresa.activa ? "bg-lime text-navy" : "border border-line")}>
                {empresa.activa ? "Activa" : "Apagada"}
              </button>
            </div>
            {abierta === empresa.empresa ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {asesores.map((p) => {
                  const on = empresa.slugs.includes(p.slug);
                  return (
                    <button key={p.slug} type="button" onClick={() => guardar(empresa, empresa.activa, on ? empresa.slugs.filter((s) => s !== p.slug) : [...empresa.slugs, p.slug])} className={"h-9 rounded-full px-3 text-xs font-semibold " + (on ? "bg-navy text-paper" : "border border-line")}>
                      {p.name.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {lista.length > 80 ? <p className="mt-2 text-xs text-ink-soft">Hay {lista.length}. Afina la búsqueda para ver el resto.</p> : null}
    </div>
  );
}

const NOMBRE_MES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function tituloMes(mes: string) {
  const [anio, numero] = mes.split("-");
  return `${NOMBRE_MES[Number(numero)] || mes} ${anio}`;
}

function finDeMes(mes: string) {
  const [anio, numero] = mes.split("-").map(Number);
  const dia = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
  return `${mes}-${String(dia).padStart(2, "0")}`;
}

function Estadisticas({ onError }: { onError: (t: string) => void }) {
  const hoy = hoyBogota();
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [dia, setDia] = useState(hoy);
  const [stats, setStats] = useState<StatsCall | null>(null);
  function cargar(diaSel = dia) {
    statsCall({ data: { dia: diaSel } }).then(setStats).catch((err: Error) => onError(err.message));
  }
  useEffect(() => { cargar(); }, []);
  const meses = stats?.meses ?? [];
  const vista = meses.find((item) => item.mes === mes) ?? meses[meses.length - 1];
  const nombres = [...new Set(meses.flatMap((item) => item.porAsesor.map((row) => row.nombre)))];
  nombres.sort((a, b) => {
    const total = (nombre: string) => meses.reduce((suma, item) => suma + (item.porAsesor.find((row) => row.nombre === nombre)?.total ?? 0), 0);
    return total(b) - total(a);
  });
  const granTotal = meses.reduce((suma, item) => suma + item.total, 0);
  const tasa = vista && vista.total ? Math.round((vista.efectivos / vista.total) * 100) : 0;
  return (
    <div>
      <CargarGestiones onError={onError} onListo={() => cargar(dia)} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">Todas las llamadas, aunque la empresa esté apagada. {granTotal} en total.</p>
        <button type="button" className="h-10 rounded-2xl border border-line bg-card px-4 text-sm font-semibold" disabled={!vista} onClick={() => {
          if (!vista) return;
          const hasta = vista.mes === hoy.slice(0, 7) ? hoy : finDeMes(vista.mes);
          exportarCall({ data: { desde: `${vista.mes}-01`, hasta } }).then((file) => bajarExcel(file.base64, file.filename)).catch((err: Error) => onError(err.message));
        }}>Exportar {vista ? tituloMes(vista.mes) : "Excel"}</button>
      </div>
      {meses.length > 0 ? (
        <div className="mt-3 overflow-x-auto rounded-card border border-line bg-card">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-soft">
                <th className="px-3 py-2 font-semibold">Asesor</th>
                {meses.map((item) => (
                  <th key={item.mes} className="px-3 py-2 font-semibold">{tituloMes(item.mes)}</th>
                ))}
                <th className="px-3 py-2 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {nombres.map((nombre) => {
                const total = meses.reduce((suma, item) => suma + (item.porAsesor.find((row) => row.nombre === nombre)?.total ?? 0), 0);
                return (
                  <tr key={nombre} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-semibold">{nombre}</td>
                    {meses.map((item) => (
                      <td key={item.mes} className="px-3 py-2">{item.porAsesor.find((row) => row.nombre === nombre)?.total ?? 0}</td>
                    ))}
                    <td className="px-3 py-2 font-semibold">{total}</td>
                  </tr>
                );
              })}
              <tr>
                <td className="px-3 py-2 font-semibold">Total</td>
                {meses.map((item) => (
                  <td key={item.mes} className="px-3 py-2 font-semibold">{item.total}</td>
                ))}
                <td className="px-3 py-2 font-semibold">{granTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : stats ? <p className="mt-3 text-sm text-ink-soft">Todavía no hay llamadas guardadas.</p> : <p className="mt-3 text-sm text-ink-soft">Cargando…</p>}
      {vista ? (
        <>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {meses.map((item) => (
              <button key={item.mes} type="button" onClick={() => setMes(item.mes)} className={"h-10 shrink-0 rounded-2xl px-4 text-sm font-semibold " + (item.mes === vista.mes ? "bg-navy text-paper" : "border border-line bg-card")}>
                {tituloMes(item.mes)} · {item.total}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Dato n={vista.total} label="Llamadas" />
            <Dato n={vista.efectivos} label="Contacto efectivo" />
            <Dato n={vista.noEfectivos} label="No efectivo" />
            <Dato n={`${tasa}%`} label="Contactabilidad" />
          </div>
          <Bloque titulo={`Por asesor · ${tituloMes(vista.mes)}`}>
            {vista.porAsesor.map((row) => <p key={row.nombre}>{row.nombre}: {row.total} · {row.efectivos} efectivas · {duracionTexto(row.segundos)}</p>)}
          </Bloque>
          <Bloque titulo="Por empresa">
            {vista.porEmpresa.map((row) => <p key={row.empresa}>{row.empresa}: {row.total} · {row.efectivos} efectivas</p>)}
          </Bloque>
          <Bloque titulo="Por calificación">
            {vista.porCalificacion.map((row) => <p key={row.calificacion + row.clasificacion}>{row.calificacion} · {row.clasificacion || "sin clasificación"}: {row.total}</p>)}
          </Bloque>
          <Bloque titulo="Por día">
            {vista.porDia.map((row) => <p key={row.fecha}>{row.fecha}: {row.total} · {row.efectivos} efectivas</p>)}
          </Bloque>
          <div className="mt-3">
            <label className="text-sm font-semibold">Minuto a minuto
              <input type="date" value={dia} onChange={(e) => { setDia(e.target.value); cargar(e.target.value); }} className="mt-1 h-11 w-full rounded-2xl border border-line px-3 font-normal" />
            </label>
            <ul className="mt-2 grid gap-1">
              {stats?.minutos.map((row, i) => (
                <li key={`${row.hora}-${i}`} className="rounded-xl bg-card px-3 py-2 text-sm">
                  <b>{row.hora || "—"}</b> {row.asesor.split(" ")[0]} · {row.placa} {row.nombre} · {row.clasificacion} · {duracionTexto(row.segundos)}
                </li>
              ))}
              {stats && stats.minutos.length === 0 ? <li className="text-sm text-ink-soft">Ese día no hay llamadas guardadas en el call center.</li> : null}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Dato({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="rounded-card border border-line bg-card p-3">
      <p className="text-2xl font-semibold text-navy">{n}</p>
      <p className="text-xs text-ink-soft">{label}</p>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mt-3 rounded-card border border-line bg-card p-4 text-sm">
      <p className="mb-2 font-semibold text-navy">{titulo}</p>
      <div className="grid gap-1">{children}</div>
    </div>
  );
}

function Seguimiento({ llama, onError }: { llama: boolean; onError: (t: string) => void }) {
  const [filas, setFilas] = useState<SeguimientoCall[]>([]);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [clasificacion, setClasificacion] = useState("");
  const [calificacion, setCalificacion] = useState("");
  const [intencion, setIntencion] = useState("");
  const [proxima, setProxima] = useState("");
  const [resultado, setResultado] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    listSeguimiento().then(setFilas).catch((err: Error) => onError(err.message));
  }
  useEffect(() => { cargar(); }, []);

  function abrir(fila: SeguimientoCall) {
    setAbierta(fila.id);
    setClasificacion(fila.clasificacion);
    setCalificacion(fila.calificacion);
    setIntencion(fila.intencion);
    setProxima(fila.proxima);
    setResultado(fila.resultado);
    setNota("");
  }

  async function guardar(fila: SeguimientoCall) {
    if (!llama) return;
    setGuardando(true);
    try {
      await guardarLlamada({
        data: {
          contactoId: fila.id,
          segundos: 0,
          tipoPersona: "propietario",
          nombre: fila.nombre || fila.propietario || "Propietario",
          cc: fila.cc,
          tel: fila.telefono || fila.telPropietario,
          tieneNuevo: false,
          nuevoNombre: "",
          nuevoTel: "",
          soloPropietario: true,
          clasificacion,
          calificacion,
          conductor: "",
          propietario: nota,
          intencion,
          proxima,
          fechaProxima: "",
          noAplicaProxima: true,
          resultado,
          fechaAfiliacion: "",
          noAplicaAfiliacion: true,
          motivo: "",
          observacionFinal: nota,
          agendar: false,
        },
      });
      setAbierta(null);
      cargar();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No pude actualizar la gestión");
    } finally {
      setGuardando(false);
    }
  }

  const atrasadas = filas.filter((fila) => fila.atrasada).length;
  return (
    <div>
      <p className="text-sm text-ink-soft">
        Contactos efectivos o que quedaron en WhatsApp, por llamar o en proceso. Si llevan más de una semana sin una tipificación nueva, salen para actualizar.
        {atrasadas ? ` ${atrasadas} de esta semana.` : ""}
      </p>
      <ul className="mt-3 grid gap-2">
        {filas.length === 0 ? <li className="rounded-card border border-line bg-card p-4 text-sm">No hay gestiones abiertas.</li> : null}
        {filas.map((fila) => (
          <li key={fila.id} className={"rounded-card border bg-card p-4 " + (fila.atrasada ? "border-danger" : "border-line")}>
            <button type="button" className="w-full text-left" onClick={() => abrir(fila)}>
              <p className="font-semibold text-navy">{fila.placa || "Sin placa"} · {fila.nombre || "Sin nombre"}</p>
              <p className="mt-1 text-sm text-ink-soft">{fila.empresa} · {fila.clasificacion || "Sin clasificación"} · {fila.proxima || "sin próxima"}{fila.resultado ? ` · ${fila.resultado}` : ""}</p>
              <p className={"mt-1 text-xs font-semibold " + (fila.atrasada ? "text-danger" : "text-ink-soft")}>{fila.fecha} · {fila.asesor.split(" ")[0]}{fila.atrasada ? " · toca actualizar esta semana" : " · al día"}</p>
            </button>
            {abierta === fila.id && llama ? (
              <div className="mt-3 grid gap-2">
                <Select label="Clasificación" value={clasificacion} opciones={CLASIFICACIONES} onChange={setClasificacion} />
                <Select label="Calificación" value={calificacion} opciones={CALIFICACIONES} onChange={setCalificacion} />
                <Select label="Intención" value={intencion} opciones={INTENCIONES} onChange={setIntencion} />
                <Select label="Próxima gestión" value={proxima} opciones={PROXIMAS} onChange={setProxima} />
                <Select label="Resultado" value={resultado} opciones={RESULTADOS} onChange={setResultado} />
                <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Qué pasó en este seguimiento" className="rounded-2xl border border-line px-3 py-2 text-sm" />
                <button type="button" disabled={guardando} onClick={() => void guardar(fila)} className="h-11 rounded-2xl bg-navy font-semibold text-paper disabled:opacity-60">
                  {guardando ? "Guardando…" : "Guardar seguimiento"}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Briefing({ edita, compacto = false, onError }: { edita: boolean; compacto?: boolean; onError: (t: string) => void }) {
  const [items, setItems] = useState<BriefingItem[]>([]);
  const [abierta, setAbierta] = useState("guion");
  const [cuerpo, setCuerpo] = useState("");
  useEffect(() => { listBriefing().then(setItems).catch((err: Error) => onError(err.message)); }, []);
  const actual = items.find((item) => item.seccion === abierta);
  return (
    <div className={compacto ? "" : "grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]"}>
      <div className={"flex gap-2 overflow-x-auto " + (compacto ? "" : "lg:grid lg:overflow-visible")}>
        {items.map((item) => (
          <button key={item.seccion} type="button" onClick={() => { setAbierta(item.seccion); setCuerpo(item.cuerpo); }} className={"h-10 shrink-0 rounded-2xl px-3 text-left text-sm font-semibold lg:h-auto lg:px-3 lg:py-2 " + (abierta === item.seccion ? "bg-navy text-paper" : "border border-line bg-card")}>
            {item.titulo}
          </button>
        ))}
      </div>
      {actual ? (
        <article className={compacto ? "mt-2" : "rounded-card border border-line bg-card p-4"}>
          {compacto ? null : <h3 className="font-semibold text-navy">{actual.titulo}</h3>}
          {edita && !compacto ? (
            <>
              <textarea value={cuerpo || actual.cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={16} className="mt-3 w-full rounded-2xl border border-line px-3 py-2 text-sm" />
              <button type="button" className="mt-2 h-10 rounded-2xl bg-navy px-4 text-sm font-semibold text-paper" onClick={() => {
                guardarBriefing({ data: { seccion: actual.seccion, cuerpo: cuerpo || actual.cuerpo } })
                  .then(() => setItems((prev) => prev.map((item) => item.seccion === actual.seccion ? { ...item, cuerpo: cuerpo || actual.cuerpo } : item)))
                  .catch((err: Error) => onError(err.message));
              }}>Guardar sección</button>
            </>
          ) : <pre className={"whitespace-pre-wrap font-sans " + (compacto ? "" : "mt-3 text-sm")} style={compacto ? { fontSize: "1em" } : undefined}>{actual.cuerpo}</pre>}
        </article>
      ) : null}
    </div>
  );
}

type CajaGuion = { x: number; y: number; w: number; h: number; font: number };

function cajaGuion(): CajaGuion {
  const base = { x: 16, y: 72, w: 420, h: 640, font: 16 };
  if (typeof window === "undefined") return base;
  try {
    const saved = JSON.parse(localStorage.getItem("vincula-guion") || "null") as CajaGuion | null;
    if (saved && saved.w > 200 && saved.h > 160) return { ...base, ...saved };
  } catch { /* la caja nueva */ }
  return { ...base, x: Math.max(8, window.innerWidth - 450) };
}

function GuionFlotante({ onError }: { onError: (t: string) => void }) {
  const [caja, setCaja] = useState<CajaGuion>(cajaGuion);
  const [oculto, setOculto] = useState(false);
  const cajaRef = useRef(caja);
  cajaRef.current = caja;
  useEffect(() => {
    localStorage.setItem("vincula-guion", JSON.stringify(caja));
  }, [caja]);

  function mover(e: ReactPointerEvent, modo: "mover" | "tamaño") {
    e.preventDefault();
    const inicio = { x: e.clientX, y: e.clientY, caja: cajaRef.current };
    function alMover(ev: PointerEvent) {
      const dx = ev.clientX - inicio.x;
      const dy = ev.clientY - inicio.y;
      const actual = inicio.caja;
      if (modo === "mover") {
        setCaja({
          ...actual,
          x: Math.max(-actual.w + 80, Math.min(window.innerWidth - 80, actual.x + dx)),
          y: Math.max(0, Math.min(window.innerHeight - 48, actual.y + dy)),
        });
      } else {
        setCaja({
          ...actual,
          w: Math.max(280, Math.min(window.innerWidth - 16, actual.w + dx)),
          h: Math.max(220, Math.min(window.innerHeight - 16, actual.h + dy)),
        });
      }
    }
    function soltar() {
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", soltar);
    }
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", soltar);
  }

  if (oculto) {
    return (
      <button type="button" onClick={() => setOculto(false)} className="fixed bottom-4 right-4 z-40 h-11 rounded-2xl bg-navy px-4 text-sm font-semibold text-paper shadow-lg">
        Abrir guion
      </button>
    );
  }
  return (
    <div
      className="fixed z-40 flex flex-col overflow-hidden rounded-card border border-line bg-card shadow-2xl"
      style={{ left: caja.x, top: caja.y, width: caja.w, height: caja.h }}
    >
      <div className="flex cursor-grab items-center gap-2 border-b border-line bg-paper px-3 py-2 active:cursor-grabbing" onPointerDown={(e) => mover(e, "mover")}>
        <p className="min-w-0 flex-1 text-sm font-semibold text-navy">Guion, a la mano. Arrástralo.</p>
        <button type="button" className="h-8 rounded-xl border border-line bg-card px-2 text-xs font-semibold" onPointerDown={(e) => e.stopPropagation()} onClick={() => setCaja((prev) => ({ ...prev, font: Math.max(13, prev.font - 1) }))}>A−</button>
        <button type="button" className="h-8 rounded-xl border border-line bg-card px-2 text-xs font-semibold" onPointerDown={(e) => e.stopPropagation()} onClick={() => setCaja((prev) => ({ ...prev, font: Math.min(24, prev.font + 1) }))}>A+</button>
        <button type="button" className="h-8 rounded-xl border border-line bg-card px-2 text-xs font-semibold" onPointerDown={(e) => e.stopPropagation()} onClick={() => setOculto(true)}>Ocultar</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3" style={{ fontSize: caja.font, lineHeight: 1.45 }}>
        <Briefing edita={false} compacto onError={onError} />
      </div>
      <button type="button" aria-label="Cambiar tamaño" className="absolute bottom-1 right-1 h-6 w-6 cursor-nwse-resize rounded-md border border-line bg-paper" onPointerDown={(e) => mover(e, "tamaño")} />
    </div>
  );
}
