import { useEffect, useState, type FormEvent } from "react";
import { agregarAsesor, cambiarClave, cambiarMiClave, guardarAcceso, guardarPersona, listEquipo } from "@/lib/control.functions";
import type { PersonaEquipo } from "@/lib/control";
import { AREAS_APP, PODERES_APP, SECCIONES_APP, accesoDe, accesoVacio, esBandeja, etiquetaRol, llevaProcesos, type Acceso, type Role } from "@/lib/team.public";

function textoCredencial(persona: PersonaEquipo) {
  return `Usuario: ${persona.slug}\nClave: ${persona.clave ?? ""}`;
}

async function copiarTexto(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

export function EquipoVista({ edita }: { edita: boolean }) {
  const [gente, setGente] = useState<PersonaEquipo[]>([]);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [accesoNuevo, setAccesoNuevo] = useState<Acceso>(accesoVacio());
  const [verClave, setVerClave] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [copiadas, setCopiadas] = useState(false);

  async function cargar() {
    const equipo = await listEquipo();
    setGente(equipo);
  }

  useEffect(() => {
    cargar().catch((err) => setError(err instanceof Error ? err.message : "No pude cargar el equipo"));
  }, []);

  async function guardar(persona: PersonaEquipo, cambio: Partial<PersonaEquipo>) {
    setError("");
    setAviso("");
    const next = { ...persona, ...cambio };
    try {
      await guardarPersona({
        data: {
          slug: next.slug,
          empieza: next.empieza,
          entrada: next.entrada,
          salida: next.salida,
          activo: next.activo,
        },
      });
      setAviso("Quedó guardado.");
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude guardar");
    }
  }

  async function crear(event: FormEvent) {
    event.preventDefault();
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      await agregarAsesor({ data: { nombre, usuario, clave, acceso: accesoNuevo } });
      setNombre("");
      setUsuario("");
      setClave("");
      setAccesoNuevo(accesoVacio());
      setAviso("Perfil creado. Ya puede entrar con ese usuario y esa clave, solo a lo que marcaste.");
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude crear el asesor");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarAccesoDe(slug: string, acceso: Acceso) {
    setError("");
    setAviso("");
    const propio = {
      secciones: [...acceso.secciones],
      poderes: [...acceso.poderes],
      area: acceso.area,
    };
    const persona = gente.find((item) => item.slug === slug);
    try {
      await guardarAcceso({ data: { slug, acceso: propio } });
      const nombre = persona?.name.split(" ")[0] || slug;
      setAviso(`Quedó guardado solo el acceso de ${nombre}. El tuyo y el de los demás no cambian.`);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude cambiar el acceso");
    }
  }

  async function ponerClave(slug: string, claveNueva: string) {
    setError("");
    setAviso("");
    try {
      await cambiarClave({ data: { slug, clave: claveNueva } });
      setAviso("Clave actualizada. Esa persona entra con la nueva y la anterior ya no sirve.");
      await cargar();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude cambiar la clave");
      return false;
    }
  }
  const calle = gente.filter((p) => llevaProcesos(p.role));
  const coordinacion = gente.filter((p) => p.role === "coordinadora");
  const deArea = gente.filter((p) => esBandeja(p.role));

  return (
    <section>
      <h1 className="text-lg font-semibold">Equipo</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Desde cuándo trabaja cada asesor, a qué hora entra y sale, y qué rol tiene. Coordinación no tiene horario.
        Un día suelto se marca en Meta. Si ese día no trabaja, no le pedimos bitácora ni entrada.
        Los de Vía Seguros, operativa y servicio al cliente no están en esta lista de arriba: siguen creados y salen abajo, en Otras áreas.
      </p>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {aviso ? <p className="mt-3 text-sm font-semibold text-navy">{aviso}</p> : null}
      {edita ? (
        <button
          type="button"
          onClick={() => {
            const texto = gente.filter((persona) => persona.clave).map((persona) => `${persona.name}\n${textoCredencial(persona)}`).join("\n\n");
            void copiarTexto(texto).then(() => {
              setCopiadas(true);
              window.setTimeout(() => setCopiadas(false), 1500);
            });
          }}
          className="mt-3 h-10 rounded-full border border-line px-4 text-sm font-semibold"
        >
          {copiadas ? "Copiadas" : "Copiar todas las credenciales"}
        </button>
      ) : null}
      <h2 className="mt-4 text-sm font-semibold">Asesores</h2>
      <ul className="mt-2 grid gap-3">
        {calle.map((persona) => (
          <PersonaCard key={persona.slug} persona={persona} edita={edita} guardar={guardar} onAcceso={(acceso) => void guardarAccesoDe(persona.slug, acceso)} onClave={ponerClave} />
        ))}
      </ul>
      <h2 className="mt-5 text-sm font-semibold">Coordinación</h2>
      <ul className="mt-2 grid gap-3">
        {coordinacion.map((persona) => (
          <PersonaCard key={persona.slug} persona={persona} edita={edita} guardar={guardar} onAcceso={(acceso) => void guardarAccesoDe(persona.slug, acceso)} onClave={ponerClave} />
        ))}
      </ul>
      <h2 className="mt-5 text-sm font-semibold">Otras áreas</h2>
      <ul className="mt-2 grid gap-3">
        {deArea.map((persona) => (
          <PersonaCard key={persona.slug} persona={persona} edita={edita} guardar={guardar} onAcceso={(acceso) => void guardarAccesoDe(persona.slug, acceso)} onClave={ponerClave} />
        ))}
        {deArea.length === 0 ? <li className="text-sm text-ink-soft">Todavía no hay usuarios de Vía Seguros, operativa o servicio al cliente.</li> : null}
      </ul>
      {edita ? (
        <form onSubmit={(e) => void crear(e)} className="mt-4 max-w-xl rounded-card border border-line bg-card p-4">
          <p className="font-semibold">Crear perfil</p>
          <p className="mt-1 text-sm text-ink-soft">Elige qué puede hacer y a qué secciones entra. Entra con el usuario y la clave de aquí.</p>
          <div className="mt-3 grid gap-2">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className="h-11 rounded-2xl border border-line px-3" />
            <input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Usuario, sin espacios" className="h-11 rounded-2xl border border-line px-3" />
            <label className="relative block">
              <input
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="Clave inicial, mínimo 8"
                type={verClave ? "text" : "password"}
                autoComplete="new-password"
                className="h-11 w-full rounded-2xl border border-line px-3 pr-16"
              />
              <button type="button" onClick={() => setVerClave((v) => !v)} className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-ink-soft">
                {verClave ? "Ocultar" : "Ver"}
              </button>
            </label>
            <SelectorAcceso value={accesoNuevo} onChange={setAccesoNuevo} />
          </div>
          <button type="submit" disabled={guardando} className="mt-3 h-11 rounded-2xl bg-navy px-4 text-sm font-semibold text-paper disabled:opacity-60">
            {guardando ? "Creando…" : "Crear perfil"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function PersonaCard({
  persona,
  edita,
  guardar,
  onAcceso,
  onClave,
}: {
  persona: PersonaEquipo;
  edita: boolean;
  guardar: (persona: PersonaEquipo, cambio: Partial<PersonaEquipo>) => Promise<void>;
  onAcceso: (acceso: Acceso) => void;
  onClave: (slug: string, clave: string) => Promise<boolean>;
}) {
  const horario = llevaProcesos(persona.role);
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const [guardandoClave, setGuardandoClave] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [acceso, setAcceso] = useState<Acceso>(() => clonarAcceso(accesoDe(persona.role, persona.acceso)));
  useEffect(() => {
    setAcceso(clonarAcceso(accesoDe(persona.role, persona.acceso)));
  }, [persona.role, persona.acceso, persona.slug]);
  return (
    <li className={"rounded-card border border-line bg-card p-4 " + (persona.activo ? "" : "opacity-70")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{persona.name}</p>
        {edita && persona.slug !== "david" ? (
          <label className="text-sm font-medium">
            Rol
            <select
              value={ROLES.some((item) => item.id === persona.role) ? persona.role : "asesor"}
              onChange={(e) => {
                const next = accesoPorRol(e.target.value as Role, acceso);
                setAcceso(next);
                onAcceso(next);
              }}
              className="ml-2 h-10 rounded-2xl border border-line bg-card px-3"
            >
              {ROLES.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm font-medium text-ink-soft">{etiquetaRol(persona.role)}</p>
        )}
      </div>
      {edita ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <p>
            Usuario: <span className="font-semibold">{persona.slug}</span>
            {" · "}
            Clave: <span className="font-semibold">{persona.clave || "todavía no queda registrada"}</span>
          </p>
          <button
            type="button"
            disabled={!persona.clave}
            onClick={() => {
              void copiarTexto(textoCredencial(persona)).then(() => {
                setCopiado(true);
                window.setTimeout(() => setCopiado(false), 1500);
              });
            }}
            className="h-8 rounded-full border border-line px-3 text-xs font-semibold disabled:opacity-50"
          >
            {copiado ? "Copiado" : "Copiar credenciales"}
          </button>
        </div>
      ) : null}
      {edita ? (
        <div className="mt-3">
          <SelectorAcceso value={acceso} onChange={setAcceso} bloqueado={persona.slug === "david" || persona.role === "gerencia"} />
          {persona.slug === "david" ? (
            <p className="mt-2 text-xs text-ink-soft">El asesor líder entra a todo. Estas casillas no se pueden quitar y no cambian cuando editas a otra persona.</p>
          ) : (
            <button type="button" onClick={() => onAcceso(acceso)} className="mt-2 h-10 rounded-2xl bg-navy px-4 text-sm font-semibold text-paper">
              Guardar acceso de {persona.name.split(" ")[0]}
            </button>
          )}
        </div>
      ) : null}
      {horario ? (
        <>
          <p className={"mt-1 text-sm font-semibold " + (persona.activo && persona.trabajaHoy ? "text-navy" : "text-ink-soft")}>
            {!persona.activo ? "Inactivo" : persona.trabajaHoy ? "Hoy trabaja" : "Hoy libre"}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="text-sm font-medium">
              Empezó
              <input
                type="date"
                defaultValue={persona.empieza}
                key={`${persona.slug}-empieza-${persona.empieza}`}
                onBlur={(e) => {
                  if (e.target.value && e.target.value !== persona.empieza) void guardar(persona, { empieza: e.target.value });
                }}
                className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
              />
            </label>
            <label className="text-sm font-medium">
              Entra
              <input
                type="time"
                defaultValue={persona.entrada}
                key={`${persona.slug}-entrada-${persona.entrada}`}
                onBlur={(e) => {
                  if (e.target.value && e.target.value !== persona.entrada) void guardar(persona, { entrada: e.target.value });
                }}
                className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
              />
            </label>
            <label className="text-sm font-medium">
              Sale
              <input
                type="time"
                defaultValue={persona.salida}
                key={`${persona.slug}-salida-${persona.salida}`}
                onBlur={(e) => {
                  if (e.target.value && e.target.value !== persona.salida) void guardar(persona, { salida: e.target.value });
                }}
                className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
              />
            </label>
          </div>
          {edita && persona.slug !== "david" ? (
            <button
              type="button"
              onClick={() => void guardar(persona, { activo: !persona.activo })}
              className="mt-3 h-10 rounded-full border border-line px-4 text-sm font-semibold"
            >
              {persona.activo ? "Desactivar" : "Volver a activar"}
            </button>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-sm text-ink-soft">Sin horario. Ve el equipo, no marca entrada.</p>
      )}
      {edita ? (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setGuardandoClave(true);
            void onClave(persona.slug, clave).then((ok) => {
              if (ok) {
                setClave("");
                setVer(false);
              }
              setGuardandoClave(false);
            });
          }}
        >
          <label className="relative min-w-48 flex-1">
            <input
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              placeholder="Nueva clave"
              type={ver ? "text" : "password"}
              autoComplete="new-password"
              className="h-11 w-full rounded-2xl border border-line px-3 pr-16"
            />
            <button type="button" onClick={() => setVer((v) => !v)} className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-ink-soft">
              {ver ? "Ocultar" : "Ver"}
            </button>
          </label>
          <button type="submit" disabled={guardandoClave || clave.trim().length < 8} className="h-11 rounded-2xl border border-line px-4 text-sm font-semibold disabled:opacity-60">
            {guardandoClave ? "Cambiando…" : "Cambiar clave"}
          </button>
        </form>
      ) : null}
    </li>
  );
}

const ROLES: { id: Role; label: string }[] = [
  { id: "asesor", label: "Asesor" },
  { id: "lider", label: "Asesor líder" },
  { id: "coordinadora", label: "Coordinación" },
  { id: "via_seguros", label: "Vía Seguros" },
  { id: "operativa", label: "Operativa" },
  { id: "servicio", label: "Servicio al cliente" },
];

function clonarAcceso(acceso: Acceso): Acceso {
  return { secciones: [...acceso.secciones], poderes: [...acceso.poderes], area: acceso.area };
}

function accesoPorRol(rol: Role, actual: Acceso): Acceso {
  const base = clonarAcceso(actual);
  if (rol === "lider") return { secciones: SECCIONES_APP.map((item) => item.id), poderes: ["propios", "ver_equipo", "configurar"], area: "" };
  if (rol === "coordinadora") {
    const secciones = [...new Set([...base.secciones, "equipo", "auditoria"])];
    return { secciones, poderes: ["ver_equipo"], area: "" };
  }
  if (rol === "via_seguros" || rol === "operativa" || rol === "servicio") return { secciones: ["procesos"], poderes: [], area: rol };
  const secciones = base.secciones.filter((id) => id !== "equipo" && id !== "auditoria");
  return { secciones: secciones.length > 0 ? secciones : [...accesoVacio().secciones], poderes: ["propios"], area: "" };
}

export function SelectorAcceso({ value, onChange, bloqueado }: { value: Acceso; onChange: (acceso: Acceso) => void; bloqueado?: boolean }) {
  function poner(next: Acceso) {
    const copia = clonarAcceso(next);
    if (bloqueado) {
      onChange({ ...copia, poderes: ["propios", "ver_equipo", "configurar"], area: "" });
      return;
    }
    onChange(copia);
  }
  function seccion(id: string, on: boolean) {
    const secciones = on ? [...new Set([...value.secciones, id])] : value.secciones.filter((item) => item !== id);
    const poderes = id === "equipo" || id === "auditoria" ? (on ? [...new Set([...value.poderes, "ver_equipo"])] : value.poderes) : value.poderes;
    poner({ ...value, secciones, poderes });
  }
  function poder(id: string, on: boolean) {
    let poderes = on ? [...new Set([...value.poderes, id])] : value.poderes.filter((item) => item !== id);
    if (id === "configurar" && on) poderes = [...new Set([...poderes, "ver_equipo"])];
    if (id === "ver_equipo" && !on) poderes = poderes.filter((item) => item !== "configurar");
    let secciones = value.secciones;
    if (poderes.includes("ver_equipo")) secciones = [...new Set([...secciones, "equipo", "auditoria"])];
    poner({ ...value, poderes, secciones, area: poderes.includes("ver_equipo") || poderes.includes("configurar") ? "" : value.area });
  }
  return (
    <div className="grid gap-3 rounded-2xl border border-line p-3">
      <div>
        <p className="text-sm font-semibold">Qué puede hacer</p>
        <div className="mt-2 grid gap-1">
          {PODERES_APP.map((item) => (
            <label key={item.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" disabled={bloqueado} checked={value.poderes.includes(item.id)} onChange={(e) => poder(item.id, e.target.checked)} />
              {item.label}
            </label>
          ))}
        </div>
      </div>
      <label className="text-sm font-semibold">
        Área
        <select
          value={value.area}
          disabled={bloqueado}
          onChange={(e) => poner({ ...value, area: e.target.value, poderes: e.target.value ? value.poderes.filter((id) => id === "propios") : value.poderes })}
          className="mt-1 h-11 w-full rounded-2xl border border-line px-3 font-normal"
        >
          {AREAS_APP.map((item) => (
            <option key={item.id || "ninguna"} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
      <div>
        <p className="text-sm font-semibold">Secciones a las que entra</p>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {SECCIONES_APP.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm font-normal">
              <input type="checkbox" checked={value.secciones.includes(item.id)} disabled={bloqueado} onChange={(e) => seccion(item.id, e.target.checked)} />
              {item.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MiClave({ onClose }: { onClose: () => void }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repite, setRepite] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar(event: FormEvent) {
    event.preventDefault();
    setError("");
    setAviso("");
    if (nueva.trim() !== repite.trim()) {
      setError("La clave nueva no coincide");
      return;
    }
    setGuardando(true);
    try {
      await cambiarMiClave({ data: { actual, nueva } });
      setActual("");
      setNueva("");
      setRepite("");
      setVer(false);
      setAviso("Listo. Entra con la clave nueva.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude cambiar la clave");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 sm:items-center" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => void guardar(e)} className="w-full max-w-md rounded-t-3xl bg-card p-5 sm:rounded-card">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold">Mi clave</p>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-ink-soft">
            Cerrar
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-soft">Escribe la clave con la que entras ahora y la que quieres usar. Mínimo 8 caracteres.</p>
        <div className="mt-3 grid gap-2">
          <input value={actual} onChange={(e) => setActual(e.target.value)} placeholder="Clave actual" type={ver ? "text" : "password"} autoComplete="current-password" className="h-11 rounded-2xl border border-line px-3" />
          <input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Clave nueva" type={ver ? "text" : "password"} autoComplete="new-password" className="h-11 rounded-2xl border border-line px-3" />
          <input value={repite} onChange={(e) => setRepite(e.target.value)} placeholder="Repite la clave nueva" type={ver ? "text" : "password"} autoComplete="new-password" className="h-11 rounded-2xl border border-line px-3" />
        </div>
        <button type="button" onClick={() => setVer((v) => !v)} className="mt-2 text-xs font-semibold text-ink-soft">
          {ver ? "Ocultar" : "Ver"}
        </button>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        {aviso ? <p className="mt-3 text-sm font-semibold text-navy">{aviso}</p> : null}
        <button type="submit" disabled={guardando} className="mt-4 h-11 w-full rounded-2xl bg-navy text-sm font-semibold text-paper disabled:opacity-60">
          {guardando ? "Guardando…" : "Cambiar mi clave"}
        </button>
      </form>
    </div>
  );
}
