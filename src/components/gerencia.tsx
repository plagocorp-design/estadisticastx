import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, FileText, KeyRound, LayoutDashboard, ListChecks, LogOut, Mail, Users } from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { SelectorAcceso } from "@/components/equipo";
import { accesoVacio, type Acceso } from "@/lib/team.public";
import { parteDeDoc, TEXTOS_BASE, type CiudadConfig } from "@/lib/gerencia";
import {
  claveUsuario,
  crearCiudad,
  crearOtraGerencia,
  crearUsuarioCiudad,
  estadoUsuario,
  guardarConfigCiudad,
  informeCiudad,
  leerConfigCiudad,
  listarGerencias,
  parteContrato,
  pausarCiudad,
  pdfDeCiudad,
  procesosCiudad,
  resumenPais,
  seriePais,
  usuariosCiudad,
} from "@/lib/gerencia.functions";
import { etiquetaRol } from "@/lib/team.public";
import { EditorContrato } from "@/components/gerencia-contrato";
import { CatalogoDatos } from "@/components/catalogo-datos";
import { MapaPais } from "@/components/gerencia-mapa";

type Ciudad = {
  id: number;
  slug: string;
  nombre: string;
  activa: boolean;
  personas: number;
  abiertos: number;
  polizas: number;
  completados: number;
  caidos: number;
};

type Usuario = { slug: string; name: string; role: string; clave: string; activo: boolean };
type Proceso = { id: number; placa: string; nombre: string; estado: string; asesor: string; dias: number };
type Informe = Awaited<ReturnType<typeof informeCiudad>>;

const SECCIONES = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["informe", "Informe", BarChart3],
  ["usuarios", "Usuarios", Users],
  ["documentos", "Documentos", FileText],
  ["pasos", "Pasos", ListChecks],
  ["contrato", "Contrato", FileText],
  ["correos", "Correos", Mail],
] as const;

type Seccion = (typeof SECCIONES)[number][0] | "accesos";

const GRUPOS_PASO = ["Inicio", "Documentos", "Firma", "Póliza", "Tarjeta", "Operativa", "Vía Seguros", "Servicio", "Extra"];
const COLORES = ["#1B3A4B", "#8FBF2F", "#C45C26", "#3D6B8C", "#6B4C7A"];

