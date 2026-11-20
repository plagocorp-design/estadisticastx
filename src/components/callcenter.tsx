import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  armarSao,
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
  type EfectividadFila,
  type PlacaDeBase,
  type CorteCall,
} from "@/lib/callcenter.functions";
import type { Me } from "@/lib/casos.functions";
import { hoyBogota, ORIGENES } from "@/lib/casos";
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
      <p className="mt-1 text-xs text-ink-soft">Sube el Excel del asesor, el de la hoja BD. La hoja WhatsApp queda como seguimiento de esa placa y no suma en las llamadas de Estadísticas. Si la fila no trae placa (referido o Instagram), no entra.</p>
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

export function CallCenterVista({ me, verEquipo = false, onProceso, onCerro }: { me: Me; verEquipo?: boolean; onProceso: (id: number) => void; onCerro?: (id: number) => void }) {
  const [tab, setTab] = useState<Tab>("llamar");
  const [resumen, setResumen] = useState<Awaited<ReturnType<typeof resumenCall>> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (tab !== "llamar" && tab !== "empresas" && tab !== "seguimiento") return;
    resumenCall()
      .then(setResumen)
      .catch((err: Error) => setError(err.message));
  }, [tab]);

  const puedeTipificar = resumen?.llama ?? llevaProcesos(me.role);
  const coordina = verEquipo && (resumen?.coordina ?? me.role !== "asesor");
  const tabs: { id: Tab; label: string }[] = [
    { id: "llamar", label: "Llamar" },
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
              ? puedeTipificar
                ? `Hoy ${resumen.hoy} de ${META_LLAMADAS}${resumen.hoy >= META_LLAMADAS ? " · meta cumplida" : ` · faltan ${META_LLAMADAS - resumen.hoy}`}. Tu cola tipifica y abre el proceso.`
                : verEquipo
                  ? "Ves la cola y el seguimiento de cada asesor, uno por uno."
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
            puedeTipificar={puedeTipificar}
            verEquipo={verEquipo}
            asesores={resumen?.asesores ?? []}
            onProceso={onProceso}
            onError={setError}
            onCola={(pendientes, hoy, hoySegundos) =>
              setResumen((prev) => (prev ? { ...prev, pendientes, hoy, hoySegundos } : prev))
            }
          />
        ) : null}
        {tab === "seguimiento" ? (
          <Seguimiento
            me={me}
            verEquipo={verEquipo}
            asesores={resumen?.asesores ?? []}
            puedeTipificar={puedeTipificar}
            onError={setError}
            onProceso={onProceso}
            onCerro={onCerro}
          />
        ) : null}
        {tab === "bases" && coordina ? <Bases onError={setError} /> : null}
        {tab === "empresas" && coordina ? <Empresas onError={setError} /> : null}
        {tab === "stats" && coordina ? <Estadisticas onError={setError} onProceso={onProceso} /> : null}
        {tab === "briefing" ? <Briefing edita={coordina} onError={setError} /> : null}
      </div>
    </div>
  );
}

