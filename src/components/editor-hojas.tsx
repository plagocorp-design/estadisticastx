import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { copiasAlImprimir, tipoVisible } from "@/lib/piloto";

// Una foto o una página de PDF que entra al editor.
// tipo: el tipo de documento (cedula_frente, tarjeta_propiedad, contrato…).
// grupo: las páginas de un mismo PDF comparten grupo, para sacar las copias en orden.
// pdf: es una página de PDF. Va sola en su hoja, a tamaño completo.
export type FotoHoja = { id: string; nombre: string; src: string; tipo?: string; grupo?: string; pdf?: boolean };

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

type Medida = { w: number; h: number };
type Caja = { x: number; y: number; w: number; h: number };

// Hoja A4 en milímetros. Las piezas se guardan en % de la hoja.
const ANCHO = 210;
const ALTO = 297;

// Estas van de a dos por hoja (frente arriba, reverso abajo) y se repiten por cada copia.
const TARJETAS = ["cedula", "tarjeta_propiedad", "tarjeta_operacion"];

const ARRIBA: Caja = { x: 6, y: 4, w: 88, h: 44 };
const ABAJO: Caja = { x: 6, y: 52, w: 88, h: 44 };
const COMPLETA: Caja = { x: 4, y: 3, w: 92, h: 94 };

function ladoOrden(tipo: string) {
  if (tipo.endsWith("_frente")) return 0;
  if (tipo.endsWith("_reverso")) return 2;
  return 1;
}

// Mete la foto en el espacio sin deformarla, centrada.
function encajar(espacio: Caja, anchoMax: number, medida: Medida | undefined): Pick<Pieza, "x" | "y" | "w" | "h"> {
  const ar = medida && medida.w > 0 && medida.h > 0 ? medida.w / medida.h : 1.5;
  const sw = (espacio.w / 100) * ANCHO;
  const sh = (espacio.h / 100) * ALTO;
  const tope = Math.min(sw, (anchoMax / 100) * ANCHO);
  const w = Math.min(tope, sh * ar);
  const h = w / ar;
  const x = (espacio.x / 100) * ANCHO + (sw - w) / 2;
  const y = (espacio.y / 100) * ALTO + (sh - h) / 2;
  return { x: (x / ANCHO) * 100, y: (y / ALTO) * 100, w: (w / ANCHO) * 100, h: (h / ALTO) * 100 };
}

