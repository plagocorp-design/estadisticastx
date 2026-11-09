import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { enviarMensaje, listGenteChat, listMensajes, type Mensaje, type PersonaChat } from "@/lib/chat.functions";
import { etiquetaRol } from "@/lib/team.public";

const PREGUNTAS = [
  "¿Ya tienes la cédula?",
  "¿Confirmó la plata de la póliza?",
  "¿Cuándo firma?",
  "¿Qué falta para operativa?",
  "¿Me confirmas placa y propietario?",
];

function cuerpoDe(body: string) {
  const partes = body.split(/(@[a-z0-9]+)/gi);
  return partes.map((parte, i) =>
    parte.startsWith("@") ? <b key={i}>{parte}</b> : <span key={i}>{parte}</span>,
  );
}

function fallo(err: unknown) {
  return err instanceof Error ? err.message : "No se pudo enviar";
}

export function ChatCaso({
  casoId,
  duenoId,
  yo,
  delEquipo,
  onCambio,
}: {
  casoId: number;
  duenoId: string;
  yo: string;
  delEquipo: boolean;
  onCambio: () => void;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [privado, setPrivado] = useState(false);
  const [para, setPara] = useState<PersonaChat | null>(null);
  const [llamar, setLlamar] = useState(false);
  const [ver, setVer] = useState<"todo" | "privados">("todo");
  const [gente, setGente] = useState<PersonaChat[]>([]);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const alCambiar = useRef(onCambio);
  alCambiar.current = onCambio;
  const soyDueno = yo === duenoId;
  const puedePreguntar = delEquipo && !soyDueno;

  async function cargar() {
    const rows = await listMensajes({ data: casoId });
    setMensajes(rows);
    setListo(true);
    alCambiar.current();
  }

  useEffect(() => {
    let vivo = true;
    setListo(false);
    setMensajes([]);
    listMensajes({ data: casoId })
      .then((rows) => {
        if (!vivo) return;
        setMensajes(rows);
        setListo(true);
        alCambiar.current();
      })
      .catch((err) => {
        if (vivo) setError(fallo(err));
      });
    const id = window.setInterval(() => {
      listMensajes({ data: casoId })
        .then((rows) => {
          if (!vivo) return;
          setMensajes(rows);
          alCambiar.current();
        })
        .catch(() => {});
    }, 8000);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, [casoId]);

  useEffect(() => {
    listGenteChat().then(setGente).catch(() => {});
  }, []);

  const mencion = texto.match(/(?:^|\s)@([a-z0-9]*)$/i)?.[1] ?? null;
  const busqueda = (mencion ?? "").toLowerCase();
  const sugeridos = mencion === null && !llamar
    ? []
    : gente.filter((persona) => {
        if (!busqueda) return true;
        const nombre = persona.name.toLowerCase();
        return persona.slug.includes(busqueda) || nombre.includes(busqueda);
      }).slice(0, 8);

  function elegir(persona: PersonaChat) {
    setPara(persona);
    setLlamar(false);
    setTexto((prev) => {
      const conArroba = /(?:^|\s)@[a-z0-9]*$/i.test(prev);
      const base = conArroba ? prev.replace(/(?:^|\s)@[a-z0-9]*$/i, (trozo) => trozo.replace(/@[a-z0-9]*$/i, "")) : prev;
      const espacio = base && !base.endsWith(" ") ? " " : "";
      return `${base}${espacio}@${persona.slug} `;
    });
  }

  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes.length]);

  async function mandar(body: string) {
    const limpio = body.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    setError("");
    try {
      const etiqueta = para ?? gente.find((persona) => limpio.toLowerCase().includes(`@${persona.slug}`)) ?? null;
      await enviarMensaje({ data: { casoId, body: limpio, privado, paraSlug: etiqueta?.slug ?? "" } });
      setTexto("");
      setPrivado(false);
      setPara(null);
      await cargar();
    } catch (err) {
      setError(fallo(err));
    } finally {
      setEnviando(false);
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    void mandar(texto);
  }

  const visibles = ver === "privados" ? mensajes.filter((m) => m.privado) : mensajes;
  const llamado = para ?? gente.find((persona) => texto.toLowerCase().includes(`@${persona.slug}`)) ?? null;

  return (
    <section className="rounded-card border border-line bg-paper p-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Chat del proceso</h3>
        <p className="text-xs text-ink-soft">Asesor, coordinación y el área que tenga el proceso</p>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Escribe @ o toca Llamar para etiquetar a alguien de tu ciudad. Le llega como urgente. Si lo marcas privado, solo lo ven tú y esa persona.
      </p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => setVer("todo")} className={"h-8 rounded-full px-3 text-xs font-semibold " + (ver === "todo" ? "bg-navy text-paper" : "border border-line")}>Del proceso</button>
        <button type="button" onClick={() => setVer("privados")} className={"h-8 rounded-full px-3 text-xs font-semibold " + (ver === "privados" ? "bg-navy text-paper" : "border border-line")}>Privados</button>
      </div>
      <div ref={lista} className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
        {!listo ? <p className="text-sm text-ink-soft">Cargando chat…</p> : null}
        {listo && visibles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-card px-3 py-4 text-sm text-ink-soft">
            {ver === "privados" ? "No hay privados en este proceso." : "Todavía no hay mensajes en este proceso."}
          </p>
        ) : null}
        {visibles.map((m) => {
          const mio = m.authorId === yo;
          return (
            <div key={m.id} className={mio ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm " +
                  (m.paraMi && m.urgente ? "border-2 border-danger bg-card text-ink" : mio ? "bg-navy text-paper" : "border border-line bg-card text-ink")
                }
              >
                <p className={"text-xs " + (mio && !m.paraMi ? "text-lime" : "text-ink-soft")}>
                  {mio ? "Tú" : m.authorName} · {etiquetaRol(m.authorRole)} · {m.hora}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap">{cuerpoDe(m.body)}</p>
                {m.urgente || m.privado ? (
                  <p className={"mt-1 text-xs font-semibold " + (mio && !m.paraMi ? "text-lime" : "text-danger")}>
                    {m.paraMi ? "Te llamaron" : m.privado ? `Privado${m.paraNombre ? ` · ${m.paraNombre.split(" ")[0]}` : ""}` : `Urgente para ${m.paraNombre.split(" ")[0] || "alguien"}`}
                    {m.paraMi && m.privado ? " · privado" : ""}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {puedePreguntar ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {PREGUNTAS.map((pregunta) => (
            <button
              key={pregunta}
              type="button"
              disabled={enviando}
              onClick={() => void mandar(pregunta)}
              className="h-11 shrink-0 rounded-full border border-line bg-card px-3 text-sm disabled:opacity-60"
            >
              {pregunta}
            </button>
          ))}
        </div>
      ) : null}
      <form onSubmit={enviar} className="mt-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setLlamar((v) => !v)} className={"h-8 rounded-full px-3 text-xs font-semibold " + (llamar ? "bg-navy text-paper" : "border border-line")}>
            {llamar ? "Cerrar" : "Llamar"}
          </button>
          {llamado ? (
            <span className="rounded-full bg-danger px-3 py-1 text-xs font-semibold text-paper">
              Urgente para {llamado.name.split(" ")[0]}
              <button type="button" onClick={() => setPara(null)} className="ml-2">Quitar</button>
            </span>
          ) : (
            <span className="text-xs text-ink-soft">Gente de tu ciudad. Ejemplo: @asiyade</span>
          )}
        </div>
        {sugeridos.length > 0 ? (
          <ul className="mb-2 overflow-hidden rounded-2xl border border-line bg-card">
            {sugeridos.map((persona) => (
              <li key={persona.slug}>
                <button type="button" onClick={() => elegir(persona)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-paper">
                  <span><b>@{persona.slug}</b> · {persona.name}</span>
                  <span className="text-xs text-ink-soft">{etiquetaRol(persona.role)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor={`chat-${casoId}`}>
          Mensaje
        </label>
        <textarea
          id={`chat-${casoId}`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void mandar(texto);
            }
          }}
          rows={2}
          maxLength={500}
          placeholder={privado ? "Privado. Elige a quién o escribe @…" : "Escribe… @ o Llamar para pedir urgente"}
          className="min-h-11 flex-1 resize-none rounded-2xl border border-line bg-card px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={enviando || !texto.trim()}
          aria-label="Enviar mensaje"
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-navy text-paper disabled:opacity-60"
        >
          <Send className="size-4" />
        </button>
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={privado} onChange={(e) => setPrivado(e.target.checked)} />
          Privado del proceso. Solo lo ven tú y {llamado ? llamado.name.split(" ")[0] : "la persona del @"}.
        </label>
      </form>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </section>
  );
}
