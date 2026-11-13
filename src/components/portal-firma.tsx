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
    ctx.strokeStyle = "#1b3a4b";
    ctx.lineWidth = 3.2;
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
        className="h-40 w-full touch-none rounded-2xl border border-[#d7e0dc] bg-white"
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerLeave={soltar}
      />
      <button type="button" onClick={limpiar} className="mt-2 text-sm font-semibold text-[#5c6b7a]">
        Borrar firma
      </button>
    </div>
  );
}

function ContratoCompleto({ pdf }: { pdf: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const [total, setTotal] = useState(0);
  const [aviso, setAviso] = useState("Abriendo todas las páginas…");

  useEffect(() => {
    const destino = caja.current;
    if (!destino) return;
    let cancelado = false;
    destino.replaceChildren();
    setAviso("Abriendo todas las páginas…");
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const binario = Uint8Array.from(atob(pdf), (letra) => letra.charCodeAt(0));
      const doc = await pdfjs.getDocument({ data: binario }).promise;
      if (cancelado) return;
      const hasta = Math.min(doc.numPages, 24);
      setTotal(doc.numPages);
      const ancho = Math.max(280, destino.clientWidth || window.innerWidth - 32);
      for (let numero = 1; numero <= hasta; numero += 1) {
        if (cancelado) return;
        const hoja = await doc.getPage(numero);
        const base = hoja.getViewport({ scale: 1 });
        const vista = hoja.getViewport({ scale: Math.min(2, ancho / base.width) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(vista.width);
        canvas.height = Math.floor(vista.height);
        canvas.className = "mb-3 w-full rounded-2xl bg-white shadow-sm";
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await hoja.render({ canvasContext: ctx, viewport: vista }).promise;
        if (cancelado) return;
        destino.appendChild(canvas);
      }
      setAviso(doc.numPages > hasta ? `Se muestran ${hasta} de ${doc.numPages} páginas.` : "");
    })().catch((err) => {
      if (!cancelado) setAviso(err instanceof Error ? err.message : "No pude mostrar el contrato");
    });
    return () => {
      cancelado = true;
    };
  }, [pdf]);

  return (
    <div className="mt-5">
      <p className="mb-2 text-xs font-semibold tracking-wide text-[#5c6b7a] uppercase">{total ? `${total} páginas. Desliza para verlas todas.` : "Contrato"}</p>
      <div ref={caja} />
      {aviso ? <p className="text-sm text-[#5c6b7a]">{aviso}</p> : null}
    </div>
  );
}

function piel(r: number, g: number, b: number) {
  return r > 80 && g > 30 && b > 15 && r > g && r > b && r - g > 12;
}

function FotoCedula({ onChange }: { onChange: (jpeg: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [foto, setFoto] = useState("");
  const [cara, setCara] = useState(false);
  const [cedula, setCedula] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (!abierta) return;
    let vivo = true;
    let flujo: MediaStream | null = null;
    const lienzo = document.createElement("canvas");
    const ctx = lienzo.getContext("2d", { willReadFrequently: true });
    let frame = 0;
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then(async (medio) => {
        flujo = medio;
        if (!vivo || !video.current) {
          medio.getTracks().forEach((pista) => pista.stop());
          return;
        }
        video.current.srcObject = medio;
        await video.current.play();
      })
      .catch(() => setAviso("No pude abrir la cámara. Permite la cámara y vuelve a intentar."));

    const reloj = window.setInterval(() => {
      const medio = video.current;
      if (!medio || !ctx || medio.videoWidth < 20) return;
      const ancho = 180;
      const alto = Math.round((ancho * window.innerHeight) / Math.max(1, window.innerWidth));
      lienzo.width = ancho;
      lienzo.height = alto;
      const escala = Math.max(ancho / medio.videoWidth, alto / medio.videoHeight);
      const w = medio.videoWidth * escala;
      const h = medio.videoHeight * escala;
      ctx.save();
      ctx.translate(ancho, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(medio, (ancho - w) / 2, (alto - h) / 2, w, h);
      ctx.restore();
      const datos = ctx.getImageData(0, 0, ancho, alto).data;
      const zona = (x0: number, y0: number, x1: number, y1: number) => {
        let n = 0;
        let pieles = 0;
        let suma = 0;
        let suma2 = 0;
        let bordes = 0;
        const ax = Math.max(0, Math.floor(x0 * ancho));
        const ay = Math.max(0, Math.floor(y0 * alto));
        const bx = Math.min(ancho - 1, Math.floor(x1 * ancho));
        const by = Math.min(alto - 1, Math.floor(y1 * alto));
        for (let y = ay; y < by; y += 2) {
          for (let x = ax; x < bx; x += 2) {
            const i = (y * ancho + x) * 4;
            const r = datos[i];
            const g = datos[i + 1];
            const b = datos[i + 2];
            const luz = (r + g + b) / 3;
            n += 1;
            suma += luz;
            suma2 += luz * luz;
            if (piel(r, g, b)) pieles += 1;
            const j = (y * ancho + Math.min(ancho - 1, x + 2)) * 4;
            bordes += Math.abs(luz - (datos[j] + datos[j + 1] + datos[j + 2]) / 3);
          }
        }
        const media = n ? suma / n : 0;
        const variacion = n ? Math.sqrt(Math.max(0, suma2 / n - media * media)) : 0;
        return { piel: n ? pieles / n : 0, variacion, bordes: n ? bordes / n : 0 };
      };
      const rostro = zona(0.28, 0.16, 0.62, 0.58);
      const documento = zona(0.64, 0.22, 0.92, 0.58);
      const hayCara = rostro.piel > 0.12 && rostro.variacion > 14;
      const hayCedula = documento.variacion > 22 && documento.bordes > 10 && documento.piel < 0.72;
      if (hayCara && hayCedula) frame += 1;
      else frame = 0;
      setCara(hayCara);
      setCedula(hayCedula);
      if (frame >= 4) setAviso("");
    }, 280);

    return () => {
      vivo = false;
      window.clearInterval(reloj);
      flujo?.getTracks().forEach((pista) => pista.stop());
      if (video.current) video.current.srcObject = null;
    };
  }, [abierta]);

  function tomar() {
    const medio = video.current;
    if (!medio || !cara || !cedula) return;
    const canvas = document.createElement("canvas");
    const lado = 960;
    const escala = Math.min(1, lado / Math.max(medio.videoWidth, medio.videoHeight));
    canvas.width = Math.max(1, Math.round(medio.videoWidth * escala));
    canvas.height = Math.max(1, Math.round(medio.videoHeight * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(medio, 0, 0, canvas.width, canvas.height);
    const jpeg = canvas.toDataURL("image/jpeg", 0.72);
    setFoto(jpeg);
    onChange(jpeg);
    setAbierta(false);
  }

  function repetir() {
    setFoto("");
    onChange("");
    setAviso("");
    setAbierta(true);
  }

  const listo = cara && cedula;
  const falta = !cara && !cedula ? "Pon la cara en la silueta y la cédula en el recuadro" : !cara ? "Falta tu cara dentro de la silueta" : !cedula ? "Falta la cédula dentro del recuadro" : "Quédate quieto y toma la foto";

  return (
    <div className="grid gap-3">
      {foto ? (
        <div className="grid gap-3">
          <img src={foto} alt="Foto con la cédula" className="max-h-80 w-full rounded-2xl object-cover" />
          <button type="button" onClick={repetir} className="h-11 rounded-2xl border border-[#1b3a4b] text-sm font-semibold text-[#1b3a4b]">
            Borrar y tomar otra
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAbierta(true)} className="h-12 rounded-2xl bg-[#1b3a4b] text-sm font-semibold text-white">
          Abrir cámara
        </button>
      )}
      {aviso && !abierta ? <p className="text-sm text-red-700">{aviso}</p> : null}
      {abierta ? (
        <div className="fixed inset-0 z-50 bg-black">
          <video ref={video} playsInline muted autoPlay className="h-full w-full object-cover [transform:scaleX(-1)]" />
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-[16%] left-[28%] h-[42%] w-[34%] rounded-[999px] border-4 border-[#c6e84a] shadow-[0_0_0_9999px_rgba(0,0,0,.35)]" />
            <div className="absolute top-[22%] left-[64%] h-[36%] w-[26%] rounded-xl border-4 border-white" />
            <p className="absolute top-[12%] left-[28%] text-sm font-semibold text-white">Tu cara</p>
            <p className="absolute top-[18%] left-[64%] text-sm font-semibold text-white">Cédula</p>
          </div>
          <div className="absolute inset-x-0 bottom-0 grid gap-3 bg-gradient-to-t from-black/80 to-transparent px-5 pt-16 pb-8 text-center">
            <p className="text-sm font-semibold text-white">{falta}</p>
            <div className="flex items-center justify-center gap-6">
              <button type="button" onClick={() => setAbierta(false)} className="h-12 rounded-full px-4 text-sm font-semibold text-white">
                Cancelar
              </button>
              <button
                type="button"
                disabled={!listo}
                onClick={tomar}
                aria-label="Tomar foto"
                className="grid size-20 place-items-center rounded-full border-4 border-white disabled:opacity-40"
              >
                <span className={"size-14 rounded-full " + (listo ? "bg-[#c6e84a]" : "bg-white/70")} />
              </button>
              <span className="w-16" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function bajarPdf(base64: string, nombre: string) {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

export function PortalFirma({ token }: { token: string }) {
  const [pdf, setPdf] = useState("");
  const [nombre, setNombre] = useState("");
  const [placa, setPlaca] = useState("");
  const [asesor, setAsesor] = useState("");
  const [ya, setYa] = useState(false);
  const [otro, setOtro] = useState("");
  const [firma, setFirma] = useState("");
  const [foto, setFoto] = useState("");
  const [acepto, setAcepto] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [fiesta, setFiesta] = useState(false);
  const sigue = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("sigue") ?? "";

  useEffect(() => {
    verPortal({ data: token })
      .then((portal) => {
        setPdf(portal.pdf);
        setNombre(portal.nombre);
        setPlaca(portal.datos.placa);
        setAsesor(portal.asesor || "");
        setYa(portal.yaFirmo);
        setOtro(portal.otro);
        if (portal.yaFirmo) setFiesta(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No pude abrir el contrato"));
  }, [token]);

  async function firmar() {
    setError("");
    if (!foto) {
      setError("Toma la foto de frente con la cédula.");
      return;
    }
    if (!acepto) {
      setError("Marca que leíste el contrato y aceptas firmar.");
      return;
    }
    setGuardando(true);
    try {
      await firmarPortal({ data: { token, firma, foto } });
      const portal = await verPortal({ data: token });
      setPdf(portal.pdf);
      setAsesor(portal.asesor || asesor);
      setYa(true);
      setFiesta(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude guardar la firma");
    } finally {
      setGuardando(false);
    }
  }

  if (error && !pdf) return <p className="grid min-h-screen place-items-center bg-[#eef2ef] px-6 text-center text-[#5c6b7a]">{error}</p>;
  if (!pdf) return <p className="grid min-h-screen place-items-center bg-[#eef2ef] text-[#5c6b7a]">Abriendo el contrato…</p>;

  const cola = sigue.split(",").map((item) => decodeURIComponent(item).trim()).filter((item) => /^[A-Za-z0-9_-]{20,80}$/.test(item));
  const siguiente = cola[0];
  const resto = cola.slice(1).join(",");

  if (ya && fiesta) {
    return (
      <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#1b3a4b] px-6 py-10 text-center text-white">
        <style>{`
          @keyframes explosion { 0% { transform: scale(.2); opacity: .95; } 100% { transform: scale(7); opacity: 0; } }
          @keyframes aparece { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
          .circulo { position: absolute; left: 50%; top: 42%; width: 8rem; height: 8rem; margin: -4rem; border-radius: 999px; animation: explosion 1.3s ease-out both; }
          .luego { animation: aparece .6s ease both; }
        `}</style>
        <span className="circulo bg-[#1b3a4b]" />
        <span className="circulo bg-[#c6e84a]" style={{ animationDelay: ".12s" }} />
        <span className="circulo bg-white" style={{ animationDelay: ".24s" }} />
        <div className="luego relative z-10 grid max-w-md justify-items-center gap-4" style={{ animationDelay: ".7s" }}>
          <img src="/taxis-libres-blanco.png" alt="Taxis Libres" className="h-16 w-auto" />
          <h1 className="font-sans text-3xl font-semibold tracking-tight">Gracias por firmar tu contrato</h1>
          <p className="text-base leading-relaxed text-white/90">
            {placa ? `La placa ${placa} quedó firmada. ` : ""}
            Sigue el proceso con tu asesor{asesor ? `, ${asesor}` : ""}.
          </p>
          <button type="button" onClick={() => bajarPdf(pdf, `contrato-${placa || "firmado"}.pdf`)} className="h-12 w-full rounded-2xl bg-[#c6e84a] text-sm font-semibold text-[#102033]">
            Descargar el contrato firmado
          </button>
          <a href={`/api/constancia/${token}`} className="grid h-12 w-full place-items-center rounded-2xl border border-white/40 text-sm font-semibold">
            Descargar certificado
          </a>
          {siguiente ? (
            <a href={`/firmar/${siguiente}${resto ? `?sigue=${encodeURIComponent(resto)}` : ""}`} className="text-sm font-semibold text-[#c6e84a]">
              Ahora firma el siguiente propietario
            </a>
          ) : null}
          <button type="button" onClick={() => setFiesta(false)} className="text-sm text-white/70">
            Ver el contrato
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef2ef] px-4 py-8">
      <style>{`
        @keyframes subir { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        @keyframes pulso { 0%, 100% { box-shadow: 0 0 0 0 rgba(198,232,74,.7); } 70% { box-shadow: 0 0 0 12px rgba(198,232,74,0); } }
        .entra { animation: subir .45s ease both; }
        .listo-btn { animation: pulso 1.6s ease infinite; }
      `}</style>
      <div className="entra mx-auto max-w-2xl">
        <img src="/taxis-libres.png" alt="Taxis Libres" className="h-12 w-auto" />
        <h1 className="mt-4 font-sans text-3xl font-semibold tracking-tight text-[#102033]">Firma del contrato{placa ? ` · ${placa}` : ""}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#5c6b7a]">
          {nombre}, lee el contrato completo. En el teléfono se ven todas las páginas, una debajo de la otra. Después te tomas la foto con la cédula y firmas.
          {otro ? ` ${otro}.` : ""}
        </p>
        <ContratoCompleto pdf={pdf} />
        {ya ? (
          <button type="button" onClick={() => setFiesta(true)} className="mt-6 h-12 w-full rounded-2xl bg-[#c6e84a] text-sm font-semibold text-[#102033]">
            Ver la confirmación
          </button>
        ) : (
          <div className="mt-6 grid gap-5 rounded-3xl bg-white p-5">
            <section>
              <p className="text-sm font-semibold text-[#102033]">1. Foto de frente con la cédula</p>
              <div className="mt-3">
                <FotoCedula onChange={setFoto} />
              </div>
            </section>
            <section>
              <p className="text-sm font-semibold text-[#102033]">2. Firma de {nombre}</p>
              <div className="mt-2">
                <Lienzo onChange={setFirma} />
              </div>
            </section>
            <label className="flex items-start gap-2 text-sm text-[#243246]">
              <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="mt-1" />
              Leí el contrato y la carta, y acepto firmarlos con esta foto.
            </label>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <button
              type="button"
              disabled={guardando || firma.length < 800 || foto.length < 4000 || !acepto}
              onClick={() => void firmar()}
              className={"h-12 rounded-2xl bg-[#c6e84a] text-sm font-semibold text-[#102033] disabled:opacity-50 " + (firma.length >= 800 && foto.length >= 4000 && acepto ? "listo-btn" : "")}
            >
              {guardando ? "Guardando…" : "Firmar contrato y carta"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
