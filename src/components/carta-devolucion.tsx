import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { generarCartaDevolucion } from "@/lib/firma.functions";

function hoy() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

function diasEntre(desde: string, hasta: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return 0;
  const a = Date.UTC(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, Number(desde.slice(8, 10)));
  const b = Date.UTC(Number(hasta.slice(0, 4)), Number(hasta.slice(5, 7)) - 1, Number(hasta.slice(8, 10)));
  return Math.round((b - a) / 86400000);
}

function pesos(valor: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor);
}

function Campo({ label, value, onChange, type = "text", placeholder = "" }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-line px-3" />
    </label>
  );
}

export function CartaDevolucion({
  empresa,
  propietario,
  cc,
  telefono,
  correo,
  placa,
  marca,
  modelo,
}: {
  empresa: string;
  propietario: string;
  cc: string;
  telefono: string;
  correo: string;
  placa: string;
  marca: string;
  modelo: string;
}) {
  const [ciudad, setCiudad] = useState("Bogotá D.C.");
  const [empresaCarta, setEmpresaCarta] = useState(empresa);
  const [nit, setNit] = useState("");
  const [direccionEmpresa, setDireccionEmpresa] = useState("");
  const [correoEmpresa, setCorreoEmpresa] = useState("");
  const [aseguradora, setAseguradora] = useState("");
  const [poliza, setPoliza] = useState("");
  const [inicio, setInicio] = useState("");
  const [vence, setVence] = useState("");
  const [desde, setDesde] = useState(hoy);
  const [valor, setValor] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const cuenta = useMemo(() => {
    const pagado = Number(valor.replace(/\D/g, ""));
    const vigencia = diasEntre(inicio, vence);
    const restantes = diasEntre(desde, vence);
    if (!pagado || vigencia <= 0 || restantes <= 0 || restantes > vigencia) return null;
    const diario = pagado / vigencia;
    return { vigencia, restantes, diario, devolver: diario * restantes, pagado };
  }, [valor, inicio, vence, desde]);

  const liquidacion = cuenta
    ? `Liquidación de referencia: vigencia de ${inicio} a ${vence} (${cuenta.vigencia} días). Desde ${desde} quedan ${cuenta.restantes} días. Valor cobrado ${pesos(cuenta.pagado)}, valor diario ${pesos(cuenta.diario)}, valor aproximado a devolver ${pesos(cuenta.devolver)}. Solicito que la empresa confirme esta cuenta con la factura de la aseguradora.`
    : "";

  async function bajar(destino: "empresa" | "aseguradora" | "desvinculacion") {
    setBusy(destino);
    setError("");
    try {
      const file = await generarCartaDevolucion({
        data: {
          destino,
          ciudad,
          empresa: empresaCarta,
          nit,
          direccionEmpresa,
          correoEmpresa,
          propietario,
          cc,
          telefono,
          correo,
          placa,
          marca,
          modelo,
          aseguradora,
          poliza,
          desde,
          liquidacion,
          fecha: hoy(),
        },
      });
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude armar la carta");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="grid gap-3 rounded-2xl border border-line p-3">
      <div>
        <p className="text-sm font-medium">Cartas, cada una por separado</p>
        <p className="mt-1 text-xs text-ink-soft">
          La de desvinculación la firma el propietario: pide que lo saquen de la empresa, del sistema, de las planillas y que cancelen el tarjetón. Las otras dos son de la póliza, una para la empresa y otra para la aseguradora. La cédula y la tarjeta de propiedad se adjuntan aparte.
        </p>
      </div>
      <a
        href="https://portalpublico.runt.gov.co/#/consulta-vehiculo"
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-11 items-center justify-center rounded-2xl border border-line px-3 text-sm font-semibold"
      >
        Consultar fechas en el RUNT
      </a>
      <p className="text-xs text-ink-soft">
        El RUNT muestra el SOAT: aseguradora, número, día en que empezó y día en que vence. Las pólizas RCC y RCE de la empresa casi nunca salen ahí, porque están a nombre de la empresa. Si las fechas están en el extracto o en la póliza, escríbelas abajo y la cuenta sale sola.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Campo label="Ciudad" value={ciudad} onChange={setCiudad} />
        <Campo label="Desde el día" type="date" value={desde} onChange={setDesde} />
      </div>
      <Campo label="Empresa" value={empresaCarta} onChange={setEmpresaCarta} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Campo label="NIT" value={nit} onChange={setNit} />
        <Campo label="Correo de la empresa" value={correoEmpresa} onChange={setCorreoEmpresa} />
      </div>
      <Campo label="Dirección de la empresa" value={direccionEmpresa} onChange={setDireccionEmpresa} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Campo label="Aseguradora" value={aseguradora} onChange={setAseguradora} placeholder="Si se conoce" />
        <Campo label="Número de póliza" value={poliza} onChange={setPoliza} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Campo label="La póliza empezó" type="date" value={inicio} onChange={setInicio} />
        <Campo label="La póliza vence" type="date" value={vence} onChange={setVence} />
        <Campo label="Valor que le cobraron" value={valor} onChange={setValor} placeholder="Ej. 850000" />
      </div>
      {cuenta ? (
        <p className="rounded-2xl bg-lime px-3 py-3 text-sm text-ink">
          {cuenta.vigencia} días de vigencia, {cuenta.restantes} sin usar. Al día {pesos(cuenta.diario)}. A devolver, aproximadamente, {pesos(cuenta.devolver)}.
        </p>
      ) : (
        <p className="text-xs text-ink-soft">Sin las tres fechas y el valor no calculo. La carta igual se puede sacar.</p>
      )}
      <button type="button" onClick={() => void bajar("desvinculacion")} disabled={busy !== ""} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-navy px-3 text-sm font-semibold text-paper disabled:opacity-60">
        <FileText className="size-4" /> {busy === "desvinculacion" ? "Armando…" : "Carta de desvinculación"}
      </button>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => void bajar("empresa")} disabled={busy !== ""} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-line px-3 text-sm font-semibold disabled:opacity-60">
          <FileText className="size-4" /> {busy === "empresa" ? "Armando…" : "Carta de la póliza a la empresa"}
        </button>
        <button type="button" onClick={() => void bajar("aseguradora")} disabled={busy !== ""} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-line px-3 text-sm font-semibold disabled:opacity-60">
          <FileText className="size-4" /> {busy === "aseguradora" ? "Armando…" : "Carta a la aseguradora"}
        </button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </section>
  );
}
