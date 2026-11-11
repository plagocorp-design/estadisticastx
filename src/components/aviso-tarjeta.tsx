import { useEffect, useMemo, useState } from "react";
import { Copy, Download, MessageCircle } from "lucide-react";

export type AvisoTarjetaId = "radicada" | "movilidad" | "empresa" | "entregada";

const AVISOS: {
  id: AvisoTarjetaId;
  label: string;
  titulo: string;
  apoyo: string;
  cuerpo: string;
}[] = [
  {
    id: "radicada",
    label: "Radicada",
    titulo: "Te tengo una buena noticia",
    apoyo: "Tu tarjeta ya fue radicada",
    cuerpo: "la tarjeta de operación ya fue radicada. El trámite quedó presentado y seguimos atentos para contarte el siguiente avance.",
  },
  {
    id: "movilidad",
    label: "En movilidad",
    titulo: "Tu tarjeta ya está en movilidad",
    apoyo: "El trámite sigue avanzando",
    cuerpo: "la tarjeta de operación ya está en movilidad. Seguimos pendientes y, apenas salga de allá, te aviso.",
  },
  {
    id: "empresa",
    label: "En la empresa",
    titulo: "Tu tarjeta ya está en la empresa",
    apoyo: "Ya la recibimos",
    cuerpo: "la tarjeta de operación ya está en la empresa. En cuanto quede lista para entregártela, te confirmo.",
  },
  {
    id: "entregada",
    label: "Entregada",
    titulo: "Tu tarjeta ya está entregada",
    apoyo: "Quedó en tus manos",
    cuerpo: "la tarjeta de operación ya está entregada. Gracias por la confianza. Cualquier cosa, me escribes.",
  },
];

const NAVY = "#1b3a4b";
const LIME = "#c6e84a";
const INK = "#102033";
const PAPER = "#f4f6f3";

export function avisoSugerido(caso: {
  tarjetaEntregada?: boolean;
  opTarjeta?: string;
  estadoTarjeta?: string;
  areaMarcas?: string;
}): AvisoTarjetaId {
  if (caso.tarjetaEntregada || caso.opTarjeta === "entregada") return "entregada";
  if (caso.opTarjeta === "expedida" || caso.estadoTarjeta === "Expedida" || String(caso.areaMarcas ?? "").includes("tarjeta_recibida")) return "empresa";
  if (caso.opTarjeta === "movilidad") return "movilidad";
  return "radicada";
}

function mensajeDe(id: AvisoTarjetaId, propietario: string, placa: string, asesor: string) {
  const aviso = AVISOS.find((item) => item.id === id) ?? AVISOS[0];
  const quien = propietario.trim();
  const saludo = quien ? `Hola ${quien}.` : "Hola.";
  const dePlaca = placa.trim() ? ` de la placa ${placa.trim().toUpperCase()}` : "";
  const firma = asesor.trim() ? `\n\n${asesor.trim()}\nTu asesor, Radio Taxi Aeropuerto` : "\n\nTu asesor, Radio Taxi Aeropuerto";
  return `${saludo} Te cuento cómo vamos${dePlaca}: ${aviso.cuerpo}${firma}`;
}

function telefonoWa(value: string) {
  const digitos = value.replace(/\D/g, "");
  if (digitos.length < 10) return "";
  if (digitos.startsWith("57") && digitos.length >= 12) return digitos;
  return `57${digitos.slice(-10)}`;
}

