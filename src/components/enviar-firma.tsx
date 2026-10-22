import { useState, type FormEvent } from "react";
import { enviarPortal } from "@/lib/firma.functions";

function textoCorreo(enlace: string) {
  return `Hola,\n\nTe enviamos el contrato de vinculación para que lo leas y lo firmes.\n\nNo respondas este correo. Entra aquí y firma:\n${enlace}\n\nEl enlace es solo tuyo.\n`;
}

function falloCorreo(error: string) {
  if (error.includes("missing_connector_token")) {
    return "El sitio no pudo usar Gmail. Copia el enlace o ábrelo en tu correo y mándaselo tú.";
  }
  return "No salió el correo. Copia el enlace y mándaselo tú.";
}

export function EnviarFirma({
  casoId,
  correo,
  placa,
  nombre,
  cc,
  telefono,
  direccion,
  marca,
  linea,
  modelo,
  onEnviado,
}: {
  casoId: number;
  correo: string;
  placa: string;
  nombre: string;
  cc: string;
  telefono: string;
  direccion: string;
  marca: string;
  linea: string;
  modelo: string;
  onEnviado?: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [para, setPara] = useState(correo);
  const [dir, setDir] = useState(direccion);
  const [marcaV, setMarcaV] = useState(marca);
  const [lineaV, setLineaV] = useState(linea);
  const [modeloV, setModeloV] = useState(modelo);
  const [clase, setClase] = useState("AUTOMÓVIL");
  const [carroceria, setCarroceria] = useState("");
  const [motor, setMotor] = useState("");
  const [serie, setSerie] = useState("");
  const [cilindraje, setCilindraje] = useState("");
  const [servicio, setServicio] = useState("PÚBLICO");
  const [otro, setOtro] = useState(false);
  const [segundoNombre, setSegundoNombre] = useState("");
  const [segundoCc, setSegundoCc] = useState("");
  const [segundoCorreo, setSegundoCorreo] = useState("");
  const [error, setError] = useState("");
  const [enviados, setEnviados] = useState<{ correo: string; enlace: string; ok: boolean; error: string }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState("");

  async function armar(soloAbrir: boolean) {
    setError("");
    setEnviados([]);
    setGuardando(true);
    try {
      const result = await enviarPortal({
        data: {
          casoId,
          correo: para,
          nombre,
          cc,
          telefono,
          direccion: dir,
          marca: marcaV,
          linea: lineaV,
          modelo: modeloV,
          clase,
          carroceria,
          motor,
          serie,
          cilindraje,
          servicio,
          segundoNombre: otro ? segundoNombre : "",
          segundoCc: otro ? segundoCc : "",
          segundoCorreo: otro ? segundoCorreo : "",
          soloAbrir,
        },
      });
      if (soloAbrir && result.enviados[0]) {
        const sigue = result.enviados[1]?.enlace.split("/").pop();
        window.location.assign(result.enviados[0].enlace + (sigue ? `?sigue=${sigue}` : ""));
        return;
      }
      setEnviados(result.enviados);
      if (result.docusealId) onEnviado?.(result.docusealId);
      const pendiente = result.enviados.find((item) => !item.ok && item.correo.includes("@"));
      if (pendiente) {
        window.location.href = `mailto:${pendiente.correo}?subject=${encodeURIComponent("Contrato para firmar")}&body=${encodeURIComponent(textoCorreo(pendiente.enlace))}`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude abrir el portal");
    } finally {
      setGuardando(false);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    await armar(false);
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="h-11 rounded-2xl border border-line px-4 text-sm font-semibold">
        Enviar a firmar
      </button>
    );
  }

  return (
    <form onSubmit={(e) => void enviar(e)} className="grid gap-2 rounded-card border border-line bg-paper p-3">
      <p className="text-sm font-semibold">Portal de firma · {placa}</p>
      <p className="text-xs text-ink-soft">Estos datos quedan escritos en el contrato. El correo lo manda DocuSeal. Si no sale, copia el enlace o ábrelo en tu correo.</p>
      <input value={para} onChange={(e) => setPara(e.target.value)} placeholder="Correo del propietario" className="h-11 rounded-2xl border border-line px-3" />
      <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="Dirección" className="h-11 rounded-2xl border border-line px-3" />
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={marcaV} onChange={(e) => setMarcaV(e.target.value)} placeholder="Marca" className="h-11 rounded-2xl border border-line px-3" />
        <input value={lineaV} onChange={(e) => setLineaV(e.target.value)} placeholder="Línea" className="h-11 rounded-2xl border border-line px-3" />
        <input value={modeloV} onChange={(e) => setModeloV(e.target.value)} placeholder="Modelo" className="h-11 rounded-2xl border border-line px-3" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={clase} onChange={(e) => setClase(e.target.value)} placeholder="Clase" className="h-11 rounded-2xl border border-line px-3" />
        <input value={carroceria} onChange={(e) => setCarroceria(e.target.value)} placeholder="Carrocería" className="h-11 rounded-2xl border border-line px-3" />
        <input value={motor} onChange={(e) => setMotor(e.target.value)} placeholder="Motor" className="h-11 rounded-2xl border border-line px-3" />
        <input value={serie} onChange={(e) => setSerie(e.target.value)} placeholder="Serie" className="h-11 rounded-2xl border border-line px-3" />
        <input value={cilindraje} onChange={(e) => setCilindraje(e.target.value)} placeholder="Cilindraje" className="h-11 rounded-2xl border border-line px-3" />
        <input value={servicio} onChange={(e) => setServicio(e.target.value)} placeholder="Servicio" className="h-11 rounded-2xl border border-line px-3" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={otro} onChange={(e) => setOtro(e.target.checked)} />
        Hay otro propietario
      </label>
      {otro ? (
        <div className="grid gap-2">
          <input value={segundoNombre} onChange={(e) => setSegundoNombre(e.target.value)} placeholder="Nombre del otro propietario" className="h-11 rounded-2xl border border-line px-3" />
          <input value={segundoCc} onChange={(e) => setSegundoCc(e.target.value)} placeholder="Cédula" className="h-11 rounded-2xl border border-line px-3" />
          <input value={segundoCorreo} onChange={(e) => setSegundoCorreo(e.target.value)} placeholder="Correo del otro propietario" className="h-11 rounded-2xl border border-line px-3" />
        </div>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {enviados.map((item) => (
        <div key={item.enlace} className="grid gap-2 rounded-2xl border border-line p-3 text-sm">
          <p>{item.ok ? `DocuSeal lo envió a ${item.correo}` : `No salió a ${item.correo}. ${falloCorreo(item.error)}`}</p>
          <p className="break-all text-ink-soft">{item.enlace}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(item.enlace);
                setCopiado(item.enlace);
              }}
              className="h-10 rounded-2xl border border-line font-semibold"
            >
              {copiado === item.enlace ? "Copiado" : "Copiar enlace"}
            </button>
            <a
              href={`mailto:${item.correo}?subject=${encodeURIComponent("Contrato para firmar")}&body=${encodeURIComponent(textoCorreo(item.enlace))}`}
              className="grid h-10 place-items-center rounded-2xl bg-navy font-semibold text-paper"
            >
              Abrir en mi correo
            </a>
          </div>
        </div>
      ))}
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={guardando} onClick={() => void armar(true)} className="h-11 rounded-2xl bg-navy text-sm font-semibold text-paper disabled:opacity-60">
          {guardando ? "Abriendo…" : "Firmar en esta tablet"}
        </button>
        <button type="submit" disabled={guardando} className="h-11 rounded-2xl border border-line text-sm font-semibold disabled:opacity-60">
          Enviar por correo
        </button>
      </div>
    </form>
  );
}
