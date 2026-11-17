import { useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

type Foto = { id: string; nombre: string; src: string };

type Pieza = {
  id: string;
  fotoId: string;
  pagina: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  recorte: number;
};

function repartir(fotos: Foto[]): Pieza[] {
  return fotos.map((foto, i) => {
    const cedula = /cedula/i.test(foto.id) || /cédula|cedula/i.test(foto.nombre);
    const pagina = Math.floor(i / 2);
    const abajo = i % 2 === 1;
    return {
      id: foto.id,
      fotoId: foto.id,
      pagina,
      x: cedula ? 27 : 11,
      y: abajo ? 54 : 8,
      w: cedula ? 46 : 76,
      h: cedula ? 22 : 40,
      rot: 0,
      recorte: 0,
    };
  });
}

function base64(bytes: Uint8Array) {
  let binario = "";
  const paso = 0x8000;
  for (let i = 0; i < bytes.length; i += paso) binario += String.fromCharCode(...bytes.subarray(i, i + paso));
  return btoa(binario);
}

function cargarImagen(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No pude abrir una foto"));
    img.src = src;
  });
}

export function EditorHojas({
  fotos,
  onCerrar,
  onGuardar,
}: {
  fotos: Foto[];
  onCerrar: () => void;
  onGuardar: (hojas: { nombre: string; archivo: string }[]) => Promise<void> | void;
}) {
  const [piezas, setPiezas] = useState<Pieza[]>(() => repartir(fotos));
  const [orden, setOrden] = useState(() => Array.from({ length: Math.max(1, Math.ceil(fotos.length / 2)) }, (_, n) => n));
  const [pagina, setPagina] = useState(0);
  const [activa, setActiva] = useState(fotos[0]?.id ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const hojaRef = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ id: string; px: number; py: number; x: number; y: number; ancho: number; alto: number } | null>(null);

  const vista = orden[pagina] ?? 0;
  const pieza = piezas.find((item) => item.id === activa && item.pagina === vista) ?? piezas.find((item) => item.pagina === vista) ?? null;

  function mover(id: string, patch: Partial<Pieza>) {
    setPiezas((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function quitarHoja(indice: number) {
    if (orden.length <= 1) return;
    const id = orden[indice];
    setPiezas((prev) => prev.filter((item) => item.pagina !== id));
    setOrden((prev) => prev.filter((item) => item !== id));
    setPagina((actual) => Math.max(0, Math.min(actual, orden.length - 2)));
  }

  function moverHoja(indice: number, delta: number) {
    const destino = indice + delta;
    if (destino < 0 || destino >= orden.length) return;
    setOrden((prev) => {
      const copia = [...prev];
      const [item] = copia.splice(indice, 1);
      copia.splice(destino, 0, item);
      return copia;
    });
    setPagina(destino);
  }

  async function guardar() {
    setGuardando(true);
    setError("");
    try {
      const pdf = await PDFDocument.create();
      const imagenes = new Map<string, HTMLImageElement>();
      for (const foto of fotos) imagenes.set(foto.id, await cargarImagen(foto.src));
      for (const id of orden) {
        const canvas = document.createElement("canvas");
        canvas.width = 1240;
        canvas.height = 1754;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No pude armar la hoja");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (const item of piezas.filter((p) => p.pagina === id)) {
          const img = imagenes.get(item.fotoId);
          if (!img) continue;
          const margen = Math.min(0.35, item.recorte / 100);
          const sx = img.width * margen;
          const sy = img.height * margen;
          const sw = img.width * (1 - margen * 2);
          const sh = img.height * (1 - margen * 2);
          const x = (item.x / 100) * canvas.width;
          const y = (item.y / 100) * canvas.height;
          const w = (item.w / 100) * canvas.width;
          const h = (item.h / 100) * canvas.height;
          ctx.save();
          ctx.translate(x + w / 2, y + h / 2);
          ctx.rotate((item.rot * Math.PI) / 180);
          ctx.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
        const data = canvas.toDataURL("image/jpeg", 0.86);
        const bytes = Uint8Array.from(atob(data.split(",")[1] || ""), (c) => c.charCodeAt(0));
        const jpg = await pdf.embedJpg(bytes);
        const hoja = pdf.addPage([595.28, 841.89]);
        hoja.drawImage(jpg, { x: 0, y: 0, width: 595.28, height: 841.89 });
      }
      const archivo = base64(await pdf.save());
      await onGuardar([{ nombre: "documentos-operativa.pdf", archivo }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude guardar las hojas");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <p className="font-semibold">Acomodar en hojas</p>
          <p className="text-xs text-ink-soft">Arrastra, gira, recorta y ordena las hojas. Se guarda un solo PDF.</p>
        </div>
        <button type="button" onClick={onCerrar} className="h-10 rounded-xl border border-line px-3 text-sm font-semibold">Cerrar</button>
      </div>
      <div className="flex gap-2 overflow-x-auto px-3 py-2">
        {orden.map((id, n) => (
          <button key={id} type="button" onClick={() => setPagina(n)} className={"h-9 shrink-0 rounded-full px-3 text-sm font-semibold " + (n === pagina ? "bg-navy text-paper" : "border border-line")}>
            Hoja {n + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            const id = Math.max(-1, ...orden, ...piezas.map((item) => item.pagina)) + 1;
            setOrden((prev) => [...prev, id]);
            setPagina(orden.length);
          }}
          className="h-9 shrink-0 rounded-full border border-line px-3 text-sm font-semibold"
        >
          Nueva hoja
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        <div ref={hojaRef} className="relative mx-auto w-full max-w-lg bg-white shadow" style={{ aspectRatio: "210 / 297" }}>
          {piezas.filter((item) => item.pagina === vista).map((item) => {
            const foto = fotos.find((f) => f.id === item.fotoId);
            if (!foto) return null;
            const elegida = pieza?.id === item.id;
            const zoom = 1 / Math.max(0.45, 1 - (item.recorte / 100) * 2);
            return (
              <div
                key={item.id}
                className={"absolute touch-none overflow-hidden " + (elegida ? "ring-2 ring-navy" : "")}
                style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%`, height: `${item.h}%` }}
                onPointerDown={(e) => {
                  const caja = hojaRef.current?.getBoundingClientRect();
                  if (!caja) return;
                  setActiva(item.id);
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  arrastre.current = { id: item.id, px: e.clientX, py: e.clientY, x: item.x, y: item.y, ancho: caja.width, alto: caja.height };
                }}
                onPointerMove={(e) => {
                  const drag = arrastre.current;
                  if (!drag || drag.id !== item.id || drag.ancho <= 0) return;
                  const dx = ((e.clientX - drag.px) / drag.ancho) * 100;
                  const dy = ((e.clientY - drag.py) / drag.alto) * 100;
                  mover(item.id, {
                    x: Math.min(92, Math.max(-20, drag.x + dx)),
                    y: Math.min(92, Math.max(-20, drag.y + dy)),
                  });
                }}
                onPointerUp={() => {
                  arrastre.current = null;
                }}
              >
                <img
                  src={foto.src}
                  alt={foto.nombre}
                  draggable={false}
                  className="h-full w-full object-cover"
                  style={{ transform: `rotate(${item.rot}deg) scale(${zoom})`, transformOrigin: "center" }}
                />
                {elegida ? (
                  <button
                    type="button"
                    aria-label="Cambiar tamaño"
                    className="absolute right-0 bottom-0 size-5 cursor-nwse-resize rounded-sm bg-navy"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const caja = hojaRef.current?.getBoundingClientRect();
                      if (!caja) return;
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      arrastre.current = { id: `tam-${item.id}`, px: e.clientX, py: e.clientY, x: item.w, y: item.h, ancho: caja.width, alto: caja.height };
                    }}
                    onPointerMove={(e) => {
                      const drag = arrastre.current;
                      if (!drag || drag.id !== `tam-${item.id}` || drag.ancho <= 0) return;
                      const dw = ((e.clientX - drag.px) / drag.ancho) * 100;
                      const dh = ((e.clientY - drag.py) / drag.alto) * 100;
                      mover(item.id, { w: Math.min(96, Math.max(18, drag.x + dw)), h: Math.min(90, Math.max(12, drag.y + dh)) });
                    }}
                    onPointerUp={() => {
                      arrastre.current = null;
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid gap-2 border-t border-line px-3 py-3">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold" onClick={() => moverHoja(pagina, -1)}>Hoja atrás</button>
          <button type="button" className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold" onClick={() => moverHoja(pagina, 1)}>Hoja adelante</button>
          <button type="button" className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold text-danger" onClick={() => quitarHoja(pagina)}>Eliminar hoja</button>
        </div>
        {pieza ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold" onClick={() => mover(pieza.id, { rot: (pieza.rot + 270) % 360 })}>Girar izquierda</button>
            <button type="button" className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold" onClick={() => mover(pieza.id, { rot: (pieza.rot + 90) % 360 })}>Girar derecha</button>
            <button type="button" className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold" onClick={() => mover(pieza.id, { recorte: Math.min(30, pieza.recorte + 4) })}>Recortar</button>
            <button type="button" className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold" onClick={() => mover(pieza.id, { recorte: 0 })}>Quitar recorte</button>
            <button
              type="button"
              className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold"
              onClick={() => {
                const destino = orden[pagina + 1];
                if (destino == null) {
                  const id = Math.max(-1, ...orden, ...piezas.map((item) => item.pagina)) + 1;
                  setOrden((prev) => [...prev, id]);
                  mover(pieza.id, { pagina: id });
                  setPagina(orden.length);
                  return;
                }
                mover(pieza.id, { pagina: destino });
                setPagina(pagina + 1);
              }}
            >
              Pasar a otra hoja
            </button>
            <button type="button" className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold" onClick={() => mover(pieza.id, { w: Math.min(120, pieza.w + 8), h: Math.min(120, pieza.h + 8) })}>Agrandar</button>
            <button type="button" className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold" onClick={() => mover(pieza.id, { w: Math.max(18, pieza.w - 8), h: Math.max(12, pieza.h - 8) })}>Achicar</button>
            <button type="button" className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold text-danger" onClick={() => setPiezas((prev) => prev.filter((item) => item.id !== pieza.id))}>Quitar foto</button>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">Esta hoja está vacía.</p>
        )}
        <button type="button" disabled={guardando || fotos.length === 0} onClick={() => void guardar()} className="h-11 rounded-2xl bg-navy text-sm font-semibold text-paper disabled:opacity-60">
          {guardando ? "Guardando…" : "Guardar un solo PDF"}
        </button>
      </div>
    </div>
  );
}