function Llamar({ me, puedeTipificar, verEquipo, asesores, onProceso, onError, onCola }: { me: Me; puedeTipificar: boolean; verEquipo: boolean; asesores: AsesorMini[]; onProceso: (id: number) => void; onError: (t: string) => void; onCola: (pendientes: number, hoy: number, segundos: number) => void }) {
  const [slug, setSlug] = useState(puedeTipificar ? me.slug : "");
  const [contacto, setContacto] = useState<ContactoCall | null>(null);
  const [aviso, setAviso] = useState("");
  const [cargando, setCargando] = useState(true);
  const [cayo, setCayo] = useState(false);
  const [q, setQ] = useState("");
  const [hallados, setHallados] = useState<{ id: number; placa: string; nombre: string; telefono: string; empresa: string; hecho: boolean; dueno?: string }[]>([]);
  const llama = puedeTipificar && slug === me.slug;
  const colas = [...asesores].sort((a, b) => (a.slug === me.slug ? -1 : b.slug === me.slug ? 1 : a.name.localeCompare(b.name, "es")));

  async function abrir(contactoId = 0, asesor = slug) {
    setCargando(true);
    setCayo(false);
    try {
      const res = await colaCall({ data: { contactoId, slug: asesor } });
      setContacto(res.contacto);
      setAviso(res.aviso);
      setHallados([]);
      if (res.contacto) onCola(res.contacto.pendientes, res.contacto.hoyLlamadas, res.contacto.hoySegundos);
    } catch (err) {
      setContacto(null);
      setAviso("");
      setCayo(true);
      onError(err instanceof Error ? err.message : "No pude abrir la cola");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    const inicial = puedeTipificar ? me.slug : (asesores.find((p) => p.slug !== me.slug)?.slug || asesores[0]?.slug || "");
    if (inicial && inicial !== slug) setSlug(inicial);
    void abrir(0, inicial || slug);
  }, [asesores.length, verEquipo]);

  function volverAMi() {
    setSlug(me.slug);
    void abrir(0, me.slug);
  }

  return (
    <div>
    <div>
      {verEquipo ? (
        <label className="mb-3 block text-sm">
          Ver la cola de
          <select
            value={slug}
            onChange={(e) => { setSlug(e.target.value); void abrir(0, e.target.value); }}
            className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
          >
            {colas.map((p) => <option key={p.slug} value={p.slug}>{p.slug === me.slug ? `${p.name} (mi cola)` : p.name}</option>)}
          </select>
          <span className="mt-1 block text-xs text-ink-soft">
            {llama
              ? "Estás en tu cola. Aquí se guarda la tipificación y se abre el proceso en Procesos."
              : "Esta cola es de otra persona: solo lectura. Cada placa es de un solo asesor."}
          </span>
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
                <span>
                  <b>{item.placa || "Sin placa"}</b>
                  {item.dueno ? "" : ` · ${item.nombre || "Sin nombre"} · ${item.telefono}`}
                </span>
                <span className="text-ink-soft">{item.dueno ? `La tiene ${item.dueno}` : item.hecho ? "Ya llamado" : "Pendiente"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {cargando ? <p className="mt-4 text-sm text-ink-soft">Abriendo el siguiente…</p> : null}
      {!cargando && !contacto && !cayo ? <p className="mt-4 rounded-card border border-line bg-card p-4 text-sm">{aviso || "No hay contactos en la cola."}</p> : null}
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
          onVolver={puedeTipificar && !llama ? volverAMi : undefined}
        />
      ) : null}
    </div>
    <GuionFlotante onError={onError} />
    </div>
  );
}

function cuentaComo(clasificacion: string, intencion: string, resultado: string) {
  const partes: string[] = [];
  const clas = clasificacion.toLowerCase();
  const inten = intencion.toLowerCase();
  const res = resultado.toLowerCase();
  if (clas.includes("efectivo") && !clas.includes("no efectivo")) partes.push("Contestó");
  if (inten.includes("no interesado")) partes.push("No interesado");
  if (inten.includes("considera")) partes.push("Considera opción");
  if (inten.includes("quiere")) partes.push("Quiere afiliarse");
  if (res.includes("no afiliado")) partes.push("No afiliado");
  else if (res === "afiliado") partes.push("Afiliado");
  if (res.includes("no localizado")) partes.push("No localizado");
  if (res === "en proceso") partes.push("En proceso de afiliación");
  else if (resultado && res !== "afiliado" && !res.includes("no afiliado") && !res.includes("no localizado")) partes.push(resultado);
  return partes;
}

function Ficha({
  contacto, llama, aviso, onAviso, onIr, onGuardado, onProceso, onError, onVolver,
}: {
  contacto: ContactoCall;
  llama: boolean;
  aviso: string;
  onAviso: (t: string) => void;
  onIr: (id: number) => void;
  onGuardado: (c: ContactoCall | null, aviso: string) => void;
  onProceso: (id: number) => void | Promise<void>;
  onError: (t: string) => void;
  onVolver?: () => void;
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
  const [origen, setOrigen] = useState((ORIGENES as readonly string[]).includes(contacto.origen) ? contacto.origen : "Base de datos (Call)");
  const [fallo, setFallo] = useState("");
  const [segundos, setSegundos] = useState(0);
  const [guardando, setGuardando] = useState<"guardar" | "abrir" | "">("");
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

  function draftDe(quedarse: boolean, resultadoForzado = resultado): LlamadaDraft {
    return {
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
      resultado: resultadoForzado,
      fechaAfiliacion,
      noAplicaAfiliacion,
      motivo,
      observacionFinal,
      agendar: Boolean(fechaProxima) && !noAplicaProxima,
      quedarse,
    };
  }

  async function guardar() {
    if (!llama) return;
    setFallo("");
    if (!clasificacion || !calificacion) {
      setFallo("Faltan la clasificación y la calificación. Sin eso no entra a la tabla.");
      return;
    }
    setGuardando("guardar");
    try {
      const res = await guardarLlamada({ data: draftDe(false) });
      onGuardado(res.contacto, res.aviso);
    } catch (err) {
      const texto = err instanceof Error ? err.message : "No pude guardar";
      setFallo(texto);
      onError(texto);
    } finally {
      setGuardando("");
    }
  }

  async function abrir() {
    if (!llama) return;
    setFallo("");
    const telLimpio = (tel || contacto.telefonoLista).replace(/\D/g, "");
    const faltan: string[] = [];
    if (!clasificacion) faltan.push("clasificación");
    if (!calificacion) faltan.push("calificación");
    if (!contacto.placa) faltan.push("placa");
    if (!cc.replace(/\D/g, "")) faltan.push("cédula");
    if (nombre.trim().length < 3) faltan.push("nombre");
    if (telLimpio.length < 7) faltan.push("teléfono");
    if (faltan.length) {
      setFallo(`Para abrir el proceso falta: ${faltan.join(", ")}.`);
      return;
    }
    const resultadoAbrir = resultado || "En proceso";
    if (!resultado) setResultado("En proceso");
    setGuardando("abrir");
    try {
      const res = await guardarLlamada({ data: draftDe(true, resultadoAbrir) });
      onAviso(res.aviso);
      const abierto = await abrirProcesoCall({
        data: { contactoId: contacto.id, nombre, cc, telefono: tel || contacto.telefonoLista, origen },
      });
      onAviso(abierto.aviso);
      if (abierto.casoId) await onProceso(abierto.casoId);
    } catch (err) {
      const texto = err instanceof Error ? err.message : "No pude abrir el proceso";
      setFallo(texto);
      onError(texto);
    } finally {
      setGuardando("");
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
        <Select label="De dónde salió el contacto" value={origen} opciones={ORIGENES} onChange={setOrigen} disabled={!llama} />
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
        <p className="mt-3 text-xs text-ink-soft">Observación SAO, se guarda sola: {armarSao({ tipoPersona: tipo, nombre, cc, tel, tieneNuevo, nuevoNombre, nuevoTel })}</p>
      </div>

      {llama ? (
        <div className="fixed inset-x-0 bottom-16 z-50 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-[15rem]">
          {fallo ? <p className="mx-auto mb-2 max-w-3xl text-sm text-danger">{fallo}</p> : null}
          <p className="mx-auto mb-2 max-w-3xl text-xs text-ink-soft">
            {cuentaComo(clasificacion, intencion, resultado || (guardando === "abrir" ? "En proceso" : "")).length
              ? `En la tabla de efectividad cuenta como: ${cuentaComo(clasificacion, intencion, resultado).join(" · ")}.`
              : "Elige clasificación, calificación e intención para que esta llamada cuente en la tabla."}
            {` Origen: ${origen}.`}
          </p>
          <div className="mx-auto grid max-w-3xl gap-2 sm:grid-cols-2">
            <button type="button" disabled={guardando !== ""} onClick={() => void guardar()} className="h-12 rounded-2xl bg-navy font-semibold text-paper disabled:opacity-60">
              {guardando === "guardar" ? "Guardando…" : "Guardar y pasar al siguiente"}
            </button>
            <button type="button" disabled={guardando !== ""} onClick={() => void abrir()} className="h-12 rounded-2xl bg-lime font-semibold text-navy disabled:opacity-60">
              {guardando === "abrir" ? "Abriendo el proceso…" : "Abrir proceso"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-card border border-line bg-card p-4 text-sm">
          <p>{onVolver ? "Esta cola no es tuya. Vuelve a la tuya para guardar la llamada y abrir el proceso." : "La tipificación la guarda el asesor. Desde aquí se revisa la cola."}</p>
          {onVolver ? <button type="button" onClick={onVolver} className="mt-3 h-11 rounded-2xl bg-navy px-4 font-semibold text-paper">Ir a mi cola</button> : null}
        </div>
      )}
      <p className="mt-2 pb-48 text-xs text-ink-soft">Si la próxima gestión es WhatsApp, queda en Control sin cerrar las llamadas, y la bitácora del día se llena sola. Si hay fecha, también queda en la agenda. Abrir proceso guarda esta tipificación y abre el proceso en Procesos. Si el resultado es No afiliado o No localizado, o la próxima gestión es Cerrar, el proceso se cierra.</p>
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
      <p className="mt-2 text-xs text-ink-soft">Primero sube BASE COMPLETA, la hoja Base ORIGINAL: de ahí sale todo. No prende la cola ni reparte las placas. La primera hoja de ese archivo es solo ALO TAXIS; se usa la grande. Después sube BASE PARA GESTION DE LLAMADAS: su primera hoja también es solo ALO TAXIS. La segunda, BASE PARA GESTION LLAMADAS, trae la columna AGENTE y es la cola (un pedazo de la completa, no el parque entero). Si AGENTE está vacío, esa placa no entra a la cola. El Excel de cada asesor se cruza en «Cruzar gestiones con la base».</p>
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

const CLAVES_EFECTO = ["contesto", "noInteresado", "considera", "quiere", "enProceso", "noAfiliado", "noLocalizado", "afiliado", "procesosAbiertos", "vinculados"] as const;

const COLUMNAS_EFECTO: { clave: (typeof CLAVES_EFECTO)[number]; label: string }[] = [
  { clave: "contesto", label: "Contestó" },
  { clave: "noInteresado", label: "No interesado" },
  { clave: "considera", label: "Considera opción" },
  { clave: "quiere", label: "Quiere afiliarse" },
  { clave: "enProceso", label: "En proceso" },
  { clave: "noAfiliado", label: "No afiliado" },
  { clave: "noLocalizado", label: "No localizado" },
  { clave: "afiliado", label: "Afiliado" },
  { clave: "procesosAbiertos", label: "Abiertos Call" },
  { clave: "vinculados", label: "Vinculados Call" },
];

function TablaEfectividad({ filas }: { filas: EfectividadFila[] }) {
  const total = (clave: (typeof CLAVES_EFECTO)[number]) => filas.reduce((suma, fila) => suma + (fila[clave] || 0), 0);
  return (
    <div className="mt-3 overflow-x-auto rounded-card border border-line bg-card">
      <table className="w-full min-w-[64rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-soft">
            <th className="px-3 py-2 font-semibold">Asesor</th>
            {COLUMNAS_EFECTO.map((col) => <th key={col.clave} className="px-3 py-2 font-semibold">{col.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? <tr><td colSpan={11} className="px-3 py-3 text-ink-soft">Todavía no hay gestiones para esta tabla.</td></tr> : null}
          {filas.map((fila) => (
            <tr key={fila.nombre} className="border-b border-line last:border-0">
              <td className="px-3 py-2 font-semibold">{fila.nombre}</td>
              {COLUMNAS_EFECTO.map((col) => (
                <td key={col.clave} className={"px-3 py-2 " + (col.clave === "afiliado" || col.clave === "vinculados" ? "font-semibold text-navy" : "")}>{fila[col.clave]}</td>
              ))}
            </tr>
          ))}
          {filas.length > 0 ? (
            <tr>
              <td className="px-3 py-2 font-semibold">Total</td>
              {COLUMNAS_EFECTO.map((col) => <td key={col.clave} className="px-3 py-2 font-semibold">{total(col.clave)}</td>)}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function finDeMes(mes: string) {
  const [anio, numero] = mes.split("-").map(Number);
  const dia = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
  return `${mes}-${String(dia).padStart(2, "0")}`;
}

function PlacasBase({ placas, campana, mes, onProceso }: { placas: PlacaDeBase[]; campana: boolean; mes: string; onProceso: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const base = placas.filter((fila) => campana || fila.fecha.slice(0, 7) === mes);
  const texto = q.trim().toLowerCase();
  const lista = base.filter((fila) => {
    if (estado && fila.estado !== estado && !(estado === "Llamar" && fila.desde === "Llamar")) return false;
    if (!texto) return true;
    return `${fila.placa} ${fila.nombre} ${fila.asesor} ${fila.empresa}`.toLowerCase().includes(texto);
  });
  const vinculados = base.filter((fila) => fila.estado === "Vinculado").length;
  const abiertos = base.filter((fila) => fila.estado === "Abierto").length;
  const desdeLlamar = base.filter((fila) => fila.desde === "Llamar").length;
  return (
    <div className="mt-4">
      <p className="font-semibold text-navy">Procesos que salieron de la llamada</p>
      <p className="mt-1 text-sm text-ink-soft">
        {base.length} placas. {vinculados} vinculadas, {abiertos} abiertas. {desdeLlamar} se abrieron con el botón de Llamar; el resto tiene origen Base de datos (Call). Un referido, un trabajo de campo o un proceso de otra vía no entra, aunque la placa esté en la base.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar placa, asesor o empresa" className="h-11 min-w-0 flex-1 rounded-2xl border border-line px-3" />
        {["", "Vinculado", "Abierto", "Cerrado", "Llamar"].map((opcion) => (
          <button key={opcion || "todas"} type="button" onClick={() => setEstado(opcion)} className={"h-11 rounded-2xl px-3 text-sm font-semibold " + (estado === opcion ? "bg-navy text-paper" : "border border-line bg-card")}>
            {opcion || "Todas"}
          </button>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto rounded-card border border-line bg-card">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-soft">
              <th className="px-3 py-2 font-semibold">Placa</th>
              <th className="px-3 py-2 font-semibold">Propietario</th>
              <th className="px-3 py-2 font-semibold">Asesor</th>
              <th className="px-3 py-2 font-semibold">Empresa</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
              <th className="px-3 py-2 font-semibold">Cómo se abrió</th>
              <th className="px-3 py-2 font-semibold">Origen</th>
              <th className="px-3 py-2 font-semibold">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 ? <tr><td colSpan={8} className="px-3 py-3 text-ink-soft">Ningún proceso de llamada coincide{texto || estado ? " con ese filtro" : ""}.</td></tr> : null}
            {lista.map((fila) => (
              <tr key={fila.casoId} className="border-b border-line last:border-0">
                <td className="px-3 py-2">
                  <button type="button" onClick={() => onProceso(fila.casoId)} className="font-semibold text-navy">{fila.placa || "Sin placa"}</button>
                </td>
                <td className="px-3 py-2">{fila.nombre}</td>
                <td className="px-3 py-2 font-semibold">{fila.asesor}</td>
                <td className="px-3 py-2">{fila.empresa}</td>
                <td className="px-3 py-2">{fila.estado}</td>
                <td className="px-3 py-2">{fila.desde}</td>
                <td className="px-3 py-2">{fila.origen || "—"}</td>
                <td className="px-3 py-2">{fila.fecha}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Panel({ titulo, nota, abierto = false, children }: { titulo: string; nota?: string; abierto?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(abierto);
  return (
    <section className="rounded-card border border-line bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left">
        <span>
          <span className="block font-semibold text-navy">{titulo}</span>
          {nota ? <span className="mt-1 block text-xs text-ink-soft">{nota}</span> : null}
        </span>
        <span className="shrink-0 text-sm font-semibold text-navy">{open ? "Plegar" : "Ver"}</span>
      </button>
      {open ? <div className="border-t border-line px-4 py-3">{children}</div> : null}
    </section>
  );
}

function FiltroSelect({ label, value, opciones, todos = "Todos", onChange }: { label: string; value: string; opciones: string[]; todos?: string; onChange: (v: string) => void }) {
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

function GraficoBarras({ datos }: { datos: { nombre: string; valor: number }[] }) {
  if (datos.length === 0) return <p className="text-sm text-ink-soft">Sin datos con ese filtro.</p>;
  return (
    <div style={{ height: Math.max(220, datos.length * 32) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="nombre" width={128} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="valor" name="Llamadas" fill="#1b3a4b" radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function vaciaEfecto(nombre: string): EfectividadFila {
  return { nombre, contesto: 0, noInteresado: 0, considera: 0, quiere: 0, enProceso: 0, noAfiliado: 0, noLocalizado: 0, afiliado: 0, procesosAbiertos: 0, vinculados: 0 };
}

function efectoDe(row: CorteCall, fila: EfectividadFila) {
  const inten = row.intencion.toLowerCase();
  const res = row.resultado.toLowerCase();
  fila.contesto += row.efectivos;
  if (inten.includes("no interesado")) fila.noInteresado += row.total;
  if (inten.includes("considera")) fila.considera += row.total;
  if (inten.includes("quiere")) fila.quiere += row.total;
  if (res.includes("en proceso")) fila.enProceso += row.total;
  if (res.includes("no afiliado")) fila.noAfiliado += row.total;
  else if (res.includes("afiliado")) fila.afiliado += row.total;
  if (res.includes("no localizado")) fila.noLocalizado += row.total;
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

function Estadisticas({ onError, onProceso }: { onError: (t: string) => void; onProceso: (id: number) => void }) {
  const hoy = hoyBogota();
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [asesor, setAsesor] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [clasificacion, setClasificacion] = useState("");
  const [calificacion, setCalificacion] = useState("");
  const [intencion, setIntencion] = useState("");
  const [resultado, setResultado] = useState("");
  const [dia, setDia] = useState(hoy);
  const [stats, setStats] = useState<StatsCall | null>(null);
  const [exportando, setExportando] = useState(false);
  function cargar(diaSel = dia) {
    statsCall({ data: { dia: diaSel } }).then(setStats).catch((err: Error) => onError(err.message));
  }
  useEffect(() => { cargar(); }, []);

  const todos = stats?.cortes ?? [];
  function pasa(row: CorteCall, salvo = "") {
    if (salvo !== "mes" && mes !== "todos" && !row.fecha.startsWith(mes)) return false;
    if (salvo !== "asesor" && asesor && row.asesor !== asesor) return false;
    if (salvo !== "empresa" && empresa && row.empresa !== empresa) return false;
    if (salvo !== "clasificacion" && clasificacion && row.clasificacion !== clasificacion) return false;
    if (salvo !== "calificacion" && calificacion && row.calificacion !== calificacion) return false;
    if (salvo !== "intencion" && intencion && row.intencion !== intencion) return false;
    if (salvo !== "resultado" && resultado && row.resultado !== resultado) return false;
    return true;
  }
  function unicos(campo: keyof CorteCall, salvo: string) {
    return [...new Set(todos.filter((row) => pasa(row, salvo)).map((row) => String(row[campo] || "")))].filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
  }
  const mesesOpcion = useMemo(
    () => [...new Set(todos.map((row) => row.fecha.slice(0, 7)).filter((item) => /^\d{4}-\d{2}$/.test(item)))].sort(),
    [todos],
  );
  const cortes = todos.filter((row) => pasa(row));
  const llamadas = cortes.reduce((n, row) => n + row.total, 0);
  const efectivas = cortes.reduce((n, row) => n + row.efectivos, 0);
  const noEfectivas = cortes.reduce((n, row) => n + row.noEfectivos, 0);
  const segundos = cortes.reduce((n, row) => n + row.segundos, 0);
  const tasa = llamadas ? Math.round((efectivas / llamadas) * 100) : 0;
  const porAsesor = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const row of cortes) mapa.set(row.asesor, (mapa.get(row.asesor) || 0) + row.total);
    return [...mapa.entries()].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor);
  }, [cortes]);
  const porEmpresa = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const row of cortes) mapa.set(row.empresa, (mapa.get(row.empresa) || 0) + row.total);
    return [...mapa.entries()].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor).slice(0, 12);
  }, [cortes]);
  const porCalificacion = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const row of cortes) mapa.set(row.calificacion, (mapa.get(row.calificacion) || 0) + row.total);
    return [...mapa.entries()].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor);
  }, [cortes]);
  const porIntencion = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const row of cortes) mapa.set(row.intencion, (mapa.get(row.intencion) || 0) + row.total);
    return [...mapa.entries()].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor);
  }, [cortes]);
  const porResultado = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const row of cortes) mapa.set(row.resultado, (mapa.get(row.resultado) || 0) + row.total);
    return [...mapa.entries()].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor);
  }, [cortes]);
  const porDia = useMemo(() => {
    const mapa = new Map<string, { fecha: string; llamadas: number; efectivas: number }>();
    for (const row of cortes) {
      const actual = mapa.get(row.fecha) ?? { fecha: row.fecha.slice(5), llamadas: 0, efectivas: 0 };
      actual.llamadas += row.total;
      actual.efectivas += row.efectivos;
      mapa.set(row.fecha, actual);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, fila]) => fila);
  }, [cortes]);
  const efectividad = useMemo(() => {
    const mapa = new Map<string, EfectividadFila>();
    const tomar = (nombre: string) => {
      const actual = mapa.get(nombre) ?? vaciaEfecto(nombre);
      mapa.set(nombre, actual);
      return actual;
    };
    for (const row of cortes) efectoDe(row, tomar(row.asesor));
    for (const row of stats?.procesos ?? []) {
      if (mes !== "todos" && row.mes !== mes) continue;
      if (asesor && row.nombre !== asesor) continue;
      if (empresa && row.empresa !== empresa) continue;
      const fila = tomar(row.nombre);
      fila.procesosAbiertos += row.abiertos;
      fila.vinculados += row.vinculados;
    }
    return [...mapa.values()].sort((a, b) => b.contesto - a.contesto || b.vinculados - a.vinculados);
  }, [cortes, stats?.procesos, mes, asesor, empresa]);
  const placas = (stats?.placas ?? []).filter((fila) => {
    if (mes !== "todos" && fila.fecha.slice(0, 7) !== mes) return false;
    if (asesor && fila.asesor !== asesor) return false;
    if (empresa && fila.empresa !== empresa) return false;
    return true;
  });
  const minutos = (stats?.minutos ?? []).filter((row) => {
    if (asesor && row.asesor !== asesor) return false;
    if (empresa && row.empresa !== empresa) return false;
    if (clasificacion && row.clasificacion !== clasificacion) return false;
    if (calificacion && row.calificacion !== calificacion) return false;
    if (intencion && row.intencion !== intencion) return false;
    if (resultado && row.resultado !== resultado) return false;
    return true;
  });
  const hayFiltro = mes !== "todos" || Boolean(asesor || empresa || clasificacion || calificacion || intencion || resultado);

  function limpiar() {
    setMes("todos");
    setAsesor("");
    setEmpresa("");
    setClasificacion("");
    setCalificacion("");
    setIntencion("");
    setResultado("");
  }

  function informe() {
    const desde = mes === "todos" ? `${mesesOpcion[0] || hoy.slice(0, 7)}-01` : `${mes}-01`;
    const hasta = mes === "todos" || mes === hoy.slice(0, 7) ? hoy : finDeMes(mes);
    setExportando(true);
    exportarCall({ data: { desde, hasta, asesor, empresa, clasificacion, calificacion, intencion, resultado } })
      .then((file) => bajarExcel(file.base64, file.filename))
      .catch((err: Error) => onError(err.message))
      .finally(() => setExportando(false));
  }

  function resumenCsv() {
    const filas: string[][] = [
      ["Corte", mes === "todos" ? "Todos los meses" : tituloMes(mes)],
      ["Asesor", asesor || "Todos"],
      ["Empresa", empresa || "Todas"],
      ["Clasificación", clasificacion || "Todas"],
      ["Calificación", calificacion || "Todas"],
      ["Intención", intencion || "Todas"],
      ["Resultado", resultado || "Todos"],
      [],
      ["Llamadas", String(llamadas)],
      ["Contacto efectivo", String(efectivas)],
      ["No efectivo", String(noEfectivas)],
      ["Contactabilidad", `${tasa}%`],
      [],
      ["Asesor", ...COLUMNAS_EFECTO.map((col) => col.label)],
      ...efectividad.map((fila) => [fila.nombre, ...COLUMNAS_EFECTO.map((col) => String(fila[col.clave]))]),
      [],
      ["Día", "Llamadas", "Efectivas"],
      ...porDia.map((fila) => [fila.fecha, String(fila.llamadas), String(fila.efectivas)]),
    ];
    bajarCsv(`informe-llamadas-${mes}.csv`, filas);
  }

  return (
    <div className="grid gap-3">
      <CargarGestiones onError={onError} onListo={() => cargar(dia)} />
      <div className="rounded-card border border-line bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-semibold text-navy">Filtros</p>
            <p className="mt-1 text-xs text-ink-soft">Lo que elijas corta las gráficas, la tabla y el informe. El WhatsApp no entra. Si ya está la base, la placa tiene que existir ahí.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={limpiar} className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold">Limpiar</button>
            <button type="button" onClick={resumenCsv} disabled={!stats} className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold">Resumen CSV</button>
            <button type="button" onClick={informe} disabled={exportando || !stats} className="h-10 rounded-2xl bg-navy px-3 text-sm font-semibold text-paper disabled:opacity-60">{exportando ? "Armando…" : "Informe Excel"}</button>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold">
            Mes
            <select value={mes === "todos" ? "" : mes} onChange={(e) => setMes(e.target.value || "todos")} className="mt-1 h-11 w-full rounded-2xl border border-line bg-card px-3 text-sm font-normal">
              <option value="">Todos los meses</option>
              {mesesOpcion.map((item) => <option key={item} value={item}>{tituloMes(item)}</option>)}
            </select>
          </label>
          <FiltroSelect label="Asesor" value={asesor} opciones={unicos("asesor", "asesor")} onChange={setAsesor} />
          <FiltroSelect label="Empresa" value={empresa} opciones={unicos("empresa", "empresa")} onChange={setEmpresa} />
          <FiltroSelect label="Clasificación" value={clasificacion} opciones={unicos("clasificacion", "clasificacion")} onChange={setClasificacion} />
          <FiltroSelect label="Calificación" value={calificacion} opciones={unicos("calificacion", "calificacion")} onChange={setCalificacion} />
          <FiltroSelect label="Intención" value={intencion} opciones={unicos("intencion", "intencion")} onChange={setIntencion} />
          <FiltroSelect label="Resultado" value={resultado} opciones={unicos("resultado", "resultado")} onChange={setResultado} />
        </div>
        {mesesOpcion.length > 0 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            <button type="button" onClick={() => setMes("todos")} className={"h-9 shrink-0 rounded-full px-3 text-sm font-semibold " + (mes === "todos" ? "bg-navy text-paper" : "border border-line bg-paper")}>Todos</button>
            {mesesOpcion.map((item) => (
              <button key={item} type="button" onClick={() => setMes(item)} className={"h-9 shrink-0 rounded-full px-3 text-sm font-semibold " + (mes === item ? "bg-navy text-paper" : "border border-line bg-paper")}>
                {tituloMes(item)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!stats ? <p className="text-sm text-ink-soft">Cargando…</p> : null}
      {stats && cortes.length === 0 ? <p className="text-sm text-ink-soft">{hayFiltro ? "Nada coincide con ese filtro." : "Todavía no hay llamadas guardadas."}</p> : null}

      <Panel titulo="Resumen" nota={`${llamadas} llamadas · ${efectivas} efectivas · ${tasa}% de contactabilidad · ${duracionTexto(segundos)}.`} abierto>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Dato n={llamadas} label="Llamadas" />
          <Dato n={efectivas} label="Contacto efectivo" />
          <Dato n={noEfectivas} label="No efectivo" />
          <Dato n={`${tasa}%`} label="Contactabilidad" />
        </div>
        {porDia.length > 0 ? (
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={porDia} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} width={32} />
                <Tooltip />
                <Line type="monotone" dataKey="llamadas" name="Llamadas" stroke="#1b3a4b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="efectivas" name="Efectivas" stroke="#65a30d" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </Panel>

      <Panel titulo="Efectividad por asesor" nota="Contestó es contacto efectivo. Lo demás sale de la intención y del resultado. Abiertos y vinculados son procesos de la base, filtrados por mes, asesor y empresa." abierto>
        <TablaEfectividad filas={efectividad} />
      </Panel>

      <Panel titulo="Por asesor" nota="Cada barra es el número de llamadas de ese corte.">
        <GraficoBarras datos={porAsesor} />
      </Panel>
      <Panel titulo="Por empresa" nota="Las 12 empresas con más llamadas en este corte.">
        <GraficoBarras datos={porEmpresa} />
      </Panel>
      <Panel titulo="Por calificación">
        <GraficoBarras datos={porCalificacion} />
      </Panel>
      <Panel titulo="Por intención">
        <GraficoBarras datos={porIntencion} />
      </Panel>
      <Panel titulo="Por resultado">
        <GraficoBarras datos={porResultado} />
      </Panel>
      <Panel titulo="Por día" nota="Sirve para ver en qué fechas se movió la campaña.">
        {porDia.length === 0 ? <p className="text-sm text-ink-soft">Sin días en este corte.</p> : (
          <ul className="grid max-h-80 gap-1 overflow-auto text-sm">
            {porDia.map((fila) => <li key={fila.fecha} className="flex justify-between gap-3"><span>{fila.fecha}</span><span className="tabular-nums">{fila.llamadas} · {fila.efectivas} efectivas</span></li>)}
          </ul>
        )}
      </Panel>

      <Panel titulo="Procesos que salieron de la llamada" nota="También respetan mes, asesor y empresa.">
        <PlacasBase placas={placas} campana mes={mes === "todos" ? hoy.slice(0, 7) : mes} onProceso={onProceso} />
      </Panel>

      <Panel titulo="Minuto a minuto" nota="Es un solo día. Los filtros de arriba también lo cortan. El 0:00 es porque el Excel no trae duración.">
        <label className="text-sm font-semibold">Día
          <input type="date" value={dia} onChange={(e) => { setDia(e.target.value); cargar(e.target.value); }} className="mt-1 h-11 w-full rounded-2xl border border-line px-3 font-normal" />
        </label>
        <ul className="mt-2 grid max-h-80 gap-1 overflow-auto">
          {minutos.map((row, i) => (
            <li key={`${row.hora}-${row.placa}-${i}`} className="rounded-xl bg-paper px-3 py-2 text-sm">
              <b>{row.hora || "—"}</b> {row.asesor.split(" ")[0]} · {row.placa} {row.nombre} · {row.empresa} · {row.clasificacion} · {duracionTexto(row.segundos)}
            </li>
          ))}
          {stats && minutos.length === 0 ? <li className="text-sm text-ink-soft">Ese día no hay llamadas con este filtro.</li> : null}
        </ul>
      </Panel>
    </div>
  );
}

function Dato({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-3">
      <p className="text-2xl font-semibold text-navy">{n}</p>
      <p className="text-xs text-ink-soft">{label}</p>
    </div>
  );
}

function Seguimiento({ me, verEquipo, asesores, puedeTipificar, onError, onProceso, onCerro }: { me: Me; verEquipo: boolean; asesores: AsesorMini[]; puedeTipificar: boolean; onError: (t: string) => void; onProceso: (id: number) => void; onCerro?: (id: number) => void }) {
  const inicial = puedeTipificar ? me.slug : (asesores[0]?.slug || me.slug);
  const [slug, setSlug] = useState(inicial);
  const [filas, setFilas] = useState<SeguimientoCall[]>([]);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [clasificacion, setClasificacion] = useState("");
  const [calificacion, setCalificacion] = useState("");
  const [intencion, setIntencion] = useState("");
  const [proxima, setProxima] = useState("");
  const [resultado, setResultado] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [aviso, setAviso] = useState("");
  const [fallo, setFallo] = useState("");
  const edita = puedeTipificar && slug === me.slug;
  const colas = [...asesores].sort((a, b) => (a.slug === me.slug ? -1 : b.slug === me.slug ? 1 : a.name.localeCompare(b.name, "es")));
  const dueno = colas.find((p) => p.slug === slug)?.name || me.name;

  function cargar(asesor = slug) {
    listSeguimiento({ data: { slug: asesor } }).then(setFilas).catch((err: Error) => onError(err.message));
  }
  useEffect(() => {
    const siguiente = puedeTipificar ? me.slug : (asesores[0]?.slug || me.slug);
    if (siguiente && siguiente !== slug) setSlug(siguiente);
    cargar(siguiente);
  }, [asesores.length]);

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
    if (!edita) return;
    setGuardando(true);
    setAviso("");
    setFallo("");
    try {
      const res = await guardarLlamada({
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
          quedarse: true,
          sinFicha: true,
        },
      });
      setAviso(res.aviso);
      if (res.cerradoId) onCerro?.(res.cerradoId);
      setAbierta(null);
      cargar();
    } catch (err) {
      const texto = err instanceof Error ? err.message : "No pude actualizar la gestión";
      setFallo(texto);
      onError(texto);
    } finally {
      setGuardando(false);
    }
  }

  async function abrirProceso(fila: SeguimientoCall) {
    if (fila.casoId) {
      try {
        await onProceso(fila.casoId);
      } catch (err) {
        onError(err instanceof Error ? err.message : "No pude abrir el proceso");
      }
      return;
    }
    if (!edita) return;
    setAbriendo(true);
    try {
      const res = await abrirProcesoCall({
        data: {
          contactoId: fila.id,
          nombre: fila.nombre || fila.propietario,
          cc: fila.cc,
          telefono: fila.telefono || fila.telPropietario,
          origen: "Base de datos (Call)",
        },
      });
      if (res.casoId) await onProceso(res.casoId);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No pude abrir el proceso");
    } finally {
      setAbriendo(false);
    }
  }

  const atrasadas = filas.filter((fila) => fila.atrasada).length;
  const enProceso = filas.filter((fila) => fila.resultado.toLowerCase() === "en proceso").length;
  const quiere = filas.filter((fila) => /quiere/i.test(fila.intencion)).length;
  return (
    <div>
      {verEquipo ? (
        <label className="mb-3 block text-sm">
          Seguimientos de
          <select
            value={slug}
            onChange={(e) => { setSlug(e.target.value); setAbierta(null); cargar(e.target.value); }}
            className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
          >
            {colas.map((p) => <option key={p.slug} value={p.slug}>{p.slug === me.slug ? `${p.name} (míos)` : p.name}</option>)}
          </select>
        </label>
      ) : null}
      <p className="text-sm text-ink-soft">
        Solo los de {dueno.split(" ")[0]}. No se mezclan con los de otro asesor. Efectivos, WhatsApp, por llamar o en proceso.
        {atrasadas ? ` ${atrasadas} llevan más de una semana.` : ""}
        {filas.length ? ` ${enProceso} en proceso de afiliación · ${quiere} quieren afiliarse.` : ""}
      </p>
      {aviso ? <p className="mt-2 text-sm font-semibold text-navy">{aviso}</p> : null}
      <ul className="mt-3 grid gap-2">
        {filas.length === 0 ? <li className="rounded-card border border-line bg-card p-4 text-sm">No hay seguimientos abiertos de {dueno.split(" ")[0]}.</li> : null}
        {filas.map((fila) => (
          <li key={fila.id} className={"rounded-card border bg-card p-4 " + (fila.atrasada ? "border-danger" : "border-line")}>
            <button type="button" className="w-full text-left" onClick={() => abrir(fila)}>
              <p className="font-semibold text-navy">{fila.placa || "Sin placa"} · {fila.nombre || "Sin nombre"}</p>
              <p className="mt-1 text-sm text-ink-soft">{fila.empresa} · {fila.clasificacion || "Sin clasificación"} · {fila.proxima || "sin próxima"}{fila.resultado ? ` · ${fila.resultado}` : ""}</p>
              <p className={"mt-1 text-xs font-semibold " + (fila.atrasada ? "text-danger" : "text-ink-soft")}>
                {fila.fecha} · {fila.asesor.split(" ")[0]}{fila.origen ? ` · ${fila.origen}` : " · sin origen en el proceso"}{fila.casoId ? " · proceso abierto" : ""}{fila.atrasada ? " · toca actualizar" : " · al día"}
              </p>
            </button>
            {abierta === fila.id ? (
              <div className="mt-3 grid gap-2">
                {edita ? (
                  <>
                    <Select label="Clasificación" value={clasificacion} opciones={CLASIFICACIONES} onChange={setClasificacion} />
                    <Select label="Calificación" value={calificacion} opciones={CALIFICACIONES} onChange={setCalificacion} />
                    <Select label="Intención" value={intencion} opciones={INTENCIONES} onChange={setIntencion} />
                    <Select label="Próxima gestión" value={proxima} opciones={PROXIMAS} onChange={setProxima} />
                    <Select label="Resultado" value={resultado} opciones={RESULTADOS} onChange={setResultado} />
                    <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Qué pasó en este seguimiento" className="rounded-2xl border border-line px-3 py-2 text-sm" />
                    {fallo ? <p className="text-sm text-danger">{fallo}</p> : null}
                    <button type="button" disabled={guardando} onClick={() => void guardar(fila)} className="h-11 rounded-2xl bg-navy font-semibold text-paper disabled:opacity-60">
                      {guardando ? "Guardando…" : /no afiliado|no localizado/i.test(resultado) || proxima.trim().toLowerCase() === "cerrar" ? "Guardar y cerrar el proceso" : "Guardar seguimiento"}
                    </button>
                  </>
                ) : <p className="text-sm text-ink-soft">Este seguimiento es de {fila.asesor.split(" ")[0]}. Solo esa persona lo actualiza.</p>}
                {edita || fila.casoId ? (
                  <button type="button" disabled={abriendo} onClick={() => void abrirProceso(fila)} className="h-11 rounded-2xl bg-lime font-semibold text-navy disabled:opacity-60">
                    {abriendo ? "Abriendo el proceso…" : "Abrir proceso"}
                  </button>
                ) : null}
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
  const [oculto, setOculto] = useState(() => typeof window !== "undefined" && window.innerWidth < 1024);
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
      <button type="button" onClick={() => setOculto(false)} className="fixed bottom-36 right-4 z-40 h-11 rounded-2xl bg-navy px-4 text-sm font-semibold text-paper shadow-lg lg:bottom-24">
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