function lineas(ctx: CanvasRenderingContext2D, texto: string, max: number) {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const salida: string[] = [];
  let linea = "";
  for (const palabra of palabras) {
    const prueba = linea ? `${linea} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > max && linea) {
      salida.push(linea);
      linea = palabra;
    } else {
      linea = prueba;
    }
  }
  if (linea) salida.push(linea);
  return salida;
}

function ronda(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function cargarLogo() {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/taxis-libres.png";
  });
}

async function pintar(aviso: (typeof AVISOS)[number], placa: string, propietario: string, asesor: string) {
  await document.fonts.load("700 64px Outfit");
  await document.fonts.load("600 36px Outfit");
  await document.fonts.ready;
  const logo = await cargarLogo();
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No pude armar la imagen");

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, 1080, 1350);
  ronda(ctx, 48, 48, 984, 1254, 48);
  ctx.fillStyle = NAVY;
  ctx.fill();

  ctx.fillStyle = "#111111";
  ronda(ctx, 48, 48, 984, 210, 48);
  ctx.fill();
  ctx.fillRect(48, 160, 984, 98);
  if (logo) {
    const ancho = 460;
    const alto = (logo.height / logo.width) * ancho;
    ctx.drawImage(logo, (1080 - ancho) / 2, 48 + (210 - alto) / 2, ancho, alto);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = LIME;
  ctx.font = "600 28px Outfit, sans-serif";
  ctx.fillText("TARJETA DE OPERACIÓN", 540, 320);

  const placaTxt = placa.trim().toUpperCase() || "TU PLACA";
  ctx.font = "700 42px Outfit, sans-serif";
  const anchoPlaca = ctx.measureText(placaTxt).width + 72;
  ronda(ctx, (1080 - anchoPlaca) / 2, 360, anchoPlaca, 78, 39);
  ctx.fillStyle = LIME;
  ctx.fill();
  ctx.fillStyle = NAVY;
  ctx.fillText(placaTxt, 540, 412);

  const para = propietario.trim();
  ctx.font = "700 64px Outfit, sans-serif";
  const titulo = lineas(ctx, aviso.titulo, 860);
  ctx.font = "600 40px Outfit, sans-serif";
  const apoyo = lineas(ctx, aviso.apoyo, 880);
  const alto = (para ? 80 : 24) + titulo.length * 76 + 16 + apoyo.length * 52;
  let cursor = 490 + Math.max(0, (600 - alto) / 2);

  if (para) {
    ctx.fillStyle = "#d5e2ea";
    ctx.font = "500 30px Outfit, sans-serif";
    ctx.fillText(`Para ${para}`, 540, cursor);
    cursor += 80;
  } else {
    cursor += 24;
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 64px Outfit, sans-serif";
  for (const linea of titulo) {
    ctx.fillText(linea, 540, cursor);
    cursor += 76;
  }
  cursor += 16;
  ctx.fillStyle = LIME;
  ctx.font = "600 40px Outfit, sans-serif";
  for (const linea of apoyo) {
    ctx.fillText(linea, 540, cursor);
    cursor += 52;
  }

  const pieY = 1120;
  ctx.strokeStyle = LIME;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(140, pieY);
  ctx.lineTo(940, pieY);
  ctx.stroke();
  ctx.fillStyle = LIME;
  ctx.font = "600 26px Outfit, sans-serif";
  ctx.fillText("TU ASESOR", 540, pieY + 52);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 44px Outfit, sans-serif";
  const nombre = lineas(ctx, asesor.trim() || "Radio Taxi Aeropuerto", 860);
  nombre.slice(0, 2).forEach((linea, i) => ctx.fillText(linea, 540, pieY + 112 + i * 52));

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("No pude armar la imagen");
  return blob;
}

export function AvisoTarjeta({
  placa,
  propietario,
  telefono,
  asesor,
  sugerido,
}: {
  placa: string;
  propietario: string;
  telefono: string;
  asesor: string;
  sugerido: AvisoTarjetaId;
}) {
  const [id, setId] = useState<AvisoTarjetaId>(sugerido);
  const [tocado, setTocado] = useState(false);
  const [preview, setPreview] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [aviso, setAviso] = useState("");
  const [armando, setArmando] = useState(false);
  const base = useMemo(() => mensajeDe(id, propietario, placa, asesor), [id, propietario, placa, asesor]);
  const [texto, setTexto] = useState(base);
  const actual = AVISOS.find((item) => item.id === id) ?? AVISOS[0];
  const whatsapp = telefonoWa(telefono);

  useEffect(() => {
    if (!tocado) setId(sugerido);
  }, [sugerido, tocado]);

  useEffect(() => {
    setTexto(base);
  }, [base]);

  useEffect(() => {
    let vivo = true;
    setArmando(true);
    void pintar(actual, placa, propietario, asesor)
      .then((archivo) => {
        if (!vivo) return;
        setBlob(archivo);
        setPreview((anterior) => {
          if (anterior) URL.revokeObjectURL(anterior);
          return URL.createObjectURL(archivo);
        });
      })
      .catch(() => {
        if (vivo) setAviso("No pude armar la imagen. El mensaje sí se puede copiar.");
      })
      .finally(() => {
        if (vivo) setArmando(false);
      });
    return () => {
      vivo = false;
    };
  }, [actual, placa, propietario, asesor]);

  useEffect(() => {
    return () => {
      setPreview((actual) => {
        if (actual) URL.revokeObjectURL(actual);
        return "";
      });
    };
  }, []);

  function descargar() {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tarjeta-${(placa || "proceso").toLowerCase()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso("Mensaje copiado. Pégalo en el chat del propietario.");
    } catch {
      setAviso("No pude copiar. Selecciona el texto y cópialo a mano.");
    }
  }

  async function enviar() {
    if (!blob) {
      if (whatsapp) window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
      return;
    }
    const archivo = new File([blob], `tarjeta-${(placa || "proceso").toLowerCase()}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], text: texto, title: "Tarjeta de operación" });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    descargar();
    if (whatsapp) window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
    setAviso(whatsapp ? "Imagen descargada. En WhatsApp adjúntala y el mensaje ya va escrito." : "Imagen descargada. Adjunta esa foto en el chat.");
  }

  return (
    <section className="grid gap-3 rounded-2xl border border-line p-3">
      <div>
        <p className="text-sm font-medium">Avisarle al propietario</p>
        <p className="mt-1 text-xs text-ink-soft">Una imagen con tu nombre abajo y un mensaje listo para copiar. Elige cómo va la tarjeta de operación.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {AVISOS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTocado(true);
              setId(item.id);
              setAviso("");
            }}
            className={"h-11 rounded-2xl border text-sm font-semibold " + (id === item.id ? "border-navy bg-navy text-paper" : "border-line")}
          >
            {item.label}
          </button>
        ))}
      </div>
      {preview ? <img src={preview} alt={actual.titulo} className="mx-auto w-full max-w-sm rounded-2xl border border-line" /> : <p className="text-sm text-ink-soft">{armando ? "Armando la imagen…" : "La imagen aparece aquí."}</p>}
      <label className="text-sm font-medium">
        Mensaje
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} className="mt-1 w-full rounded-2xl border border-line px-3 py-2 text-sm" />
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={() => void enviar()} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-navy px-3 text-sm font-semibold text-paper">
          <MessageCircle className="size-4" /> Enviar
        </button>
        <button type="button" onClick={descargar} disabled={!blob} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-line px-3 text-sm font-semibold disabled:opacity-60">
          <Download className="size-4" /> Imagen
        </button>
        <button type="button" onClick={() => void copiar()} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-line px-3 text-sm font-semibold">
          <Copy className="size-4" /> Copiar
        </button>
      </div>
      {aviso ? <p className="text-sm text-ink-soft">{aviso}</p> : null}
    </section>
  );
}
