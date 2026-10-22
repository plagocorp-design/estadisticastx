import { useEffect, useState } from "react";
import { agregarMarca, borrarMarca, listEquipo, listMarcas, marcarControl } from "@/lib/control.functions";
import {
  CUPO_MINUTOS,
  estadoDe,
  etiquetaEstado,
  minutosEntre,
  porHora,
  type EstadoControl,
  type MarcaControl,
  type MarcaTipo,
  type PersonaEquipo,
} from "@/lib/control";
import { enCurso, type Caso } from "@/lib/casos";
import type { Me } from "@/lib/casos.functions";
import { llevaProcesos, veElEquipo } from "@/lib/team.public";

type Accion = "ingreso" | "salida" | "break" | "almuerzo" | "visita" | "volver";

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
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [visitaDe, setVisitaDe] = useState("");
  useEffect(() => {
    if (!horaTocada) setHoraMarca(hora);
  }, [hora, horaTocada]);
  const puedeMarcar = veElEquipo(me.role) && verEquipo;
  const esHoy = fecha === hoy;

  async function cargar(dia = fecha) {
    const [personas, rows] = await Promise.all([listEquipo({ data: dia }), listMarcas({ data: dia })]);
    setGente(personas);
    setMarcas(rows);
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

  async function marcar(accion: Accion, slug?: string, casoId?: number | null) {
    setOcupado(true);
    setError("");
    try {
      await marcarControl({ data: { accion, slug, casoId: casoId ?? null, hora: horaMarca, fecha } });
      setVisitaDe("");
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude marcar");
    } finally {
      setOcupado(false);
    }
  }

  async function agregar(input: {
    slug: string;
    tipo: MarcaTipo;
    hora: string;
    horaFin: string;
    nota: string;
    casoId: number | null;
  }) {
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
      {verEquipo ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">
            Día
            <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} className="mt-1 block h-11 rounded-2xl border border-line px-3" />
          </label>
          {puedeMarcar ? (
            <label className="text-sm font-medium">
              Hora de la marca
              <input type="time" value={horaMarca} onChange={(e) => { setHoraTocada(true); setHoraMarca(e.target.value); }} className="mt-1 block h-11 rounded-2xl border border-line px-3" />
            </label>
          ) : null}
        </div>
      ) : null}
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        {verEquipo
          ? "Quien no está asignado ese día no trabaja. Coordinación y el líder pueden anotar después lo que faltó: la hora en que salieron, a qué hora volvieron, y una salida con texto libre. El break y el almuerzo son uno por día."
          : "Marca cuándo llegas, el break de 10 minutos, el almuerzo de una hora, cuándo vas a un cliente y cuándo te vas."}
      </p>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      {!verEquipo ? (
        mia && !mia.trabajaHoy ? (
          <p className="mt-4 rounded-card border border-line bg-card px-4 py-3 text-sm text-ink-soft">Hoy no trabajas.</p>
        ) : (
          <Tarjeta
            persona={mia}
            marcas={marcas.filter((m) => m.slug === me.slug)}
            hora={hora}
            esHoy={esHoy}
            ocupado={ocupado}
            puedeMarcar
            propio
            procesos={casos.filter((c) => c.ownerId === me.id && enCurso(c))}
            eligiendo={visitaDe === me.slug}
            onVisita={() => setVisitaDe(visitaDe === me.slug ? "" : me.slug)}
            onMarcar={(accion, casoId) => void marcar(accion, me.slug, casoId)}
            onAgregar={agregar}
            onQuitar={(id) => void quitar(id)}
          />
        )
      ) : (
        <>
          <div className="mt-4 grid gap-3">
            {trabajan.map((persona) => (
              <Tarjeta
                key={persona.slug}
                persona={persona}
                marcas={porHora(marcas.filter((m) => m.slug === persona.slug))}
                hora={hora}
                esHoy={esHoy}
                ocupado={ocupado}
                puedeMarcar={puedeMarcar}
                procesos={casos.filter((c) => c.ownerName === persona.name && enCurso(c))}
                eligiendo={visitaDe === persona.slug}
                onVisita={() => setVisitaDe(visitaDe === persona.slug ? "" : persona.slug)}
                onMarcar={(accion, casoId) => void marcar(accion, persona.slug, casoId)}
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
  hora,
  esHoy,
  ocupado,
  puedeMarcar,
  propio,
  procesos,
  eligiendo,
  onVisita,
  onMarcar,
  onAgregar,
  onQuitar,
}: {
  persona: PersonaEquipo | undefined;
  marcas: MarcaControl[];
  hora: string;
  esHoy: boolean;
  ocupado: boolean;
  puedeMarcar: boolean;
  propio?: boolean;
  procesos: Caso[];
  eligiendo: boolean;
  onVisita: () => void;
  onMarcar: (accion: Accion, casoId?: number | null) => void;
  onAgregar: (input: { slug: string; tipo: MarcaTipo; hora: string; horaFin: string; nota: string; casoId: number | null }) => Promise<boolean>;
  onQuitar: (id: number) => void;
}) {
  const ahora = estadoDe(marcas);
  const aviso = esHoy ? alertaDe(persona, ahora.estado, ahora.desde, ahora.marca, hora) : "";
  const yaBreak = marcas.some((m) => m.tipo === "break");
  const yaAlmuerzo = marcas.some((m) => m.tipo === "almuerzo");
  const estadoTxt =
    ahora.estado === "otro" && ahora.marca?.nota
      ? `${ahora.marca.nota} · ${ahora.desde}`
      : `${aviso || etiquetaEstado(ahora.estado)}${ahora.desde && ahora.estado !== "otro" ? ` · ${ahora.desde}` : ""}`;
  return (
    <article className="rounded-card border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {persona?.name ?? "Tú"}
          {persona?.role === "lider" ? " · líder" : ""}
        </p>
        <p className={"text-sm font-semibold " + (aviso ? "text-danger" : "text-navy")}>{estadoTxt}</p>
      </div>
      {marcas.length > 0 ? (
        <ol className="mt-3 grid gap-1 border-l border-line pl-3 text-sm text-ink-soft">
          {porHora(marcas).map((marca) => (
            <li key={marca.id} className="flex items-baseline justify-between gap-2">
              <span>{textoMarca(marca)}</span>
              {puedeMarcar && !propio ? (
                <button type="button" disabled={ocupado} onClick={() => onQuitar(marca.id)} className="text-xs font-semibold text-ink-soft">
                  Quitar
                </button>
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
          {ahora.estado === "adentro" ? (
            <>
              {yaBreak ? null : <Boton disabled={ocupado} onClick={() => onMarcar("break")}>{propio ? "Voy a break" : "Salió a break"}</Boton>}
              {yaAlmuerzo ? null : <Boton disabled={ocupado} onClick={() => onMarcar("almuerzo")}>{propio ? "Voy a almuerzo" : "Salió a almuerzo"}</Boton>}
              <Boton disabled={ocupado} onClick={onVisita}>{propio ? "Voy a un cliente" : "Salió con un cliente"}</Boton>
              <Boton disabled={ocupado} onClick={() => onMarcar("salida")} fuerte>{propio ? "Me voy" : "Se fue"}</Boton>
            </>
          ) : null}
          {ahora.estado === "break" || ahora.estado === "almuerzo" || ahora.estado === "visita" || ahora.estado === "otro" ? (
            <Boton disabled={ocupado} onClick={() => onMarcar("volver")} fuerte>{propio ? "Ya volví" : "Volvió"}</Boton>
          ) : null}
        </div>
      ) : null}
      {puedeMarcar && !propio && persona ? (
        <Antes
          slug={persona.slug}
          yaBreak={yaBreak}
          yaAlmuerzo={yaAlmuerzo}
          ocupado={ocupado}
          procesos={procesos}
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

function Boton({ children, onClick, disabled, fuerte }: { children: string; onClick: () => void; disabled?: boolean; fuerte?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={"h-10 rounded-2xl px-3 text-sm font-semibold disabled:opacity-60 " + (fuerte ? "bg-navy text-paper" : "border border-line")}
    >
      {children}
    </button>
  );
}

function textoMarca(marca: MarcaControl) {
  const fin = marca.horaFin && marca.horaFin !== marca.hora ? `–${marca.horaFin}` : marca.horaFin ? "" : " · sigue";
  if (marca.tipo === "ingreso") return `Llegó ${marca.hora}`;
  if (marca.tipo === "salida") return `Se fue ${marca.hora}`;
  if (marca.tipo === "break") return `Break ${marca.hora}${fin}`;
  if (marca.tipo === "almuerzo") return `Almuerzo ${marca.hora}${fin}`;
  if (marca.tipo === "otro") return `${marca.nota || "Salida"} ${marca.hora}${fin}`;
  const quien = marca.placa ? ` · ${marca.placa} ${marca.cliente}` : "";
  return `Con cliente ${marca.hora}${fin}${quien}`;
}

function Antes({
  slug,
  yaBreak,
  yaAlmuerzo,
  ocupado,
  procesos,
  onAgregar,
}: {
  slug: string;
  yaBreak: boolean;
  yaAlmuerzo: boolean;
  ocupado: boolean;
  procesos: Caso[];
  onAgregar: (input: { slug: string; tipo: MarcaTipo; hora: string; horaFin: string; nota: string; casoId: number | null }) => Promise<boolean>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<MarcaTipo>(yaAlmuerzo ? (yaBreak ? "otro" : "break") : "almuerzo");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [nota, setNota] = useState("");
  const [casoId, setCasoId] = useState<number | null>(null);
  const intervalo = tipo === "break" || tipo === "almuerzo" || tipo === "visita" || tipo === "otro";
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
            void onAgregar({ slug, tipo, hora: desde, horaFin: intervalo ? hasta : "", nota, casoId }).then((ok) => {
              if (!ok) return;
              setDesde("");
              setHasta("");
              setNota("");
              setAbierto(false);
            });
          }}
        >
          <select value={tipo} onChange={(e) => setTipo(e.target.value as MarcaTipo)} className="h-11 rounded-2xl border border-line px-3 text-sm">
            <option value="ingreso">Llegó</option>
            {yaBreak ? null : <option value="break">Break · solo uno</option>}
            {yaAlmuerzo ? null : <option value="almuerzo">Almuerzo · solo uno</option>}
            <option value="visita">Con un cliente</option>
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
          {tipo === "otro" ? (
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="A dónde salió" className="h-11 rounded-2xl border border-line px-3 text-sm" />
          ) : null}
          {tipo === "visita" && procesos.length > 0 ? (
            <select value={casoId ?? ""} onChange={(e) => setCasoId(e.target.value ? Number(e.target.value) : null)} className="h-11 rounded-2xl border border-line px-3 text-sm">
              <option value="">Sin proceso</option>
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
  if (estado === "adentro" && persona.salida && hora > persona.salida) return `Adentro · ya pasó su salida de las ${persona.salida}`;
  if ((estado === "break" || estado === "almuerzo") && desde) {
    const minutos = minutosEntre(marca?.hora || desde, hora);
    const cupo = CUPO_MINUTOS[estado];
    if (minutos > cupo) return `${etiquetaEstado(estado)} · se pasó ${minutos - cupo} min`;
  }
  return "";
}
