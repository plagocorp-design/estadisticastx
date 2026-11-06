import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { signOut } from "@/lib/auth/client";
import { TEXTOS_BASE, type CiudadConfig } from "@/lib/gerencia";
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
  procesosCiudad,
  resumenPais,
  usuariosCiudad,
} from "@/lib/gerencia.functions";
import { etiquetaRol } from "@/lib/team.public";

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

const ROLES = [
  ["asesor", "Asesor"],
  ["lider", "Líder de ciudad"],
  ["coordinadora", "Coordinación"],
  ["via_seguros", "Vía Seguros"],
  ["operativa", "Operativa"],
  ["servicio", "Servicio al cliente"],
] as const;

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
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    const data = await resumenPais();
    setCiudades(data.ciudades);
    setTotales(data.totales);
    setGerencias(await listarGerencias().catch(() => []));
    setCiudadId((actual) => actual || data.ciudades[0]?.id || 0);
  }

  useEffect(() => {
    cargar().catch((err) => setError(err instanceof Error ? err.message : "No pude abrir el país"));
  }, []);

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
      await crearUsuarioCiudad({ data: { ciudadId, ...persona } });
      setPersona({ nombre: "", usuario: "", clave: "", rol: "asesor" });
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
      setAviso("Quedó guardado para esta ciudad. Bogotá no cambia si editaste otra.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude guardar");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="flex flex-wrap items-center gap-3 bg-navy px-4 py-4 text-paper">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wide text-lime">Gerencia</p>
          <h1 className="text-xl font-semibold">Vincula Libre · País</h1>
          <p className="text-sm text-paper/80">{nombre}</p>
        </div>
        <button
          type="button"
          className="h-10 rounded-xl border border-paper/30 px-3 text-sm"
          onClick={() => signOut().then(() => navigate({ to: "/login" }))}
        >
          Salir
        </button>
      </header>
      <main className="mx-auto grid max-w-5xl gap-4 px-4 py-5">
        {error ? <p className="rounded-2xl bg-white px-3 py-2 text-sm text-danger">{error}</p> : null}
        {aviso ? <p className="rounded-2xl bg-lime px-3 py-2 text-sm">{aviso}</p> : null}
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["Abiertos", totales.abiertos],
            ["Pólizas", totales.polizas],
            ["Completados", totales.completados],
            ["No concretados", totales.caidos],
            ["Personas", totales.personas],
          ].map(([label, valor]) => (
            <article key={label} className="rounded-2xl border border-line bg-card px-3 py-3">
              <p className="text-2xl font-semibold">{valor}</p>
              <p className="text-xs text-ink-soft">{label}</p>
            </article>
          ))}
        </section>
        <section className="rounded-card border border-line bg-card p-4">
          <h2 className="font-semibold">Ciudades</h2>
          <p className="mt-1 text-sm text-ink-soft">Bogotá ya tiene los procesos de hoy. Una ciudad nueva nace vacía, con el mismo flujo.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ciudades.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCiudadId(item.id)}
                className={
                  "rounded-2xl border px-3 py-2 text-left text-sm " +
                  (item.id === ciudadId ? "border-navy bg-navy text-paper" : "border-line")
                }
              >
                <span className="block font-semibold">{item.nombre}</span>
                <span className="block text-xs opacity-80">
                  {item.activa ? "Activa" : "En pausa"} · {item.abiertos} abiertos · {item.personas} personas
                </span>
              </button>
            ))}
          </div>
          <form onSubmit={(event) => void nuevaCiudad(event)} className="mt-4 flex flex-wrap gap-2">
            <input
              value={nombreCiudad}
              onChange={(event) => setNombreCiudad(event.target.value)}
              placeholder="Nueva ciudad"
              className="h-11 flex-1 rounded-2xl border border-line px-3"
            />
            <button type="submit" disabled={ocupado} className="h-11 rounded-2xl bg-navy px-4 text-sm font-semibold text-paper">
              Crear ciudad
            </button>
          </form>
        </section>
        <section className="rounded-card border border-line bg-card p-4">
          <h2 className="font-semibold">Accesos de gerencia</h2>
          <ul className="mt-2 grid gap-1 text-sm">
            {gerencias.map((personaPais) => (
              <li key={personaPais.slug}>
                {personaPais.name} · {personaPais.slug}{personaPais.clave ? ` · ${personaPais.clave}` : ""}{personaPais.activo ? "" : " · desactivado"}
              </li>
            ))}
          </ul>
          <form
            className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              setOcupado(true);
              void crearOtraGerencia({ data: otra })
                .then(async () => {
                  setOtra({ nombre: "", usuario: "", clave: "" });
                  setAviso("Ya puede entrar con ese usuario.");
                  setGerencias(await listarGerencias());
                })
                .catch((err) => setError(err instanceof Error ? err.message : "No pude crear el acceso"))
                .finally(() => setOcupado(false));
            }}
          >
            <input value={otra.nombre} onChange={(event) => setOtra({ ...otra, nombre: event.target.value })} placeholder="Nombre" className="h-11 rounded-2xl border border-line px-3" />
            <input value={otra.usuario} onChange={(event) => setOtra({ ...otra, usuario: event.target.value })} placeholder="Usuario" className="h-11 rounded-2xl border border-line px-3" />
            <input value={otra.clave} onChange={(event) => setOtra({ ...otra, clave: event.target.value })} placeholder="Clave" className="h-11 rounded-2xl border border-line px-3" />
            <button type="submit" className="h-11 rounded-2xl border border-line px-3 text-sm font-semibold">Crear acceso</button>
          </form>
        </section>
        {ciudad && config ? (
          <>
            <section className="rounded-card border border-line bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="flex-1 font-semibold">{ciudad.nombre}</h2>
                <button type="button" onClick={() => void pausar()} className="h-10 rounded-xl border border-line px-3 text-sm">
                  {ciudad.activa ? "Pausar ciudad" : "Reabrir ciudad"}
                </button>
                {onEntrar ? (
                  <button type="button" onClick={() => void onEntrar(ciudad.id)} className="h-10 rounded-xl bg-navy px-3 text-sm font-semibold text-paper">
                    Entrar y abrir procesos
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                {ciudad.abiertos} abiertos · {ciudad.polizas} con póliza · {ciudad.completados} completados · {ciudad.caidos} no concretados
              </p>
              <h3 className="mt-4 text-sm font-semibold">Usuarios de esta ciudad</h3>
              <ul className="mt-2 grid gap-2">
                {usuarios.length === 0 ? <li className="text-sm text-ink-soft">Todavía no hay usuarios.</li> : null}
                {usuarios.map((usuario) => (
                  <li key={usuario.slug} className="rounded-2xl border border-line px-3 py-2 text-sm">
                    <span className="font-semibold">{usuario.name}</span>
                    <span className="text-ink-soft"> · {etiquetaRol(usuario.role)} · {usuario.slug}{usuario.activo ? "" : " · desactivado"}</span>
                    {usuario.clave ? <span className="mt-1 block text-ink-soft">Clave: {usuario.clave}</span> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        value={claveNueva[usuario.slug] ?? ""}
                        onChange={(event) => setClaveNueva({ ...claveNueva, [usuario.slug]: event.target.value })}
                        placeholder="Nueva clave"
                        className="h-9 rounded-xl border border-line px-2"
                      />
                      <button
                        type="button"
                        className="h-9 rounded-xl border border-line px-2"
                        onClick={() => void claveUsuario({ data: { slug: usuario.slug, clave: claveNueva[usuario.slug] ?? "" } }).then(() => setAviso("Clave actualizada.")).catch((err) => setError(err instanceof Error ? err.message : "No pude cambiar la clave"))}
                      >
                        Cambiar clave
                      </button>
                      <button
                        type="button"
                        className="h-9 rounded-xl border border-line px-2"
                        onClick={() => void estadoUsuario({ data: { slug: usuario.slug, activo: !usuario.activo } }).then(async () => { setAviso(usuario.activo ? "Usuario desactivado." : "Usuario activo."); setUsuarios(await usuariosCiudad({ data: ciudadId })); })}
                      >
                        {usuario.activo ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <form onSubmit={(event) => void nuevoUsuario(event)} className="mt-3 grid gap-2 sm:grid-cols-2">
                <input value={persona.nombre} onChange={(e) => setPersona({ ...persona, nombre: e.target.value })} placeholder="Nombre" className="h-11 rounded-2xl border border-line px-3" />
                <input value={persona.usuario} onChange={(e) => setPersona({ ...persona, usuario: e.target.value })} placeholder="Usuario" className="h-11 rounded-2xl border border-line px-3" />
                <input value={persona.clave} onChange={(e) => setPersona({ ...persona, clave: e.target.value })} placeholder="Clave" className="h-11 rounded-2xl border border-line px-3" />
                <select value={persona.rol} onChange={(e) => setPersona({ ...persona, rol: e.target.value })} className="h-11 rounded-2xl border border-line px-3">
                  {ROLES.map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
                <button type="submit" disabled={ocupado} className="h-11 rounded-2xl bg-lime px-4 text-sm font-semibold sm:col-span-2">
                  Crear usuario
                </button>
              </form>
            </section>
            <section className="rounded-card border border-line bg-card p-4">
              <h2 className="font-semibold">Informe de {ciudad.nombre}</h2>
              <button
                type="button"
                className="mt-2 h-10 rounded-xl border border-line px-3 text-sm font-semibold"
                onClick={() => {
                  if (!informe) return;
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
                    "",
                    "Citas vencidas",
                    ...informe.citas.map((fila) => `${fila.placa};${fila.nombre};${fila.cita_fecha}`),
                  ];
                  const blob = new Blob(["\uFEFF" + lineas.join("\n")], { type: "text/csv;charset=utf-8" });
                  const enlace = document.createElement("a");
                  enlace.href = URL.createObjectURL(blob);
                  enlace.download = `informe-${ciudad.nombre}.csv`;
                  enlace.click();
                }}
              >
                Bajar informe
              </button>
              {informe ? (
                <div className="mt-3 grid gap-4 text-sm">
                  <div>
                    <p className="font-semibold">Meta del mes</p>
                    <ul className="mt-1">{informe.metas.length === 0 ? <li>Sin asesores en esta ciudad.</li> : informe.metas.map((fila) => <li key={fila.nombre}>{fila.nombre} · {fila.hechas} de {fila.meta}</li>)}</ul>
                  </div>
                  <div>
                    <p className="font-semibold">Cómo van</p>
                    <ul className="mt-1">{informe.embudo.map((fila) => <li key={fila.estado}>{fila.estado || "Sin estado"} · {fila.total}</li>)}</ul>
                  </div>
                  <div>
                    <p className="font-semibold">Los más demorados</p>
                    <ul className="mt-1">{informe.demorados.map((fila) => <li key={fila.placa}>{fila.placa} · {fila.nombre} · {fila.estado} · {fila.dias} días</li>)}</ul>
                  </div>
                  <div>
                    <p className="font-semibold">De qué empresa salieron</p>
                    <ul className="mt-1">{informe.empresas.map((fila) => <li key={fila.empresa}>{fila.empresa} · {fila.total} · {fila.polizas} con póliza</li>)}</ul>
                  </div>
                  <div>
                    <p className="font-semibold">Por dónde llegaron</p>
                    <ul className="mt-1">{informe.origenes.map((fila) => <li key={fila.origen}>{fila.origen} · {fila.total} · {fila.polizas} con póliza</li>)}</ul>
                  </div>
                  <div>
                    <p className="font-semibold">Por qué se cayeron</p>
                    <ul className="mt-1">{informe.motivos.length === 0 ? <li>Ninguno en esta ciudad.</li> : informe.motivos.map((fila) => <li key={fila.motivo}>{fila.motivo} · {fila.total}</li>)}</ul>
                  </div>
                  <div>
                    <p className="font-semibold">Citas vencidas</p>
                    <ul className="mt-1">{informe.citas.length === 0 ? <li>No hay.</li> : informe.citas.map((fila) => <li key={fila.placa}>{fila.placa} · {fila.cita_fecha}</li>)}</ul>
                  </div>
                </div>
              ) : null}
              <h3 className="mt-4 text-sm font-semibold">Procesos</h3>
              <ul className="mt-2 grid gap-1 text-sm">
                {procesos.map((fila) => (
                  <li key={fila.id}>{fila.placa} · {fila.nombre} · {fila.estado} · {fila.asesor} · {fila.dias} días</li>
                ))}
              </ul>
            </section>
            <section className="rounded-card border border-line bg-card p-4">
              <h2 className="font-semibold">Flujo</h2>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.flujo.operativaAntesDePago}
                  onChange={(event) => setConfig({ ...config, flujo: { ...config.flujo, operativaAntesDePago: event.target.checked } })}
                />
                <span>Se puede enviar a operativa antes de que Vía Seguros reciba el pago. Bogotá lo tiene prendido.</span>
              </label>
            </section>
            <section className="rounded-card border border-line bg-card p-4">
              <h2 className="font-semibold">Documentos</h2>
              <div className="mt-3 grid gap-2">
                {config.documentos.map((doc, index) => (
                  <div key={doc.id} className="grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_5rem_auto]">
                    <input
                      value={doc.label}
                      onChange={(event) => {
                        const documentos = config.documentos.slice();
                        documentos[index] = { ...doc, label: event.target.value };
                        setConfig({ ...config, documentos });
                      }}
                      className="h-10 rounded-xl border border-line px-3 text-sm"
                    />
                    <input
                      type="number"
                      min={1}
                      max={4}
                      value={doc.copias}
                      onChange={(event) => {
                        const documentos = config.documentos.slice();
                        documentos[index] = { ...doc, copias: Number(event.target.value) || 1 };
                        setConfig({ ...config, documentos });
                      }}
                      className="h-10 rounded-xl border border-line px-3 text-sm"
                      title="Copias al imprimir"
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={doc.activo}
                        onChange={(event) => {
                          const documentos = config.documentos.slice();
                          documentos[index] = { ...doc, activo: event.target.checked };
                          setConfig({ ...config, documentos });
                        }}
                      />
                      Activo
                    </label>
                  </div>
                ))}
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const id = docNuevo.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
                  if (id.length < 3 || config.documentos.some((doc) => doc.id === id)) return;
                  setConfig({ ...config, documentos: [...config.documentos, { id, label: docNuevo.trim(), obligatorio: false, copias: 1, vigencia: false, activo: true }] });
                  setDocNuevo("");
                }}
              >
                <input value={docNuevo} onChange={(event) => setDocNuevo(event.target.value)} placeholder="Documento nuevo" className="h-11 flex-1 rounded-2xl border border-line px-3" />
                <button type="submit" className="h-11 rounded-2xl border border-line px-3 text-sm font-semibold">Agregar</button>
              </form>
            </section>
            <section className="rounded-card border border-line bg-card p-4">
              <h2 className="font-semibold">Pasos</h2>
              <div className="mt-3 grid gap-2">
                {config.pasos.map((paso, index) => (
                  <label key={paso.key} className="grid grid-cols-[auto_1fr] items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={paso.activo}
                      onChange={(event) => {
                        const pasos = config.pasos.slice();
                        pasos[index] = { ...paso, activo: event.target.checked };
                        setConfig({ ...config, pasos });
                      }}
                    />
                    <input
                      value={paso.label}
                      onChange={(event) => {
                        const pasos = config.pasos.slice();
                        pasos[index] = { ...paso, label: event.target.value };
                        setConfig({ ...config, pasos });
                      }}
                      className="h-10 rounded-xl border border-line px-3"
                    />
                  </label>
                ))}
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const key = "extra_" + pasoNuevo.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
                  if (key.length < 8 || config.pasos.some((paso) => paso.key === key)) return;
                  setConfig({ ...config, pasos: [...config.pasos, { key, label: pasoNuevo.trim(), grupo: "Extra", activo: true }] });
                  setPasoNuevo("");
                }}
              >
                <input value={pasoNuevo} onChange={(event) => setPasoNuevo(event.target.value)} placeholder="Paso nuevo, sí o no" className="h-11 flex-1 rounded-2xl border border-line px-3" />
                <button type="submit" className="h-11 rounded-2xl border border-line px-3 text-sm font-semibold">Agregar</button>
              </form>
            </section>
            <section className="rounded-card border border-line bg-card p-4">
              <h2 className="font-semibold">Textos</h2>
              <div className="mt-3 grid gap-3">
                {TEXTOS_BASE.map((item) => (
                  <label key={item.clave} className="grid gap-1 text-sm">
                    {item.label}
                    <input
                      value={config.textos[item.clave] ?? ""}
                      onChange={(event) => setConfig({ ...config, textos: { ...config.textos, [item.clave]: event.target.value } })}
                      className="h-11 rounded-2xl border border-line px-3"
                    />
                  </label>
                ))}
              </div>
            </section>
            <section className="rounded-card border border-line bg-card p-4">
              <h2 className="font-semibold">Contrato de esta ciudad</h2>
              <p className="mt-1 text-sm text-ink-soft">Si subes un PDF, las firmas nuevas de esta ciudad salen sobre ese archivo. Bogotá, mientras no subas otro, sigue con el contrato de siempre. Los números son la posición de cada dato: página, x, y.</p>
              <input
                value={config.contratoNombre}
                onChange={(event) => setConfig({ ...config, contratoNombre: event.target.value })}
                placeholder="Nombre del formato"
                className="mt-3 h-11 w-full rounded-2xl border border-line px-3"
              />
              <textarea
                value={config.contratoNota}
                onChange={(event) => setConfig({ ...config, contratoNota: event.target.value })}
                className="mt-2 min-h-24 w-full rounded-2xl border border-line px-3 py-2 text-sm"
              />
              <div className="mt-3 grid gap-2">
                {config.contratoCampos.map((campo, index) => (
                  <div key={campo.campo} className="grid grid-cols-[7rem_1fr_1fr_1fr] items-center gap-2 text-xs">
                    <span>{campo.campo}</span>
                    <input type="number" value={campo.pagina} onChange={(event) => {
                      const contratoCampos = config.contratoCampos.slice();
                      contratoCampos[index] = { ...campo, pagina: Number(event.target.value) || 0 };
                      setConfig({ ...config, contratoCampos });
                    }} className="h-9 rounded-xl border border-line px-2" title="Página, desde 0" />
                    <input type="number" value={campo.x} onChange={(event) => {
                      const contratoCampos = config.contratoCampos.slice();
                      contratoCampos[index] = { ...campo, x: Number(event.target.value) || 0 };
                      setConfig({ ...config, contratoCampos });
                    }} className="h-9 rounded-xl border border-line px-2" title="x" />
                    <input type="number" value={campo.y} onChange={(event) => {
                      const contratoCampos = config.contratoCampos.slice();
                      contratoCampos[index] = { ...campo, y: Number(event.target.value) || 0 };
                      setConfig({ ...config, contratoCampos });
                    }} className="h-9 rounded-xl border border-line px-2" title="y" />
                  </div>
                ))}
              </div>
              <label className="mt-3 inline-flex h-11 cursor-pointer items-center rounded-2xl border border-line px-3 text-sm font-semibold">
                Subir PDF del contrato
                <input
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file || !ciudadId) return;
                    setOcupado(true);
                    setError("");
                    const reader = new FileReader();
                    reader.onload = () => {
                      const crudo = String(reader.result ?? "");
                      const datos = crudo.includes(",") ? crudo.slice(crudo.indexOf(",") + 1) : crudo;
                      const cargaId = crypto.randomUUID();
                      const tope = 500_000;
                      void (async () => {
                        try {
                          for (let i = 0, orden = 0; i < datos.length; i += tope, orden += 1) {
                            const fin = i + tope >= datos.length;
                            await parteContrato({ data: { ciudadId, cargaId, orden, datos: datos.slice(i, i + tope), fin, nombre: file.name, campos: config.contratoCampos } });
                          }
                          setConfig({ ...config, contratoNombre: file.name });
                          setAviso("Formato guardado. Las firmas nuevas de esta ciudad usan ese PDF.");
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "No pude subir el formato");
                        } finally {
                          setOcupado(false);
                        }
                      })();
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              <button type="button" disabled={ocupado} onClick={() => void guardar()} className="mt-3 ml-2 h-11 rounded-2xl bg-navy px-4 text-sm font-semibold text-paper">
                Guardar configuración
              </button>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
