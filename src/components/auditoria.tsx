import { useEffect, useState } from "react";
import { listAuditoria } from "@/lib/auditoria.functions";
import { certificadoProceso } from "@/lib/certificado.functions";
import { cuando, ENTIDADES, type EventoAuditoria } from "@/lib/auditoria";

export function AuditoriaVista({ veClaves }: { veClaves: boolean }) {
  const [eventos, setEventos] = useState<EventoAuditoria[]>([]);
  const [entidad, setEntidad] = useState("");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [bajando, setBajando] = useState<number | null>(null);
  const filtros = ENTIDADES.filter((item) => veClaves || item.id !== "clave");

  async function cargar(antes = 0, reemplaza = true) {
    setCargando(true);
    setError("");
    try {
      const rows = await listAuditoria({ data: { antes, entidad, q } });
      setEventos((actual) => (reemplaza ? rows : [...actual, ...rows]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude cargar el registro");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar(0, true);
  }, [entidad]);

  return (
    <section>
      <h1 className="text-lg font-semibold">Registro</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Cada cambio queda con quién lo hizo, a qué hora y qué decía antes. Una letra, un estado, una clave, una marca. Nada se borra de aquí.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {filtros.map((item) => (
          <button
            key={item.id || "todo"}
            type="button"
            onClick={() => setEntidad(item.id)}
            className={"h-9 rounded-full border px-3 text-sm font-semibold " + (entidad === item.id ? "border-navy bg-navy text-paper" : "border-line bg-card")}
          >
            {item.label}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void cargar(0, true);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar placa, persona o palabra"
          className="h-11 min-w-0 flex-1 rounded-2xl border border-line px-3"
        />
        <button type="submit" className="h-11 rounded-2xl bg-navy px-4 text-sm font-semibold text-paper">
          Buscar
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <ul className="mt-4 grid gap-2">
        {eventos.map((evento) => (
          <li key={evento.id} className="rounded-card border border-line bg-card px-4 py-3">
            <button type="button" onClick={() => setAbierto(abierto === evento.id ? null : evento.id)} className="w-full text-left">
              <p className="text-xs font-semibold text-ink-soft">
                {cuando(evento.cuando)} · {evento.actor}
                {evento.etiqueta ? ` · ${evento.etiqueta}` : ""}
              </p>
              <p className="mt-1 text-sm">{evento.detalle}</p>
            </button>
            {evento.entidad === "proceso" || evento.entidad === "poliza" || evento.entidad === "chat" || evento.entidad === "contrato" ? (
              <button
                type="button"
                disabled={bajando === Number(evento.entidadId)}
                onClick={() => {
                  const id = Number(evento.entidadId);
                  if (!id) return;
                  setBajando(id);
                  void certificadoProceso({ data: id })
                    .then((file) => {
                      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
                      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = file.filename;
                      a.click();
                      URL.revokeObjectURL(url);
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : "No pude armar el certificado"))
                    .finally(() => setBajando(null));
                }}
                className="mt-2 h-8 rounded-full border border-line px-3 text-xs font-semibold disabled:opacity-60"
              >
                {bajando === Number(evento.entidadId) ? "Armando…" : "Certificado del proceso"}
              </button>
            ) : null}
            {abierto === evento.id && (evento.antes || evento.despues) ? (
              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                <p className="rounded-xl bg-paper p-3 whitespace-pre-wrap">
                  <span className="font-semibold">Antes</span>
                  {"\n"}
                  {evento.antes || "—"}
                </p>
                <p className="rounded-xl bg-paper p-3 whitespace-pre-wrap">
                  <span className="font-semibold">Después</span>
                  {"\n"}
                  {evento.despues || "—"}
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {eventos.length === 0 && !cargando ? <p className="mt-4 text-sm text-ink-soft">Todavía no hay movimientos con ese filtro.</p> : null}
      {eventos.length > 0 ? (
        <button
          type="button"
          disabled={cargando}
          onClick={() => void cargar(eventos[eventos.length - 1]?.id ?? 0, false)}
          className="mt-3 h-10 rounded-full border border-line px-4 text-sm font-semibold disabled:opacity-60"
        >
          {cargando ? "Cargando…" : "Ver más atrás"}
        </button>
      ) : null}
    </section>
  );
}
