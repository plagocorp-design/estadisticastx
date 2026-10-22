import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { conectarSheetsFn, enviarSheetsFn, estadoSheetsFn } from "@/lib/sheets.functions";

export const DOCUMENTO =
  "https://docs.google.com/spreadsheets/d/1K_0N3PwQqq34C0ojEtQISkxn_AnqDChp3evbXWy1JUs/edit";

function textoError(raw: string) {
  if (!raw) return "";
  if (/<html|<!doctype|ppConfig|ServiceLogin/i.test(raw)) {
    return "Google contestó con una página y no con los datos. Vuelve a implementar: Aplicación web, ejecutar como Yo, acceso Cualquier persona. Pega la URL que termina en /exec y dale a Conectar.";
  }
  if (/aborted|timed out|timeout/i.test(raw)) {
    return "Google se demoró y no alcanzó a actualizar el documento. Pulsa Enviar todo y espera, sin cerrar esta ventana.";
  }
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function SheetsPanel({ onClose }: { onClose: () => void }) {
  const [webappUrl, setWebappUrl] = useState("");
  const [spreadsheetUrl, setSpreadsheetUrl] = useState(DOCUMENTO);
  const [script, setScript] = useState("");
  const [conectado, setConectado] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [busy, setBusy] = useState(false);
  const caja = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    estadoSheetsFn()
      .then((estado) => {
        setConectado(estado.conectado);
        setSpreadsheetUrl(estado.spreadsheetUrl || DOCUMENTO);
        if (estado.webappUrl) setWebappUrl(estado.webappUrl);
        setScript(estado.script);
        setError(textoError(estado.lastError));
      })
      .catch(() => setError("No pude leer la conexión"));
  }, []);

  async function conectar() {
    setBusy(true);
    setAviso("");
    setError("");
    try {
      await conectarSheetsFn({ data: { webappUrl, spreadsheetUrl } });
      setConectado(true);
      setError("");
      setAviso("Conectado. Lo que hay en la página ya está en el documento.");
    } catch (err) {
      setError(textoError(err instanceof Error ? err.message : "No pude conectar"));
    } finally {
      setBusy(false);
    }
  }

  async function enviar() {
    setBusy(true);
    setError("");
    try {
      await enviarSheetsFn();
      setError("");
      setAviso("Documento actualizado. Ábrelo y revisa la hoja Procesos. Si no ves filas, recarga el documento.");
    } catch (err) {
      setError(textoError(err instanceof Error ? err.message : "No pude enviar"));
    } finally {
      setBusy(false);
    }
  }

  async function copiar() {
    const texto = script;
    try {
      await navigator.clipboard.writeText(texto);
      setAviso("Script copiado. Pégalo en Apps Script.");
    } catch {
      caja.current?.focus();
      caja.current?.select();
      setError("");
      setAviso("No pude copiar solo. El recuadro quedó seleccionado: mantenlo pulsado y elige Copiar.");
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-ink/40" onClick={onClose}>
      <div className="flex h-dvh w-full max-w-xl flex-col bg-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-lg font-semibold">Google Sheets</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid size-11 place-items-center rounded-xl">
            <X />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
          <p className="text-ink-soft">
            Procesos, agenda, metas, calendario, resumen y equipo quedan en el mismo documento. Si cambias la página, el
            documento se actualiza. Si cambias el documento, la página se actualiza sola.
          </p>
          <p className={conectado ? "font-semibold text-navy" : "text-ink-soft"}>
            {conectado ? "Conectado." : "Falta un paso en Google, una sola vez."}
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-ink-soft">
            <li>Abre el documento Vincula Libre (ya está en tu Drive; el link queda abajo).</li>
            <li>Extensiones → Apps Script. Borra lo que haya, pega el script del recuadro y guarda.</li>
            <li>Arriba, donde dice la función, elige autorizar y pulsa Ejecutar. Acepta Sheets y también Drive.</li>
            <li>Si ya estaba conectado, no hagas otra URL. Implementar → Administrar implementaciones → el lápiz → Versión: Nueva versión → Implementar. La URL sigue igual.</li>
            <li>Si es la primera vez: Implementar → Nueva implementación. Ejecutar como: Yo. Quién tiene acceso: Cualquier persona. Copia la URL que termina en /exec.</li>
            <li>Pégala abajo, con el link del documento, y dale a Conectar. Los documentos quedan en Drive, carpeta Vincula Libre, una carpeta por placa.</li>
          </ol>
          <p className="text-ink-soft">
            Para mover un proceso puedes cambiar la columna Estado (Dijo sí, En firma, Póliza lista…) o marcar Sí / No.
            Para borrar una fila escribe Sí en Borrar. No borres la columna id.
          </p>
          <button type="button" onClick={() => void copiar()} className="h-10 rounded-full border border-line px-4 font-semibold">
            Copiar script
          </button>
          <textarea
            ref={caja}
            readOnly
            value={script}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Script para Google"
            className="h-40 w-full resize-y rounded-2xl border border-line bg-paper p-3 font-mono text-xs"
          />
          <label className="block font-medium">
            URL de la aplicación web
            <input
              value={webappUrl}
              onChange={(e) => setWebappUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/..."
              className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
            />
          </label>
          <label className="block font-medium">
            Link del documento
            <input
              value={spreadsheetUrl}
              onChange={(e) => setSpreadsheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/..."
              className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
            />
          </label>
          {spreadsheetUrl.startsWith("http") ? (
            <a href={spreadsheetUrl} target="_blank" rel="noreferrer" className="inline-block font-semibold text-navy">
              Abrir el documento
            </a>
          ) : null}
          {error ? <p className="text-danger">{error}</p> : null}
          {aviso ? <p className="text-navy">{aviso}</p> : null}
        </div>
        <div className="flex gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            disabled={busy || !conectado}
            onClick={() => void enviar()}
            className="h-11 flex-1 rounded-2xl border border-line font-semibold disabled:opacity-50"
          >
            {busy ? "Enviando…" : "Enviar todo"}
          </button>
          <button
            type="button"
            disabled={busy || !webappUrl}
            onClick={() => void conectar()}
            className="h-11 flex-1 rounded-2xl bg-navy font-semibold text-paper disabled:opacity-50"
          >
            {busy ? "Conectando…" : "Conectar"}
          </button>
        </div>
      </div>
    </div>
  );
}
