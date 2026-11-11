import { useRef, useState } from "react";

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
};

function repartir(fotos: Foto[]): Pieza[] {
  return fotos.map((foto, i) => {
    const pagina = Math.floor(i / 2);
    const abajo = i % 2 === 1;
    return { id: foto.id, fotoId: foto.id, pagina, x: 8, y: abajo ? 51 : 4, w: 84, h: 44, rot: 0 };
  });
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
  const [paginas, setPaginas] = useState(() => Math.max(1, Math.ceil(fotos.length / 2)));
  const [pagina, setPagina] = useState(0);
  const [activa, setActiva] = useState(fotos[0]?.id ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const hojaRef = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ id: string; px: number; py: number; x: number; y: number; ancho: number; alto: number } | null>(null);

  const pieza = piezas.find((item) => item.id === activa && item.pagina === pagina) ?? piezas.find((item) => item.pagina === pagina) ?? null;

  function mover(id: string, patch: Partial<Pieza>) {
    setPiezas((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function guardar() {
    setGuardando(true);
    setError("");
    try {
      const hojas: { nombre: string; archivo: string }[] = [];
      const imagenes = new Map<string, HTMLImageElement>();
      for (const foto of fotos) imagenes.set(foto.id, await cargarImagen(foto.src));
      for (let n = 0; n < paginas; n++) {
        const canvas = document.createElement("canvas");
        canvas.width = 1240;
        canvas.height = 1754;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No pude armar la hoja");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (const item of piezas.filter((p) => p.pagina === n)) {
          const img = imagenes.get(item.fotoId);
          if (!img) continue;
          const x = (item.x / 100) * canvas.width;
          const y = (item.y / 100) * canvas.height;
          const w = (item.w / 100) * canvas.width;
          const h = (item.h / 100) * canvas.height;
          ctx.save();
          ctx.translate(x + w / 2, y + h / 2);
          ctx.rotate((item.rot * Math.PI) / 180);
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
          ctx.restore();
        }
        const data = canvas.toDataURL("image/jpeg", 0.86);
        hojas.push({ nombre: `Hoja ${n + 1}.jpg`, archivo: data.split(",")[1] || "" });
      }
      await onGuardar(hojas.filter((hoja) => hoja.archivo));
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
          <p className="text-xs text-ink-soft">Arrastra cada foto. Gírala o cámbiale el tamaño. Quedan en hojas para imprimir.</p>
        </div>
        <button type="button" onClick={onCerrar} className="h-10 rounded-xl border border-line px-3 text-sm font-semibold">Cerrar</button>
      </div>
      <div className="flex gap-2 overflow-x-auto px-3 py-2">
        {Array.from({ length: paginas }, (_, n) => (
          <button key={n} type="button" onClick={() => setPagina(n)} className={"h-9 shrink-0 rounded-full px-3 text-sm font-semibold " + (n === pagina ? "bg-navy text-paper" : "border border-line")}>
            Hoja {n + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setPaginas((n) => n + 1);
            setPagina(paginas);
          }}
          className="h-9 shrink-0 rounded-full border border-line px-3 text-sm font-semibold"
        >
          Nueva hoja
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        <div
          ref={hojaRef}
          className="relative mx-auto w-full max-w-lg bg-white shadow"
          style={{ aspectRatio: "210 / 297" }}
        >
          {piezas.filter((item) => item.pagina === pagina).map((item) => {
            const foto = fotos.find((f) => f.id === item.fotoId);
            if (!foto) return null;
            const elegida = pieza?.id === item.id;
            return (
              <div
                key={item.id}
                className={"absolute touch-none " + (elegida ? "ring-2 ring-navy" : "")}
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
                  className="h-full w-full object-contain"
                  style={{ transform: `rotate(${item.rot}deg)` }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid gap-2 border-t border-line px-3 py-3">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {pieza ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold" onClick={() => mover(pieza.id, { rot: (pieza.rot + 90) % 360 })}>Girar</button>
            <button type="button" className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold" onClick={() => mover(pieza.id, { w: Math.min(120, pieza.w + 8), h: Math.min(120, pieza.h + 8) })}>Agrandar</button>
            <button type="button" className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold" onClick={() => mover(pieza.id, { w: Math.max(18, pieza.w - 8), h: Math.max(12, pieza.h - 8) })}>Achicar</button>
            {paginas > 1 ? (
              <button
                type="button"
                className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold"
                onClick={() => {
                  const destino = (pieza.pagina + 1) % paginas;
                  mover(pieza.id, { pagina: destino });
                  setPagina(destino);
                }}
              >
                Pasar de hoja
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">Esta hoja está vacía. Pasa una foto aquí o agrega otra.</p>
        )}
        <button type="button" disabled={guardando || fotos.length === 0} onClick={() => void guardar()} className="h-11 rounded-2xl bg-navy text-sm font-semibold text-paper disabled:opacity-60">
          {guardando ? "Guardando…" : "Guardar hojas"}
        </button>
      </div>
    </div>
  );
}