export function GerenciaVista({ nombre, onEntrar }: { nombre: string; onEntrar?: (ciudadId: number) => Promise<void> }) {
  const navigate = useNavigate();
  const [ciudades, setCiudades] = useState<Ciudad[]>([]);
  const [totales, setTotales] = useState({ abiertos: 0, polizas: 0, completados: 0, caidos: 0, personas: 0 });
  const [ciudadId, setCiudadId] = useState(0);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [procesos, setProcesos] = useState<Proceso[]>([]);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [claveNueva, setClaveNueva] = useState<Record<string, string>>({});
  const [docNuevo, setDocNuevo] = useState("");
  const [pasoNuevo, setPasoNuevo] = useState("");
  const [config, setConfig] = useState<CiudadConfig | null>(null);
  const [gerencias, setGerencias] = useState<{ slug: string; name: string; clave: string; activo: boolean }[]>([]);
  const [otra, setOtra] = useState({ nombre: "", usuario: "", clave: "" });
  const [nombreCiudad, setNombreCiudad] = useState("");
  const [persona, setPersona] = useState({ nombre: "", usuario: "", clave: "", rol: "asesor" });
  const [accesoNuevo, setAccesoNuevo] = useState<Acceso>(accesoVacio());
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [seccion, setSeccion] = useState<Seccion>("dashboard");
  const [serie, setSerie] = useState<Awaited<ReturnType<typeof seriePais>>>([]);
  const [pdf, setPdf] = useState("");
  const [detalle, setDetalle] = useState("");
  const [pdfOficial, setPdfOficial] = useState(true);

  async function cargar() {
    const data = await resumenPais();
    setCiudades(data.ciudades);
    setTotales(data.totales);
    setGerencias(await listarGerencias().catch(() => []));
    setCiudadId((actual) => actual || data.ciudades[0]?.id || 0);
  }

  useEffect(() => {
    cargar().catch((err) => setError(err instanceof Error ? err.message : "No pude abrir el país"));
    seriePais().then(setSerie).catch(() => {});
  }, []);

  useEffect(() => {
    if (seccion !== "contrato" || !ciudadId) return;
    pdfDeCiudad({ data: ciudadId })
      .then((dato) => {
        setPdf(dato.pdf);
        setPdfOficial(dato.oficial);
      })
      .catch(() => setPdf(""));
  }, [seccion, ciudadId]);

  useEffect(() => {
    if (!ciudadId) return;
    setError("");
    Promise.all([usuariosCiudad({ data: ciudadId }), leerConfigCiudad({ data: ciudadId }), procesosCiudad({ data: ciudadId }), informeCiudad({ data: ciudadId })])
      .then(([gente, conf, filas, datos]) => {
        setUsuarios(gente);
        setConfig(conf);
        setProcesos(filas);
        setInforme(datos);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No pude abrir la ciudad"));
  }, [ciudadId]);

  const ciudad = ciudades.find((item) => item.id === ciudadId);

  async function nuevaCiudad(event: FormEvent) {
    event.preventDefault();
    setOcupado(true);
    setError("");
    try {
      const creada = await crearCiudad({ data: { nombre: nombreCiudad } });
      setNombreCiudad("");
      setAviso("Ciudad creada. Empieza con el flujo de Bogotá y sin procesos.");
      await cargar();
      setCiudadId(creada.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude crear la ciudad");
    } finally {
      setOcupado(false);
    }
  }

  async function pausar() {
    if (!ciudad) return;
    setOcupado(true);
    setError("");
    try {
      await pausarCiudad({ data: { id: ciudad.id, activa: !ciudad.activa } });
      setAviso(ciudad.activa ? "Ciudad en pausa. Su equipo no debería operar hasta reabrirla." : "Ciudad reabierta.");
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude cambiar la ciudad");
    } finally {
      setOcupado(false);
    }
  }

  async function nuevoUsuario(event: FormEvent) {
    event.preventDefault();
    if (!ciudadId) return;
    setOcupado(true);
    setError("");
    try {
      await crearUsuarioCiudad({ data: { ciudadId, nombre: persona.nombre, usuario: persona.usuario, clave: persona.clave, acceso: accesoNuevo } });
      setPersona({ nombre: "", usuario: "", clave: "", rol: "asesor" });
      setAccesoNuevo(accesoVacio());
      setAviso("Usuario creado. Entra con ese usuario y esa clave.");
      setUsuarios(await usuariosCiudad({ data: ciudadId }));
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude crear el usuario");
    } finally {
      setOcupado(false);
    }
  }

  async function guardar() {
    if (!config || !ciudadId) return;
    setOcupado(true);
    setError("");
    try {
      await guardarConfigCiudad({ data: { ciudadId, config } });
      setAviso("Quedó guardado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude guardar");
      setAviso("");
    } finally {
      setOcupado(false);
    }
  }


  const meses = [...new Set(serie.map((fila) => fila.mes))];
  const comparacion = meses.map((mes) => {
    const fila: Record<string, string | number> = { mes: mes.slice(5) };
    for (const item of serie.filter((punto) => punto.mes === mes)) fila[item.ciudad] = item.polizas;
    return fila;
  });
  const nombresSerie = [...new Set(serie.map((fila) => fila.ciudad))];
  const titulo = SECCIONES.find((item) => item[0] === seccion)?.[1] ?? "Accesos";

  function bajarInforme() {
    if (!informe || !ciudad) return;
    const lineas = [
      "Etapa;Cantidad",
      ...informe.embudo.map((fila) => `${fila.estado};${fila.total}`),
      "",
      "Asesor;Hechas;Meta",
      ...informe.metas.map((fila) => `${fila.nombre};${fila.hechas};${fila.meta}`),
      "",
      "Empresa;Vehículos;Con póliza",
      ...informe.empresas.map((fila) => `${fila.empresa};${fila.total};${fila.polizas}`),
      "",
      "Origen;Vehículos;Con póliza",
      ...informe.origenes.map((fila) => `${fila.origen};${fila.total};${fila.polizas}`),
      "",
      "Placa;Nombre;Etapa;Días",
      ...informe.demorados.map((fila) => `${fila.placa};${fila.nombre};${fila.estado};${fila.dias}`),
    ];
    const blob = new Blob(["\uFEFF" + lineas.join("\n")], { type: "text/csv;charset=utf-8" });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = `informe-${ciudad.nombre}.csv`;
    enlace.click();
  }

  return (
    <div className="min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 z-20 hidden h-dvh flex-col overflow-y-auto bg-navy px-4 py-5 text-paper lg:flex">
        <div className="flex items-center gap-3">
          <img src="/taxis-libres-blanco.png" alt="Taxis Libres" className="h-10 w-auto" />
          <div>
            <p className="text-sm font-semibold leading-none">Vincula Libre</p>
            <p className="mt-1 text-xs text-paper">Gerencia</p>
          </div>
        </div>
        <nav className="mt-5 grid gap-1">
          {SECCIONES.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSeccion(id)}
              className={"flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold " + (seccion === id ? "bg-lime text-navy" : "text-paper")}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto grid gap-1">
          <button
            type="button"
            onClick={() => setSeccion("accesos")}
            className={"flex h-11 items-center gap-2 rounded-xl px-3 text-sm " + (seccion === "accesos" ? "bg-lime text-navy" : "text-paper")}
          >
            <KeyRound className="size-4" />
            Accesos
          </button>
          <button type="button" className="flex h-11 items-center gap-2 rounded-xl px-3 text-sm text-paper" onClick={() => signOut().then(() => navigate({ to: "/login" }))}>
            <LogOut className="size-4" />
            Salir
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-10 border-b border-line bg-card px-4 py-3 lg:px-8">
          <p className="text-lg font-semibold leading-none">{titulo}</p>
          <p className="mt-1 text-sm text-ink-soft">{nombre}{ciudad && seccion !== "dashboard" && seccion !== "accesos" ? ` · ${ciudad.nombre}` : " · País"}</p>
          <div className="mt-3 flex gap-2 overflow-x-auto lg:hidden">
            {SECCIONES.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setSeccion(id)} className={"h-10 shrink-0 rounded-xl px-3 text-sm font-semibold " + (seccion === id ? "bg-navy text-paper" : "border border-line")}>
                {label}
              </button>
            ))}
            <button type="button" onClick={() => setSeccion("accesos")} className={"h-10 shrink-0 rounded-xl px-3 text-sm font-semibold " + (seccion === "accesos" ? "bg-navy text-paper" : "border border-line")}>
              Accesos
            </button>
          </div>
        </header>
        <main className="grid gap-4 px-4 py-5 lg:px-8">
          {error ? <p className="rounded-2xl bg-white px-3 py-2 text-sm text-danger">{error}</p> : null}
          {aviso ? <p className="rounded-2xl bg-lime px-3 py-2 text-sm">{aviso}</p> : null}
          {seccion !== "dashboard" && seccion !== "accesos" && ciudad ? (
            <div className="flex flex-wrap items-center gap-2">
              <select value={ciudadId} onChange={(event) => setCiudadId(Number(event.target.value))} className="h-11 rounded-2xl border border-line bg-card px-3 text-sm font-semibold">
                {ciudades.map((item) => (
                  <option key={item.id} value={item.id}>{item.nombre}</option>
                ))}
              </select>
              <button type="button" onClick={() => void pausar()} className="h-11 rounded-2xl border border-line px-3 text-sm">{ciudad.activa ? "Pausar ciudad" : "Reabrir"}</button>
              {onEntrar ? (
                <button type="button" onClick={() => void onEntrar(ciudad.id)} className="h-11 rounded-2xl bg-navy px-3 text-sm font-semibold text-paper">Abrir procesos</button>
              ) : null}
              {seccion !== "contrato" ? (
                <button type="button" disabled={ocupado} onClick={() => void guardar()} className="h-11 rounded-2xl bg-lime px-3 text-sm font-semibold">Guardar</button>
              ) : null}
            </div>
          ) : null}

          {seccion === "dashboard" ? (
            <>
              <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ["Abiertos", totales.abiertos],
                  ["Pólizas", totales.polizas],
                  ["Completados", totales.completados],
                  ["No concretados", totales.caidos],
                  ["Personas", totales.personas],
                ].map(([label, valor]) => (
                  <article key={String(label)} className="rounded-2xl border border-line bg-card px-3 py-3">
                    <p className="text-2xl font-semibold">{valor}</p>
                    <p className="text-xs text-ink-soft">{label}</p>
                  </article>
                ))}
              </section>
              <section className="rounded-card border border-line bg-card p-4">
                <h2 className="font-semibold">Dónde estamos</h2>
                <p className="mt-1 text-sm text-ink-soft">Toca una ciudad para abrir su informe.</p>
                <MapaPais ciudades={ciudades} activa={ciudadId} onElegir={(id) => { setCiudadId(id); setSeccion("informe"); }} />
              </section>
              <form onSubmit={(event) => void nuevaCiudad(event)} className="relative z-10 flex gap-2 rounded-card border border-line bg-card p-4">
                <input value={nombreCiudad} onChange={(event) => setNombreCiudad(event.target.value)} placeholder="Nueva ciudad" className="h-11 min-w-0 flex-1 rounded-2xl border border-line px-3" />
                <button type="submit" className="h-11 shrink-0 rounded-2xl bg-navy px-4 text-sm font-semibold text-paper">Crear ciudad</button>
              </form>
              <section className="rounded-card border border-line bg-card p-4">
                <h2 className="font-semibold">Pólizas por mes y ciudad</h2>
                <div className="mt-3 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparacion}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      {nombresSerie.map((nombreSerie, indice) => (
                        <Line key={nombreSerie} type="monotone" dataKey={nombreSerie} stroke={COLORES[indice % COLORES.length]} strokeWidth={2} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className="rounded-card border border-line bg-card p-4">
                <h2 className="font-semibold">Ciudades, una al lado de la otra</h2>
                <div className="mt-3 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ciudades}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="nombre" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="abiertos" fill="#1B3A4B" name="Abiertos" />
                      <Bar dataKey="polizas" fill="#8FBF2F" name="Pólizas" />
                      <Bar dataKey="completados" fill="#3D6B8C" name="Completados" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </>
          ) : null}

          {seccion === "informe" && informe && ciudad ? (
            <section className="grid gap-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Informe de {ciudad.nombre}</h2>
                <button type="button" onClick={bajarInforme} className="h-10 rounded-xl border border-line px-3 text-sm font-semibold">Bajar informe</button>
              </div>
              <p className="text-sm text-ink-soft">Toca una barra para ver las placas de ese grupo.</p>
              <div className="h-[28rem] rounded-card border border-line bg-card p-4">
                <p className="mb-2 font-semibold">Cómo van</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={informe.embudo} margin={{ bottom: 48 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="estado" interval={0} angle={-28} textAnchor="end" height={80} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#1B3A4B" name="Procesos" onClick={(barra) => setDetalle(`estado:${String((barra as { estado?: string }).estado ?? "")}`)} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-[28rem] rounded-card border border-line bg-card p-4">
                <p className="mb-2 font-semibold">De qué empresa salieron</p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={informe.empresas} layout="vertical" margin={{ left: 24 }}>
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="empresa" width={160} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total" fill="#1B3A4B" name="Vehículos" onClick={(barra) => setDetalle(`empresa:${String((barra as { empresa?: string }).empresa ?? "")}`)} />
                    <Bar dataKey="polizas" fill="#8FBF2F" name="Con póliza" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-[24rem] rounded-card border border-line bg-card p-4">
                <p className="mb-2 font-semibold">Por dónde llegaron</p>
                <ResponsiveContainer width="100%" height="88%">
                  <BarChart data={informe.origenes}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="origen" interval={0} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total" fill="#3D6B8C" name="Entraron" onClick={(barra) => setDetalle(`origen:${String((barra as { origen?: string }).origen ?? "")}`)} />
                    <Bar dataKey="polizas" fill="#8FBF2F" name="Con póliza" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {detalle && informe.lista ? (
                <div className="rounded-card border border-line bg-card p-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{detalle.split(":").slice(1).join(":") || "Selección"} · {informe.lista.filter((fila) => fila[detalle.startsWith("estado:") ? "estado" : detalle.startsWith("origen:") ? "origen" : "empresa"] === detalle.split(":").slice(1).join(":")).length} placas</p>
                    <button type="button" className="h-9 rounded-xl border border-line px-3" onClick={() => setDetalle("")}>Cerrar</button>
                  </div>
                  <ul className="mt-3 grid gap-1">
                    {informe.lista
                      .filter((fila) => fila[detalle.startsWith("estado:") ? "estado" : detalle.startsWith("origen:") ? "origen" : "empresa"] === detalle.split(":").slice(1).join(":"))
                      .map((fila) => (
                        <li key={fila.placa}>{fila.placa} · {fila.nombre} · {fila.asesor} · {fila.estado}</li>
                      ))}
                  </ul>
                </div>
              ) : null}
              <div className="rounded-card border border-line bg-card p-4 text-sm">
                <p className="font-semibold">Meta del mes</p>
                <ul className="mt-2 grid gap-1">{informe.metas.length === 0 ? <li>Sin asesores.</li> : informe.metas.map((fila) => <li key={fila.nombre}>{fila.nombre}: {fila.hechas} de {fila.meta}</li>)}</ul>
                <p className="mt-4 font-semibold">Los más demorados</p>
                <ul className="mt-2 grid gap-1">{informe.demorados.map((fila) => <li key={fila.placa}>{fila.placa} · {fila.nombre} · {fila.estado} · {fila.dias} días</li>)}</ul>
                <p className="mt-4 font-semibold">Citas vencidas</p>
                <ul className="mt-2 grid gap-1">{informe.citas.length === 0 ? <li>No hay.</li> : informe.citas.map((fila) => <li key={fila.placa}>{fila.placa} · {fila.cita_fecha}</li>)}</ul>
              </div>
              <ul className="grid gap-1 text-sm">
                {procesos.map((fila) => <li key={fila.id}>{fila.placa} · {fila.nombre} · {fila.estado} · {fila.asesor} · {fila.dias} días</li>)}
              </ul>
            </section>
          ) : null}

          {seccion === "usuarios" && ciudad ? (
            <section className="rounded-card border border-line bg-card p-4">
              <h2 className="font-semibold">Usuarios de {ciudad.nombre}</h2>
              <ul className="mt-3 grid gap-2">
                {usuarios.length === 0 ? <li className="text-sm text-ink-soft">Todavía no hay usuarios.</li> : null}
                {usuarios.map((usuario) => (
                  <li key={usuario.slug} className="rounded-2xl border border-line px-3 py-2 text-sm">
                    <span className="font-semibold">{usuario.name}</span>
                    <span className="text-ink-soft"> · {etiquetaRol(usuario.role)} · {usuario.slug}{usuario.activo ? "" : " · desactivado"}</span>
                    {usuario.clave ? <span className="mt-1 block text-ink-soft">Clave: {usuario.clave}</span> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input value={claveNueva[usuario.slug] ?? ""} onChange={(event) => setClaveNueva({ ...claveNueva, [usuario.slug]: event.target.value })} placeholder="Nueva clave" className="h-9 rounded-xl border border-line px-2" />
                      <button type="button" className="h-9 rounded-xl border border-line px-2" onClick={() => void claveUsuario({ data: { slug: usuario.slug, clave: claveNueva[usuario.slug] ?? "" } }).then(() => setAviso("Clave actualizada.")).catch((err) => setError(err instanceof Error ? err.message : "No pude cambiar la clave"))}>Cambiar clave</button>
                      <button type="button" className="h-9 rounded-xl border border-line px-2" onClick={() => void estadoUsuario({ data: { slug: usuario.slug, activo: !usuario.activo } }).then(async () => { setAviso(usuario.activo ? "Usuario desactivado." : "Usuario activo."); setUsuarios(await usuariosCiudad({ data: ciudadId })); })}>{usuario.activo ? "Desactivar" : "Activar"}</button>
                    </div>
                  </li>
                ))}
              </ul>
              <form onSubmit={(event) => void nuevoUsuario(event)} className="mt-3 grid gap-2 sm:grid-cols-2">
                <input value={persona.nombre} onChange={(e) => setPersona({ ...persona, nombre: e.target.value })} placeholder="Nombre" className="h-11 rounded-2xl border border-line px-3" />
                <input value={persona.usuario} onChange={(e) => setPersona({ ...persona, usuario: e.target.value })} placeholder="Usuario" className="h-11 rounded-2xl border border-line px-3" />
                <input value={persona.clave} onChange={(e) => setPersona({ ...persona, clave: e.target.value })} placeholder="Clave" className="h-11 rounded-2xl border border-line px-3" />
                <div className="sm:col-span-2">
                  <SelectorAcceso value={accesoNuevo} onChange={setAccesoNuevo} />
                </div>
                <button type="submit" disabled={ocupado} className="h-11 rounded-2xl bg-lime px-4 text-sm font-semibold sm:col-span-2">Crear usuario</button>
              </form>
            </section>
          ) : null}

          {seccion === "documentos" && config ? (
            <section className="rounded-card border border-line bg-card p-4">
              <h2 className="font-semibold">Documentos</h2>
              <p className="mt-1 text-sm text-ink-soft">Activo es si se pide. La parte dice en qué pestaña del proceso lo sube el asesor. El número son las copias al imprimir: 2 en las tarjetas son dos de cada una. SOAT, tecnomecánica y formulario no se piden en Bogotá hasta que los prendas.</p>
              <div className="mt-3 grid gap-2">
                {config.documentos.map((doc, index) => (
                  <div key={doc.id} className="grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_11rem_6rem_auto]">
                    <input value={doc.label} onChange={(event) => { const documentos = config.documentos.slice(); documentos[index] = { ...doc, label: event.target.value }; setConfig({ ...config, documentos }); }} className="h-10 rounded-xl border border-line px-3 text-sm" />
                    <select value={doc.parte || parteDeDoc(doc.id)} onChange={(event) => { const documentos = config.documentos.slice(); documentos[index] = { ...doc, parte: event.target.value }; setConfig({ ...config, documentos }); }} className="h-10 rounded-xl border border-line px-2 text-sm">
                      {GRUPOS_PASO.filter((grupo) => grupo !== "Extra" && grupo !== "Operativa" && grupo !== "Vía Seguros" && grupo !== "Servicio").map((grupo) => <option key={grupo}>{grupo}</option>)}
                    </select>
                    <label className="text-xs text-ink-soft">Copias
                      <input type="number" min={1} max={4} value={doc.copias} onChange={(event) => { const documentos = config.documentos.slice(); documentos[index] = { ...doc, copias: Number(event.target.value) || 1 }; setConfig({ ...config, documentos }); }} className="mt-1 h-10 w-full rounded-xl border border-line px-3 text-sm" />
                    </label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={doc.activo} onChange={(event) => { const documentos = config.documentos.slice(); documentos[index] = { ...doc, activo: event.target.checked, parte: doc.parte || parteDeDoc(doc.id) }; setConfig({ ...config, documentos }); }} /> Pedirlo</label>
                  </div>
                ))}
              </div>
              <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); const id = docNuevo.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); if (id.length < 3 || config.documentos.some((doc) => doc.id === id)) return; setConfig({ ...config, documentos: [...config.documentos, { id, label: docNuevo.trim(), obligatorio: false, copias: 1, vigencia: false, activo: true, parte: "Documentos" }] }); setDocNuevo(""); }}>
                <input value={docNuevo} onChange={(event) => setDocNuevo(event.target.value)} placeholder="Documento nuevo" className="h-11 flex-1 rounded-2xl border border-line px-3" />
                <button type="submit" className="h-11 rounded-2xl border border-line px-3 text-sm font-semibold">Agregar</button>
              </form>
            </section>
          ) : null}

          {seccion === "pasos" && config ? (
            <section className="rounded-card border border-line bg-card p-4">
              <h2 className="font-semibold">Pasos</h2>
              <p className="mt-1 text-sm text-ink-soft">Cada paso vive en una parte del proceso: inicio, documentos, firma, póliza o tarjeta. Ahí es donde lo ve el asesor.</p>
              {GRUPOS_PASO.map((grupo) => {
                const lista = config.pasos.map((paso, index) => ({ paso, index })).filter((item) => item.paso.grupo === grupo);
                if (!lista.length) return null;
                return (
                  <div key={grupo} className="mt-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">{grupo}</h3>
                    <div className="mt-2 grid gap-2">
                      {lista.map(({ paso, index }) => (
                        <div key={paso.key} className="grid items-center gap-2 sm:grid-cols-[auto_1fr_11rem]">
                          <input type="checkbox" checked={paso.activo} onChange={(event) => { const pasos = config.pasos.slice(); pasos[index] = { ...paso, activo: event.target.checked }; setConfig({ ...config, pasos }); }} />
                          <input value={paso.label} onChange={(event) => { const pasos = config.pasos.slice(); pasos[index] = { ...paso, label: event.target.value }; setConfig({ ...config, pasos }); }} className="h-10 rounded-xl border border-line px-3 text-sm" />
                          <select value={paso.grupo} onChange={(event) => { const pasos = config.pasos.slice(); pasos[index] = { ...paso, grupo: event.target.value }; setConfig({ ...config, pasos }); }} className="h-10 rounded-xl border border-line px-2 text-sm">
                            {GRUPOS_PASO.map((nombre) => <option key={nombre}>{nombre}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); const key = "extra_" + pasoNuevo.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); if (key.length < 8 || config.pasos.some((paso) => paso.key === key)) return; setConfig({ ...config, pasos: [...config.pasos, { key, label: pasoNuevo.trim(), grupo: "Documentos", activo: true }] }); setPasoNuevo(""); }}>
                <input value={pasoNuevo} onChange={(event) => setPasoNuevo(event.target.value)} placeholder="Paso nuevo" className="h-11 flex-1 rounded-2xl border border-line px-3" />
                <button type="submit" className="h-11 rounded-2xl border border-line px-3 text-sm font-semibold">Agregar</button>
              </form>
            </section>
          ) : null}

          {seccion === "contrato" && config ? (
            <section className="rounded-card border border-line bg-card p-4">
              <h2 className="font-semibold">Contrato de {ciudad?.nombre}</h2>
              <p className="mt-1 text-sm text-ink-soft">
                {pdfOficial ? "Estás viendo el contrato de siempre. Si lo acomodas y guardas, esta ciudad usa esas posiciones. Sube otro PDF si el formato es distinto." : "Este es el PDF de la ciudad. Arrastra cada dato a su sitio."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <label className="inline-flex h-11 cursor-pointer items-center rounded-2xl border border-line px-3 text-sm font-semibold">
                  Subir PDF
                  <input type="file" accept="application/pdf" className="sr-only" onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file || !ciudadId) return;
                    setOcupado(true);
                    const reader = new FileReader();
                    reader.onload = () => {
                      const crudo = String(reader.result ?? "");
                      const datos = crudo.includes(",") ? crudo.slice(crudo.indexOf(",") + 1) : crudo;
                      const cargaId = crypto.randomUUID();
                      const tope = 500_000;
                      void (async () => {
                        try {
                          for (let i = 0, orden = 0; i < datos.length; i += tope, orden += 1) {
                            await parteContrato({ data: { ciudadId, cargaId, orden, datos: datos.slice(i, i + tope), fin: i + tope >= datos.length, nombre: file.name, campos: config.contratoCampos } });
                          }
                          setConfig({ ...config, contratoNombre: file.name });
                          setPdf(datos);
                          setPdfOficial(false);
                          setAviso("PDF listo. Acomoda los datos y guarda.");
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "No pude subir el formato");
                        } finally {
                          setOcupado(false);
                        }
                      })();
                    };
                    reader.readAsDataURL(file);
                  }} />
                </label>
                <button type="button" disabled={ocupado} onClick={() => void guardar()} className="h-11 rounded-2xl bg-navy px-4 text-sm font-semibold text-paper">Guardar posiciones</button>
              </div>
              <div className="mt-4">
                <CatalogoDatos campos={config.contratoCampos} onChange={(contratoCampos) => setConfig({ ...config, contratoCampos })} />
              </div>
              {pdf ? <div className="mt-4"><EditorContrato pdf={pdf} campos={config.contratoCampos} onChange={(contratoCampos) => setConfig({ ...config, contratoCampos })} /></div> : <p className="mt-3 text-sm text-ink-soft">Cargando el contrato…</p>}
            </section>
          ) : null}

          {seccion === "correos" && config ? (
            <section className="rounded-card border border-line bg-card p-4">
              <h2 className="font-semibold">Correo de firma</h2>
              <p className="mt-1 text-sm text-ink-soft">Este es el correo que DocuSign manda al propietario. Escribe {"{nombre}"} y {"{placa}"} donde quieras que salgan los datos. El botón de firmar lo pone DocuSign.</p>
              <label className="mt-4 grid gap-1 text-sm font-semibold">
                Asunto
                <input
                  value={config.textos.correo_firma_asunto || TEXTOS_BASE.find((item) => item.clave === "correo_firma_asunto")?.valor || ""}
                  onChange={(event) => setConfig({ ...config, textos: { ...config.textos, correo_firma_asunto: event.target.value } })}
                  className="h-11 rounded-2xl border border-line px-3 font-normal"
                />
              </label>
              <label className="mt-3 grid gap-1 text-sm font-semibold">
                Mensaje
                <textarea
                  value={config.textos.correo_firma_cuerpo || TEXTOS_BASE.find((item) => item.clave === "correo_firma_cuerpo")?.valor || ""}
                  onChange={(event) => setConfig({ ...config, textos: { ...config.textos, correo_firma_cuerpo: event.target.value } })}
                  rows={8}
                  className="rounded-2xl border border-line px-3 py-2 font-normal"
                />
              </label>
              <button type="button" disabled={ocupado} onClick={() => void guardar()} className="mt-3 h-11 rounded-2xl bg-navy px-4 text-sm font-semibold text-paper">
                Guardar correo
              </button>
            </section>
          ) : null}

          {seccion === "accesos" ? (
            <section className="rounded-card border border-line bg-card p-4">
              <h2 className="font-semibold">Accesos de gerencia</h2>
              <p className="mt-1 text-sm text-ink-soft">Estos entran al país, no a una sola ciudad.</p>
              <ul className="mt-3 grid gap-1 text-sm">
                {gerencias.map((personaPais) => (
                  <li key={personaPais.slug}>{personaPais.name} · {personaPais.slug}{personaPais.clave ? ` · ${personaPais.clave}` : ""}{personaPais.activo ? "" : " · desactivado"}</li>
                ))}
              </ul>
              <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); setOcupado(true); void crearOtraGerencia({ data: otra }).then(async () => { setOtra({ nombre: "", usuario: "", clave: "" }); setAviso("Ya puede entrar con ese usuario."); setGerencias(await listarGerencias()); }).catch((err) => setError(err instanceof Error ? err.message : "No pude crear el acceso")).finally(() => setOcupado(false)); }}>
                <input value={otra.nombre} onChange={(event) => setOtra({ ...otra, nombre: event.target.value })} placeholder="Nombre" className="h-11 rounded-2xl border border-line px-3" />
                <input value={otra.usuario} onChange={(event) => setOtra({ ...otra, usuario: event.target.value })} placeholder="Usuario" className="h-11 rounded-2xl border border-line px-3" />
                <input value={otra.clave} onChange={(event) => setOtra({ ...otra, clave: event.target.value })} placeholder="Clave" className="h-11 rounded-2xl border border-line px-3" />
                <button type="submit" className="h-11 rounded-2xl border border-line px-3 text-sm font-semibold">Crear acceso</button>
              </form>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
