import { useEffect, useRef, useState } from "react";
import type { CampoContrato } from "@/lib/gerencia";

const FUENTES = [
  ["helvetica", "Helvetica"],
  ["helvetica-bold", "Helvetica negrita"],
  ["times", "Times"],
  ["courier", "Courier"],
] as const;

export function EditorContrato({
  pdf,
  campos,
  onChange,
}: {
  pdf: string;
  campos: CampoContrato[];
  onChange: (campos: CampoContrato[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pagina, setPagina] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [alto, setAlto] = useState(842);
  const [escala, setEscala] = useState(1);
  const [error, setError] = useState("");
  const [activo, setActivo] = useState(campos[0]?.campo ?? "");

  useEffect(() => {
    let cancelado = false;
    setError("");
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const binario = Uint8Array.from(atob(pdf), (letra) => letra.charCodeAt(0));
        const doc = await pdfjs.getDocument({ data: binario }).promise;
        if (cancelado) return;
        setPaginas(doc.numPages);
        const hoja = await doc.getPage(Math.min(pagina, doc.numPages - 1) + 1);
        const vista = hoja.getViewport({ scale: 1.15 });
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        canvas.width = vista.width;
        canvas.height = vista.height;
        await hoja.render({ canvasContext: ctx, viewport: vista }).promise;
        if (cancelado) return;
        setAlto(hoja.view[3] - hoja.view[1]);
        setEscala(vista.width / (hoja.view[2] - hoja.view[0]));
      } catch (err) {
        if (!cancelado) setError(err instanceof Error ? err.message : "No pude pintar el contrato");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [pdf, pagina]);

  function elegir(campo: string, paginaCampo: number) {
    setActivo(campo);
    setPagina(paginaCampo);
  }

  const elegido = campos.find((campo) => campo.campo === activo);

  return (
    <div className="grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="grid content-start gap-2">
        <p className="text-sm text-ink-soft">Arrastra la casilla sobre el PDF. El tamaño es la letra. Guarda al final.</p>
        <div className="flex gap-2">
          <button type="button" className="h-9 rounded-xl border border-line px-2 text-sm" onClick={() => setPagina((n) => Math.max(0, n - 1))}>
            Anterior
          </button>
          <button type="button" className="h-9 rounded-xl border border-line px-2 text-sm" onClick={() => setPagina((n) => Math.min(paginas - 1, n + 1))}>
            Siguiente
          </button>
          <span className="self-center text-xs text-ink-soft">Página {pagina + 1} de {paginas}</span>
        </div>
        {campos.map((campo) => (
          <button
            key={campo.campo}
            type="button"
            onClick={() => elegir(campo.campo, campo.pagina)}
            className={"h-10 rounded-xl border px-3 text-left text-sm font-semibold " + (activo === campo.campo ? "border-navy bg-navy text-paper" : "border-line")}
          >
            {campo.campo}
          </button>
        ))}
        {elegido ? (
          <label className="grid gap-1 text-sm">
            Tipografía
            <select
              value={elegido.fuente || "helvetica"}
              onChange={(event) => onChange(campos.map((item) => (item.campo === elegido.campo ? { ...item, fuente: event.target.value } : item)))}
              className="h-10 rounded-xl border border-line px-2"
            >
              {FUENTES.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
        ) : null}
        {elegido ? (
          <label className="grid gap-1 text-sm">
            Tamaño de la letra: {elegido.size}
            <input
              type="range"
              min={6}
              max={16}
              value={elegido.size}
              onChange={(event) => onChange(campos.map((item) => (item.campo === elegido.campo ? { ...item, size: Number(event.target.value) } : item)))}
            />
          </label>
        ) : null}
      </div>
      <div className="overflow-auto rounded-2xl border border-line bg-paper p-2">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="relative inline-block">
          <canvas ref={canvasRef} className="block max-w-full" />
          {campos
            .filter((campo) => campo.pagina === pagina)
            .map((campo) => {
              const altoCaja = campo.size * 1.7;
              return (
                <button
                  key={campo.campo}
                  type="button"
                  onPointerDown={(event) => {
                    setActivo(campo.campo);
                    const origen = { x: event.clientX, y: event.clientY, pdfX: campo.x, pdfY: campo.y };
                    const moverPuntero = (move: PointerEvent) => {
                      const dx = (move.clientX - origen.x) / escala;
                      const dy = (move.clientY - origen.y) / escala;
                      onChange(
                        campos.map((item) =>
                          item.campo === campo.campo ? { ...item, x: Math.round(origen.pdfX + dx), y: Math.round(origen.pdfY - dy), pagina } : item,
                        ),
                      );
                    };
                    const soltar = () => {
                      window.removeEventListener("pointermove", moverPuntero);
                      window.removeEventListener("pointerup", soltar);
                    };
                    window.addEventListener("pointermove", moverPuntero);
                    window.addEventListener("pointerup", soltar);
                  }}
                  className={
                    "absolute cursor-move rounded-md border border-navy bg-lime/70 px-1 text-left text-[10px] font-semibold leading-none text-navy " +
                    (activo === campo.campo ? "ring-2 ring-navy" : "")
                  }
                  style={{
                    left: campo.x * escala,
                    top: (alto - campo.y - altoCaja) * escala,
                    minWidth: 72,
                    height: altoCaja * escala,
                  }}
                >
                  {campo.campo}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
