import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type Caja = { x: number; y: number; w: number; h: number };

const MANGOS: { modo: string; clase: string }[] = [
  { modo: "nw", clase: "left-0 top-0 -translate-x-1/2 -translate-y-1/2" },
  { modo: "ne", clase: "right-0 top-0 translate-x-1/2 -translate-y-1/2" },
  { modo: "sw", clase: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2" },
  { modo: "se", clase: "right-0 bottom-0 translate-x-1/2 translate-y-1/2" },
  { modo: "n", clase: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2" },
  { modo: "s", clase: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2" },
  { modo: "w", clase: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2" },
  { modo: "e", clase: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2" },
];

function ajustar(base: Caja, modo: string, dx: number, dy: number): Caja {
  let { x, y, w, h } = base;
  const min = 0.12;
  if (modo === "mover") {
    return {
      x: Math.min(1 - w, Math.max(0, x + dx)),
      y: Math.min(1 - h, Math.max(0, y + dy)),
      w,
      h,
    };
  }
  if (modo.includes("w")) {
    const nx = Math.min(x + w - min, Math.max(0, x + dx));
    w += x - nx;
    x = nx;
  }
  if (modo.includes("e")) w = Math.min(1 - x, Math.max(min, w + dx));
  if (modo.includes("n")) {
    const ny = Math.min(y + h - min, Math.max(0, y + dy));
    h += y - ny;
    y = ny;
  }
  if (modo.includes("s")) h = Math.min(1 - y, Math.max(min, h + dy));
  return { x, y, w, h };
}

function esImagenFile(file: File) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i.test(file.name);
}

export function esFotoParaRecortar(file: File) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return false;
  return esImagenFile(file);
}

export function RecortarFoto({
  file,
  total = 1,
  onListo,
  onCancelar,
  onCancelarTodas,
}: {
  file: File;
  indice?: number;
  total?: number;
  onListo: (file: File) => void;
  onCancelar: () => void;
  onCancelarTodas?: () => void;
}) {
  const [src, setSrc] = useState("");
  const [lista, setLista] = useState(false);
  const [fallo, setFallo] = useState("");
  const [caja, setCaja] = useState<Caja>({ x: 0.06, y: 0.06, w: 0.88, h: 0.88 });
  const [girada, setGirada] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const marco = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const urlRef = useRef("");

  useEffect(() => {
    let vivo = true;
    setSrc("");
    setLista(false);
    setFallo("");
    setCaja({ x: 0.06, y: 0.06, w: 0.88, h: 0.88 });
    setGirada(false);
    (async () => {
      try {
        const bitmap = await createImageBitmap(file);
        const max = 2400;
        const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * escala));
        canvas.height = Math.max(1, Math.round(bitmap.height * escala));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No pude abrir la foto");
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((item) => resolve(item), "image/jpeg", 0.92));
        if (!blob) throw new Error("No pude abrir la foto");
        const url = URL.createObjectURL(blob);
        if (!vivo) {
          URL.revokeObjectURL(url);
          return;
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setSrc(url);
      } catch {
        if (vivo) setFallo("No pude abrir esta foto para recortarla.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [file]);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = "";
    };
  }, []);

  function empezar(modo: string, e: ReactPointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const rect = marco.current?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return;
    const inicio = { x: e.clientX, y: e.clientY, caja };
    const mover = (ev: PointerEvent) => {
      const dx = (ev.clientX - inicio.x) / rect.width;
      const dy = (ev.clientY - inicio.y) / rect.height;
      setCaja(ajustar(inicio.caja, modo, dx, dy));
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }

  async function girar() {
    const img = imgRef.current;
    if (!img || saliendo) return;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalHeight;
    canvas.height = img.naturalWidth;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((item) => resolve(item), "image/jpeg", 0.92));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
    setLista(false);
    setSrc(url);
    setGirada(true);
    setCaja({ x: 0.06, y: 0.06, w: 0.88, h: 0.88 });
  }

  async function confirmar(completa: boolean) {
    if (saliendo) return;
    const img = imgRef.current;
    if (!img || !img.naturalWidth) {
      onListo(file);
      return;
    }
    if (completa && !girada) {
      onListo(file);
      return;
    }
    setSaliendo(true);
    try {
      const uso = completa ? { x: 0, y: 0, w: 1, h: 1 } : caja;
      const sx = img.naturalWidth * uso.x;
      const sy = img.naturalHeight * uso.y;
      const sw = Math.max(1, img.naturalWidth * uso.w);
      const sh = Math.max(1, img.naturalHeight * uso.h);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No pude recortar la foto");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((item) => resolve(item), "image/jpeg", 0.92));
      if (!blob) throw new Error("No pude recortar la foto");
      const base = file.name.replace(/\.[^.]+$/, "") || "foto";
      onListo(new File([blob], `${base}.jpg`, { type: "image/jpeg" }));
    } catch {
      onListo(file);
    } finally {
      setSaliendo(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-ink text-paper">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div>
          <p className="font-semibold">Recorta la foto</p>
          <p className="text-xs text-paper/80">
            {total > 1 ? `Quedan ${total} fotos. ` : ""}
            Arrastra el cuadro. Lo de afuera no se guarda.
          </p>
        </div>
        <button type="button" onClick={onCancelar} className="h-10 shrink-0 rounded-xl border border-white/30 px-3 text-sm font-semibold">
          {total > 1 ? "Saltar" : "Cancelar"}
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full items-center justify-center p-3">
          {fallo ? (
            <p className="max-w-xs text-center text-sm">{fallo}</p>
          ) : src ? (
            <div ref={marco} className="relative inline-block max-w-full">
              <img ref={imgRef} src={src} alt="Foto para recortar" draggable={false} onLoad={() => setLista(true)} onError={() => setFallo("No pude abrir esta foto para recortarla.")} className="max-h-[68vh] max-w-full select-none" />
              <div
                className="absolute touch-none border-2 border-white"
                style={{
                  left: `${caja.x * 100}%`,
                  top: `${caja.y * 100}%`,
                  width: `${caja.w * 100}%`,
                  height: `${caja.h * 100}%`,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,.55)",
                }}
                onPointerDown={(e) => empezar("mover", e)}
              >
                {MANGOS.map((mango) => (
                  <button
                    key={mango.modo}
                    type="button"
                    aria-label="Ajustar recorte"
                    className={"absolute grid size-11 place-items-center " + mango.clase}
                    onPointerDown={(e) => empezar(mango.modo, e)}
                  >
                    <span className="size-4 rounded-sm border-2 border-white bg-navy" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm">Abriendo la foto…</p>
          )}
        </div>
      </div>
      <div className="grid gap-2 border-t border-white/15 p-3">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={!lista || saliendo} onClick={() => void girar()} className="h-11 rounded-2xl border border-white/30 text-sm font-semibold disabled:opacity-50">
            Girar
          </button>
          <button type="button" disabled={!lista || saliendo} onClick={() => void confirmar(true)} className="h-11 rounded-2xl border border-white/30 text-sm font-semibold disabled:opacity-50">
            Subir completa
          </button>
        </div>
        <button type="button" disabled={!lista || saliendo || Boolean(fallo)} onClick={() => void confirmar(false)} className="h-12 rounded-2xl bg-lime text-sm font-semibold text-navy disabled:opacity-50">
          {saliendo ? "Recortando…" : "Recortar y subir"}
        </button>
        {fallo ? (
          <button type="button" onClick={() => onListo(file)} className="h-11 rounded-2xl bg-lime text-sm font-semibold text-navy">
            Subirla igual
          </button>
        ) : null}
        {total > 1 && onCancelarTodas ? (
          <button type="button" onClick={onCancelarTodas} className="h-10 text-sm text-paper/80">
            Cancelar las que faltan
          </button>
        ) : null}
      </div>
    </div>
  );
}
