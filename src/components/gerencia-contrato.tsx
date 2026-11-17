import { useEffect, useRef, useState } from "react";
import type { CampoContrato } from "@/lib/gerencia";
import { DATOS_CONTRATO } from "@/lib/gerencia";

const FUENTES = [
  ["helvetica", "Helvetica"],
  ["helvetica-bold", "Helvetica negrita"],
  ["times", "Times"],
  ["courier", "Courier"],
] as const;

function clave(texto: string) {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function etiqueta(campo: CampoContrato) {
  return campo.label || DATOS_CONTRATO.find((dato) => dato.campo === campo.campo)?.label || campo.campo;
}

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
  const camposRef = useRef(campos);
  camposRef.current = campos;
  const [pagina, setPagina] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [pdfW, setPdfW] = useState(595);
  const [pdfH, setPdfH] = useState(842);
  const [error, setError] = useState("");
  const [activo, setActivo] = useState(campos[0]?.id || campos[0]?.campo || "");
  const [nuevo, setNuevo] = useState("placa");
  const [propio, setPropio] = useState("");

  useEffect(() => {
    if (!campos.some((campo) => !campo.id)) return;
    onChange(campos.map((campo) => (campo.id ? campo : { ...campo, id: crypto.randomUUID() })));
  }, [campos, onChange]);

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
        const base = hoja.getViewport({ scale: 1 });
        const vista = hoja.getViewport({ scale: Math.min(2, 900 / base.width) });
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        canvas.width = Math.floor(vista.width);
        canvas.height = Math.floor(vista.height);
        await hoja.render({ canvasContext: ctx, viewport: vista }).promise;
        if (cancelado) return;
        setPdfW(base.width);
        setPdfH(base.height);
      } catch (err) {
        if (!cancelado) setError(err instanceof Error ? err.message : "No pude pintar el contrato");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [pdf, pagina]);

  function idDe(campo: CampoContrato) {
    return campo.id || campo.campo;
  }

  function punto(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 40, y: pdfH / 2 };
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(rect.width, 1)) * pdfW;
    const y = pdfH - ((clientY - rect.top) / Math.max(rect.height, 1)) * pdfH;
    return {
      x: Math.round(Math.min(pdfW - 12, Math.max(8, x))),
      y: Math.round(Math.min(pdfH - 8, Math.max(8, y))),
    };
  }

  function mover(id: string, x: number, y: number) {
    onChange(camposRef.current.map((item) => (idDe(item) === id ? { ...item, x, y, pagina } : item)));
  }

  function poner(campo: string, label?: string) {
    const dato = DATOS_CONTRATO.find((item) => item.campo === campo);
    const id = crypto.randomUUID();
    onChange([
      ...camposRef.current,
      {
        id,
        campo,
        label: label || dato?.label,
        pide: dato?.pide || "Firma",
        enContrato: true,
        pagina,
        x: Math.round(pdfW * 0.18),
        y: Math.round(pdfH * 0.55),
        size: 8,
      },
    ]);
    setActivo(id);
  }

  const elegido = campos.find((campo) => idDe(campo) === activo);
  const conocidos = [
    ...DATOS_CONTRATO.map((dato) => ({ campo: dato.campo, label: dato.label })),
    ...campos
      .filter((campo) => !DATOS_CONTRATO.some((dato) => dato.campo === campo.campo))
      .filter((campo, index, lista) => lista.findIndex((item) => item.campo === campo.campo) === index)
      .map((campo) => ({ campo: campo.campo, label: etiqueta(campo) })),
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="grid content-start gap-2">
        <p className="text-sm text-ink-soft">Arrastra la casilla hasta la línea del contrato. El check de Listo sale al guardar.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-eco="no" className="h-9 rounded-xl border border-line px-2 text-sm" onClick={() => setPagina((n) => Math.max(0, n - 1))}>
            Anterior
          </button>
          <button type="button" data-eco="no" className="h-9 rounded-xl border border-line px-2 text-sm" onClick={() => setPagina((n) => Math.min(paginas - 1, n + 1))}>
            Siguiente
          </button>
          <span className="text-xs text-ink-soft">Página {pagina + 1} de {paginas}</span>
        </div>
        <div className="grid max-h-64 gap-1 overflow-auto">
          {campos.map((campo) => {
            const id = idDe(campo);
            return (
              <button
                key={id}
                type="button"
                data-eco="no"
                onClick={() => {
                  setActivo(id);
                  setPagina(campo.pagina);
                }}
                className={"rounded-xl border px-3 py-2 text-left text-sm " + (activo === id ? "border-navy bg-navy text-paper" : "border-line")}
              >
                <span className="block font-semibold">{etiqueta(campo)}</span>
                <span className="block text-xs opacity-80">Página {campo.pagina + 1} · x {campo.x} · y {campo.y}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <select value={nuevo} onChange={(event) => setNuevo(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-line px-2 text-sm">
            {conocidos.map((dato) => (
              <option key={dato.campo} value={dato.campo}>{dato.label}</option>
            ))}
          </select>
          <button type="button" className="h-10 rounded-xl border border-line px-3 text-sm font-semibold" onClick={() => poner(nuevo)}>
            Agregar
          </button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const id = `extra_${clave(propio)}`;
            if (id.length < 8) return;
            poner(id, propio.trim());
            setPropio("");
          }}
        >
          <input value={propio} onChange={(event) => setPropio(event.target.value)} placeholder="Dato nuevo" className="h-10 min-w-0 flex-1 rounded-xl border border-line px-2 text-sm" />
          <button type="submit" className="h-10 rounded-xl border border-line px-3 text-sm font-semibold">Crear</button>
        </form>
        {elegido ? (
          <div className="grid gap-2 rounded-xl border border-line p-2">
            <p className="text-sm font-semibold">{etiqueta(elegido)}</p>
            <div className="grid grid-cols-3 gap-1">
              {[
                ["←", -4, 0],
                ["→", 4, 0],
                ["↑", 0, 4],
                ["↓", 0, -4],
              ].map(([signo, dx, dy]) => (
                <button
                  key={String(signo)}
                  type="button"
                  data-eco="no"
                  className="h-9 rounded-lg border border-line text-sm"
                  onClick={() => mover(idDe(elegido), Math.round(elegido.x + Number(dx)), Math.round(elegido.y + Number(dy)))}
                >
                  {signo}
                </button>
              ))}
            </div>
            <label className="grid gap-1 text-sm">
              Tipografía
              <select
                value={elegido.fuente || "helvetica"}
                onChange={(event) => onChange(campos.map((item) => (idDe(item) === idDe(elegido) ? { ...item, fuente: event.target.value } : item)))}
                className="h-10 rounded-xl border border-line px-2"
              >
                {FUENTES.map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Tamaño de la letra: {elegido.size}
              <input
                type="range"
                min={6}
                max={16}
                value={elegido.size}
                onChange={(event) => onChange(campos.map((item) => (idDe(item) === idDe(elegido) ? { ...item, size: Number(event.target.value) } : item)))}
              />
            </label>
            <button
              type="button"
              className="h-10 rounded-xl border border-line px-3 text-sm font-semibold text-danger"
              onClick={() => {
                onChange(campos.filter((item) => idDe(item) !== idDe(elegido)));
                setActivo("");
              }}
            >
              Quitar este dato
            </button>
          </div>
        ) : null}
      </div>
      <div className="overflow-auto rounded-2xl border border-line bg-paper p-2">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div
          className="relative w-full"
          onPointerDown={(event) => {
            if (event.target !== canvasRef.current || !elegido) return;
            const p = punto(event.clientX, event.clientY);
            mover(idDe(elegido), p.x, p.y);
          }}
        >
          <canvas ref={canvasRef} className="block h-auto w-full" />
          <div className="pointer-events-none absolute inset-0">
            {campos
              .filter((campo) => campo.pagina === pagina && campo.enContrato !== false)
              .map((campo) => {
                const id = idDe(campo);
                const altoCaja = Math.max(campo.size * 1.15, 9);
                return (
                  <button
                    key={id}
                    type="button"
                    data-eco="no"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setActivo(id);
                      const inicio = punto(event.clientX, event.clientY);
                      const ox = campo.x - inicio.x;
                      const oy = campo.y - inicio.y;
                      const moverPuntero = (move: PointerEvent) => {
                        const p = punto(move.clientX, move.clientY);
                        mover(id, p.x + ox, p.y + oy);
                      };
                      const soltar = () => {
                        window.removeEventListener("pointermove", moverPuntero);
                        window.removeEventListener("pointerup", soltar);
                      };
                      window.addEventListener("pointermove", moverPuntero);
                      window.addEventListener("pointerup", soltar);
                    }}
                    className={
                      "pointer-events-auto absolute flex cursor-move items-end rounded-sm border border-navy bg-lime/70 px-0.5 text-left text-[10px] leading-none font-semibold text-navy " +
                      (activo === id ? "ring-2 ring-navy" : "")
                    }
                    style={{
                      left: `${(campo.x / pdfW) * 100}%`,
                      top: `${((pdfH - campo.y - altoCaja) / pdfH) * 100}%`,
                      minWidth: 72,
                      height: `${(altoCaja / pdfH) * 100}%`,
                    }}
                  >
                    {etiqueta(campo)}
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
