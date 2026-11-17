import { useEffect, useState, type FormEvent } from "react";
import { enviarPortal, estadoFirma, reenviarFirma } from "@/lib/firma.functions";

function textoCorreo(enlace: string) {
  return `Hola,\n\nTe enviamos el contrato de vinculación para que lo leas y lo firmes.\n\nNo respondas este correo. Entra aquí y firma:\n${enlace}\n\nEl enlace es solo tuyo.\n`;
}

function falloCorreo(error: string) {
  return error || "No salió el correo.";
}

type ParteFirma = {
  id: number;
  nombre: string;
  correo: string;
  firmado: boolean;
  en: string;
  ip: string;
  agente: string;
  huella: string;
  tieneFoto: boolean;
};

const ESTADO: Record<string, string> = {
  sin_enviar: "Sin enviar",
  enviado: "Enviado",
  pendiente: "Pendiente de firma",
  firmado: "Firmado",
};

function horaDe(valor: string) {
  if (!valor) return "";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
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
  empresa,
  capacidad = "",
  clase = "AUTOMÓVIL",
  carroceria = "",
  motor = "",
  serie = "",
  cilindraje = "",
  servicio = "PÚBLICO",
  copropietarios = "",
  nitInicial = "",
  exigir = [],
  onFaltan,
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
  empresa: string;
  capacidad?: string;
  clase?: string;
  carroceria?: string;
  motor?: string;
  serie?: string;
  cilindraje?: string;
  servicio?: string;
  copropietarios?: string;
  nitInicial?: string;
  exigir?: { clave: string; label: string; valor: string }[];
  onFaltan?: (claves: string[]) => void;
  onEnviado?: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nitAnterior, setNitAnterior] = useState(nitInicial);
  const [otros] = useState<{ nombre: string; cc: string; correo: string }[]>(() => {
    try {
      const data = JSON.parse(copropietarios) as { nombre?: string; cc?: string; correo?: string }[];
      if (!Array.isArray(data)) return [];
      return data
        .filter((parte) => parte && typeof parte.nombre === "string" && parte.nombre.trim())
        .map((parte) => ({ nombre: parte.nombre ?? "", cc: parte.cc ?? "", correo: parte.correo ?? "" }));
    } catch {
      return [];
    }
  });
  const [error, setError] = useState("");
  const [enviados, setEnviados] = useState<{ correo: string; enlace: string; ok: boolean; error: string }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState("");
  const [estado, setEstado] = useState("sin_enviar");
  const [partes, setPartes] = useState<ParteFirma[]>([]);
  const [firmados, setFirmados] = useState(0);
  const [auditoria, setAuditoria] = useState(false);
  const [otroCorreo, setOtroCorreo] = useState<Record<number, string>>({});
  const [reenviando, setReenviando] = useState(0);

  async function cargarEstado() {
    try {
      const dato = await estadoFirma({ data: casoId });
      setEstado(dato.estado);
      setPartes(dato.partes);
      setFirmados(dato.firmados);
    } catch {
      setEstado("sin_enviar");
    }
  }

  useEffect(() => {
    if (nitInicial) setNitAnterior(nitInicial);
  }, [nitInicial]);

  useEffect(() => {
    void cargarEstado();
  }, [casoId]);

  async function armar(soloAbrir: boolean) {
    if (!completos()) return;
    setError("");
    setEnviados([]);
    setGuardando(true);
    try {
      const result = await enviarPortal({
        data: {
          casoId,
          correo,
          nombre,
          cc,
          telefono,
          direccion,
          marca,
          linea,
          modelo,
          clase,
          carroceria,
          motor,
          serie,
          cilindraje,
          servicio,
          capacidad,
          nitAnterior,
          otros,
          soloAbrir,
        },
      });
      if (soloAbrir && result.enviados[0]) {
        const resto = result.enviados
          .slice(1)
          .map((item) => item.enlace.split("/").pop() ?? "")
          .filter(Boolean)
          .join(",");
        window.location.assign(result.enviados[0].enlace + (resto ? `?sigue=${encodeURIComponent(resto)}` : ""));
        return;
      }
      setEnviados(result.enviados);
      if (result.docusealId) onEnviado?.(result.docusealId);
      await cargarEstado();
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

  function completos() {
    const pedidos = exigir.length
      ? exigir
      : [
          { clave: "correo", label: "Correo", valor: correo },
          { clave: "direccion", label: "Dirección", valor: direccion },
          { clave: "marca", label: "Marca", valor: marca },
          { clave: "linea", label: "Línea", valor: linea },
          { clave: "modelo", label: "Modelo", valor: modelo },
          { clave: "clase", label: "Clase", valor: clase },
          { clave: "carroceria", label: "Carrocería", valor: carroceria },
          { clave: "motor", label: "Motor", valor: motor },
          { clave: "serie", label: "Serie", valor: serie },
          { clave: "cilindraje", label: "Cilindraje", valor: cilindraje },
          { clave: "servicio", label: "Servicio", valor: servicio },
          { clave: "capacidad", label: "Pasajeros", valor: capacidad },
        ];
    const faltan = pedidos.filter((item) => !item.valor.trim());
    onFaltan?.(faltan.map((item) => item.clave));
    if (!faltan.length) return true;
    setError(`Completa estos datos antes de enviar: ${faltan.map((item) => item.label).join(", ")}.`);
    return false;
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    await armar(false);
  }

  async function reenviar(parte: ParteFirma) {
    const correo = (otroCorreo[parte.id] || parte.correo).trim();
    setError("");
    setReenviando(parte.id);
    try {
      await reenviarFirma({ data: { casoId, firmanteId: parte.id, correo } });
      await cargarEstado();
      setEnviados([{ correo, enlace: "", ok: true, error: "" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude reenviar");
    } finally {
      setReenviando(0);
    }
  }

  const etiqueta = ESTADO[estado] || "Sin enviar";
  const color =
    estado === "firmado" ? "bg-[#e7f6d4] text-[#24520f]" : estado === "pendiente" ? "bg-[#fff4d6] text-[#7a4b00]" : estado === "enviado" ? "bg-[#e7eef8] text-[#1b3a4b]" : "bg-paper text-ink-soft";

  if (!abierto) {
    return (
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ${color}`}>{etiqueta}</span>
          {partes.length ? <span className="text-xs text-ink-soft">{firmados} de {partes.length} firmaron</span> : null}
        </div>
        <button type="button" onClick={() => { if (estado === "sin_enviar" && !completos()) return; setAbierto(true); }} className="h-11 rounded-2xl border border-line px-4 text-sm font-semibold">
          {estado === "sin_enviar" ? "Enviar a firmar" : "Ver firma"}
        </button>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void enviar(e)} className="grid gap-2 rounded-card border border-line bg-paper p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Portal de firma · {placa}</p>
        <span className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ${color}`}>{etiqueta}</span>
      </div>
      <p className="text-xs text-ink-soft">Usa los datos que ya están arriba. El correo sale de vinculaciones@taxislibres.com.co a {correo || "sin correo"}.</p>
      {empresa && !/ninguna/i.test(empresa) ? (
        <input value={nitAnterior} onChange={(e) => setNitAnterior(e.target.value)} placeholder={`NIT de ${empresa}, si lo tienes`} className="h-11 rounded-2xl border border-line px-3" />
      ) : null}
      {otros.length ? (
        <p className="text-sm text-ink-soft">
          También firman: {otros.map((parte) => parte.nombre).filter(Boolean).join(", ")}. Los agregas en el seguimiento, no aquí.
        </p>
      ) : null}
      {partes.length ? (
        <div className="grid gap-2">
          {partes.map((parte) => (
            <div key={parte.id} className="grid gap-2 rounded-2xl border border-line p-3 text-sm">
              <p className="font-semibold">
                {parte.nombre} · {parte.firmado ? "Firmado" : "Pendiente de firma"}
              </p>
              <p className="text-ink-soft">{parte.correo}</p>
              {parte.firmado ? <p className="text-ink-soft">{horaDe(parte.en)}{parte.tieneFoto ? " · con foto y cédula" : ""}</p> : null}
              {!parte.firmado ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={otroCorreo[parte.id] ?? parte.correo}
                    onChange={(e) => setOtroCorreo((actual) => ({ ...actual, [parte.id]: e.target.value }))}
                    placeholder="Otro correo"
                    className="h-10 rounded-2xl border border-line px-3"
                  />
                  <button type="button" disabled={reenviando === parte.id} onClick={() => void reenviar(parte)} className="h-10 rounded-2xl border border-line px-3 font-semibold disabled:opacity-60">
                    {reenviando === parte.id ? "Enviando…" : "Reenviar"}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          <button type="button" onClick={() => setAuditoria((v) => !v)} className="h-10 rounded-2xl text-left text-sm font-semibold text-navy">
            {auditoria ? "Ocultar registro" : "Registro de la firma"}
          </button>
          {auditoria
            ? partes.filter((parte) => parte.firmado).map((parte) => (
                <div key={`aud-${parte.id}`} className="rounded-2xl bg-white p-3 text-sm">
                  <p className="font-semibold">{parte.nombre}</p>
                  <p>Firmó el {horaDe(parte.en) || "sin hora"} desde {parte.ip || "una conexión sin IP visible"}.</p>
                  <p className="text-ink-soft">{parte.agente || "Sin dato del navegador"}</p>
                  <p className="text-ink-soft">Huella {parte.huella || "—"}. {parte.tieneFoto ? "Quedó la foto con la cédula." : "No quedó foto."}</p>
                </div>
              ))
            : null}
          {auditoria && !partes.some((parte) => parte.firmado) ? <p className="text-sm text-ink-soft">Todavía nadie firma. El registro aparece cuando firmen.</p> : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {enviados.map((item) => (
        <div key={item.correo} className="grid gap-2 rounded-2xl border border-line p-3 text-sm">
          <p>{item.ok ? `Se envió desde vinculaciones@ a ${item.correo}` : `No salió a ${item.correo}. ${falloCorreo(item.error)}`}</p>
          {item.enlace ? (
            <>
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
            </>
          ) : (
            <p className="text-ink-soft">El enlace para firmar llega en ese correo.</p>
          )}
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
