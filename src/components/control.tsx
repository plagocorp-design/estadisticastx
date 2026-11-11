import { useEffect, useState } from "react";
import { agregarMarca, borrarMarca, claveExtension, exportarControl, guardarTipo, listEquipo, listMarcas, listTipos, marcarControl, quitarTipo } from "@/lib/control.functions";
import {
  CUPO_MINUTOS,
  atencionesDe,
  cuentaRegresiva,
  estadoDe,
  etiquetaEstado,
  leToca,
  minutosEntre,
  porHora,
  type AtencionControl,
  type EstadoControl,
  type MarcaControl,
  type MarcaTipo,
  type PersonaEquipo,
  type TipoActividad,
} from "@/lib/control";
import { enCurso, type Caso } from "@/lib/casos";
import type { Me } from "@/lib/casos.functions";
import { llevaProcesos, veElEquipo } from "@/lib/team.public";

type Accion = "ingreso" | "salida" | "break" | "almuerzo" | "visita" | "volver" | "soltar";

type MarcaNueva = {
  slug: string;
  tipo: MarcaTipo;
  tipoId?: number | null;
  hora: string;
  horaFin: string;
  nota: string;
  casoId: number | null;
  contacto?: string;
  telefono?: string;
  placaLibre?: string;
  sinProceso?: boolean;
};

type ActividadNueva = {
  tipoId: number;
  contacto: string;
  telefono: string;
  placaLibre: string;
  sinProceso: boolean;
  casoId: number | null;
  nota: string;
};

