import { useState } from "react";
import { DATOS_CONTRATO, type CampoContrato } from "@/lib/gerencia";

const PARTES = ["Inicio", "Seguimiento", "Firma", "Documentos", "Póliza", "Tarjeta"];

function clave(campo: string) {
  return campo
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function CatalogoDatos({ campos, onChange }: { campos: CampoContrato[]; onChange: (campos: CampoContrato[]) => void }) {
  const [nuevo, setNuevo] = useState("");
  const [parte, setParte] = useState("Seguimiento");
  const propios = campos.filter((campo) => !DATOS_CONTRATO.some((dato) => dato.campo === campo.campo));
  const vistos = new Set<string>();
  const extras = propios.filter((campo) => {
    if (vistos.has(campo.campo)) return false;
    vistos.add(campo.campo);
    return true;
  });

  function puestos(campo: string) {
    return campos.filter((item) => item.campo === campo);
  }

  function marcar(campo: string, label: string, pide: string, enContrato: boolean) {
    const ya = puestos(campo);
    if (!ya.length) {
      onChange([...campos, { id: crypto.randomUUID(), campo, label, pide, enContrato, pagina: 0, x: 80, y: 700, size: 8 }]);
      return;
    }
    onChange(campos.map((item) => (item.campo === campo ? { ...item, label: item.label || label, pide, enContrato } : item)));
  }

  function fila(campo: string, label: string, viene: string, pideBase: string) {
    const ya = puestos(campo);
    const en = ya.length ? ya.some((item) => item.enContrato !== false) : DATOS_CONTRATO.some((dato) => dato.campo === campo);
    const pide = ya[0]?.pide || pideBase;
    return (
      <div key={campo} className="grid items-center gap-2 rounded-xl border border-line px-3 py-2 sm:grid-cols-[auto_1fr_11rem]">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={en} onChange={(event) => marcar(campo, label, pide, event.target.checked)} />
          En el contrato
        </label>
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-ink-soft">{viene}</p>
        </div>
        <select value={pide} onChange={(event) => marcar(campo, label, event.target.value, en)} className="h-10 rounded-xl border border-line px-2 text-sm">
          {PARTES.map((nombre) => (
            <option key={nombre}>{nombre}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm text-ink-soft">Todos los datos que recogemos. Marca cuáles van en el contrato y en qué parte del proceso se piden.</p>
      {DATOS_CONTRATO.map((dato) => fila(dato.campo, dato.label, dato.viene, dato.pide))}
      {extras.map((campo) => fila(campo.campo, campo.label || campo.campo, "Dato creado en esta ciudad", campo.pide || "Seguimiento"))}
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const id = `extra_${clave(nuevo)}`;
          if (id.length < 8 || campos.some((campo) => campo.campo === id) || DATOS_CONTRATO.some((dato) => dato.campo === id)) return;
          onChange([...campos, { id: crypto.randomUUID(), campo: id, label: nuevo.trim(), pide: parte, enContrato: false, pagina: 0, x: 80, y: 700, size: 8 }]);
          setNuevo("");
        }}
      >
        <input value={nuevo} onChange={(event) => setNuevo(event.target.value)} placeholder="Dato nuevo" className="h-11 min-w-0 flex-1 rounded-2xl border border-line px-3" />
        <select value={parte} onChange={(event) => setParte(event.target.value)} className="h-11 rounded-2xl border border-line px-2 text-sm">
          {PARTES.map((nombre) => (
            <option key={nombre}>{nombre}</option>
          ))}
        </select>
        <button type="submit" className="h-11 rounded-2xl border border-line px-3 text-sm font-semibold">
          Crear
        </button>
      </form>
    </div>
  );
}
