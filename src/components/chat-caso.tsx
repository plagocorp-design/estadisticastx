import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { enviarMensaje, listMensajes, type Mensaje } from "@/lib/chat.functions";
import { etiquetaRol } from "@/lib/team.public";

const PREGUNTAS = [
  "¿Ya tienes la cédula?",
  "¿Confirmó la plata de la póliza?",
  "¿Cuándo firma?",
  "¿Qué falta para operativa?",
  "¿Me confirmas placa y propietario?",
];

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
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes.length]);

  async function mandar(body: string) {
    const limpio = body.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    setError("");
    try {
      await enviarMensaje({ data: { casoId, body: limpio } });
      setTexto("");
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

  return (
    <section className="rounded-card border border-line bg-paper p-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Chat del proceso</h3>
        <p className="text-xs text-ink-soft">Asesor, coordinación y el área que tenga el proceso</p>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {puedePreguntar
          ? "Pregúntale aquí al asesor. Le queda marcado hasta que lo abra."
          : soyDueno
            ? "Si coordinación te pregunta por este carro, responde aquí."
            : "Lo que se pregunte de este proceso queda guardado aquí."}
      </p>
      <div ref={lista} className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
        {!listo ? <p className="text-sm text-ink-soft">Cargando chat…</p> : null}
        {listo && mensajes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-card px-3 py-4 text-sm text-ink-soft">
            Todavía no hay mensajes en este proceso.
          </p>
        ) : null}
        {mensajes.map((m) => {
          const mio = m.authorId === yo;
          return (
            <div key={m.id} className={mio ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm " +
                  (mio ? "bg-navy text-paper" : "border border-line bg-card text-ink")
                }
              >
                <p className={"text-xs " + (mio ? "text-lime" : "text-ink-soft")}>
                  {mio ? "Tú" : m.authorName} · {etiquetaRol(m.authorRole)} · {m.hora}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
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
      <form onSubmit={enviar} className="mt-3 flex items-end gap-2">
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
          placeholder={puedePreguntar ? "Pregúntale al asesor…" : "Escribe la respuesta…"}
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
      </form>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </section>
  );
}
