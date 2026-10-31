import { useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { removeAgenda, saveAgenda } from "@/lib/agenda.functions";
import { etiquetaTipo, diasDelMes, TIPOS_AGENDA, type AgendaItem, type TipoAgenda } from "@/lib/agenda";
import { enCurso, hoyBogota, type Caso } from "@/lib/casos";
import type { Me } from "@/lib/casos.functions";
import { ASESORES, llevaProcesos, nombreLista } from "@/lib/team.public";
const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

type Draft = {
  id?: number;
  tipo: TipoAgenda;
  titulo: string;
  fecha: string;
  hora: string;
  nota: string;
  casoId: number | null;
  hecho: boolean;
  ownerSlug: string;
};

function fallo(err: unknown) {
  return err instanceof Error ? err.message : "No se pudo guardar";
}

function partir(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return { y, m };
}

export function AgendaView({
  me,
  items,
  casos,
  persona,
  delEquipo,
  onChanged,
  onOpenCaso,
  onError,
}: {
  me: Me;
  items: AgendaItem[];
  casos: Caso[];
  persona: string;
  delEquipo: boolean;
  onChanged: () => Promise<void>;
  onOpenCaso: (caso: Caso) => void;
  onError: (message: string) => void;
}) {
  const hoy = hoyBogota();
  const inicio = partir(hoy);
  const [cursor, setCursor] = useState(inicio);
  const [dia, setDia] = useState(hoy);
  const [form, setForm] = useState<Draft | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(0);

  const celdas = useMemo(() => diasDelMes(cursor.y, cursor.m), [cursor]);
  const delDia = items.filter((item) => item.fecha === dia).sort((a, b) => a.hora.localeCompare(b.hora));
  const delEquipoCasos = casos.filter((c) => persona === "todos" || c.ownerName === persona);
  const procesos = delEquipoCasos.filter((c) => enCurso(c) && c.fechaProxima === dia);
  const marcas = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) if (!item.hecho) map.set(item.fecha, (map.get(item.fecha) ?? 0) + 1);
    for (const caso of delEquipoCasos) {
      if (enCurso(caso) && caso.fechaProxima) {
        map.set(caso.fechaProxima, (map.get(caso.fechaProxima) ?? 0) + 1);
      }
    }
    return map;
  }, [items, delEquipoCasos]);

  function mover(delta: number) {
    const next = new Date(Date.UTC(cursor.y, cursor.m - 1 + delta, 1));
    setCursor({ y: next.getUTCFullYear(), m: next.getUTCMonth() + 1 });
  }

  function abrirNueva() {
    setConfirmar(0);
    setForm({
      tipo: "visita",
      titulo: "",
      fecha: dia,
      hora: "09:00",
      nota: "",
      casoId: null,
      hecho: false,
      ownerSlug: llevaProcesos(me.role) ? me.slug : "david",
    });
  }

  function abrirItem(item: AgendaItem) {
    setConfirmar(0);
    setForm({
      id: item.id,
      tipo: item.tipo,
      titulo: item.titulo,
      fecha: item.fecha,
      hora: item.hora,
      nota: item.nota,
      casoId: item.casoId,
      hecho: item.hecho,
      ownerSlug: item.ownerSlug,
    });
  }

  async function guardar(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setGuardando(true);
    onError("");
    try {
      await saveAgenda({ data: form });
      setForm(null);
      setDia(form.fecha);
      const [y, m] = form.fecha.split("-").map(Number);
      setCursor({ y, m });
      await onChanged();
    } catch (err) {
      onError(fallo(err));
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(id: number) {
    if (confirmar !== id) {
      setConfirmar(id);
      return;
    }
    setGuardando(true);
    onError("");
    try {
      await removeAgenda({ data: id });
      setForm(null);
      setConfirmar(0);
      await onChanged();
    } catch (err) {
      onError(fallo(err));
    } finally {
      setGuardando(false);
    }
  }

  async function marcar(item: AgendaItem) {
    onError("");
    try {
      await saveAgenda({
        data: {
          id: item.id,
          tipo: item.tipo,
          titulo: item.titulo,
          fecha: item.fecha,
          hora: item.hora,
          nota: item.nota,
          casoId: item.casoId,
          hecho: !item.hecho,
          ownerSlug: item.ownerSlug,
        },
      });
      await onChanged();
    } catch (err) {
      onError(fallo(err));
    }
  }

  const procesosDelAsesor = form
    ? casos.filter((c) => enCurso(c) && (delEquipo ? c.ownerName === nombreAsesor(form.ownerSlug) : true))
    : [];

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Agenda</h2>
          <p className="text-sm text-ink-soft">
            {delEquipo ? "Ves la agenda de todo el equipo." : "Solo la tuya. Viviana también la ve."}
          </p>
        </div>
        <button
          type="button"
          onClick={abrirNueva}
          className="inline-flex h-10 items-center gap-1 rounded-xl bg-lime px-3 text-sm font-semibold text-ink"
        >
          <Plus className="size-4" />
          Agendar
        </button>
      </div>

      <div className="mt-4 rounded-card border border-line bg-card p-3">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => mover(-1)} aria-label="Mes anterior" className="grid h-10 w-10 place-items-center rounded-xl">
            <ChevronLeft className="size-5" />
          </button>
          <p className="text-sm font-semibold capitalize">
            {MESES[cursor.m - 1]} {cursor.y}
          </p>
          <button type="button" onClick={() => mover(1)} aria-label="Mes siguiente" className="grid h-10 w-10 place-items-center rounded-xl">
            <ChevronRight className="size-5" />
          </button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs text-ink-soft">
          {DIAS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {celdas.map((cell, i) => {
            if (!cell) return <span key={`vacio-${i}`} />;
            const on = cell.iso === dia;
            const esHoy = cell.iso === hoy;
            const n = marcas.get(cell.iso) ?? 0;
            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => {
                  setDia(cell.iso);
                  setForm(null);
                }}
                className={
                  "relative flex h-11 flex-col items-center justify-center rounded-xl text-sm " +
                  (on ? "bg-navy font-semibold text-paper" : esHoy ? "bg-lime font-semibold text-ink" : "")
                }
              >
                <span>{Number(cell.iso.slice(-2))}</span>
                {n > 0 ? (
                  <span className={"absolute bottom-1.5 h-1.5 w-1.5 rounded-full " + (on ? "bg-lime" : "bg-navy")} />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{dia === hoy ? "Hoy" : fechaLarga(dia)}</h3>
        {dia !== hoy ? (
          <button type="button" onClick={() => setDia(hoy)} className="text-sm font-semibold text-navy">
            Volver a hoy
          </button>
        ) : null}
      </div>

      {form ? (
        <form onSubmit={(event) => void guardar(event)} className="mt-3 grid gap-3 rounded-card border border-line bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{form.id ? "Editar gestión" : "Nueva gestión"}</p>
            <button type="button" aria-label="Cerrar" onClick={() => setForm(null)}>
              <X className="size-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {TIPOS_AGENDA.map((tipo) => (
              <button
                key={tipo.id}
                type="button"
                onClick={() => setForm({ ...form, tipo: tipo.id })}
                className={
                  "h-10 rounded-full border px-3 text-sm " +
                  (form.tipo === tipo.id ? "border-navy bg-navy text-paper" : "border-line")
                }
              >
                {tipo.label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Fecha
              <input
                type="date"
                required
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
              />
            </label>
            <label className="text-sm font-medium">
              Hora
              <input
                type="time"
                required
                value={form.hora}
                onChange={(e) => setForm({ ...form, hora: e.target.value })}
                className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
              />
            </label>
          </div>
          {delEquipo ? (
            <label className="text-sm font-medium">
              Asesor
              <select
                value={form.ownerSlug}
                onChange={(e) => setForm({ ...form, ownerSlug: e.target.value, casoId: null })}
                className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
              >
                {ASESORES.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {nombreLista(p)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="text-sm font-medium">
            Proceso
            <select
              value={form.casoId ?? ""}
              onChange={(e) => {
                const casoId = e.target.value ? Number(e.target.value) : null;
                const caso = casos.find((c) => c.id === casoId);
                setForm({
                  ...form,
                  casoId,
                  titulo: form.titulo || (caso ? tituloDe(form.tipo, caso) : form.titulo),
                  ownerSlug: caso ? slugDe(caso.ownerName) : form.ownerSlug,
                });
              }}
              className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
            >
              <option value="">Sin proceso</option>
              {procesosDelAsesor.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.placa} · {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Qué hay que hacer
            <input
              required
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Visita de María en la oficina"
              className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
            />
          </label>
          <label className="text-sm font-medium">
            Nota
            <textarea
              value={form.nota}
              onChange={(e) => setForm({ ...form, nota: e.target.value })}
              placeholder="Estate atento, llega a esa hora"
              className="mt-1 min-h-20 w-full rounded-2xl border border-line p-3"
            />
          </label>
          {form.id ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.hecho}
                onChange={(e) => setForm({ ...form, hecho: e.target.checked })}
              />
              Ya se hizo
            </label>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={guardando}
              className="h-11 flex-1 rounded-2xl bg-navy text-sm font-semibold text-paper disabled:opacity-60"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            {form.id ? (
              <button
                type="button"
                disabled={guardando}
                onClick={() => void quitar(form.id!)}
                className="h-11 rounded-2xl border border-line px-3 text-sm text-danger"
              >
                {confirmar === form.id ? "Sí, quitar" : "Quitar"}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {delDia.length === 0 && procesos.length === 0 ? (
        <p className="mt-3 rounded-card border border-dashed border-line bg-card px-4 py-8 text-center text-sm text-ink-soft">
          Este día no tiene nada. Agéndalo: visita, llamada o mensaje.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {delDia.map((item) => (
            <li key={item.id} className="rounded-card border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => abrirItem(item)} className="text-left">
                  <p className={"font-semibold " + (item.hecho ? "text-ink-soft line-through" : "")}>
                    {item.hora} · {etiquetaTipo(item.tipo)}
                  </p>
                  <p className="text-sm">{item.titulo}</p>
                  <p className="text-sm text-ink-soft">
                    {delEquipo ? `${item.ownerName.split(" ")[0]} · ` : ""}
                    {item.placa ? `${item.placa} ${item.cliente}` : "Sin proceso"}
                  </p>
                  {item.nota ? <p className="mt-1 text-sm">{item.nota}</p> : null}
                </button>
                <button
                  type="button"
                  onClick={() => void marcar(item)}
                  className={
                    "h-10 shrink-0 rounded-full border px-3 text-sm " +
                    (item.hecho ? "border-navy bg-navy text-paper" : "border-line")
                  }
                >
                  {item.hecho ? "Hecha" : "Pendiente"}
                </button>
              </div>
              {item.fecha < hoy && !item.hecho ? <p className="mt-2 text-sm font-semibold text-danger">Pasó y sigue pendiente</p> : null}
            </li>
          ))}
          {procesos.map((caso) => (
            <li key={`caso-${caso.id}`}>
              <button
                type="button"
                onClick={() => onOpenCaso(caso)}
                className="w-full rounded-card border border-dashed border-line bg-card p-4 text-left"
              >
                <p className="text-sm font-semibold text-navy">Del proceso</p>
                <p className="font-semibold">{caso.placa}</p>
                <p className="text-sm text-ink-soft">
                  {caso.proxima || "Próxima gestión"}
                  {delEquipo ? ` · ${caso.ownerName.split(" ")[0]}` : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function nombreAsesor(slug: string) {
  return ASESORES.find((p) => p.slug === slug)?.name ?? "";
}

function slugDe(name: string) {
  return ASESORES.find((p) => p.name === name)?.slug ?? "david";
}

function tituloDe(tipo: TipoAgenda, caso: Caso) {
  return `${etiquetaTipo(tipo)} · ${caso.nombre} ${caso.placa}`;
}

function fechaLarga(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]}`;
}