export function ControlVista({
  me,
  hora,
  hoy,
  verEquipo,
  casos,
}: {
  me: Me;
  hora: string;
  hoy: string;
  verEquipo: boolean;
  casos: Caso[];
}) {
  const [fecha, setFecha] = useState(hoy);
  const [horaMarca, setHoraMarca] = useState(hora);
  const [horaTocada, setHoraTocada] = useState(false);
  const [gente, setGente] = useState<PersonaEquipo[]>([]);
  const [marcas, setMarcas] = useState<MarcaControl[]>([]);
  const [tipos, setTipos] = useState<TipoActividad[]>([]);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [visitaDe, setVisitaDe] = useState("");
  useEffect(() => {
    if (!horaTocada) setHoraMarca(hora);
  }, [hora, horaTocada]);
  const puedeMarcar = veElEquipo(me.role) && verEquipo;
  const corrige = veElEquipo(me.role);
  const esHoy = fecha === hoy;

  async function cargar(dia = fecha) {
    const [personas, rows, actividades] = await Promise.all([listEquipo({ data: dia }), listMarcas({ data: dia }), listTipos()]);
    setGente(personas);
    setMarcas(rows);
    setTipos(actividades);
  }

  useEffect(() => {
    let vivo = true;
    cargar(fecha).catch((err) => vivo && setError(err instanceof Error ? err.message : "No pude cargar el control"));
    if (!esHoy) return () => {
      vivo = false;
    };
    const id = window.setInterval(() => {
      cargar(fecha).catch(() => {});
    }, 20000);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, [fecha]);

  async function marcarActividad(slug: string, input: ActividadNueva) {
    setOcupado(true);
    setError("");
    try {
      await marcarControl({ data: { accion: "actividad", slug, hora: horaMarca, fecha, ...input } });
      setVisitaDe("");
      await cargar();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude marcar");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function guardarActividad(input: {
    id: number | null;
    nombre: string;
    pideContacto: boolean;
    pideProceso: boolean;
    unaVez: boolean;
    minutos: number;
    predeterminada: boolean;
    paralela: boolean;
    todos: boolean;
    slugs: string[];
  }) {
    setOcupado(true);
    setError("");
    try {
      await guardarTipo({ data: input });
      await cargar();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude guardar la tipificación");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function quitarActividad(id: number) {
    setOcupado(true);
    setError("");
    try {
      await quitarTipo({ data: id });
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude quitar la tipificación");
    } finally {
      setOcupado(false);
    }
  }
  async function marcar(accion: Accion, slug?: string, casoId?: number | null, tipoId?: number | null) {
    setOcupado(true);
    setError("");
    try {
      await marcarControl({ data: { accion, slug, casoId: casoId ?? null, tipoId: tipoId ?? null, hora: horaMarca, fecha } });
      setVisitaDe("");
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude marcar");
    } finally {
      setOcupado(false);
    }
  }

  async function agregar(input: MarcaNueva) {
    setOcupado(true);
    setError("");
    try {
      await agregarMarca({ data: { ...input, fecha } });
      await cargar();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude agregar la marca");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function quitar(id: number) {
    setOcupado(true);
    setError("");
    try {
      await borrarMarca({ data: id });
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude quitar la marca");
    } finally {
      setOcupado(false);
    }
  }

  const calle = gente.filter((p) => llevaProcesos(p.role) && p.activo);
  const trabajan = calle.filter((p) => p.trabajaHoy);
  const libres = calle.filter((p) => !p.trabajaHoy);
  const mia = gente.find((p) => p.slug === me.slug);

  return (
    <section>
      <h1 className="text-lg font-semibold">{verEquipo ? "Control del equipo" : "Tu control"}</h1>
      {corrige ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">
            Día
            <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} className="mt-1 block h-11 rounded-2xl border border-line px-3" />
          </label>
          <label className="text-sm font-medium">
            Hora de la marca
            <input type="time" value={horaMarca} onChange={(e) => { setHoraTocada(true); setHoraMarca(e.target.value); }} className="mt-1 block h-11 rounded-2xl border border-line px-3" />
          </label>
          {verEquipo ? (
            <button
              type="button"
              disabled={ocupado}
              className="h-11 rounded-2xl border border-line bg-card px-4 text-sm font-semibold disabled:opacity-60"
              onClick={() => {
                setOcupado(true);
                setError("");
                exportarControl({ data: fecha.slice(0, 7) })
                  .then((file) => bajarExcel(file.base64, file.filename))
                  .catch((err: Error) => setError(err.message))
                  .finally(() => setOcupado(false));
              }}
            >
              Exportar el mes
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        {verEquipo
          ? "Llegó y se fue son la entrada y la salida. Llamar se empieza y se termina como cualquier gestión. WhatsApp se puede al mismo tiempo. Break, almuerzo o un cliente pausan lo que esté abierto."
          : "Marca cuándo llegas y cuándo te vas. Llamar no queda abierto solo: lo empiezas y lo terminas. WhatsApp se puede al tiempo. Break y almuerzo también."}
      </p>
      <ClaveWhatsapp />
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      {!verEquipo ? (
        mia && !mia.trabajaHoy ? (
          <p className="mt-4 rounded-card border border-line bg-card px-4 py-3 text-sm text-ink-soft">Hoy no trabajas.</p>
        ) : (
          <>
          <Tarjeta
            persona={mia}
            marcas={marcas.filter((m) => m.slug === me.slug)}
            tipos={tipos}
            hora={hora}
            esHoy={esHoy}
            ocupado={ocupado}
            puedeMarcar
            puedeCorregir={corrige}
            propio
            procesos={casos.filter((c) => c.ownerId === me.id && enCurso(c))}
            eligiendo={visitaDe === me.slug}
            onVisita={() => setVisitaDe(visitaDe === me.slug ? "" : me.slug)}
            onMarcar={(accion, casoId, tipoId) => void marcar(accion, me.slug, casoId, tipoId)}
            onActividad={(input) => marcarActividad(me.slug, input)}
            onAgregar={agregar}
            onQuitar={(id) => void quitar(id)}
          />
          <Atenciones marcas={marcas.filter((m) => m.slug === me.slug)} gente={gente} propio />
          </>
        )
      ) : (
        <>
          {puedeMarcar ? (
            <Tipificaciones tipos={tipos} gente={calle} ocupado={ocupado} onGuardar={guardarActividad} onQuitar={(id) => void quitarActividad(id)} />
          ) : null}
          <Ahora gente={trabajan} marcas={marcas} tipos={tipos} hora={hora} esHoy={esHoy} />
          <Atenciones marcas={marcas} gente={gente} />
          <div className="mt-4 grid gap-3">
            {trabajan.map((persona) => (
              <Tarjeta
                key={persona.slug}
                persona={persona}
                marcas={porHora(marcas.filter((m) => m.slug === persona.slug))}
                tipos={tipos}
                hora={hora}
                esHoy={esHoy}
                ocupado={ocupado}
                puedeMarcar={puedeMarcar}
                puedeCorregir={corrige}
                propio={persona.slug === me.slug}
                procesos={casos.filter((c) => c.ownerName === persona.name && enCurso(c))}
                eligiendo={visitaDe === persona.slug}
                onVisita={() => setVisitaDe(visitaDe === persona.slug ? "" : persona.slug)}
                onMarcar={(accion, casoId, tipoId) => void marcar(accion, persona.slug, casoId, tipoId)}
                onActividad={(input) => marcarActividad(persona.slug, input)}
                onAgregar={agregar}
                onQuitar={(id) => void quitar(id)}
              />
            ))}
          </div>
          {libres.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-semibold text-ink-soft">No trabajan este día</p>
              <ul className="mt-2 grid gap-1">
                {libres.map((persona) => {
                  const suyas = marcas.filter((m) => m.slug === persona.slug);
                  return (
                    <li key={persona.slug} className="rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink-soft">
                      <span className="font-semibold text-ink">{persona.name.split(" ")[0]}</span>
                      {" · "}
                      {suyas.length > 0 ? suyas.map(textoMarca).join(" · ") : "Sin marcas"}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function Tarjeta({
  persona,
  marcas,
  tipos,
  hora,
  esHoy,
  ocupado,
  puedeMarcar,
  puedeCorregir,
  propio,
  procesos,
  eligiendo,
  onVisita,
  onMarcar,
  onActividad,
  onAgregar,
  onQuitar,
}: {
  persona: PersonaEquipo | undefined;
  marcas: MarcaControl[];
  tipos: TipoActividad[];
  hora: string;
  esHoy: boolean;
  ocupado: boolean;
  puedeMarcar: boolean;
  puedeCorregir: boolean;
  propio?: boolean;
  procesos: Caso[];
  eligiendo: boolean;
  onVisita: () => void;
  onMarcar: (accion: Accion, casoId?: number | null, tipoId?: number | null) => void;
  onActividad: (input: ActividadNueva) => Promise<boolean>;
  onAgregar: (input: MarcaNueva) => Promise<boolean>;
  onQuitar: (id: number) => void;
}) {
  const [formId, setFormId] = useState<number | null>(null);
  const [alTiempo, setAlTiempo] = useState(false);
  const vista = textoAhora(marcas, tipos, persona?.slug ?? "", persona, hora, esHoy);
  const ahora = vista.ahora;
  const yaBreak = pausaHecha(marcas, "break");
  const yaAlmuerzo = pausaHecha(marcas, "almuerzo");
  const extra = tipos.filter((tipo) => persona && leToca(tipo, persona.slug));
  const alMismoTiempo = extra.filter((tipo) => tipo.paralela);
  const unaSola = extra.filter((tipo) => !tipo.paralela);
  const form = extra.find((tipo) => tipo.id === formId) ?? null;
  const adentro = ahora.estado === "adentro" || ahora.estado === "break" || ahora.estado === "almuerzo" || ahora.estado === "visita" || ahora.estado === "otro" || ahora.estado === "actividad";
  const enBase = ahora.estado === "adentro";
  const nombreActual = ahora.estado === "actividad"
    ? ahora.marca?.nombreTipo || "esta gestión"
    : ahora.estado === "break"
      ? "break"
      : ahora.estado === "almuerzo"
        ? "almuerzo"
        : ahora.estado === "visita"
          ? "la visita"
          : ahora.estado === "otro"
            ? ahora.marca?.nota || "esta salida"
            : "esta gestión";
  useEffect(() => {
    setAlTiempo(false);
    setFormId(null);
  }, [ahora.estado, ahora.marca?.id]);
  return (
    <article className="rounded-card border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {persona?.name ?? "Tú"}
          {persona?.role === "lider" ? " · líder" : ""}
        </p>
        <p className={"text-sm font-semibold " + (vista.aviso ? "text-danger" : "text-navy")}>{vista.texto}</p>
      </div>
      {esHoy && (ahora.estado === "break" || ahora.estado === "almuerzo") ? (
        <CuentaRegresiva desde={ahora.desde} cupo={CUPO_MINUTOS[ahora.estado]} etiqueta={ahora.estado === "break" ? "Break · 10 min" : "Almuerzo · 1 hora"} />
      ) : null}
      {marcas.length > 0 ? (
        <ol className="mt-3 grid gap-1 border-l border-line pl-3 text-sm text-ink-soft">
          {porHora(marcas).map((marca) => (
            <li key={marca.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span>{textoMarca(marca)}</span>
                {puedeCorregir ? (
                  <button type="button" disabled={ocupado} onClick={() => onQuitar(marca.id)} className="text-xs font-semibold text-ink-soft">
                    Quitar
                  </button>
                ) : null}
              </div>
              {atencionesDe(marca).length > 0 && (marca.paralela || atencionesDe(marca).length > 1) ? (
                <ul className="mt-1 grid gap-0.5 text-xs">
                  {atencionesDe(marca).map((personaAtendida) => (
                    <li key={`${marca.id}-${personaAtendida.id}-${personaAtendida.hora}-${personaAtendida.telefono}`}>
                      {personaAtendida.hora} · {[personaAtendida.contacto, personaAtendida.telefono, personaAtendida.placaLibre].filter(Boolean).join(" · ")}
                      {personaAtendida.nota ? ` · ${personaAtendida.nota}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">{esHoy ? "Todavía no hay marcas." : "Ese día no marcó."}</p>
      )}
      {puedeMarcar ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {ahora.estado === "sin_llegar" || ahora.estado === "se_fue" ? (
            <Boton disabled={ocupado} onClick={() => onMarcar("ingreso")}>{propio ? "Llegué" : "Llegó"}</Boton>
          ) : null}
          {adentro ? (
            enBase ? (
              <>
                <p className="w-full text-sm text-ink-soft">Elige la gestión. Llamar se empieza y se termina, no queda abierta sola.</p>
                {unaSola.map((tipo) => (
                  <BotonGestion key={tipo.id} tipo={tipo} marcas={marcas} ahora={ahora} formId={formId} ocupado={ocupado} setFormId={setFormId} onMarcar={onMarcar} onActividad={onActividad} />
                ))}
                {alMismoTiempo.map((tipo) => (
                  <BotonGestion key={tipo.id} tipo={tipo} marcas={marcas} ahora={ahora} formId={formId} ocupado={ocupado} setFormId={setFormId} onMarcar={onMarcar} onActividad={onActividad} />
                ))}
                {ahora.estado === "break" ? null : <Boton disabled={ocupado || yaBreak} onClick={() => onMarcar("break")}>{yaBreak ? "Break ya lo tomaste" : propio ? "Voy a break" : "Salió a break"}</Boton>}
                {ahora.estado === "almuerzo" ? null : <Boton disabled={ocupado || yaAlmuerzo} onClick={() => onMarcar("almuerzo")}>{yaAlmuerzo ? "Almuerzo ya lo tomaste" : propio ? "Voy a almuerzo" : "Salió a almuerzo"}</Boton>}
                <Boton disabled={ocupado} onClick={onVisita}>{propio ? "Bajé con un cliente" : "Bajó con un cliente"}</Boton>
                <Boton disabled={ocupado} rojo onClick={() => onMarcar("salida")}>Salida</Boton>
              </>
            ) : (
              <>
                <p className="w-full text-sm text-ink-soft">Estás en {nombreActual}. Termínala para empezar otra. Break y almuerzo se marcan aquí mismo.</p>
                <Boton disabled={ocupado} fuerte onClick={() => onMarcar("volver")}>
                  {propio ? `Terminar gestión de ${nombreActual}` : `Terminó gestión de ${nombreActual}`}
                </Boton>
                {ahora.estado === "break" ? null : <Boton disabled={ocupado || yaBreak} onClick={() => onMarcar("break")}>{yaBreak ? "Break ya lo tomaste" : propio ? "Voy a break" : "Salió a break"}</Boton>}
                {ahora.estado === "almuerzo" ? null : <Boton disabled={ocupado || yaAlmuerzo} onClick={() => onMarcar("almuerzo")}>{yaAlmuerzo ? "Almuerzo ya lo tomaste" : propio ? "Voy a almuerzo" : "Salió a almuerzo"}</Boton>}
                {ahora.paralelas.map((marca) => (
                  <Boton key={`soltar-${marca.id}`} disabled={ocupado} onClick={() => { if (formId === marca.tipoId) setFormId(null); onMarcar("soltar", null, marca.tipoId); }}>
                    {propio ? `Terminar ${marca.nombreTipo}` : `Terminó ${marca.nombreTipo}`}
                  </Boton>
                ))}
                <Boton disabled={ocupado} onClick={() => setAlTiempo((v) => !v)}>{alTiempo ? "Cerrar" : "Agregar otra gestión al tiempo"}</Boton>
                {alTiempo ? alMismoTiempo.map((tipo) => (
                  <BotonGestion key={tipo.id} tipo={tipo} marcas={marcas} ahora={ahora} formId={formId} ocupado={ocupado} setFormId={setFormId} onMarcar={onMarcar} onActividad={onActividad} />
                )) : null}
              </>
            )
          ) : null}
        </div>
      ) : null}
      {form && persona ? (
        <FormaActividad
          tipo={form}
          ya={(() => {
            const sesion = ahora.paralelas.find((marca) => marca.tipoId === form.id);
            return sesion ? atencionesDe(sesion) : [];
          })()}
          abierta={ahora.paralelas.some((marca) => marca.tipoId === form.id)}
          procesos={procesos}
          ocupado={ocupado}
          onCerrar={() => setFormId(null)}
          onListo={async (input) => {
            const ok = await onActividad(input);
            if (ok && !(form.paralela && form.pideContacto)) setFormId(null);
            return ok;
          }}
        />
      ) : null}
      {puedeCorregir && persona ? (
        <Antes
          slug={persona.slug}
          yaBreak={yaBreak}
          yaAlmuerzo={yaAlmuerzo}
          ocupado={ocupado}
          procesos={procesos}
          tipos={extra}
          onAgregar={onAgregar}
        />
      ) : null}
      {eligiendo ? (
        <div className="mt-2 grid gap-2">
          <button type="button" disabled={ocupado} onClick={() => onMarcar("visita", null)} className="h-10 rounded-2xl border border-line px-3 text-left text-sm font-semibold">
            Sin proceso
          </button>
          {procesos.map((caso) => (
            <button key={caso.id} type="button" disabled={ocupado} onClick={() => onMarcar("visita", caso.id)} className="h-10 rounded-2xl border border-line px-3 text-left text-sm font-semibold">
              {caso.placa} · {caso.nombre}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function pausaHecha(marcas: MarcaControl[], tipo: "break" | "almuerzo") {
  return marcas.some((marca) => marca.tipo === tipo && (marca.horaFin === "" || marca.horaFin > marca.hora));
}

function BotonGestion({
  tipo,
  marcas,
  ahora,
  formId,
  ocupado,
  setFormId,
  onMarcar,
  onActividad,
}: {
  tipo: TipoActividad;
  marcas: MarcaControl[];
  ahora: { estado: string; paralelas: MarcaControl[]; marca: MarcaControl | null };
  formId: number | null;
  ocupado: boolean;
  setFormId: (id: number | null) => void;
  onMarcar: (accion: Accion, casoId?: number | null, tipoId?: number | null) => void;
  onActividad: (input: ActividadNueva) => Promise<boolean>;
}) {
  const sesion = ahora.paralelas.find((marca) => marca.tipoId === tipo.id);
  return (
    <Boton
      disabled={ocupado || (!sesion && tipo.unaVez && marcas.some((m) => m.tipoId === tipo.id))}
      fuerte={Boolean(sesion)}
      onClick={() => {
        if (sesion && !tipo.pideContacto && !tipo.pideProceso) {
          onMarcar("soltar", null, tipo.id);
          return;
        }
        if (tipo.pideContacto || tipo.pideProceso || sesion) setFormId(formId === tipo.id ? null : tipo.id);
        else void onActividad({ tipoId: tipo.id, contacto: "", telefono: "", placaLibre: "", sinProceso: false, casoId: null, nota: "" });
      }}
    >
      {sesion && tipo.pideContacto ? `Otra persona · ${tipo.nombre.replace(/^Atención por /i, "")}` : tipo.nombre}
    </Boton>
  );
}

function Boton({ children, onClick, disabled, fuerte, rojo }: { children: string; onClick: () => void; disabled?: boolean; fuerte?: boolean; rojo?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={"h-10 rounded-2xl px-3 text-sm font-semibold disabled:opacity-60 " + (rojo ? "bg-danger text-paper" : fuerte ? "bg-navy text-paper" : "border border-line")}
    >
      {children}
    </button>
  );
}

function CuentaRegresiva({ desde, cupo, etiqueta }: { desde: string; cupo: number; etiqueta: string }) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [desde, cupo]);
  const texto = cuentaRegresiva(desde, cupo, ahora);
  const pasada = texto.startsWith("Te pasaste");
  return <p className={"mt-2 text-sm font-semibold " + (pasada ? "text-danger" : "text-navy")}>{etiqueta} · {texto}</p>;
}

function bajarExcel(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function textoMarca(marca: MarcaControl) {
  const fin = marca.horaFin && marca.horaFin !== marca.hora ? `–${marca.horaFin}` : marca.horaFin ? "" : " · sigue";
  if (marca.tipo === "ingreso") return `Llegó ${marca.hora}`;
  if (marca.tipo === "salida") return `Se fue ${marca.hora}`;
  if (marca.tipo === "break") return `Break ${marca.hora}${fin}`;
  if (marca.tipo === "almuerzo") return `Almuerzo ${marca.hora}${fin}`;
  if (marca.tipo === "otro") return `${marca.nota || "Salida"} ${marca.hora}${fin}`;
  if (marca.tipo === "actividad") {
    const gente = atencionesDe(marca);
    if (gente.length > 1 || marca.paralela) {
      const cuantos = gente.length === 1 ? "1 persona" : `${gente.length} personas`;
      return `${marca.nombreTipo || "Tarea"} ${marca.hora}${fin}${gente.length ? ` · ${cuantos}` : ""}`;
    }
    const primera = gente[0];
    const placa = primera?.placaLibre || marca.placaLibre || marca.placa;
    const quien = [primera?.contacto || marca.contacto, primera?.telefono || marca.telefono, placa].filter(Boolean).join(" · ");
    const extra = marca.sinProceso ? "proceso aún no activo" : "";
    return `${marca.nombreTipo || "Tarea"} ${marca.hora}${fin}${quien ? ` · ${quien}` : ""}${extra ? ` · ${extra}` : ""}${marca.nota ? ` · ${marca.nota}` : ""}`;
  }
  const quien = marca.placa ? ` · ${marca.placa} ${marca.cliente}` : "";
  return `Con cliente ${marca.hora}${fin}${quien}`;
}

function Antes({
  slug,
  yaBreak,
  yaAlmuerzo,
  ocupado,
  procesos,
  tipos,
  onAgregar,
}: {
  slug: string;
  yaBreak: boolean;
  yaAlmuerzo: boolean;
  ocupado: boolean;
  procesos: Caso[];
  tipos: TipoActividad[];
  onAgregar: (input: MarcaNueva) => Promise<boolean>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<string>(yaAlmuerzo ? (yaBreak ? "otro" : "break") : "almuerzo");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [nota, setNota] = useState("");
  const [casoId, setCasoId] = useState<number | null>(null);
  const [contacto, setContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [placaLibre, setPlacaLibre] = useState("");
  const actividad = tipos.find((item) => `act:${item.id}` === tipo);
  const intervalo = tipo === "break" || tipo === "almuerzo" || tipo === "visita" || tipo === "otro" || Boolean(actividad);
  return (
    <div className="mt-3">
      <button type="button" onClick={() => setAbierto((v) => !v)} className="text-sm font-semibold text-navy">
        {abierto ? "Cerrar" : "Agregar algo que ya pasó"}
      </button>
      {abierto ? (
        <form
          className="mt-2 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void onAgregar({
              slug,
              tipo: actividad ? "actividad" : (tipo as MarcaTipo),
              tipoId: actividad?.id ?? null,
              hora: desde,
              horaFin: intervalo ? hasta : "",
              nota,
              casoId,
              contacto,
              telefono,
              placaLibre,
              sinProceso: Boolean(actividad?.pideProceso) && !casoId,
            }).then((ok) => {
              if (!ok) return;
              setDesde("");
              setHasta("");
              setNota("");
              setContacto("");
              setTelefono("");
              setPlacaLibre("");
              setAbierto(false);
            });
          }}
        >
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-11 rounded-2xl border border-line px-3 text-sm">
            <option value="ingreso">Llegó</option>
            {yaBreak ? null : <option value="break">Break · solo uno</option>}
            {yaAlmuerzo ? null : <option value="almuerzo">Almuerzo · solo uno</option>}
            <option value="visita">Con un cliente</option>
            {tipos.map((item) => (
              <option key={item.id} value={`act:${item.id}`}>{item.nombre}</option>
            ))}
            <option value="salida">Se fue</option>
            <option value="otro">Otra salida</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm font-medium">
              Desde
              <input type="time" required value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-line px-3" />
            </label>
            {intervalo ? (
              <label className="text-sm font-medium">
                Volvió
                <input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-line px-3" />
              </label>
            ) : null}
          </div>
          {actividad?.pideContacto ? (
            <>
              <input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Nombre de la persona" className="h-11 rounded-2xl border border-line px-3 text-sm" />
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" className="h-11 rounded-2xl border border-line px-3 text-sm" />
            </>
          ) : null}
          {actividad?.pideContacto || actividad?.pideProceso ? (
            <input value={placaLibre} onChange={(e) => setPlacaLibre(e.target.value.toUpperCase())} placeholder="Placa, si la tiene" className="h-11 rounded-2xl border border-line px-3 text-sm uppercase" />
          ) : null}
          {tipo === "otro" || actividad ? (
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={tipo === "otro" ? "A dónde salió" : "Qué quedó, si quieres"} className="h-11 rounded-2xl border border-line px-3 text-sm" />
          ) : null}
          {(tipo === "visita" || actividad?.pideProceso) && procesos.length > 0 ? (
            <select value={casoId ?? ""} onChange={(e) => setCasoId(e.target.value ? Number(e.target.value) : null)} className="h-11 rounded-2xl border border-line px-3 text-sm">
              <option value="">{actividad?.pideProceso ? "El proceso todavía no está activo" : "Sin proceso"}</option>
              {procesos.map((caso) => (
                <option key={caso.id} value={caso.id}>
                  {caso.placa} · {caso.nombre}
                </option>
              ))}
            </select>
          ) : null}
          <button type="submit" disabled={ocupado} className="h-11 rounded-2xl bg-navy text-sm font-semibold text-paper disabled:opacity-60">
            Guardar esa marca
          </button>
          <p className="text-xs text-ink-soft">Si ya volvió, pon las dos horas. Si sigue afuera, deja Volvió vacío.</p>
        </form>
      ) : null}
    </div>
  );
}

function alertaDe(persona: PersonaEquipo | undefined, estado: EstadoControl, desde: string, marca: MarcaControl | null, hora: string) {
  if (!persona?.trabajaHoy) return "";
  if (estado === "sin_llegar" && persona.entrada && hora > persona.entrada) return `No ha llegado · entra ${persona.entrada}`;
  if (estado === "adentro" && persona.salida && hora > persona.salida) return `Ya pasó la salida de las ${persona.salida}`;
  if ((estado === "break" || estado === "almuerzo" || estado === "actividad") && desde && marca) {
    const minutos = minutosEntre(marca.hora || desde, hora);
    const cupo = estado === "actividad" ? marca.cupo : CUPO_MINUTOS[estado];
    if (cupo > 0 && minutos > cupo) return `${estado === "actividad" ? marca.nombreTipo : etiquetaEstado(estado)} · se pasó ${minutos - cupo} min`;
  }
  return "";
}

function FormaActividad({
  tipo,
  ya,
  abierta,
  procesos,
  ocupado,
  onCerrar,
  onListo,
}: {
  tipo: TipoActividad;
  ya: AtencionControl[];
  abierta: boolean;
  procesos: Caso[];
  ocupado: boolean;
  onCerrar: () => void;
  onListo: (input: ActividadNueva) => Promise<boolean>;
}) {
  const [contacto, setContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [placaLibre, setPlacaLibre] = useState("");
  const [casoId, setCasoId] = useState<number | "nuevo">("nuevo");
  const [nota, setNota] = useState("");
  const [aviso, setAviso] = useState("");
  const sigue = tipo.paralela && tipo.pideContacto;
  return (
    <form
      className="mt-3 grid gap-2 rounded-2xl border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const nombre = contacto.trim();
        void onListo({
          tipoId: tipo.id,
          contacto,
          telefono,
          placaLibre,
          sinProceso: tipo.pideProceso && casoId === "nuevo",
          casoId: typeof casoId === "number" ? casoId : null,
          nota,
        }).then((ok) => {
          if (!ok || !sigue) return;
          setAviso(`${nombre} quedó. Escribe la siguiente.`);
          setContacto("");
          setTelefono("");
          setPlacaLibre("");
          setNota("");
        });
      }}
    >
      <p className="text-sm font-semibold">{abierta ? `Otra persona en ${tipo.nombre}` : tipo.nombre}</p>
      {sigue ? (
        <p className="text-xs text-ink-soft">Llamar sigue. Agrega cada persona sin cerrar la gestión.</p>
      ) : null}
      {ya.length > 0 ? (
        <ul className="grid gap-0.5 text-xs text-ink-soft">
          {ya.map((persona) => (
            <li key={persona.id}>{persona.hora} · {[persona.contacto, persona.telefono, persona.placaLibre].filter(Boolean).join(" · ")}</li>
          ))}
        </ul>
      ) : null}
      {aviso ? <p className="text-sm font-semibold text-navy">{aviso}</p> : null}
      {tipo.pideContacto ? (
        <>
          <input required value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Nombre de la persona" className="h-11 rounded-2xl border border-line px-3 text-sm" />
          <input required value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" inputMode="tel" className="h-11 rounded-2xl border border-line px-3 text-sm" />
        </>
      ) : null}
      {tipo.pideContacto || tipo.pideProceso ? (
        <input value={placaLibre} onChange={(e) => setPlacaLibre(e.target.value.toUpperCase())} placeholder="Placa, si la tiene" className="h-11 rounded-2xl border border-line px-3 text-sm uppercase" />
      ) : null}
      {tipo.pideProceso ? (
        <select value={casoId} onChange={(e) => setCasoId(e.target.value === "nuevo" ? "nuevo" : Number(e.target.value))} className="h-11 rounded-2xl border border-line px-3 text-sm">
          <option value="nuevo">El proceso todavía no está activo</option>
          {procesos.map((caso) => (
            <option key={caso.id} value={caso.id}>{caso.placa} · {caso.nombre}</option>
          ))}
        </select>
      ) : null}
      <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué quedó, si quieres" className="h-11 rounded-2xl border border-line px-3 text-sm" />
      <div className="flex gap-2">
        <button type="submit" disabled={ocupado} className="h-10 flex-1 rounded-2xl bg-navy text-sm font-semibold text-paper disabled:opacity-60">
          {abierta ? "Agregar esta persona" : "Empezar"}
        </button>
        <button type="button" onClick={onCerrar} className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold">Cerrar</button>
      </div>
    </form>
  );
}

function Tipificaciones({
  tipos,
  gente,
  ocupado,
  onGuardar,
  onQuitar,
}: {
  tipos: TipoActividad[];
  gente: PersonaEquipo[];
  ocupado: boolean;
  onGuardar: (input: {
    id: number | null;
    nombre: string;
    pideContacto: boolean;
    pideProceso: boolean;
    unaVez: boolean;
    minutos: number;
    predeterminada: boolean;
    paralela: boolean;
    todos: boolean;
    slugs: string[];
  }) => Promise<boolean>;
  onQuitar: (id: number) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [nombre, setNombre] = useState("");
  const [pideContacto, setPideContacto] = useState(false);
  const [pideProceso, setPideProceso] = useState(false);
  const [unaVez, setUnaVez] = useState(false);
  const [minutos, setMinutos] = useState(0);
  const [predeterminada, setPredeterminada] = useState(false);
  const [paralela, setParalela] = useState(false);
  const [todos, setTodos] = useState(true);
  const [slugs, setSlugs] = useState<string[]>([]);

  function cargar(tipo: TipoActividad) {
    setAbierto(true);
    setEditId(tipo.id);
    setNombre(tipo.nombre);
    setPideContacto(tipo.pideContacto);
    setPideProceso(tipo.pideProceso);
    setUnaVez(tipo.unaVez);
    setMinutos(tipo.minutos);
    setPredeterminada(tipo.predeterminada);
    setParalela(tipo.paralela);
    setTodos(tipo.todos);
    setSlugs(tipo.slugs);
  }

  function limpiar() {
    setEditId(null);
    setNombre("");
    setPideContacto(false);
    setPideProceso(false);
    setUnaVez(false);
    setMinutos(0);
    setPredeterminada(false);
    setParalela(false);
    setTodos(true);
    setSlugs([]);
  }

  return (
    <div className="mt-4 rounded-card border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">Tipificaciones</p>
        <button type="button" onClick={() => { setAbierto((v) => !v); if (abierto) limpiar(); }} className="text-sm font-semibold text-navy">
          {abierto ? "Cerrar" : "Nueva"}
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-soft">Cada gestión se empieza y se termina. Ninguna queda abierta sola. Break son 10 minutos y almuerzo una hora: el contador corre al revés.</p>
      <ul className="mt-3 grid gap-2">
        {tipos.map((tipo) => (
          <li key={tipo.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button type="button" onClick={() => cargar(tipo)} className="text-left font-semibold">
              {tipo.nombre}
              <span className="mt-0.5 block font-normal text-ink-soft">
                {tipo.todos ? "Todo el equipo" : tipo.slugs.map((slug) => gente.find((persona) => persona.slug === slug)?.name.split(" ")[0] ?? slug).join(", ") || "Nadie"}
                {tipo.pideContacto ? " · pide nombre y teléfono" : ""}
                {tipo.paralela ? " · se puede al tiempo" : ""}
                {tipo.pideProceso ? " · pide el proceso" : ""}
                {tipo.minutos > 0 ? ` · ${tipo.minutos} min` : ""}
              </span>
            </button>
            <button type="button" disabled={ocupado} onClick={() => onQuitar(tipo.id)} className="text-xs font-semibold text-ink-soft">Quitar</button>
          </li>
        ))}
      </ul>
      {abierto ? (
        <form
          className="mt-3 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void onGuardar({ id: editId, nombre, pideContacto, pideProceso, unaVez, minutos, predeterminada, paralela, todos, slugs }).then((ok) => {
              if (ok) {
                limpiar();
                setAbierto(false);
              }
            });
          }}
        >
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre. Por ejemplo, Pegar distintivos" className="h-11 rounded-2xl border border-line px-3 text-sm" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pideContacto} onChange={(e) => { setPideContacto(e.target.checked); if (e.target.checked) setParalela(true); }} /> Pide nombre y teléfono. La placa va si la tiene.</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pideProceso} onChange={(e) => setPideProceso(e.target.checked)} /> Pide el proceso, o decir que todavía no está activo.</label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={paralela} onChange={(e) => setParalela(e.target.checked)} />
            Se puede hacer al tiempo con otra gestión. Por ejemplo, WhatsApp mientras se llama.
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unaVez} onChange={(e) => setUnaVez(e.target.checked)} /> Solo una vez al día.</label>
          <label className="text-sm font-medium">
            Minutos. 0 es sin límite.
            <input type="number" min={0} max={240} value={minutos} onChange={(e) => setMinutos(Number(e.target.value))} className="mt-1 h-11 w-full rounded-2xl border border-line px-3" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
            Para todo el equipo
          </label>
          {todos ? null : (
            <div className="grid gap-1">
              {gente.map((persona) => (
                <label key={persona.slug} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={slugs.includes(persona.slug)}
                    onChange={(e) => setSlugs(e.target.checked ? [...slugs, persona.slug] : slugs.filter((slug) => slug !== persona.slug))}
                  />
                  {persona.name.split(" ")[0]}
                </label>
              ))}
            </div>
          )}
          <button type="submit" disabled={ocupado} className="h-11 rounded-2xl bg-navy text-sm font-semibold text-paper disabled:opacity-60">
            {editId ? "Guardar cambios" : "Crear tipificación"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function Atenciones({ marcas, gente, propio }: { marcas: MarcaControl[]; gente: PersonaEquipo[]; propio?: boolean }) {
  const filas = porHora(marcas).flatMap((marca) => {
    if (marca.tipo !== "actividad") return [];
    const personas = atencionesDe(marca);
    if (personas.length === 0) return [{ marca, atencion: null as AtencionControl | null }];
    return personas.map((atencion) => ({ marca, atencion }));
  });
  if (filas.length === 0) {
    if (propio) return null;
    return (
      <div className="mt-4">
        <p className="text-sm font-semibold">Historial de atenciones</p>
        <p className="mt-1 text-sm text-ink-soft">Cada persona de WhatsApp queda aquí, aunque la gestión siga abierta. También distintivos y pólizas.</p>
      </div>
    );
  }
  const nombre = new Map(gente.map((persona) => [persona.slug, persona.name.split(" ")[0] ?? persona.slug]));
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold">{propio ? "Tus atenciones de hoy" : "Historial de atenciones"}</p>
      <ul className="mt-2 grid gap-2">
        {filas.map(({ marca, atencion }, indice) => (
          <li key={`${marca.id}-${atencion?.id ?? indice}`} className="rounded-xl border border-line bg-card px-3 py-2 text-sm">
            {propio ? null : <span className="font-semibold">{nombre.get(marca.slug) ?? marca.slug} · </span>}
            <span className="font-semibold">{marca.nombreTipo || "Tarea"}</span>
            {atencion?.contacto ? ` · ${atencion.contacto}` : !atencion && marca.contacto ? ` · ${marca.contacto}` : ""}
            {atencion?.telefono ? ` · ${atencion.telefono}` : !atencion && marca.telefono ? ` · ${marca.telefono}` : ""}
            {(atencion ? atencion.placaLibre : marca.placaLibre || marca.placa) ? ` · ${atencion ? atencion.placaLibre : marca.placaLibre || marca.placa}` : ""}
            {marca.sinProceso ? " · proceso aún no activo" : ""}
            {" · "}
            {atencion?.hora || marca.hora}
            {marca.horaFin ? ` · gestión ${marca.hora}–${marca.horaFin}` : " · gestión sigue"}
            {(atencion ? atencion.nota : marca.nota) ? ` · ${atencion ? atencion.nota : marca.nota}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Ahora({
  gente,
  marcas,
  tipos,
  hora,
  esHoy,
}: {
  gente: PersonaEquipo[];
  marcas: MarcaControl[];
  tipos: TipoActividad[];
  hora: string;
  esHoy: boolean;
}) {
  if (gente.length === 0) return null;
  return (
    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
      {gente.map((persona) => {
        const vista = textoAhora(porHora(marcas.filter((m) => m.slug === persona.slug)), tipos, persona.slug, persona, hora, esHoy);
        return (
          <li key={persona.slug} className="rounded-2xl border border-line bg-card px-3 py-2">
            <p className="text-sm font-semibold">{persona.name.split(" ")[0]}</p>
            <p className={"text-sm " + (vista.aviso ? "font-semibold text-danger" : "text-ink-soft")}>{vista.texto}</p>
            {esHoy && (vista.ahora.estado === "break" || vista.ahora.estado === "almuerzo") ? (
              <CuentaRegresiva desde={vista.ahora.desde} cupo={CUPO_MINUTOS[vista.ahora.estado]} etiqueta={vista.ahora.estado === "break" ? "Break" : "Almuerzo"} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function textoAhora(marcas: MarcaControl[], tipos: TipoActividad[], slug: string, persona: PersonaEquipo | undefined, hora: string, esHoy: boolean) {
  const ahora = estadoDe(marcas);
  const base = tipos.find((tipo) => tipo.predeterminada && leToca(tipo, slug));
  const aviso = esHoy ? alertaDe(persona, ahora.estado, ahora.desde, ahora.marca, hora) : "";
  const junto = ahora.paralelas
    .map((marca) => {
      const gente = atencionesDe(marca);
      const nombres = gente.map((fila) => fila.contacto).filter(Boolean);
      const lista = nombres.slice(0, 3).join(", ");
      const resto = nombres.length > 3 ? ` y ${nombres.length - 3} más` : "";
      return `${marca.nombreTipo}${gente.length ? ` · ${gente.length}` : ""}${lista ? ` · ${lista}${resto}` : ""}`;
    })
    .join(" · ");
  const primera = ahora.marca ? atencionesDe(ahora.marca)[0] : undefined;
  let texto =
    ahora.estado === "adentro"
      ? `Adentro · desde ${ahora.desde}${junto ? ` · también ${junto}` : ""}`
      : ahora.estado === "actividad" && ahora.marca
        ? `${ahora.marca.nombreTipo || "En tarea"}${primera?.contacto || ahora.marca.contacto ? ` · ${primera?.contacto || ahora.marca.contacto}` : ""}${primera?.placaLibre || ahora.marca.placaLibre || ahora.marca.placa ? ` · ${primera?.placaLibre || ahora.marca.placaLibre || ahora.marca.placa}` : ""} · desde ${ahora.desde}`
        : ahora.estado === "visita"
          ? `Con un cliente${ahora.marca?.placa ? ` · ${ahora.marca.placa}` : ""} · desde ${ahora.desde}`
          : ahora.estado === "otro" && ahora.marca?.nota
            ? `${ahora.marca.nota} · ${ahora.desde}`
            : `${etiquetaEstado(ahora.estado)}${ahora.desde ? ` · ${ahora.desde}` : ""}`;
  if (aviso && (ahora.estado === "break" || ahora.estado === "almuerzo" || ahora.estado === "actividad")) texto = aviso;
  else if (aviso && ahora.estado === "adentro") texto = `Adentro · ${aviso.charAt(0).toLowerCase()}${aviso.slice(1)}${junto ? ` · también ${junto}` : ""}`;
  else if (aviso) texto = aviso;
  return { ahora, base, aviso, texto };
}

function ClaveWhatsapp() {
  const [token, setToken] = useState("");
  const [aviso, setAviso] = useState("");
  useEffect(() => {
    claveExtension()
      .then((dato) => setToken(dato.token))
      .catch(() => setAviso("No pude leer la clave de la extensión."));
  }, []);
  return (
    <details className="mt-3 max-w-2xl rounded-2xl border border-line bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold">Extensión de WhatsApp</summary>
      <p className="mt-2 text-ink-soft">
        Al abrir WhatsApp Web se marca la gestión en Control. Cada chat se cuenta desde el primer mensaje de hoy, aunque el chat sea viejo y todavía no tengas la placa ni el nombre. El verde es atendido y el rojo es que no se pudo. Los dos quedan guardados.
      </p>
      <p className="mt-2 break-all font-mono text-xs">{token || "…"}</p>
      {aviso ? <p className="mt-2 text-danger">{aviso}</p> : null}
      <button
        type="button"
        className="mt-2 h-10 rounded-2xl border border-line px-3 font-semibold"
        onClick={() => {
          void navigator.clipboard.writeText(token);
          setAviso("Clave copiada. Pégala en la extensión, una sola vez.");
        }}
      >
        Copiar clave
      </button>
    </details>
  );
}
