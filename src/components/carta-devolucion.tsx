import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { generarCartaDevolucion } from "@/lib/firma.functions";
import { leerDocumento } from "@/lib/piloto.functions";
import { nitDe } from "@/lib/nits";
import { prepararParaLeer } from "@/lib/archivo";

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
  casoId,
  empresa,
  nit,
  propietario,
  cc,
  telefono,
  correo,
  placa,
  marca,
  modelo,
  aseguradoraInicial = "",
  polizaInicial = "",
  inicioInicial = "",
  venceInicial = "",
  valorInicial = "",
  onDatos,
}: {
  casoId: number;
  empresa: string;
  nit: string;
  propietario: string;
  cc: string;
  telefono: string;
  correo: string;
  placa: string;
  marca: string;
  modelo: string;
  aseguradoraInicial?: string;
  polizaInicial?: string;
  inicioInicial?: string;
  venceInicial?: string;
  valorInicial?: string;
  onDatos?: (patch: { empresa?: string; extra?: Record<string, string> }) => void;
}) {
  const [ciudad, setCiudad] = useState("Bogotá D.C.");
  const [empresaCarta, setEmpresaCarta] = useState(empresa);
  const [nitCarta, setNitCarta] = useState(nit || nitDe(empresa));
  const [aseguradora, setAseguradora] = useState(aseguradoraInicial);
  const [poliza, setPoliza] = useState(polizaInicial);
  const [inicio, setInicio] = useState(inicioInicial);
  const [vence, setVence] = useState(venceInicial);
  const [desde, setDesde] = useState(hoy);
  const [valor, setValor] = useState(valorInicial);
  const [busy, setBusy] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    setEmpresaCarta(empresa);
    setNitCarta(nit || nitDe(empresa));
  }, [casoId, empresa, nit]);

  useEffect(() => {
    setAseguradora(aseguradoraInicial);
    setPoliza(polizaInicial);
    setInicio(inicioInicial);
    setVence(venceInicial);
    setValor(valorInicial);
  }, [casoId, aseguradoraInicial, polizaInicial, inicioInicial, venceInicial, valorInicial]);

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

  function guardarExtra(parcial: Record<string, string> = {}, empresaNueva = empresaCarta, nitNuevo = nitCarta) {
    onDatos?.({
      empresa: empresaNueva,
      extra: {
        nitAnterior: nitNuevo || nitDe(empresaNueva),
        aseguradora,
        numeroPoliza: poliza,
        inicioPoliza: inicio,
        vencePoliza: vence,
        valorPoliza: valor.replace(/\D/g, ""),
        ...parcial,
      },
    });
  }

  function cambiarEmpresa(valorEmpresa: string) {
    setEmpresaCarta(valorEmpresa);
    const conocido = nitDe(valorEmpresa);
    const nitNuevo = conocido || nitCarta;
    if (conocido) setNitCarta(conocido);
    guardarExtra({ nitAnterior: nitNuevo || nitDe(valorEmpresa) }, valorEmpresa, nitNuevo);
  }

  async function bajar(destino: "empresa" | "aseguradora" | "desvinculacion") {
    setBusy(destino);
    setError("");
    guardarExtra();
    try {
      const file = await generarCartaDevolucion({
        data: {
          destino,
          ciudad,
          empresa: empresaCarta,
          nit: nitCarta || nitDe(empresaCarta),
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

  async function leerExtracto(file: File) {
    setLeyendo(true);
    setError("");
    setAviso("");
    try {
      const listo = await prepararParaLeer(file);
      const lectura = await leerDocumento({
        data: {
          tipo: "poliza",
          nombre: listo.nombre,
          archivo: listo.archivo,
          actual: { placa, nombre: propietario, cc, empresa: empresaCarta },
        },
      });
      const extra = lectura.extra ?? {};
      const siguiente = {
        aseguradora: extra.aseguradora || aseguradora,
        poliza: extra.numeroPoliza || poliza,
        inicio: extra.inicioPoliza || inicio,
        vence: extra.vencePoliza || vence,
        valor: extra.valorPoliza || valor,
      };
      if (extra.aseguradora) setAseguradora(extra.aseguradora);
      if (extra.numeroPoliza) setPoliza(extra.numeroPoliza);
      if (extra.inicioPoliza) setInicio(extra.inicioPoliza);
      if (extra.vencePoliza) setVence(extra.vencePoliza);
      if (extra.valorPoliza) setValor(extra.valorPoliza);
      const leyo = [siguiente.aseguradora, siguiente.poliza, siguiente.inicio, siguiente.vence].filter(Boolean);
      setAviso(leyo.length ? `Del extracto tomé ${leyo.join(", ")}. Revisa antes de sacar la carta.` : lectura.aviso || "No vi el número de póliza ni la aseguradora. Escríbelos abajo.");
      onDatos?.({
        extra: {
          aseguradora: siguiente.aseguradora,
          numeroPoliza: siguiente.poliza,
          inicioPoliza: siguiente.inicio,
          vencePoliza: siguiente.vence,
          valorPoliza: siguiente.valor.replace(/\D/g, ""),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude leer el extracto");
    } finally {
      setLeyendo(false);
    }
  }

  const falta = [
    propietario.trim().length < 3 ? "el nombre" : "",
    placa.trim().length < 5 ? "la placa" : "",
    empresaCarta.trim().length < 3 ? "la empresa anterior" : "",
  ].filter(Boolean);
  const carro = [marca, modelo].filter(Boolean).join(" ");

  return (
    <section className="grid gap-3 rounded-2xl border border-line p-3">
      <div>
        <p className="text-sm font-medium">Carta de devolución de la prima</p>
        <p className="mt-1 text-xs text-ink-soft">
          Esta carta es solo para pedirle a la empresa anterior el dinero no usado de las pólizas RCC y RCE. No pide la desvinculación. Sale con los datos del proceso y el NIT se pone solo.
        </p>
      </div>
      <div className="rounded-2xl bg-paper px-3 py-3 text-sm">
        <p>
          Para: <span className="font-semibold">{empresaCarta || "falta la empresa"}</span>
          {nitCarta ? ` · NIT ${nitCarta}` : ""}
        </p>
        <p className="mt-1">
          De: <span className="font-semibold">{propietario || "falta el nombre"}</span>
          {cc ? ` · C.C. ${cc}` : ""}
          {placa ? ` · ${placa}` : ""}
          {carro ? ` · ${carro}` : ""}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Campo label="Empresa anterior" value={empresaCarta} onChange={cambiarEmpresa} />
        <Campo label="NIT" value={nitCarta} onChange={(valorNit) => { setNitCarta(valorNit); guardarExtra({ nitAnterior: valorNit }); }} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Campo label="Ciudad" value={ciudad} onChange={setCiudad} />
        <Campo label="Excluir la póliza desde" type="date" value={desde} onChange={setDesde} />
      </div>
      <div className="grid gap-2">
        <p className="text-xs text-ink-soft">Si tienes el extracto o la póliza, súbelo. Si no, escribe solo lo que se vea. La carta igual sale.</p>
        <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-2xl border border-line px-3 text-sm font-semibold">
          {leyendo ? "Leyendo el extracto…" : "Subir extracto o póliza"}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            disabled={leyendo}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void leerExtracto(file);
            }}
          />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Campo label="Aseguradora" value={aseguradora} onChange={(valorCampo) => { setAseguradora(valorCampo); guardarExtra({ aseguradora: valorCampo }); }} placeholder="Si se conoce" />
        <Campo label="Número de póliza" value={poliza} onChange={(valorCampo) => { setPoliza(valorCampo); guardarExtra({ numeroPoliza: valorCampo }); }} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Campo label="La póliza empezó" type="date" value={inicio} onChange={(valorCampo) => { setInicio(valorCampo); guardarExtra({ inicioPoliza: valorCampo }); }} />
        <Campo label="La póliza vence" type="date" value={vence} onChange={(valorCampo) => { setVence(valorCampo); guardarExtra({ vencePoliza: valorCampo }); }} />
        <Campo label="Valor que le cobraron" value={valor} onChange={(valorCampo) => { setValor(valorCampo); guardarExtra({ valorPoliza: valorCampo.replace(/\D/g, "") }); }} placeholder="Ej. 850000" />
      </div>
      {cuenta ? (
        <p className="rounded-2xl bg-lime px-3 py-3 text-sm text-ink">
          {cuenta.vigencia} días de vigencia, {cuenta.restantes} sin usar. Al día {pesos(cuenta.diario)}. A devolver, aproximadamente, {pesos(cuenta.devolver)}.
        </p>
      ) : (
        <p className="text-xs text-ink-soft">Sin las fechas y el valor no calculo el dinero. La carta igual pide la devolución de lo no usado.</p>
      )}
      <button
        type="button"
        onClick={() => void bajar("empresa")}
        disabled={busy !== "" || falta.length > 0}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-navy px-3 text-sm font-semibold text-paper disabled:opacity-60"
      >
        <FileText className="size-4" /> {busy === "empresa" ? "Armando…" : "Sacar carta de devolución"}
      </button>
      {falta.length ? <p className="text-sm text-danger">Para sacarla falta {falta.join(", ")}. Está en los datos del proceso.</p> : null}
      {aviso ? <p className="text-sm text-ink-soft">{aviso}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Otras cartas, si las piden</summary>
        <p className="mt-2 text-xs text-ink-soft">La de desvinculación pide salir de la empresa, del sistema y del tarjetón. La de la aseguradora va aparte, por si la empresa no responde.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => void bajar("desvinculacion")} disabled={busy !== "" || falta.length > 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-line px-3 text-sm font-semibold disabled:opacity-60">
            <FileText className="size-4" /> {busy === "desvinculacion" ? "Armando…" : "Carta de desvinculación"}
          </button>
          <button type="button" onClick={() => void bajar("aseguradora")} disabled={busy !== "" || !aseguradora.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-line px-3 text-sm font-semibold disabled:opacity-60">
            <FileText className="size-4" /> {busy === "aseguradora" ? "Armando…" : "Carta a la aseguradora"}
          </button>
        </div>
      </details>
    </section>
  );
}