function armar(fotos: FotoHoja[], medidas: Map<string, Medida>, copiasDe: (tipo: string) => number) {
  const grupos = new Map<string, { tarjeta: boolean; tipo: string; fotos: FotoHoja[] }>();
  for (const foto of fotos) {
    const visible = tipoVisible(foto.tipo || "");
    const tarjeta = !foto.pdf && TARJETAS.includes(visible);
    const clave = tarjeta ? `t:${visible}` : `g:${foto.grupo || foto.id}`;
    const grupo = grupos.get(clave) ?? { tarjeta, tipo: foto.tipo || "", fotos: [] };
    grupo.fotos.push(foto);
    grupos.set(clave, grupo);
  }
  const lista = [...grupos.entries()].sort(([a], [b]) => {
    const pa = a.startsWith("t:") ? TARJETAS.indexOf(a.slice(2)) : TARJETAS.length;
    const pb = b.startsWith("t:") ? TARJETAS.indexOf(b.slice(2)) : TARJETAS.length;
    return pa - pb;
  });
  const piezas: Pieza[] = [];
  let pagina = 0;
  for (const [, grupo] of lista) {
    const copias = Math.max(1, Math.min(4, Math.round(copiasDe(grupo.tipo)) || 1));
    if (grupo.tarjeta) {
      const orden = [...grupo.fotos].sort((a, b) => ladoOrden(a.tipo || "") - ladoOrden(b.tipo || ""));
      const anchoMax = tipoVisible(grupo.tipo) === "cedula" ? 46 : 62;
      for (let copia = 0; copia < copias; copia += 1) {
        for (let i = 0; i < orden.length; i += 2) {
          orden.slice(i, i + 2).forEach((foto, lado) => {
            piezas.push({ id: `${foto.id}~${copia}`, fotoId: foto.id, pagina, rot: 0, recorte: 0, ...encajar(lado === 0 ? ARRIBA : ABAJO, anchoMax, medidas.get(foto.id)) });
          });
          pagina += 1;
        }
      }
    } else {
      for (let copia = 0; copia < copias; copia += 1) {
        for (const foto of grupo.fotos) {
          piezas.push({ id: `${foto.id}~${copia}`, fotoId: foto.id, pagina, rot: 0, recorte: 0, ...encajar(COMPLETA, 92, medidas.get(foto.id)) });
          pagina += 1;
        }
      }
    }
  }
  return { piezas, paginas: Math.max(1, pagina) };
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

// La foto dentro de su recuadro. El recuadro siempre tiene la forma de la foto
// (ya girada), así lo que se ve es lo mismo que sale en el PDF.
function Recuadro({ item, foto }: { item: Pieza; foto: FotoHoja }) {
  const zoom = 1 / Math.max(0.4, 1 - (item.recorte / 100) * 2);
  const acostada = item.rot % 180 !== 0;
  const anchoMm = (item.w / 100) * ANCHO;
  const altoMm = (item.h / 100) * ALTO;
  const w = acostada && anchoMm > 0 ? (altoMm / anchoMm) * 100 : 100;
  const h = acostada && altoMm > 0 ? (anchoMm / altoMm) * 100 : 100;
  return (
    <div
      className="absolute overflow-hidden"
      style={{ left: "50%", top: "50%", width: `${w}%`, height: `${h}%`, transform: `translate(-50%, -50%) rotate(${item.rot}deg)` }}
    >
      <img src={foto.src} alt={foto.nombre} draggable={false} className="h-full w-full object-fill" style={{ transform: `scale(${zoom})` }} />
    </div>
  );
}

export function EditorHojas({
  fotos,
  copiasDe = copiasAlImprimir,
  onCerrar,
  onGuardar,
}: {
  fotos: FotoHoja[];
  copiasDe?: (tipo: string) => number;
  onCerrar: () => void;
  onGuardar: (hojas: { nombre: string; archivo: string }[]) => Promise<void> | void;
}) {
  const [listo, setListo] = useState(false);
  const [piezas, setPiezas] = useState<Pieza[]>([]);
  const [orden, setOrden] = useState<number[]>([0]);
  const [pagina, setPagina] = useState(0);
  const [activa, setActiva] = useState("");
  const [todas, setTodas] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const hojaRef = useRef<HTMLDivElement>(null);
  const imagenes = useRef(new Map<string, HTMLImageElement>());
  const arrastre = useRef<{ id: string; px: number; py: number; x: number; y: number; ancho: number; alto: number } | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const medidas = new Map<string, Medida>();
      for (const foto of fotos) {
        try {
          const img = await cargarImagen(foto.src);
          imagenes.current.set(foto.id, img);
          medidas.set(foto.id, { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
        } catch {
          // Si una foto no abre, igual se arma el resto.
        }
      }
      if (!vivo) return;
      const armado = armar(fotos, medidas, copiasDe);
      setPiezas(armado.piezas);
      setOrden(Array.from({ length: armado.paginas }, (_, n) => n));
      setPagina(0);
      setActiva(armado.piezas[0]?.id ?? "");
      setListo(true);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const fotoDe = new Map(fotos.map((foto) => [foto.id, foto]));
  const vista = orden[pagina] ?? 0;
  const pieza = piezas.find((item) => item.id === activa && item.pagina === vista) ?? piezas.find((item) => item.pagina === vista) ?? null;

  function mover(id: string, patch: Partial<Pieza>) {
    setPiezas((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  // Cambia el tamaño sin deformar la foto, desde el centro.
  function escalar(item: Pieza, factor: number) {
    const w = Math.min(100, Math.max(10, item.w * factor));
    const h = (item.h * w) / item.w;
    mover(item.id, { w, h, x: item.x + (item.w - w) / 2, y: item.y + (item.h - h) / 2 });
  }

  // Al girar 90°, el recuadro se acuesta para que la foto no se corte.
  function girar(item: Pieza, grados: number) {
    const w = (item.h * ALTO) / ANCHO;
    const h = (item.w * ANCHO) / ALTO;
    mover(item.id, { rot: (item.rot + grados) % 360, w, h, x: item.x + (item.w - w) / 2, y: item.y + (item.h - h) / 2 });
  }

  function quitarHoja(indice: number) {
    const id = orden[indice];
    setPiezas((prev) => prev.filter((item) => item.pagina !== id));
    if (orden.length <= 1) return;
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

  function nuevaHoja() {
    const id = Math.max(-1, ...orden, ...piezas.map((item) => item.pagina)) + 1;
    setOrden((prev) => [...prev, id]);
    return id;
  }

  const conAlgo = orden.filter((id) => piezas.some((item) => item.pagina === id));

  async function guardar() {
    setGuardando(true);
    setError("");
    try {
      if (!conAlgo.length) throw new Error("Todas las hojas están vacías. No hay nada para guardar.");
      const pdf = await PDFDocument.create();
      for (const id of conAlgo) {
        const canvas = document.createElement("canvas");
        canvas.width = 1240;
        canvas.height = 1754;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No pude armar la hoja");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (const item of piezas.filter((p) => p.pagina === id)) {
          const img = imagenes.current.get(item.fotoId);
          if (!img) continue;
          const margen = Math.min(0.3, item.recorte / 100);
          const iw = img.naturalWidth || img.width;
          const ih = img.naturalHeight || img.height;
          const sx = iw * margen;
          const sy = ih * margen;
          const sw = iw * (1 - margen * 2);
          const sh = ih * (1 - margen * 2);
          const x = (item.x / 100) * canvas.width;
          const y = (item.y / 100) * canvas.height;
          const w = (item.w / 100) * canvas.width;
          const h = (item.h / 100) * canvas.height;
          const acostada = item.rot % 180 !== 0;
          const dw = acostada ? h : w;
          const dh = acostada ? w : h;
          ctx.save();
          ctx.translate(x + w / 2, y + h / 2);
          ctx.rotate((item.rot * Math.PI) / 180);
          ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
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

  function queLleva(id: number) {
    const nombres = piezas.filter((item) => item.pagina === id).map((item) => fotoDe.get(item.fotoId)?.nombre || "Foto");
    return nombres.length ? nombres.join(" + ") : "Vacía";
  }

  const boton = "h-10 rounded-2xl border border-line px-3 text-sm font-semibold";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <p className="font-semibold">Acomodar en hojas</p>
          <p className="text-xs text-ink-soft">
            Frente y reverso van en la misma hoja. Cada copia sale en su propia hoja. Revisa todo antes de guardar: así queda el PDF.
          </p>
        </div>
        <button type="button" onClick={onCerrar} className="h-10 rounded-xl border border-line px-3 text-sm font-semibold">Cerrar</button>
      </div>

      {!listo ? (
        <p className="flex-1 p-6 text-center text-sm text-ink-soft">Preparando las hojas…</p>
      ) : todas ? (
        <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
          <p className="mb-3 text-sm">
            Esto es lo que va a quedar en el PDF: <span className="font-semibold">{conAlgo.length} {conAlgo.length === 1 ? "hoja" : "hojas"}</span>. Toca una hoja para ajustarla.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {orden.map((id, n) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setPagina(n);
                  setTodas(false);
                }}
                className="grid gap-1 text-left"
              >
                <div className="relative w-full overflow-hidden border border-line bg-white shadow-sm" style={{ aspectRatio: "210 / 297" }}>
                  {piezas.filter((item) => item.pagina === id).map((item) => {
                    const foto = fotoDe.get(item.fotoId);
                    if (!foto) return null;
                    return (
                      <div key={item.id} className="absolute overflow-hidden" style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%`, height: `${item.h}%` }}>
                        <Recuadro item={item} foto={foto} />
                      </div>
                    );
                  })}
                </div>
                <span className="text-xs font-semibold">Hoja {n + 1}</span>
                <span className="line-clamp-2 text-xs text-ink-soft">{queLleva(id)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto px-3 py-2">
            <button type="button" onClick={() => setTodas(true)} className="h-9 shrink-0 rounded-full border border-navy px-3 text-sm font-semibold text-navy">
              Ver todas
            </button>
            {orden.map((id, n) => (
              <button key={id} type="button" onClick={() => setPagina(n)} className={"h-9 shrink-0 rounded-full px-3 text-sm font-semibold " + (n === pagina ? "bg-navy text-paper" : "border border-line")}>
                Hoja {n + 1}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                nuevaHoja();
                setPagina(orden.length);
              }}
              className="h-9 shrink-0 rounded-full border border-line px-3 text-sm font-semibold"
            >
              Nueva hoja
            </button>
          </div>
          <p className="px-3 pb-2 text-xs text-ink-soft">Hoja {pagina + 1}: {queLleva(vista)}</p>
          <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
            <div ref={hojaRef} className="relative mx-auto w-full max-w-lg overflow-hidden bg-white shadow" style={{ aspectRatio: "210 / 297" }}>
              {piezas.filter((item) => item.pagina === vista).map((item) => {
                const foto = fotoDe.get(item.fotoId);
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
                    <div className="absolute inset-0 overflow-hidden">
                      <Recuadro item={item} foto={foto} />
                    </div>
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
                          const w = Math.min(100, Math.max(10, drag.x + dw));
                          mover(item.id, { w, h: (drag.y * w) / drag.x });
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
            <div className="flex flex-wrap gap-2">
              <button type="button" className={boton} onClick={() => moverHoja(pagina, -1)}>Hoja atrás</button>
              <button type="button" className={boton} onClick={() => moverHoja(pagina, 1)}>Hoja adelante</button>
              <button type="button" className={boton + " text-danger"} onClick={() => quitarHoja(pagina)}>Eliminar hoja</button>
            </div>
            {pieza ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={boton} onClick={() => girar(pieza, 270)}>Girar izquierda</button>
                <button type="button" className={boton} onClick={() => girar(pieza, 90)}>Girar derecha</button>
                <button type="button" className={boton} onClick={() => mover(pieza.id, { recorte: Math.min(30, pieza.recorte + 4) })}>Recortar</button>
                <button type="button" className={boton} onClick={() => mover(pieza.id, { recorte: 0 })}>Quitar recorte</button>
                <button
                  type="button"
                  className={boton}
                  onClick={() => {
                    const destino = orden[pagina + 1];
                    if (destino == null) {
                      const id = nuevaHoja();
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
                <button type="button" className={boton} onClick={() => escalar(pieza, 1.1)}>Agrandar</button>
                <button type="button" className={boton} onClick={() => escalar(pieza, 0.9)}>Achicar</button>
                <button type="button" className={boton + " text-danger"} onClick={() => setPiezas((prev) => prev.filter((item) => item.id !== pieza.id))}>Quitar foto</button>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">Esta hoja está vacía. Si la dejas así, no sale en el PDF.</p>
            )}
          </div>
        </>
      )}

      <div className="grid gap-2 border-t border-line px-3 py-3">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button type="button" disabled={!listo || guardando || conAlgo.length === 0} onClick={() => void guardar()} className="h-11 rounded-2xl bg-navy text-sm font-semibold text-paper disabled:opacity-60">
          {guardando ? "Guardando…" : `Guardar un solo PDF (${conAlgo.length} ${conAlgo.length === 1 ? "hoja" : "hojas"})`}
        </button>
      </div>
    </div>
  );
}
