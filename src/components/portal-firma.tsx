import { useEffect, useRef, useState, type PointerEvent } from "react";
import { firmarPortal, verPortal } from "@/lib/firma.functions";

function Lienzo({ onChange }: { onChange: (png: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);

  function punto(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = ref.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function empezar(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    dibujando.current = true;
    canvas.setPointerCapture(e.pointerId);
    const p = punto(e);
    ctx.strokeStyle = "#102033";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function mover(e: PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const p = punto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function soltar() {
    if (!dibujando.current) return;
    dibujando.current = false;
    const canvas = ref.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  }

  function limpiar() {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div>
      <canvas
        ref={ref}
        width={640}
        height={220}
        className="h-40 w-full touch-none rounded-2xl border border-line bg-white"
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerLeave={soltar}
      />
      <button type="button" onClick={limpiar} className="mt-2 text-sm font-semibold text-ink-soft">
        Borrar firma
      </button>
    </div>
  );
}

export function PortalFirma({ token }: { token: string }) {
  const [pdf, setPdf] = useState("");
  const [nombre, setNombre] = useState("");
  const [ya, setYa] = useState(false);
  const [otro, setOtro] = useState("");
  const [firma, setFirma] = useState("");
  const [error, setError] = useState("");
  const [listo, setListo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const sigue = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("sigue") ?? "";

  useEffect(() => {
    verPortal({ data: token })
      .then((portal) => {
        setPdf(portal.pdf);
        setNombre(portal.nombre);
        setYa(portal.yaFirmo);
        setOtro(portal.otro);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No pude abrir el contrato"));
  }, [token]);

  async function firmar() {
    setError("");
    setGuardando(true);
    try {
      const result = await firmarPortal({ data: { token, firma } });
      const portal = await verPortal({ data: token });
      setPdf(portal.pdf);
      setYa(true);
      setListo(result.completo ? "Listo. La firma quedó en el contrato. Ya firmaron todos." : "Listo. Tu firma quedó en el contrato.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude guardar la firma");
    } finally {
      setGuardando(false);
    }
  }

  if (error && !pdf) return <p className="grid min-h-screen place-items-center px-6 text-center text-ink-soft">{error}</p>;
  if (!pdf) return <p className="grid min-h-screen place-items-center text-ink-soft">Abriendo el contrato…</p>;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8">
      <p className="text-sm font-semibold text-navy">Radio Taxi Aeropuerto · Vincula Libre</p>
      <h1 className="mt-1 text-2xl font-semibold">Contrato de vinculación</h1>
      <p className="mt-2 text-sm text-ink-soft">
        {nombre}, este es el contrato de Radio Taxi. Léelo y firma abajo. La firma queda en el mismo PDF.
        {otro ? ` El otro propietario ${otro}.` : ""}
      </p>
      {pdf ? (
        <iframe title="Contrato de vinculación" src={`data:application/pdf;base64,${pdf}`} className="mt-4 h-[70vh] w-full rounded-card border border-line bg-white" />
      ) : null}
      {ya ? (
        <div className="mt-6 grid gap-3">
          <p className="rounded-card border border-line bg-card p-4 font-semibold text-navy">{listo || "Este enlace ya está firmado."}</p>
          {sigue && /^[A-Za-z0-9_-]{20,80}$/.test(sigue) ? (
            <a href={`/firmar/${sigue}`} className="grid h-12 place-items-center rounded-2xl bg-navy text-sm font-semibold text-paper">
              Ahora firma el otro propietario
            </a>
          ) : null}
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-sm font-semibold">Firma de {nombre}</p>
          <div className="mt-2">
            <Lienzo onChange={setFirma} />
          </div>
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          <button
            type="button"
            disabled={guardando || firma.length < 800}
            onClick={() => void firmar()}
            className="mt-3 h-12 w-full rounded-2xl bg-navy text-sm font-semibold text-paper disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Firmar contrato"}
          </button>
        </div>
      )}
    </main>
  );
}
