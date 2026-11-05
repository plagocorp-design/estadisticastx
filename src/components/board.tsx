import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, BookOpen, CalendarDays, Clock, Download, ExternalLink, FileSpreadsheet, FileText, Flag, Folder, KeyRound, LayoutList, LogOut, MessageCircle, Phone, Plus, ScrollText, Search, Users, X } from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { listAgenda } from "@/lib/agenda.functions";
import { type AgendaItem } from "@/lib/agenda";
import { AgendaView } from "@/components/agenda";
import { ChatCaso } from "@/components/chat-caso";
import { BitacoraVista } from "@/components/bitacora";
import { ControlVista } from "@/components/control";
import { EquipoVista, MiClave } from "@/components/equipo";
import { AuditoriaVista } from "@/components/auditoria";
import { cuando } from "@/lib/auditoria";
import { certificadoProceso } from "@/lib/certificado.functions";
import { EnviarFirma } from "@/components/enviar-firma";
import { sincronizarDocuseal, verAuditoriaFirma } from "@/lib/firma.functions";
import { leerDocumento, recibirTrozo, subirDocumento } from "@/lib/piloto.functions";
import { enviarEnTrozos, prepararArchivo } from "@/lib/archivo";
import type { CampoLeido } from "@/lib/ocr";
import { listEquipo } from "@/lib/control.functions";
import type { PersonaEquipo } from "@/lib/control";
import { MetaEquipo, MetaMia } from "@/components/meta";
import { listBitacoras } from "@/lib/bitacora.functions";
import { bitacoraHecha, horaBogota, type Bitacora } from "@/lib/bitacora";
import { SheetsPanel, DOCUMENTO } from "@/components/sheets-panel";
import { traerSheetsFn } from "@/lib/sheets.functions";
import { marcarChatsLeidos, resumenChat, type ChatResumen } from "@/lib/chat.functions";
import {
  createCaso,
  exportarExcel,
  exportarTodo,
  getMe,
  leerContrato,
  listCasos,
  moverPoliza,
  removeCaso,
  updateCaso,
  verContrato,
  type CasoPatch,
  type Me,
} from "@/lib/casos.functions";
import {
  conAvance,
  hechosDe,
  hoyBogota,
  listoParaVia,
  POLIZA_ESTADOS,
  OPERATIVA_ESTADOS,
  requisitosVia,
  siguientePaso,
  STEPS,
  ENTREGA,
  entregaIds,
  ORIGENES,
  tableroDe,
  enCurso,
  type Caso,
  type CasoDraft,
  type StepKey,
} from "@/lib/casos";
import { ASESORES, configura, esBandeja, etiquetaRol, llevaProcesos, nombreLista, veElEquipo } from "@/lib/team.public";
import { BloquePiloto } from "@/components/piloto";
import { estadoPiloto, pasarMano } from "@/lib/piloto.functions";
import { etiquetaMarca, marcasDe } from "@/lib/piloto";
import { buscarEmpresas, unificarEmpresa } from "@/lib/empresas";

const GRUPOS = ["Inicio", "Documentos", "Firma", "Póliza", "Tarjeta"] as const;
const TARJETAS = ["Pendiente", "Radicada", "Expedida"] as const;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type Filtro = "curso" | "nuevo" | "dijo" | "docs" | "firma" | "poliza" | "operativa" | "entregada" | "listo" | "cerrado" | "todos";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "curso", label: "En curso" },
  { id: "nuevo", label: "Nuevos" },
  { id: "dijo", label: "Dijo sí" },
  { id: "docs", label: "Documentos" },
  { id: "firma", label: "En firma" },
  { id: "poliza", label: "Póliza" },
  { id: "operativa", label: "Operativa" },
  { id: "entregada", label: "Entregada" },
  { id: "listo", label: "Completados" },
  { id: "cerrado", label: "No se concretó" },
  { id: "todos", label: "Todos" },
];

function coincide(c: Caso, filtro: Filtro) {
  if (filtro === "todos") return true;
  if (filtro === "curso") return enCurso(c);
  if (filtro === "cerrado") return !c.completado && Boolean(c.motivoCierre.trim());
  if (filtro === "listo") return c.completado;
  if (!enCurso(c)) return false;
  if (filtro === "nuevo") return c.estado === "Nuevo";
  if (filtro === "dijo") return c.estado === "Dijo sí";
  if (filtro === "docs") return c.estado === "Documentos";
  if (filtro === "firma") return c.estado === "En firma";
  if (filtro === "poliza") return (POLIZA_ESTADOS as readonly string[]).includes(c.estado);
  if (filtro === "operativa") return (OPERATIVA_ESTADOS as readonly string[]).includes(c.estado);
  return c.estado === "Entregada";
}

function fechaCorta(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]}`;
}

function celular(tel: string) {
  const d = tel.replace(/\D/g, "");
  if (d.length === 10) return `57${d}`;
  return d;
}

function fallo(err: unknown) {
  return err instanceof Error ? err.message : "No se pudo guardar";
}

function porCaso(rows: ChatResumen[]) {
  const map: Record<number, ChatResumen> = {};
  for (const row of rows) map[row.casoId] = row;
  return map;
}

export function Board() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [casos, setCasos] = useState<Caso[]>([]);
  const [q, setQ] = useState("");
  const [asesor, setAsesor] = useState("todos");
  const [filtro, setFiltro] = useState<Filtro>("curso");
  const [open, setOpen] = useState<Caso | "new" | null>(null);
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState(false);
  const [archivos, setArchivos] = useState(false);
  const [mas, setMas] = useState(false);
  const [vista, setVista] = useState<"procesos" | "agenda" | "meta" | "bitacora" | "control" | "equipo" | "auditoria">("procesos");
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [chats, setChats] = useState<Record<number, ChatResumen>>({});
  const [soloMensajes, setSoloMensajes] = useState(false);
  const [sheetsOpen, setSheetsOpen] = useState(false);
  const [claveOpen, setClaveOpen] = useState(false);
  const [campana, setCampana] = useState(false);
  const [docUrl, setDocUrl] = useState("");
  const [bitacoras, setBitacoras] = useState<Bitacora[]>([]);
  const [equipo, setEquipo] = useState<PersonaEquipo[]>([]);
  const [hora, setHora] = useState(horaBogota);
  const [modo, setModo] = useState<"mio" | "equipo">("equipo");
  const [pilotoOn, setPilotoOn] = useState(false);
  const hoy = hoyBogota();

  async function load() {
    const [who, rows, citas, hilos, dias, personas] = await Promise.all([
      getMe(),
      listCasos(),
      listAgenda(),
      resumenChat(),
      listBitacoras({ data: hoyBogota() }),
      listEquipo().catch(() => [] as PersonaEquipo[]),
    ]);
    if (!who) {
      await navigate({ to: "/login" });
      return [];
    }
    setMe(who);
    setCasos(rows);
    setAgenda(citas);
    setChats(porCaso(hilos));
    setBitacoras(dias);
    setEquipo(personas);
    const piloto = await estadoPiloto().catch(() => null);
    if (piloto) setPilotoOn(piloto.activo);
    return rows;
  }

  useEffect(() => {
    load().catch(() => navigate({ to: "/login" }));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setHora(horaBogota()), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (window.localStorage.getItem("vl-modo") === "mio") setModo("mio");
  }, []);

  useEffect(() => {
    if (!me) return;
    let vivo = true;
    let sheetsVuelo = false;
    const chats = () => {
      resumenChat()
        .then((hilos) => {
          if (vivo) setChats(porCaso(hilos));
        })
        .catch(() => {});
    };
    const sheets = () => {
      if (sheetsVuelo) return;
      sheetsVuelo = true;
      traerSheetsFn()
        .then((r) => {
          if (!vivo) return;
          if (r.spreadsheetUrl) setDocUrl(r.spreadsheetUrl);
          if (r.cambios > 0) return load();
        })
        .catch(() => {})
        .finally(() => {
          sheetsVuelo = false;
        });
    };
    chats();
    sheets();
    const procesos = () => {
      listCasos()
        .then((rows) => {
          if (vivo) setCasos(rows);
        })
        .catch(() => {});
    };
    const chatsId = window.setInterval(chats, 12000);
    const sheetsId = window.setInterval(sheets, 45000);
    const procesosId = window.setInterval(procesos, 12000);
    return () => {
      vivo = false;
      window.clearInterval(chatsId);
      window.clearInterval(sheetsId);
      window.clearInterval(procesosId);
    };
  }, [me]);

  const delEquipo = veElEquipo(me?.role);
  const soyDavid = configura(me?.role);
  const bandeja = esBandeja(me?.role);
  const miraEquipo = delEquipo && !(soyDavid && modo === "mio");
  const persona = miraEquipo ? asesor : (me?.name ?? "todos");
  const esMio = (ownerId: string) => !me || ownerId === me.id;
  const base = bandeja ? casos : casos.filter((c) => (miraEquipo ? asesor === "todos" || c.ownerName === asesor : esMio(c.ownerId)));
  const tarde = hora >= "16:30";
  const asesoresHoy = (equipo.length ? equipo : ASESORES.map((a) => ({ ...a, activo: true, trabajaHoy: true, empieza: "", entrada: "", salida: "" }))).filter(
    (a) => llevaProcesos(a.role) && a.activo !== false,
  );
  const faltanBitacora = asesoresHoy.filter((a) => {
    if (!me) return false;
    if (!delEquipo && a.slug !== me.slug) return false;
    if (equipo.length && a.trabajaHoy === false) return false;
    return !bitacoraHecha(bitacoras.find((b) => b.slug === a.slug));
  });
  const faltanVisibles = faltanBitacora.filter((a) => miraEquipo || a.slug === me?.slug);
  const filtered = base.filter((c) => {
    const blob = `${c.placa} ${c.nombre} ${c.telefono} ${c.cc} ${c.empresa} ${c.marca} ${c.linea} ${c.correo} ${c.estado} ${c.motivoCierre}`.toLowerCase();
    if (q && !blob.includes(q.toLowerCase())) return false;
    if (bandeja) return true;
    if (soloMensajes && !chats[c.id]) return false;
    return coincide(c, filtro);
  });
  const gestiones = base
    .filter((c) => enCurso(c) && c.fechaProxima && c.fechaProxima <= hoy)
    .sort((a, b) => a.fechaProxima.localeCompare(b.fechaProxima));
  const sinCerrar = base.filter((c) => c.estado === "Entregada").length;
  const agendaVista = agenda.filter((item) => (miraEquipo ? asesor === "todos" || item.ownerName === asesor : esMio(item.ownerId)));
  const hoyAgenda = agendaVista.filter((item) => item.fecha === hoy && !item.hecho);
  const sinLeerTotal = Object.values(chats).reduce((n, hilo) => n + hilo.sinLeer, 0);
  const escritos = (miraEquipo ? casos : base).filter((c) => (chats[c.id]?.sinLeer ?? 0) > 0);
  const sinLeerNav = escritos.reduce((n, c) => n + (chats[c.id]?.sinLeer ?? 0), 0);
  const esperando = Object.values(chats).filter((hilo) => hilo.esperaAsesor).length;
  const conChat = base.filter((c) => chats[c.id]).length;
  const avisos = casos
    .flatMap((c) => {
      const hilo = chats[c.id];
      if (!hilo) return [];
      if (hilo.sinLeer <= 0) return [];
      return [{ caso: c, hilo }];
    })
    .sort((a, b) => b.hilo.sinLeer - a.hilo.sinLeer || a.caso.placa.localeCompare(b.caso.placa));

  function refrescarChat() {
    resumenChat()
      .then((hilos) => setChats(porCaso(hilos)))
      .catch(() => {});
  }

  async function leerTodo() {
    try {
      await marcarChatsLeidos();
      setChats((prev) => {
        const next: Record<number, ChatResumen> = {};
        for (const [id, hilo] of Object.entries(prev)) next[Number(id)] = { ...hilo, sinLeer: 0 };
        return next;
      });
    } catch {
      refrescarChat();
    }
  }

  async function bajarArchivo(traer: () => Promise<{ base64: string; filename: string }>) {
    setExportando(true);
    setError("");
    try {
      const file = await traer();
      const bin = atob(file.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(fallo(err));
    } finally {
      setExportando(false);
    }
  }

  function bajar() {
    return bajarArchivo(exportarExcel);
  }

  function bajarTodo() {
    return bajarArchivo(exportarTodo);
  }

  function elegirModo(next: "mio" | "equipo") {
    setModo(next);
    window.localStorage.setItem("vl-modo", next);
    if (next === "mio") setVista((actual) => (actual === "equipo" ? "control" : actual));
  }

  if (!me) {
    return <p className="grid min-h-screen place-items-center text-ink-soft">Cargando…</p>;
  }

  const titulo =
    vista === "agenda"
      ? "Agenda"
      : vista === "meta"
        ? miraEquipo
          ? "Meta del equipo"
          : "Mi meta"
        : vista === "bitacora"
          ? miraEquipo
            ? "Bitácoras"
            : "Mi bitácora"
          : vista === "control"
            ? miraEquipo
              ? "Control del equipo"
              : "Tu control"
            : vista === "equipo"
              ? "Equipo"
              : vista === "auditoria"
                ? "Registro"
                : miraEquipo
                  ? "Procesos del equipo"
                  : bandeja
                    ? etiquetaRol(me.role)
                    : "Mis procesos";
  const subtitulo = bandeja
    ? "Solo los procesos de tu área."
    : soyDavid
      ? modo === "mio"
        ? "Tu trabajo de asesor"
        : "El equipo. La configuración es solo tuya."
      : delEquipo
        ? "Coordinación. Ves a cada asesor, sin configurar."
        : "Tus procesos, tu agenda y tu bitácora.";
  const secciones = [
        { id: "procesos" as const, label: "Procesos", icon: LayoutList, n: sinLeerNav, alerta: false },
        { id: "agenda" as const, label: "Agenda", icon: CalendarDays, n: hoyAgenda.length, alerta: false },
        { id: "meta" as const, label: "Meta", icon: Flag, n: 0, alerta: false },
        {
          id: "bitacora" as const,
          label: "Bitácora",
          icon: BookOpen,
          n: tarde ? faltanVisibles.length : 0,
          alerta: tarde && faltanVisibles.length > 0,
        },
        { id: "control" as const, label: "Control", icon: Clock, n: 0, alerta: false },
        { id: "equipo" as const, label: "Equipo", icon: Users, n: 0, alerta: false },
        { id: "auditoria" as const, label: "Registro", icon: ScrollText, n: 0, alerta: false },
      ].filter((item) => {
        if (bandeja) return item.id === "procesos";
        return (item.id !== "equipo" && item.id !== "auditoria") || miraEquipo;
      });

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto bg-navy px-4 py-5 text-paper lg:flex">
        <div className="flex items-center gap-3">
          <img src="/taxis-libres-blanco.png" alt="Taxis Libres" className="h-10 w-auto" />
          <div>
            <p className="text-sm font-semibold leading-none">Vincula Libre</p>
            <p className="mt-1 text-xs text-paper">{soyDavid ? "Asesor líder" : delEquipo ? "Coordinación" : etiquetaRol(me.role)}</p>
          </div>
        </div>
        {soyDavid ? (
          <div className="mt-5">
            <ModoSwitch modo={modo} onChange={elegirModo} invert />
          </div>
        ) : null}
        <nav className="mt-5 grid gap-1">
          {secciones.map((item) => {
            const Icon = item.icon;
            const on = vista === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setVista(item.id)}
                className={
                  "flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold " +
                  (on ? "bg-lime text-navy" : "text-paper")
                }
              >
                <Icon className="size-4" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.n > 0 ? (
                  <span className={"grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs " + (on ? "bg-navy text-lime" : "bg-lime text-navy")}>
                    {item.n > 9 ? "9+" : item.n}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto grid gap-1">
          {delEquipo || soyDavid ? (
            <button
              type="button"
              onClick={() => setArchivos((v) => !v)}
              className={"flex h-11 items-center gap-2 rounded-xl px-3 text-sm " + (archivos ? "bg-lime text-navy" : "text-paper")}
            >
              <Folder className="size-4" />
              Archivos
            </button>
          ) : null}
          {archivos && delEquipo ? (
            <>
            <button
              type="button"
              onClick={() => void bajar()}
              disabled={exportando}
              className="flex h-11 items-center gap-2 rounded-xl px-3 pl-9 text-sm text-paper disabled:opacity-60"
            >
              <Download className="size-4" />
              {exportando ? "Armando…" : "Excel"}
            </button>
            <button
              type="button"
              onClick={() => void bajarTodo()}
              disabled={exportando}
              className="flex h-11 items-center gap-2 rounded-xl px-3 pl-9 text-sm text-paper disabled:opacity-60"
            >
              <Download className="size-4" />
              {exportando ? "Armando…" : "Todo"}
            </button>
            </>
          ) : null}
          {archivos && soyDavid ? (
            <button
              type="button"
              onClick={() => setSheetsOpen(true)}
              className="flex h-11 items-center gap-2 rounded-xl px-3 pl-9 text-sm text-paper"
            >
              <FileSpreadsheet className="size-4" />
              Configurar Sheets
            </button>
          ) : null}
          {delEquipo || !bandeja ? (
            <button
              type="button"
              onClick={() => setMas((v) => !v)}
              className={"flex h-11 items-center gap-2 rounded-xl px-3 text-sm " + (mas ? "bg-lime text-navy" : "text-paper")}
            >
              <Folder className="size-4" />
              Más
            </button>
          ) : null}
          {mas && delEquipo ? (
            <a
              href={docUrl || DOCUMENTO}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 items-center gap-2 rounded-xl px-3 pl-9 text-sm text-paper"
            >
              <ExternalLink className="size-4" />
              Documento
            </a>
          ) : null}
          {mas && !bandeja ? (
          <a href="/piloto" className="flex h-11 items-center gap-2 rounded-xl px-3 pl-9 text-sm text-paper">
            Áreas
          </a>
          ) : null}
          {mas ? (
          <button
            type="button"
            className="flex h-11 items-center gap-2 rounded-xl px-3 pl-9 text-sm text-paper"
            onClick={() => setClaveOpen(true)}
          >
            <KeyRound className="size-4" />
            Mi clave
          </button>
          ) : null}
          <button
            type="button"
            className="flex h-11 items-center gap-2 rounded-xl px-3 text-sm text-paper"
            onClick={() => signOut().then(() => navigate({ to: "/login" }))}
          >
            <LogOut className="size-4" />
            Salir
          </button>
        </div>
      </aside>

      <div className="min-w-0">
      <header className="sticky top-0 z-10 border-b border-line bg-card px-4 py-3 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/taxis-libres.png" alt="" className="h-9 w-auto shrink-0 lg:hidden" />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold leading-none">{titulo}</p>
              <p className="mt-1 truncate text-sm text-ink-soft">{subtitulo}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setCampana(true)}
              aria-label="Mensajes"
              className="relative inline-flex h-11 items-center gap-1 rounded-xl border border-line px-3 text-sm"
            >
              <Bell className="size-4" />
              {avisos.length > 0 ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-lime px-1 text-xs font-semibold text-navy">
                  {avisos.length > 9 ? "9+" : avisos.length}
                </span>
              ) : null}
            </button>
            {bandeja ? null : (
            <button
              type="button"
              onClick={() => setOpen("new")}
              className="inline-flex h-11 items-center gap-1 rounded-xl bg-lime px-3 text-sm font-semibold text-ink"
            >
              <Plus className="size-4" />
              Nuevo
            </button>
            )}
            <button
              type="button"
              onClick={() => setClaveOpen(true)}
              aria-label="Mi clave"
              className="inline-flex h-11 items-center gap-1 rounded-xl border border-line px-3 text-sm lg:hidden"
            >
              <KeyRound className="size-4" />
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center gap-1 rounded-xl border border-line px-3 text-sm lg:hidden"
              onClick={() => signOut().then(() => navigate({ to: "/login" }))}
            >
              Salir
            </button>
          </div>
        </div>
        {soyDavid ? (
          <div className="mt-3 lg:hidden">
            <ModoSwitch modo={modo} onChange={elegirModo} />
          </div>
        ) : null}
        {delEquipo || soyDavid ? (
          <div className="mt-3 flex flex-wrap gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setArchivos((v) => !v)}
              className="inline-flex h-10 items-center gap-1 rounded-xl border border-line px-3 text-sm"
            >
              <Folder className="size-4" />
              Archivos
            </button>
            {archivos && delEquipo ? (
              <>
              <button
                type="button"
                onClick={() => void bajar()}
                disabled={exportando}
                className="inline-flex h-10 items-center gap-1 rounded-xl border border-line px-3 text-sm disabled:opacity-60"
              >
                <Download className="size-4" />
                {exportando ? "Armando…" : "Excel"}
              </button>
              <button
                type="button"
                onClick={() => void bajarTodo()}
                disabled={exportando}
                className="inline-flex h-10 items-center gap-1 rounded-xl border border-line px-3 text-sm disabled:opacity-60"
              >
                <Download className="size-4" />
                {exportando ? "Armando…" : "Todo"}
              </button>
              </>
            ) : null}
            {archivos && soyDavid ? (
              <button
                type="button"
                onClick={() => setSheetsOpen(true)}
                className="inline-flex h-10 items-center gap-1 rounded-xl border border-line px-3 text-sm"
              >
                <FileSpreadsheet className="size-4" />
                Sheets
              </button>
            ) : null}
            {delEquipo ? (
              <a
                href={docUrl || DOCUMENTO}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-1 rounded-xl border border-line px-3 text-sm"
              >
                <ExternalLink className="size-4" />
                Documento
              </a>
            ) : null}
          </div>
        ) : null}
      </header>

      <main className="px-4 py-5 pb-24 lg:px-8 lg:pb-8">
        {tarde && !bandeja && faltanVisibles.length > 0 ? (
          <button
            type="button"
            onClick={() => setVista("bitacora")}
            className="mb-4 w-full rounded-card border border-danger bg-card px-4 py-3 text-left text-sm font-semibold text-danger"
          >
            {llevaProcesos(me.role) && faltanVisibles.some((a) => a.slug === me.slug)
              ? `Son más de las 4:30. Falta tu bitácora de hoy.${
                  faltanVisibles.length > 1
                    ? ` También: ${faltanVisibles
                        .filter((a) => a.slug !== me.slug)
                        .map((a) => a.name.split(" ")[0])
                        .join(", ")}.`
                    : ""
                }`
              : `Son más de las 4:30. Sin bitácora: ${faltanVisibles.map((a) => a.name.split(" ")[0]).join(", ")}.`}
          </button>
        ) : null}

        {vista === "equipo" && miraEquipo ? (
          <EquipoVista edita={soyDavid} />
        ) : vista === "auditoria" && miraEquipo ? (
          <AuditoriaVista veClaves={soyDavid} />
        ) : vista === "control" ? (
          <ControlVista me={me} hora={hora} hoy={hoy} verEquipo={miraEquipo} casos={casos} />
        ) : vista === "bitacora" ? (
          <BitacoraVista
            me={me}
            hoy={hoy}
            tarde={tarde}
            verEquipo={miraEquipo}
            noTrabajan={equipo.filter((p) => !p.trabajaHoy).map((p) => p.slug)}
            onSaved={() => void load()}
          />
        ) : vista === "meta" && miraEquipo ? (
          <MetaEquipo casos={casos} hoy={hoy} edita={soyDavid} gente={equipo} />
        ) : vista === "meta" ? (
          <MetaMia casos={base} hoy={hoy} nombre={me.name} />
        ) : vista === "agenda" ? (
          <div className="mt-5">
            {miraEquipo ? (
              <select
                value={asesor}
                onChange={(e) => setAsesor(e.target.value)}
                className="mb-4 h-11 rounded-2xl border border-line px-3"
              >
                <option value="todos">Todo el equipo</option>
                {ASESORES.map((p) => (
                  <option key={p.slug} value={p.name}>
                    {nombreLista(p)}
                  </option>
                ))}
              </select>
            ) : null}
            {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
            <AgendaView
              me={me}
              items={agendaVista}
              casos={base}
              persona={persona}
              delEquipo={miraEquipo}
              onChanged={async () => {
                await load();
              }}
              onOpenCaso={(caso) => setOpen(caso)}
              onError={setError}
            />
          </div>
        ) : (
          <>
            {bandeja ? null : miraEquipo ? (
              <Tablero
                casos={casos}
                activo={asesor}
                onPick={(name) => setAsesor((prev) => (prev === name ? "todos" : name))}
              />
            ) : bandeja ? null : (
              <MisNumeros casos={base} />
            )}
            {bandeja || sinCerrar === 0 ? null : (
              <p className="mt-3 text-sm text-ink-soft">
                {sinCerrar} {sinCerrar === 1 ? "tarjeta entregada" : "tarjetas entregadas"} sin marcar completado.
              </p>
            )}
            {miraEquipo && esperando > 0 ? (
              <p className="mt-3 text-sm text-ink-soft">
                {esperando} {esperando === 1 ? "proceso espera" : "procesos esperan"} respuesta del asesor.
              </p>
            ) : null}

            {escritos.length > 0 ? (
              <section className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">{miraEquipo ? "Mensajes sin leer" : "Te preguntaron"}</h2>
                  <button
                    type="button"
                    onClick={() => void leerTodo()}
                    className="h-9 rounded-full border border-line bg-card px-3 text-sm font-semibold"
                  >
                    Marcar leídos
                  </button>
                </div>
                <ul className="mt-2 grid gap-2">
                  {escritos.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setOpen(c)}
                        className="flex w-full items-center justify-between gap-3 rounded-card border border-line bg-card px-4 py-3 text-left"
                      >
                        <span>
                          <span className="font-semibold">{c.placa}</span>
                          <span className="mt-0.5 block text-sm text-ink-soft">
                            {chats[c.id]?.ultimoDe.split(" ")[0]}: {chats[c.id]?.ultimo}
                            {miraEquipo ? ` · ${c.ownerName.split(" ")[0]}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-lime px-3 py-1 text-xs font-semibold text-navy">
                          {chats[c.id]?.sinLeer} sin leer
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {hoyAgenda.length > 0 ? (
              <section className="mt-5">
                <h2 className="text-sm font-semibold">Hoy en la agenda</h2>
                <ul className="mt-2 grid gap-2">
                  {hoyAgenda.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setVista("agenda")}
                        className="flex w-full items-center justify-between gap-3 rounded-card border border-line bg-card px-4 py-3 text-left"
                      >
                        <span>
                          <span className="font-semibold">
                            {item.hora} · {item.titulo}
                          </span>
                          <span className="mt-0.5 block text-sm text-ink-soft">
                            {item.placa || "Sin proceso"}
                            {miraEquipo ? ` · ${item.ownerName.split(" ")[0]}` : ""}
                          </span>
                        </span>
                        <span className="text-sm font-semibold text-navy">Ver</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {gestiones.length > 0 ? (
              <section className="mt-5">
                <h2 className="text-sm font-semibold">Para gestionar</h2>
                <ul className="mt-2 grid gap-2">
                  {gestiones.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setOpen(c)}
                        className="flex w-full items-center justify-between gap-3 rounded-card border border-line bg-card px-4 py-3 text-left"
                      >
                        <span>
                          <span className="font-semibold">{c.placa}</span>
                          <span className="mt-0.5 block text-sm text-ink-soft">
                            {c.proxima || siguientePaso(c)}
                            {miraEquipo ? ` · ${c.ownerName.split(" ")[0]}` : ""}
                          </span>
                        </span>
                        <span className={c.fechaProxima < hoy ? "text-sm font-semibold text-danger" : "text-sm font-semibold text-navy"}>
                          {c.fechaProxima < hoy ? "Atrasada" : "Hoy"} · {fechaCorta(c.fechaProxima)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-ink-soft" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Placa, nombre, cédula o teléfono"
                  className="h-11 w-full rounded-2xl border border-line pr-3 pl-10"
                />
              </label>
              {miraEquipo ? (
                <select
                  value={asesor}
                  onChange={(e) => setAsesor(e.target.value)}
                  className="h-11 rounded-2xl border border-line px-3"
                >
                  <option value="todos">Todo el equipo</option>
                  {ASESORES.map((p) => (
                    <option key={p.slug} value={p.name}>
                      {nombreLista(p)}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            {bandeja ? null : (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {FILTROS.map((f) => {
                const n = base.filter((c) => coincide(c, f.id)).length;
                if (n === 0 && f.id !== "curso" && f.id !== "todos") return null;
                const on = filtro === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFiltro(f.id)}
                    className={
                      "h-10 shrink-0 rounded-full border px-3 text-sm " +
                      (on ? "border-navy bg-navy text-paper" : "border-line bg-card text-ink")
                    }
                  >
                    {f.label} {n}
                  </button>
                );
              })}
              {conChat > 0 ? (
                <button
                  type="button"
                  onClick={() => setSoloMensajes((v) => !v)}
                  className={
                    "h-10 shrink-0 rounded-full border px-3 text-sm " +
                    (soloMensajes ? "border-navy bg-navy text-paper" : "border-line bg-card text-ink")
                  }
                >
                  Chat {conChat}
                </button>
              ) : null}
            </div>
            )}

            {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

            {filtered.length === 0 ? (
              <p className="mt-4 rounded-card border border-dashed border-line bg-card px-4 py-10 text-center text-ink-soft">
                {miraEquipo
                  ? "Todavía no hay procesos en esta vista. Con Nuevo abres uno a nombre de un asesor."
                  : bandeja
                    ? "No hay procesos en tu área."
                    : "No hay procesos aquí. Con Nuevo subes el contrato firmado y se llena solo."}
              </p>
            ) : (
              <ul className="mt-4 grid gap-2 xl:grid-cols-2">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(c)}
                      className="rise w-full rounded-card border border-line bg-card p-4 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold tracking-wide">{c.placa}</p>
                          <p className="text-sm text-ink-soft">
                            {c.nombre}
                            {miraEquipo || bandeja ? ` · ${c.ownerName.split(" ")[0]}` : ""}
                          </p>
                          {c.marca || c.linea || c.modelo ? (
                            <p className="text-sm text-ink-soft">{[c.marca, c.linea, c.modelo].filter(Boolean).join(" ")}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-navy">{c.estado}</span>
                          {chats[c.id]?.sinLeer ? (
                            <span className="rounded-full bg-lime px-2 py-1 text-xs font-semibold text-navy">
                              {chats[c.id].sinLeer} sin leer
                            </span>
                          ) : chats[c.id]?.esperaAsesor ? (
                            <span className="rounded-full bg-paper px-2 py-1 text-xs font-semibold text-ink-soft">Espera respuesta</span>
                          ) : null}
                        </div>
                      </div>
                      {c.actualizadoEn ? (
                        <p className="mt-2 text-xs text-ink-soft">
                          Actualizado {cuando(c.actualizadoEn)}
                          {c.actualizadoPor ? ` · ${c.actualizadoPor}` : ""}
                        </p>
                      ) : null}
                      <p className={"mt-2 text-sm " + (c.motivoCierre.trim() && !c.completado ? "line-clamp-2" : "")}>{siguientePaso(c)}</p>
                      {c.citaFecha ? (
                        <p className="mt-1 text-sm font-medium">Cita {fechaCorta(c.citaFecha)}{c.citaHora ? ` · ${c.citaHora}` : ""}</p>
                      ) : null}
                      {chats[c.id] ? (
                        <p className="mt-1 line-clamp-1 text-sm text-ink-soft">
                          {chats[c.id].ultimoDe.split(" ")[0]}: {chats[c.id].ultimo}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm text-ink-soft">
                        {unificarEmpresa(c.empresa) || "Sin empresa"} · {c.telefono}
                        {c.origen ? ` · ${c.origen}` : ""}
                        {c.fechaProxima ? ` · próxima ${fechaCorta(c.fechaProxima)}` : ""}
                      </p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper">
                        <div className="h-full bg-lime-deep" style={{ width: `${c.avance}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-ink-soft">
                        {hechosDe(c)} de 16 · {c.avance}%
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
      {bandeja ? null : (
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid border-t border-line bg-card lg:hidden"
        style={{ gridTemplateColumns: `repeat(${secciones.length}, minmax(0, 1fr))` }}
      >
        {secciones.map((item) => {
          const Icon = item.icon;
          const on = vista === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setVista(item.id)}
              className={"flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold " + (on ? "text-navy" : item.alerta ? "text-danger" : "text-ink-soft")}
            >
              <Icon className="size-5" />
              {item.label}
              {item.n > 0 ? ` ${item.n > 9 ? "9+" : item.n}` : ""}
            </button>
          );
        })}
      </nav>
      )}
      </div>

      {claveOpen ? <MiClave onClose={() => setClaveOpen(false)} /> : null}

      {open ? (
        <Panel
          key={open === "new" ? "new" : open.id}
          caso={open === "new" ? null : open}
          canEdit={open === "new" || open.ownerId === me.id || miraEquipo}
          delEquipo={miraEquipo}
          yo={me.id}
          rol={me.role}
          miSlug={me.slug}
          area={bandeja}
          pilotoActivo={pilotoOn}
          esLider={configura(me.role)}
          asesorInicial={miraEquipo ? (ASESORES.find((p) => p.name === asesor)?.slug ?? me.slug) : me.slug}
          onClose={() => {
            setOpen(null);
            void load();
          }}
          onCreated={async (id) => {
            const rows = await load();
            setOpen(rows.find((c) => c.id === id) ?? null);
            setError("");
          }}
          onSaved={async () => {
            setError("");
            await load();
          }}
          onChat={refrescarChat}
          onError={setError}
        />
      ) : null}
      {sheetsOpen ? (
        <SheetsPanel
          onClose={() => {
            setSheetsOpen(false);
            traerSheetsFn()
              .then((r) => {
                if (r.spreadsheetUrl) setDocUrl(r.spreadsheetUrl);
                if (r.cambios > 0) return load();
              })
              .catch(() => {});
          }}
        />
      ) : null}
      {campana ? (
        <div className="fixed inset-0 z-30 flex justify-end bg-ink/40" onClick={() => setCampana(false)}>
          <div className="flex h-dvh w-full max-w-md flex-col bg-card" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h2 className="text-lg font-semibold">Mensajes</h2>
              <div className="flex items-center gap-2">
                {sinLeerTotal > 0 ? (
                  <button
                    type="button"
                    onClick={() => void leerTodo()}
                    className="h-10 rounded-full border border-line px-3 text-sm font-semibold"
                  >
                    Marcar leídos
                  </button>
                ) : null}
                <button type="button" onClick={() => setCampana(false)} aria-label="Cerrar" className="grid size-11 place-items-center rounded-xl">
                  <X />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {avisos.length === 0 ? (
                <p className="text-sm text-ink-soft">
                  No tienes mensajes pendientes. Cuando te pregunten o te respondan por un proceso, sale aquí.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {avisos.map(({ caso, hilo }) => (
                    <li key={caso.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCampana(false);
                          setVista("procesos");
                          setOpen(caso);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-card border border-line px-4 py-3 text-left"
                      >
                        <span>
                          <span className="font-semibold">{caso.placa}</span>
                          <span className="mt-0.5 block text-sm text-ink-soft">
                            {hilo.ultimoDe.split(" ")[0]}: {hilo.ultimo}
                            {delEquipo ? ` · ${caso.ownerName.split(" ")[0]}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-lime px-3 py-1 text-xs font-semibold text-navy">
                          {hilo.sinLeer} sin leer
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModoSwitch({
  modo,
  onChange,
  invert = false,
}: {
  modo: "mio" | "equipo";
  onChange: (modo: "mio" | "equipo") => void;
  invert?: boolean;
}) {
  return (
    <div className={"grid grid-cols-2 gap-1 rounded-full p-1 " + (invert ? "bg-navy-soft" : "bg-paper")}>
      {(
        [
          ["mio", "Mi trabajo"],
          ["equipo", "El equipo"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={
            "h-9 rounded-full text-sm font-semibold " +
            (modo === id ? (invert ? "bg-lime text-navy" : "bg-navy text-paper") : invert ? "text-paper" : "text-ink-soft")
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function MisNumeros({ casos }: { casos: Caso[] }) {
  const n = tableroDe(casos);
  const celdas = [
    ["Procesos", n.procesos],
    ["Dijo sí", n.dijoSi],
    ["En documentos", n.documentos],
    ["En firma", n.firma],
    ["Póliza", n.poliza],
    ["Operativa", n.operativa],
    ["Completados", n.completados],
    ["No se concretó", n.cerrados],
  ] as const;
  return (
    <section>
      <h1 className="text-lg font-semibold">Tu seguimiento</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Dijo sí, documentos, firma, póliza, operativa y completados no se suman entre sí. El 1 está solo donde va el proceso ahora.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {celdas.map(([label, value]) => (
          <div key={label} className="rounded-card border border-line bg-card px-3 py-3">
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-sm text-ink-soft">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Tablero({
  casos,
  activo,
  onPick,
}: {
  casos: Caso[];
  activo: string;
  onPick: (name: string) => void;
}) {
  const filas = ASESORES.map((p) => ({
    name: p.name,
    corto: p.role === "lider" ? `${p.name.split(" ")[0]} · líder` : p.name.split(" ")[0],
    ...tableroDe(casos.filter((c) => c.ownerName === p.name)),
  }));
  const total = tableroDe(casos);
  return (
    <section>
      <h1 className="text-lg font-semibold">Tablero del equipo</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Los números salen de los procesos de cada asesor. El 1 se mueve: si ya está en firma, no sigue contando en Dijo sí. Toca un nombre para filtrar.
      </p>
      <div className="mt-3 hidden overflow-hidden rounded-card border border-line bg-card md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy text-paper">
            <tr>
              {["Asesor", "Procesos", "Dijo sí", "En documentos", "En firma", "Póliza", "Operativa", "Completados"].map((h) => (
                <th key={h} className="px-3 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.name} className={activo === f.name ? "bg-paper" : ""}>
                <td className="px-3 py-2">
                  <button type="button" className="font-semibold text-navy" onClick={() => onPick(f.name)}>
                    {f.corto}
                  </button>
                </td>
                <Num>{f.procesos}</Num>
                <Num>{f.dijoSi}</Num>
                <Num>{f.documentos}</Num>
                <Num>{f.firma}</Num>
                <Num>{f.poliza}</Num>
                <Num>{f.operativa}</Num>
                <Num>{f.completados}</Num>
              </tr>
            ))}
            <tr className="border-t border-line font-semibold">
              <td className="px-3 py-2">Total</td>
              <Num>{total.procesos}</Num>
              <Num>{total.dijoSi}</Num>
              <Num>{total.documentos}</Num>
              <Num>{total.firma}</Num>
              <Num>{total.poliza}</Num>
              <Num>{total.operativa}</Num>
              <Num>{total.completados}</Num>
            </tr>
          </tbody>
        </table>
      </div>
      <ul className="mt-3 grid gap-2 md:hidden">
        {filas.map((f) => (
          <li key={f.name}>
            <button
              type="button"
              onClick={() => onPick(f.name)}
              className={
                "w-full rounded-card border px-4 py-3 text-left " +
                (activo === f.name ? "border-navy bg-navy text-paper" : "border-line bg-card")
              }
            >
              <span className="font-semibold">{f.corto}</span>
              <span className={"mt-1 block text-sm " + (activo === f.name ? "text-lime" : "text-ink-soft")}>
                {f.procesos} procesos · {f.dijoSi} dijeron sí · {f.completados} listos
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Num({ children }: { children: number }) {
  return <td className="px-3 py-2 tabular-nums">{children}</td>;
}

function PolizaSeguimiento({
  form,
  canEdit,
  esLider,
  soyDueno,
  busy,
  onFecha,
  onMover,
  onPasar,
}: {
  form: Caso;
  canEdit: boolean;
  esLider: boolean;
  soyDueno: boolean;
  busy: boolean;
  onFecha: (fecha: string) => void;
  onMover: (accion: "espera" | "recibida" | "avisar" | "pedir_foto" | "pedir_final" | "cancelar" | "aceptar") => Promise<void>;
  onPasar: (atencion: "presencial" | "virtual") => Promise<void>;
}) {
  const fase = form.polizaFase;
  const entrega = form.polizaEntrega;
  return (
    <div className="mt-3 grid gap-2">
      <p className="text-xs text-ink-soft">
        El día en que marcas Pólizas pagadas cuenta para la meta. No se mueve si después editas el proceso. Lo de la impresión y la entrega lo marca David.
      </p>
      {form.mano === "via" ? (
        <p className="text-sm">
          En Vía Seguros, atención {form.viaAtencion === "presencial" ? "presencial. El pago es en cajas." : "virtual."}
        </p>
      ) : null}
      {form.areaMarcas ? (
        <p className="text-sm text-ink-soft">{marcasDe(form.areaMarcas).map((id) => etiquetaMarca(id, form.viaAtencion)).join(" · ")}</p>
      ) : null}
      {canEdit && (esLider || soyDueno) && !form.mano ? (
        <div className="flex flex-wrap gap-2">
          <BotonPoliza disabled={busy} onClick={() => void onPasar("virtual")}>Pasar a Vía Seguros, virtual</BotonPoliza>
          <BotonPoliza disabled={busy} onClick={() => void onPasar("presencial")}>Pasar a Vía Seguros, presencial</BotonPoliza>
        </div>
      ) : null}
      {form.plataPoliza ? (
        <label className="text-sm font-medium">
          Fecha para comprarlas
          <input
            type="date"
            disabled={!canEdit}
            value={form.fechaCompra}
            onChange={(e) => onFecha(e.target.value)}
            className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
          />
          <span className="mt-1 block text-xs font-normal text-ink-soft">Se guarda con el proceso.</span>
        </label>
      ) : null}
      {form.polizasSubidas ? (
        <div className="rounded-2xl border border-line bg-paper p-3">
          <p className="text-sm font-semibold">Después de pagadas</p>
          <ol className="mt-2 grid gap-1 text-sm text-ink-soft">
            <li className={fase ? "font-semibold text-ink" : ""}>1. En espera de impresión</li>
            <li className={fase === "recibida" || fase === "avisada" ? "font-semibold text-ink" : ""}>2. Impresas, David las recibió</li>
            <li className={fase === "avisada" ? "font-semibold text-ink" : ""}>3. David avisó que ya las tiene</li>
            <li className={entrega ? "font-semibold text-ink" : ""}>
              4. {entrega === "foto" ? "El asesor aceptó la foto" : entrega === "final" ? "El asesor aceptó la entrega definitiva" : entrega === "pide_foto" ? "David va a entregarlas para la foto" : entrega === "pide_final" ? "David va a entregarlas definitivas" : "David dice que las va a entregar y el asesor acepta"}
            </li>
          </ol>
          {esLider ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {!fase ? <BotonPoliza disabled={busy} onClick={() => void onMover("espera")}>En espera de impresión</BotonPoliza> : null}
              {fase === "espera" ? <BotonPoliza disabled={busy} onClick={() => void onMover("recibida")}>Ya las recibí impresas</BotonPoliza> : null}
              {fase === "recibida" ? <BotonPoliza disabled={busy} onClick={() => void onMover("avisar")}>Avisar que las recibí</BotonPoliza> : null}
              {fase === "avisada" && entrega !== "foto" && entrega !== "final" ? (
                <>
                  <BotonPoliza disabled={busy} onClick={() => void onMover("pedir_foto")}>Voy a entregarlas para la foto</BotonPoliza>
                  <BotonPoliza disabled={busy} onClick={() => void onMover("pedir_final")}>Entrega definitiva</BotonPoliza>
                </>
              ) : null}
              {entrega === "pide_foto" || entrega === "pide_final" ? (
                <BotonPoliza disabled={busy} onClick={() => void onMover("cancelar")}>Cancelar la entrega</BotonPoliza>
              ) : null}
            </div>
          ) : null}
          {soyDueno && (entrega === "pide_foto" || entrega === "pide_final") ? (
            <button type="button" disabled={busy} onClick={() => void onMover("aceptar")} className="mt-3 h-11 w-full rounded-2xl bg-navy text-sm font-semibold text-paper disabled:opacity-60">
              Ya las recibí, las acepto
            </button>
          ) : null}
          {entrega === "pide_foto" || entrega === "pide_final" ? (
            <p className="mt-2 text-xs text-ink-soft">Queda pendiente hasta que el asesor las acepte. El aviso también le sale en el chat.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BotonPoliza({ children, onClick, disabled }: { children: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="h-10 rounded-2xl border border-line bg-card px-3 text-sm font-semibold disabled:opacity-60">
      {children}
    </button>
  );
}

function Panel({
  caso,
  canEdit,
  delEquipo,
  yo,
  rol,
  miSlug,
  area,
  pilotoActivo,
  esLider,
  asesorInicial,
  onClose,
  onCreated,
  onSaved,
  onChat,
  onError,
}: {
  caso: Caso | null;
  canEdit: boolean;
  delEquipo: boolean;
  yo: string;
  rol: string;
  miSlug: string;
  area: boolean;
  pilotoActivo: boolean;
  esLider: boolean;
  asesorInicial: string;
  onClose: () => void;
  onCreated: (id: number) => Promise<void>;
  onSaved: () => Promise<void>;
  onChat: () => void;
  onError: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<CasoDraft>(borradorVacio);
  const [form, setForm] = useState<Caso | null>(caso);
  const [pestana, setPestana] = useState<"inicio" | "documentos" | "firma" | "poliza" | "tarjeta" | "cita" | "chat">("inicio");
  const [pdfNuevo, setPdfNuevo] = useState("");
  const [nombrePdf, setNombrePdf] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [ownerSlug, setOwnerSlug] = useState(
    () => ASESORES.find((p) => p.name === caso?.ownerName)?.slug ?? asesorInicial,
  );
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState("");
  const [fotosApertura, setFotosApertura] = useState<FotoApertura[]>([]);
  const [leyendoFoto, setLeyendoFoto] = useState("");
  const [choques, setChoques] = useState<CampoLeido[]>([]);
  const [borrar, setBorrar] = useState(false);
  const [certificando, setCertificando] = useState(false);
  const [guardado, setGuardado] = useState<"quieto" | "guardando" | "listo" | "error">("quieto");
  const formRef = useRef(form);
  const ownerRef = useRef(ownerSlug);
  const pdfRef = useRef({ pdf: pdfNuevo, nombre: nombrePdf });
  const ultimoRef = useRef("");
  const ocupadoRef = useRef(false);
  const colaRef = useRef(false);
  const arranqueRef = useRef(false);
  const refrescoRef = useRef(0);
  const montadoRef = useRef(true);
  formRef.current = form;
  ownerRef.current = ownerSlug;
  pdfRef.current = { pdf: pdfNuevo, nombre: nombrePdf };
  const vivo = form ? conAvance(form) : null;
  const grupos = useMemo(
    () =>
      GRUPOS.map((g) => ({
        g,
        steps: STEPS.filter(
          (s) => s.group === g && !["soat", "tecnomecanica", "formulario", "documentos", "completado"].includes(s.key),
        ),
      })),
    [],
  );

  useEffect(() => {
    if (!caso?.docusealId || caso.docusealEstado === "completed") return;
    void sincronizarDocuseal({ data: caso.id }).then((resultado) => {
      setForm((actual) =>
        actual
          ? {
              ...actual,
              docusealEstado: resultado.estado || actual.docusealEstado,
              firmaContrato: actual.firmaContrato || resultado.firmaContrato,
              auditoriaNombre: resultado.auditoriaNombre || actual.auditoriaNombre,
              contratoNombre: resultado.contratoNombre || actual.contratoNombre,
            }
          : actual,
      );
      if (resultado.resumen) setAviso(resultado.resumen);
    }).catch(() => undefined);
  }, [caso?.id, caso?.docusealId, caso?.docusealEstado]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") void cerrar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function firmaActual() {
    const actual = formRef.current;
    const pdf = pdfRef.current;
    if (!actual) return "";
    return JSON.stringify({
      id: actual.id,
      placa: actual.placa,
      cc: actual.cc,
      nombre: actual.nombre,
      telefono: actual.telefono,
      empresa: actual.empresa,
      dijoSi: actual.dijoSi,
      cedula: actual.cedula,
      tarjetaPropiedad: actual.tarjetaPropiedad,
      tarjetaOperacion: actual.tarjetaOperacion,
      soat: actual.soat,
      tecnomecanica: actual.tecnomecanica,
      formulario: actual.formulario,
      documentos: actual.documentos,
      firmaCarta: actual.firmaCarta,
      firmaContrato: actual.firmaContrato,
      plataPoliza: actual.plataPoliza,
      viaSeguros: actual.viaSeguros,
      polizasSubidas: actual.polizasSubidas,
      operativa: actual.operativa,
      tarjetaEntregada: actual.tarjetaEntregada,
      completado: actual.completado,
      motivoCierre: actual.motivoCierre,
      estadoTarjeta: actual.estadoTarjeta,
      observacion: actual.observacion,
      proxima: actual.proxima,
      fechaProxima: actual.fechaProxima,
      origen: actual.origen,
      direccion: actual.direccion,
      correo: actual.correo,
      marca: actual.marca,
      linea: actual.linea,
      modelo: actual.modelo,
      fechaFirma: actual.fechaFirma,
      fechaCompra: actual.fechaCompra,
      citaFecha: actual.citaFecha,
      citaHora: actual.citaHora,
      entrega: actual.entrega,
      copropietarios: actual.copropietarios,
      ownerSlug: ownerRef.current,
      pdf: pdf.pdf ? `${pdf.nombre}:${pdf.pdf.length}:${pdf.pdf.slice(0, 24)}` : "",
    });
  }

  async function persistir() {
    const actual = formRef.current;
    if (!actual || !canEdit) return;
    const firma = firmaActual();
    if (!firma || firma === ultimoRef.current) return;
    if (ocupadoRef.current) {
      colaRef.current = true;
      return;
    }
    ocupadoRef.current = true;
    if (montadoRef.current) setGuardado("guardando");
    const pdf = pdfRef.current;
    const patch: CasoPatch = {
      id: actual.id,
      placa: actual.placa,
      cc: actual.cc,
      nombre: actual.nombre,
      telefono: actual.telefono,
      empresa: actual.empresa,
      dijoSi: actual.dijoSi,
      cedula: actual.cedula,
      tarjetaPropiedad: actual.tarjetaPropiedad,
      tarjetaOperacion: actual.tarjetaOperacion,
      soat: actual.soat,
      tecnomecanica: actual.tecnomecanica,
      formulario: actual.formulario,
      documentos: actual.documentos,
      firmaCarta: actual.firmaCarta,
      firmaContrato: actual.firmaContrato,
      plataPoliza: actual.plataPoliza,
      viaSeguros: actual.viaSeguros,
      polizasSubidas: actual.polizasSubidas,
      operativa: actual.operativa,
      tarjetaEntregada: actual.tarjetaEntregada,
      completado: actual.completado,
      motivoCierre: actual.motivoCierre,
      estadoTarjeta: actual.estadoTarjeta,
      observacion: actual.observacion,
      proxima: actual.proxima,
      fechaProxima: actual.fechaProxima,
      origen: actual.origen,
      direccion: actual.direccion,
      correo: actual.correo,
      marca: actual.marca,
      linea: actual.linea,
      modelo: actual.modelo,
      fechaFirma: actual.fechaFirma,
      fechaCompra: actual.fechaCompra,
      citaFecha: actual.citaFecha,
      citaHora: actual.citaHora,
      entrega: actual.entrega,
      copropietarios: actual.copropietarios,
      ...(pdf.pdf ? { contratoPdf: pdf.pdf, contratoNombre: pdf.nombre } : {}),
      ...(delEquipo ? { ownerSlug: ownerRef.current } : {}),
    };
    try {
      await updateCaso({ data: patch });
      if (pdf.pdf && pdfRef.current.pdf === pdf.pdf) {
        pdfRef.current = { pdf: "", nombre: "" };
        if (montadoRef.current) {
          setPdfNuevo("");
          setNombrePdf("");
        }
      }
      ultimoRef.current = firmaActual();
      if (montadoRef.current) {
        setGuardado("listo");
        setAviso(actual.motivoCierre.trim() ? "Cerrado. No cuenta como completado." : "");
      }
      const ahora = Date.now();
      if (ahora - refrescoRef.current > 1200) {
        refrescoRef.current = ahora;
        void onSaved();
      }
    } catch (err) {
      if (montadoRef.current) {
        setGuardado("error");
        onError(fallo(err));
      }
    } finally {
      ocupadoRef.current = false;
      if (colaRef.current || firmaActual() !== ultimoRef.current) {
        colaRef.current = false;
        void persistir();
      }
    }
  }

  async function cerrar() {
    await persistir();
    onClose();
  }

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      void persistir();
    };
  }, []);

  useEffect(() => {
    if (!form || !canEdit) return;
    if (!arranqueRef.current) {
      arranqueRef.current = true;
      ultimoRef.current = firmaActual();
      return;
    }
    const t = window.setTimeout(() => void persistir(), 450);
    return () => window.clearTimeout(t);
  }, [form, ownerSlug, pdfNuevo, nombrePdf, canEdit]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setAviso("");
    try {
      const { id } = await createCaso({
        data: delEquipo ? { ...draft, ownerSlug } : draft,
      });
      for (const foto of fotosApertura) {
        await subirDocumento({
          data: { casoId: id, tipo: foto.tipo, nombre: foto.nombre, archivo: foto.archivo, lectura: foto.lectura },
        });
      }
      if (draft.contratoPdf && draft.contratoPdf.length > 80) {
        await guardarComoDocumento(id, "contrato", draft.contratoNombre || "contrato.pdf", draft.contratoPdf, "");
      }
      await onCreated(id);
    } catch (err) {
      onError(fallo(err));
      setBusy(false);
    }
  }

  async function leerApertura(tipo: FotoApertura["tipo"], file: File) {
    if (!file.type.startsWith("image/")) {
      setAviso("Sube una foto, no un PDF. Si el documento es un escaneo, tómale una foto.");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setAviso("La foto pesa más de 30 MB");
      return;
    }
    setLeyendoFoto(tipo);
    setAviso("");
    try {
      const listo = await prepararArchivo(file);
      const archivo = listo.archivo;
      const actual = {
        placa: draft.placa,
        cc: draft.cc,
        nombre: draft.nombre,
        telefono: draft.telefono,
        direccion: draft.direccion ?? "",
        correo: draft.correo ?? "",
        marca: draft.marca ?? "",
        linea: draft.linea ?? "",
        modelo: draft.modelo ?? "",
        empresa: draft.empresa,
      };
      const leida = await leerDocumento({ data: { tipo, nombre: listo.nombre, archivo, actual } });
      const llenos: Partial<CasoDraft> = {};
      const distintos: CampoLeido[] = [];
      for (const campo of leida.campos) {
        const valor = String(actual[campo.key] ?? "").trim();
        if (!valor) llenos[campo.key] = campo.leido;
        else distintos.push(campo);
      }
      if (Object.keys(llenos).length) setDraft((prev) => ({ ...prev, ...llenos }));
      setChoques((prev) => [...prev.filter((item) => !leida.campos.some((campo) => campo.key === item.key)), ...distintos]);
      setFotosApertura((prev) => [
        ...prev.filter((item) => item.tipo !== tipo),
        { tipo, nombre: listo.nombre, archivo, lectura: JSON.stringify(leida) },
      ]);
      const etiquetas = Object.keys(llenos).map((key) => leida.campos.find((campo) => campo.key === key)?.label ?? key);
      setAviso(
        etiquetas.length
          ? `Llené ${etiquetas.join(", ")}. Revisa que estén bien y escribe el celular.`
          : leida.aviso,
      );
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No pude leer la foto. Escríbelo a mano.");
    } finally {
      setLeyendoFoto("");
    }
  }

  function toggle(key: StepKey) {
    if (!form || !canEdit) return;
    if (key === "completado" && !form[key] && !form.tarjetaEntregada) {
      setAviso("Completado solo se marca cuando la tarjeta ya se entregó.");
      return;
    }
    const next = { ...form, [key]: !form[key] };
    if (key === "completado" && next.completado) next.motivoCierre = "";
    if (key === "tarjetaEntregada" && !next.tarjetaEntregada) next.completado = false;
    if (key === "polizasSubidas" && !next.polizasSubidas) {
      next.polizaFase = "";
      next.polizaEntrega = "";
    }
    setForm(next);
    setAviso("");
  }

  async function guardarComoDocumento(casoId: number, tipo: string, nombre: string, archivo: string, lectura: string) {
    const cargaId = crypto.randomUUID();
    await enviarEnTrozos(archivo, async (orden, datos, fin) => {
      await recibirTrozo({ data: { cargaId, orden, datos, fin, casoId, tipo, nombre, lectura } });
    });
  }

  async function tomarContrato(file: File) {
    if (file.type && file.type !== "application/pdf") {
      onError("Sube el contrato en PDF");
      return;
    }
    if (file.size > 8_000_000) {
      onError("El PDF pesa más de 8 MB");
      return;
    }
    setLeyendo(true);
    setAviso("");
    try {
      const pdf = await aBase64(file);
      if (pdf.length > 3_000_000) {
        if (!caso) throw new Error("Ese contrato es muy pesado para leerlo. Súbelo en Documentos como contrato.");
        await guardarComoDocumento(caso.id, "contrato", file.name, pdf, "");
        setAviso("El contrato pesa mucho para leerlo aquí. Quedó guardado en Documentos.");
        return;
      }
      const leido = await leerContrato({ data: { pdf } });
      if (caso) await guardarComoDocumento(caso.id, "contrato", file.name, pdf, "");
      if (!caso) {
        setDraft((d) => ({
          ...d,
          placa: leido.placa,
          cc: leido.cc,
          nombre: leido.nombre,
          telefono: leido.telefono,
          direccion: leido.direccion,
          correo: leido.correo,
          marca: leido.marca,
          linea: leido.linea,
          modelo: leido.modelo,
          fechaFirma: leido.fechaFirma,
          contratoNombre: file.name,
          contratoPdf: pdf,
          firmaContrato: leido.firmado,
        }));
      } else {
        setForm((actual) =>
          actual
            ? {
                ...actual,
                placa: leido.placa,
                cc: leido.cc,
                nombre: leido.nombre,
                telefono: leido.telefono,
                direccion: leido.direccion || actual.direccion,
                correo: leido.correo || actual.correo,
                marca: leido.marca || actual.marca,
                linea: leido.linea || actual.linea,
                modelo: leido.modelo || actual.modelo,
                fechaFirma: leido.fechaFirma || actual.fechaFirma,
                contratoNombre: file.name,
                dijoSi: true,
                firmaContrato: actual.firmaContrato || leido.firmado,
              }
            : actual,
        );
        setPdfNuevo(pdf);
        setNombrePdf(file.name);
      }
      const carro = [leido.marca, leido.linea, leido.modelo].filter(Boolean).join(" ");
      setAviso(
        leido.firmado
          ? `Contrato leído: ${leido.placa} · ${leido.nombre}${carro ? ` · ${carro}` : ""}. Quedó también en Documentos.`
          : "Leí los datos. No vi la firma del propietario: confírmala. El archivo quedó en Documentos.",
      );
    } catch (err) {
      onError(fallo(err));
    } finally {
      setLeyendo(false);
    }
  }

  async function bajarContrato() {
    if (!form) return;
    try {
      const file = await verContrato({ data: form.id });
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      onError(fallo(err));
    }
  }

  async function bajarAuditoriaFirma() {
    if (!form) return;
    try {
      const file = await verAuditoriaFirma({ data: form.id });
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      onError(fallo(err));
    }
  }

  async function traerDocuseal() {
    if (!form) return;
    setAviso("");
    try {
      const resultado = await sincronizarDocuseal({ data: form.id });
      setForm((actual) =>
        actual
          ? {
              ...actual,
              docusealEstado: resultado.estado || actual.docusealEstado,
              firmaContrato: actual.firmaContrato || resultado.firmaContrato,
              auditoriaNombre: resultado.auditoriaNombre || actual.auditoriaNombre,
              contratoNombre: resultado.contratoNombre || actual.contratoNombre,
            }
          : actual,
      );
      setAviso(resultado.resumen || (resultado.firmaContrato ? "Ya quedó el contrato firmado y el certificado." : "Todavía no terminan de firmar."));
      if (resultado.cambio) await onSaved();
    } catch (err) {
      onError(fallo(err));
    }
  }

  async function bajarCertificado() {
    if (!form) return;
    setCertificando(true);
    try {
      const file = await certificadoProceso({ data: form.id });
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      onError(fallo(err));
    } finally {
      setCertificando(false);
    }
  }

  const tel = form ? celular(form.telefono) : "";

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-ink/40" onClick={() => void cerrar()}>
      <div className="rise flex h-dvh w-full flex-col bg-card lg:max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">{caso ? caso.placa : "Nuevo seguimiento"}</h2>
            {vivo ? (
              <p className="text-sm text-ink-soft">
                {vivo.estado} · {vivo.hechos} de 16 · {vivo.avance}%
                {caso?.actualizadoEn ? ` · Actualizado ${cuando(caso.actualizadoEn)}${caso.actualizadoPor ? ` por ${caso.actualizadoPor}` : ""}` : ""}
              </p>
            ) : (
              <p className="text-sm text-ink-soft">Toma o sube la foto de la cédula y de la tarjeta de propiedad. Con eso se llenan placa, cédula y nombre. El celular lo escribes tú.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {caso ? (
              <button
                type="button"
                disabled={certificando}
                onClick={() => void bajarCertificado()}
                className="h-11 rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-60"
              >
                {certificando ? "Armando…" : "Certificado"}
              </button>
            ) : null}
            <button type="button" onClick={() => void cerrar()} aria-label="Cerrar" className="grid size-11 place-items-center rounded-xl">
              <X />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!caso ? (
            <form id="nuevo" onSubmit={create} className="grid gap-3">
              <div className="grid gap-2 rounded-2xl border border-line bg-paper p-3">
                <p className="text-sm font-semibold">Abre el seguimiento con dos fotos</p>
                <p className="text-sm text-ink-soft">Cédula y tarjeta de propiedad. El resto de documentos se sube después. El celular no sale en la foto: escríbelo para poder pedir el enlace de pago.</p>
                <FotoApertura etiqueta="Cédula" lista={fotosApertura.some((foto) => foto.tipo === "cedula")} leyendo={leyendoFoto === "cedula"} onFile={(file) => void leerApertura("cedula", file)} />
                <FotoApertura etiqueta="Tarjeta de propiedad" lista={fotosApertura.some((foto) => foto.tipo === "tarjeta_propiedad")} leyendo={leyendoFoto === "tarjeta_propiedad"} onFile={(file) => void leerApertura("tarjeta_propiedad", file)} />
              </div>
              {choques.map((campo) => (
                <div key={campo.key} className="grid gap-1 rounded-2xl border border-line p-3 text-sm">
                  <p className="font-semibold">{campo.label}</p>
                  <p className="text-ink-soft">Lo que escribiste: {campo.actual}</p>
                  <p>En la foto: {campo.leido}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="h-9 rounded-xl bg-navy px-3 font-semibold text-paper"
                      onClick={() => {
                        setDraft((prev) => ({ ...prev, [campo.key]: campo.leido }));
                        setChoques((prev) => prev.filter((item) => item.key !== campo.key));
                      }}
                    >
                      V
                    </button>
                    <button type="button" className="h-9 rounded-xl border border-line px-3 font-semibold" onClick={() => setChoques((prev) => prev.filter((item) => item.key !== campo.key))}>
                      X
                    </button>
                  </div>
                </div>
              ))}
              {delEquipo ? <AsesorSelect value={ownerSlug} onChange={setOwnerSlug} /> : null}
              <Field label="Placa" value={draft.placa} onChange={(v) => setDraft({ ...draft, placa: v.toUpperCase() })} />
              <Field label="CC del propietario" value={draft.cc} onChange={(v) => setDraft({ ...draft, cc: v })} />
              <Field label="Nombre del propietario" value={draft.nombre} onChange={(v) => setDraft({ ...draft, nombre: v })} />
              <Field label="Celular" value={draft.telefono} onChange={(v) => setDraft({ ...draft, telefono: v })} />
              <OtrosPropietarios valor={draft.copropietarios ?? ""} onChange={(copropietarios) => setDraft((actual) => ({ ...actual, copropietarios }))} />
              <EmpresaSelect value={draft.empresa} onChange={(v) => setDraft({ ...draft, empresa: v })} />
              <Origen key="nuevo" value={draft.origen ?? ""} onChange={(v) => setDraft({ ...draft, origen: v })} />
              <DatosContrato
                direccion={draft.direccion}
                correo={draft.correo}
                marca={draft.marca}
                linea={draft.linea}
                modelo={draft.modelo}
                fechaFirma={draft.fechaFirma}
                onChange={(patch) => setDraft({ ...draft, ...patch })}
              />
            </form>
          ) : form && vivo && area ? (
            <div className="grid gap-4">
              <div className="rounded-2xl border border-line bg-paper p-3 text-sm">
                <p className="font-semibold">{form.placa} · {form.nombre || "Sin propietario"}</p>
                <p className="mt-1 text-ink-soft">{[form.telefono, form.empresa, form.ownerName].filter(Boolean).join(" · ")}</p>
                <p className="mt-1">{form.estado}. {siguientePaso(form)}</p>
              </div>
              <ChatCaso casoId={form.id} duenoId={form.ownerId} yo={yo} delEquipo onCambio={onChat} />
              <BloquePiloto
                caso={form}
                rol={rol}
                miSlug={miSlug}
                activo={pilotoActivo}
                onCaso={(patch) => setForm((actual) => (actual ? { ...actual, ...patch } : actual))}
                onListo={() => {
                  onChat();
                  void onSaved();
                }}
                onError={onError}
              />
            </div>
          ) : form && vivo ? (
            <ProcesoConPestanas
              form={form}
              pestana={pestana}
              setPestana={setPestana}
              siguiente={siguientePaso(form)}
            >
            <div className="grid gap-4">
              {pestana === "chat" ? (
                <ChatCaso casoId={form.id} duenoId={form.ownerId} yo={yo} delEquipo={delEquipo} onCambio={onChat} />
              ) : null}
              {pestana === "documentos" ? (
              <BloquePiloto
                caso={form}
                rol={rol}
                miSlug={miSlug}
                activo
                soloDocs
                soloTipos={["unificado", "cedula", "tarjeta_propiedad", "tarjeta_operacion", "contrato"]}
                onCaso={(patch) => setForm((actual) => (actual ? { ...actual, ...patch } : actual))}
                onListo={() => {
                  onChat();
                  void onSaved();
                }}
                onError={onError}
              />
              ) : null}
              {pestana === "inicio" || pestana === "firma" ? (
              <div className="grid content-start gap-3">
                {pestana === "inicio" && delEquipo ? <AsesorSelect value={ownerSlug} onChange={setOwnerSlug} /> : null}
                {canEdit && pestana === "inicio" ? (
                  <>
                    <Field label="Placa" value={form.placa} onChange={(v) => setForm({ ...form, placa: v.toUpperCase() })} />
                    <Field label="CC del propietario" value={form.cc} onChange={(v) => setForm({ ...form, cc: v })} />
                    <Field label="Nombre" value={form.nombre} onChange={(v) => setForm({ ...form, nombre: v })} />
                    <Field label="Celular" value={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} />
                    <OtrosPropietarios valor={form.copropietarios} onChange={(copropietarios) => setForm((actual) => (actual ? { ...actual, copropietarios } : actual))} />
                    <EmpresaSelect value={form.empresa} onChange={(v) => setForm({ ...form, empresa: v })} />
                    <Origen key={form.id} value={form.origen} onChange={(v) => setForm({ ...form, origen: v })} />
                  </>
                ) : null}
                {canEdit && pestana === "firma" ? (
                  <>
                    <SubirContrato busy={leyendo || busy} onFile={tomarContrato} />
                    <DatosContrato
                      direccion={form.direccion}
                      correo={form.correo}
                      marca={form.marca}
                      linea={form.linea}
                      modelo={form.modelo}
                      fechaFirma={form.fechaFirma}
                      onChange={(patch) => setForm({ ...form, ...patch })}
                    />
                    <EnviarFirma
                      casoId={form.id}
                      correo={form.correo}
                      placa={form.placa}
                      nombre={form.nombre}
                      cc={form.cc}
                      telefono={form.telefono}
                      direccion={form.direccion}
                      marca={form.marca}
                      linea={form.linea}
                      modelo={form.modelo}
                      empresa={form.empresa}
                      copropietarios={form.copropietarios}
                      onEnviado={(id) => setForm((actual) => (actual ? { ...actual, docusealId: id, docusealEstado: "pendiente" } : actual))}
                    />
                    {form.docusealId ? (
                      <div className="grid gap-2 rounded-2xl border border-line p-3 text-sm">
                        <p>
                          {form.docusealEstado === "completed"
                            ? "DocuSeal guardó la firma y el certificado."
                            : "DocuSeal está esperando la firma. Cuando terminen, trae el certificado."}
                        </p>
                        {form.docusealEstado !== "completed" ? (
                          <button type="button" onClick={() => void traerDocuseal()} className="h-10 rounded-2xl border border-line font-semibold">
                            Traer certificado
                          </button>
                        ) : null}
                        {form.auditoriaNombre ? (
                          <button type="button" onClick={() => void bajarAuditoriaFirma()} className="inline-flex h-10 items-center gap-2 font-semibold text-navy">
                            <FileText className="size-4" /> {form.auditoriaNombre}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {form.contratoNombre && !pdfNuevo ? (
                      <button type="button" onClick={bajarContrato} className="inline-flex h-11 items-center gap-2 text-sm font-semibold text-navy">
                        <FileText className="size-4" /> {form.contratoNombre}
                      </button>
                    ) : null}
                  </>
                ) : null}
                {!canEdit && pestana === "inicio" ? (
                  <p className="text-sm">
                    <span className="font-semibold">{form.nombre}</span>
                    <span className="mt-1 block text-ink-soft">
                      CC {form.cc} · {form.telefono}
                      <br />
                      {unificarEmpresa(form.empresa) || "Sin empresa"}
                      {form.origen ? ` · ${form.origen}` : ""}
                      {" · "}desde {fechaCorta(form.fechaInicio)} · {form.ownerName}
                    </span>
                  </p>
                ) : null}
                {pestana === "inicio" && tel.length >= 12 ? (
                  <div className="flex gap-2">
                    <a href={`tel:+${tel}`} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-line text-sm font-semibold">
                      <Phone className="size-4" /> Llamar
                    </a>
                    <a
                      href={`https://wa.me/${tel}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-navy text-sm font-semibold text-paper"
                    >
                      <MessageCircle className="size-4" /> WhatsApp
                    </a>
                  </div>
                ) : null}
                {pestana === "inicio" ? (
                  <>
                <label className="text-sm font-medium">
                  Observación
                  <textarea
                    disabled={!canEdit}
                    value={form.observacion}
                    onChange={(e) => setForm({ ...form, observacion: e.target.value })}
                    className="mt-1 min-h-20 w-full rounded-2xl border border-line p-3"
                  />
                </label>
                <div className="rounded-2xl border border-line bg-paper p-3">
                  <p className="text-sm font-medium">Cerrar sin concretar</p>
                  <p className="mt-1 text-xs font-normal text-ink-soft">
                    Si desistió, no tenía la plata de la póliza u otra razón, escríbela. No queda como completado y la placa se puede volver a abrir.
                  </p>
                  <textarea
                    disabled={!canEdit}
                    value={form.motivoCierre}
                    placeholder="Ejemplo: desistió, no tenía la plata de la póliza"
                    onChange={(e) =>
                      setForm({
                        ...form,
                        motivoCierre: e.target.value,
                        completado: e.target.value.trim() ? false : form.completado,
                      })
                    }
                    className="mt-2 min-h-20 w-full rounded-2xl border border-line bg-card p-3"
                  />
                  {form.motivoCierre.trim() ? (
                    <p className="mt-2 text-xs font-normal text-ink-soft">
                      Al escribir el motivo sale de En curso.
                      {form.fechaCierre ? ` Cerrado el ${fechaCorta(form.fechaCierre)}.` : ""} Para reabrirlo, borra este texto.
                    </p>
                  ) : null}
                </div>
                <label className="text-sm font-medium">
                  Próxima gestión
                  <input
                    disabled={!canEdit}
                    value={form.proxima}
                    onChange={(e) => setForm({ ...form, proxima: e.target.value })}
                    className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
                  />
                </label>
                <label className="text-sm font-medium">
                  Fecha de la próxima
                  <input
                    type="date"
                    disabled={!canEdit}
                    value={form.fechaProxima}
                    onChange={(e) => setForm({ ...form, fechaProxima: e.target.value })}
                    className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
                  />
                  <span className="mt-1 block text-xs font-normal text-ink-soft">Esta fecha sale en la agenda de ese día.</span>
                </label>
                  </>
                ) : null}
              </div>
              ) : null}
              {pestana === "poliza" && listoParaVia(form) ? (
                <p className="rounded-2xl bg-lime px-3 py-3 text-sm font-medium text-ink">
                  Listo para Vía Seguros: ya están los papeles, las dos firmas y la plata.
                </p>
              ) : null}
              {pestana === "poliza" && form.viaSeguros && !requisitosVia(form) ? (
                <p className="rounded-2xl bg-paper px-3 py-3 text-sm text-danger">
                  A Vía Seguros se pasa con los tres documentos, las dos firmas y la plata de la póliza.
                </p>
              ) : null}
              {pestana === "tarjeta" ? (
                <div>
                  <p className="text-sm font-medium">Estado de la tarjeta</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {TARJETAS.map((t) => {
                      const on = form.estadoTarjeta === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => setForm({ ...form, estadoTarjeta: on ? "" : t })}
                          className={
                            "h-11 rounded-2xl border text-sm font-semibold " + (on ? "border-navy bg-navy text-paper" : "border-line")
                          }
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {pestana === "cita" ? (
                <>
                <CitaEntrega form={form} canEdit={canEdit} onChange={(patch) => setForm({ ...form, ...patch })} />
                <BloquePiloto
                  caso={form}
                  rol={rol}
                  miSlug={miSlug}
                  activo
                  soloDocs
                  soloTipos={["autorizacion"]}
                  onCaso={(patch) => setForm((actual) => (actual ? { ...actual, ...patch } : actual))}
                  onListo={() => {
                    onChat();
                    void onSaved();
                  }}
                  onError={onError}
                />
                </>
              ) : null}
              <div className="order-first grid content-start gap-4">
                {grupos.filter(({ g }) => g === (pestana === "inicio" ? "Inicio" : pestana === "documentos" ? "Documentos" : pestana === "firma" ? "Firma" : pestana === "poliza" ? "Póliza" : pestana === "tarjeta" ? "Tarjeta" : "")).map(({ g, steps }) => {
                  const listos = steps.filter((s) => form[s.key]).length;
                  return (
                    <fieldset key={g}>
                      <legend className="mb-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
                        {g} · {listos}/{steps.length}
                      </legend>
                      <div className="grid gap-2">
                        {steps.map((step) => {
                          const on = form[step.key];
                          const locked = !canEdit || (step.key === "completado" && !form.tarjetaEntregada && !on);
                          return (
                            <button
                              key={step.key}
                              type="button"
                              disabled={locked}
                              aria-pressed={on}
                              onClick={() => toggle(step.key)}
                              className={
                                "flex min-h-11 items-center gap-3 rounded-2xl border px-3 text-left text-sm " +
                                (on ? "border-navy bg-navy text-paper" : "border-line") +
                                (locked && !on ? " opacity-60" : "")
                              }
                            >
                              <span
                                className={
                                  "grid h-6 w-8 place-items-center rounded-md text-xs font-bold " +
                                  (on ? "bg-lime text-navy" : "bg-paper text-ink-soft")
                                }
                              >
                                {on ? "Sí" : "No"}
                              </span>
                              {step.label}
                            </button>
                          );
                        })}
                      </div>
                      {g === "Póliza" ? (
                        <PolizaSeguimiento
                          form={form}
                          canEdit={canEdit}
                          esLider={esLider}
                          soyDueno={yo === form.ownerId}
                          busy={busy}
                          onFecha={(fechaCompra) => setForm({ ...form, fechaCompra })}
                          onMover={async (accion) => {
                            setBusy(true);
                            setAviso("");
                            try {
                              const listo = await moverPoliza({ data: { id: form.id, accion } });
                              setForm({ ...form, polizaFase: listo.fase, polizaEntrega: listo.entrega });
                              onChat();
                              setAviso("Quedó marcado.");
                            } catch (err) {
                              onError(fallo(err));
                            } finally {
                              setBusy(false);
                            }
                          }}
                          onPasar={async (atencion) => {
                            setBusy(true);
                            setAviso("");
                            try {
                              await pasarMano({ data: { id: form.id, mano: "via", atencion } });
                              setForm({ ...form, mano: "via", viaAtencion: atencion, viaSeguros: true, viaEstado: form.viaEstado || "pedido" });
                              onChat();
                              setAviso(atencion === "presencial" ? "Quedó en Vía Seguros, presencial." : "Quedó en Vía Seguros, virtual.");
                            } catch (err) {
                              onError(fallo(err));
                            } finally {
                              setBusy(false);
                            }
                          }}
                        />
                      ) : null}
                    </fieldset>
                  );
                })}
                {!canEdit ? <p className="text-sm text-ink-soft">Este proceso no se puede editar desde aquí.</p> : null}
              </div>
            </div>
            </ProcesoConPestanas>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          {caso && canEdit ? (
            <p className={"flex-1 text-sm " + (guardado === "error" ? "font-semibold text-danger" : "text-ink-soft")}>
              {aviso ? <span className="block">{aviso}</span> : null}
              {guardado === "guardando" ? "Guardando…" : guardado === "error" ? "No se guardó" : guardado === "listo" ? "Guardado" : "Se guarda solo"}
            </p>
          ) : aviso ? (
            <p className="flex-1 text-sm text-ink-soft">{aviso}</p>
          ) : (
            <span className="flex-1" />
          )}
          {!caso ? (
            <button form="nuevo" disabled={busy} className="h-12 flex-1 rounded-2xl bg-lime font-semibold text-ink disabled:opacity-60">
              {busy ? "Abriendo…" : "Abrir seguimiento"}
            </button>
          ) : canEdit ? (
            <>
              {borrar ? (
                <button
                  type="button"
                  className="h-12 rounded-2xl border border-line px-4 text-sm font-semibold text-danger"
                  onClick={async () => {
                    if (!form) return;
                    await removeCaso({ data: form.id });
                    await onSaved();
                    onClose();
                  }}
                >
                  Sí, borrar
                </button>
              ) : (
                <button type="button" className="h-12 rounded-2xl px-3 text-sm text-danger" onClick={() => setBorrar(true)}>
                  Borrar
                </button>
              )}
              {guardado === "error" ? (
                <button type="button" onClick={() => void persistir()} className="h-12 rounded-2xl bg-navy px-4 font-semibold text-paper">
                  Reintentar
                </button>
              ) : (
                <button type="button" onClick={() => void cerrar()} className="h-12 rounded-2xl bg-navy px-5 font-semibold text-paper">
                  Cerrar
                </button>
              )}
            </>
          ) : (
            <button type="button" onClick={() => void cerrar()} className="h-12 flex-1 rounded-2xl bg-navy font-semibold text-paper">
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProcesoConPestanas({
  form,
  pestana,
  setPestana,
  siguiente,
  children,
}: {
  form: Caso;
  pestana: "inicio" | "documentos" | "firma" | "poliza" | "tarjeta" | "cita" | "chat";
  setPestana: (id: "inicio" | "documentos" | "firma" | "poliza" | "tarjeta" | "cita" | "chat") => void;
  siguiente: string;
  children: ReactNode;
}) {
  const docs = form.cedula && form.tarjetaPropiedad && form.tarjetaOperacion;
  const recibida =
    form.areaMarcas.includes("tarjeta_recibida") || form.opTarjeta === "entregada" || form.tarjetaEntregada || form.estadoTarjeta === "Expedida";
  const tabs = [
    { id: "inicio" as const, label: "Inicio", abierta: true },
    { id: "documentos" as const, label: "Documentos", abierta: form.dijoSi },
    { id: "firma" as const, label: "Firma", abierta: docs },
    { id: "poliza" as const, label: "Póliza", abierta: form.firmaContrato },
    { id: "tarjeta" as const, label: "Tarjeta", abierta: form.polizasSubidas },
    { id: "cita" as const, label: "Cita", abierta: recibida },
    { id: "chat" as const, label: "Chat", abierta: true },
  ];
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-line bg-paper p-3 text-sm">
        <p className="font-semibold">
          {form.placa} · {form.nombre || "Sin propietario"}
        </p>
        <p className="mt-1 text-ink-soft">
          {form.estado}. {siguiente}
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            disabled={!tab.abierta}
            onClick={() => setPestana(tab.id)}
            className={
              "h-10 shrink-0 rounded-2xl px-3 text-sm font-semibold disabled:opacity-40 " +
              (pestana === tab.id ? "bg-navy text-paper" : "border border-line")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

function CitaEntrega({
  form,
  canEdit,
  onChange,
}: {
  form: Caso;
  canEdit: boolean;
  onChange: (patch: Partial<Caso>) => void;
}) {
  const tiene = new Set(entregaIds(form.entrega));
  const bonos = ["bono_rodamiento", "bono_app", "bono_distintivos", "bono_equipo", "bono_espia"];
  const listo = tiene.has("distintivos") && tiene.has("pegada") && tiene.has("tarjeta_nueva") && bonos.every((id) => tiene.has(id));
  function marcar(id: string) {
    const next = new Set(tiene);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ entrega: [...next].join(",") });
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-ink-soft">
        Cita al señor cuando la tarjeta ya llegó. Ese día la jefe Asiyade entrega los distintivos, dejan el carro, pasan por operativa y salen por los bonos.
      </p>
      <label className="text-sm font-medium">
        Día de la cita
        <input
          type="date"
          disabled={!canEdit}
          value={form.citaFecha}
          onChange={(e) => onChange({ citaFecha: e.target.value })}
          className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
        />
      </label>
      <label className="text-sm font-medium">
        Hora
        <input
          type="time"
          disabled={!canEdit}
          value={form.citaHora}
          onChange={(e) => onChange({ citaHora: e.target.value })}
          className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
        />
        <span className="mt-1 block text-xs font-normal text-ink-soft">Queda en la agenda como visita, Cita de entrega.</span>
      </label>
      <div className="grid gap-2">
        {ENTREGA.map((item) => {
          const on = tiene.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              disabled={!canEdit}
              onClick={() => marcar(item.id)}
              className={"flex min-h-11 items-center gap-3 rounded-2xl border px-3 text-left text-sm " + (on ? "border-navy bg-navy text-paper" : "border-line")}
            >
              <span className={"grid h-6 w-8 place-items-center rounded-md text-xs font-bold " + (on ? "bg-lime text-navy" : "bg-paper text-ink-soft")}>
                {on ? "Sí" : "No"}
              </span>
              {item.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={!canEdit || (!listo && !form.completado)}
        onClick={() => onChange({ completado: !form.completado, motivoCierre: form.completado ? form.motivoCierre : "" })}
        className={"h-11 rounded-2xl text-sm font-semibold disabled:opacity-50 " + (form.completado ? "bg-navy text-paper" : "border border-line")}
      >
        {form.completado ? "Completado" : listo ? "Marcar completado" : "Faltan distintivos, tarjeta o bonos"}
      </button>
    </div>
  );
}

function EmpresaSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const puesta = unificarEmpresa(value);
  const enLista = puesta !== "" && puesta !== value.trim();
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const lista = buscarEmpresas(q).slice(0, 40);
  return (
    <div className="text-sm font-medium">
      Empresa actual
      <button type="button" onClick={() => setAbierto((v) => !v)} className="mt-1 flex h-11 w-full items-center rounded-2xl border border-line px-3 text-left font-normal">
        <span className="truncate">{puesta || "Elegir empresa"}</span>
      </button>
      {value.trim() && puesta === value.trim() && !buscarEmpresas(value).some((empresa) => empresa === value.trim()) ? (
        <p className="mt-1 font-normal text-ink-soft">Ese nombre no está en la lista. Elige el oficial.</p>
      ) : null}
      {enLista ? <p className="mt-1 font-normal text-ink-soft">Se unifica como {puesta}. Queda con ese nombre al guardarse solo.</p> : null}
      {abierto ? (
        <div className="mt-2 rounded-2xl border border-line p-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar empresa"
            className="h-11 w-full rounded-2xl border border-line px-3 font-normal"
          />
          <ul className="mt-2 max-h-60 overflow-auto">
            {lista.map((empresa) => (
              <li key={empresa}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(empresa);
                    setAbierto(false);
                    setQ("");
                  }}
                  className={"block w-full rounded-xl px-3 py-2 text-left font-normal " + (empresa === puesta ? "bg-navy text-paper" : "")}
                >
                  {empresa}
                </button>
              </li>
            ))}
            {lista.length === 0 ? <li className="px-3 py-2 font-normal text-ink-soft">No está en la lista.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Origen({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const fijo = (ORIGENES as readonly string[]).includes(value);
  const [otro, setOtro] = useState(value !== "" && !fijo);
  return (
    <div>
      <p className="text-sm font-medium">De dónde salió</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {ORIGENES.map((opcion) => {
          const on = value === opcion;
          return (
            <button
              key={opcion}
              type="button"
              onClick={() => {
                setOtro(false);
                onChange(on ? "" : opcion);
              }}
              className={"h-11 rounded-2xl border px-2 text-sm font-semibold " + (on ? "border-navy bg-navy text-paper" : "border-line")}
            >
              {opcion}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setOtro(true);
            if (fijo) onChange("");
          }}
          className={"h-11 rounded-2xl border px-2 text-sm font-semibold " + (otro ? "border-navy bg-navy text-paper" : "border-line")}
        >
          Personalizado
        </button>
      </div>
      {otro ? (
        <input
          value={fijo ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Escribe de dónde salió"
          className="mt-2 h-11 w-full rounded-2xl border border-line px-3"
        />
      ) : null}
    </div>
  );
}

function FotoApertura({
  etiqueta,
  lista,
  leyendo,
  onFile,
}: {
  etiqueta: string;
  lista: boolean;
  leyendo: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <div className="grid gap-2 rounded-2xl border border-line bg-card p-3">
      <p className="text-sm font-semibold">{etiqueta}{lista ? " · lista" : ""}</p>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex h-11 cursor-pointer items-center rounded-2xl bg-navy px-3 text-sm font-semibold text-paper">
          {leyendo ? "Leyendo…" : "Tomar foto"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={leyendo}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onFile(file);
            }}
          />
        </label>
        <label className="inline-flex h-11 cursor-pointer items-center rounded-2xl border border-line px-3 text-sm font-semibold">
          Subir foto
          <input
            type="file"
            accept="image/*"
            disabled={leyendo}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onFile(file);
            }}
          />
        </label>
      </div>
    </div>
  );
}

type FotoApertura = { tipo: "cedula" | "tarjeta_propiedad"; nombre: string; archivo: string; lectura: string };

function borradorVacio(): CasoDraft {
  return {
    placa: "",
    cc: "",
    nombre: "",
    telefono: "",
    empresa: "",
    origen: "",
    direccion: "",
    correo: "",
    marca: "",
    linea: "",
    modelo: "",
    fechaFirma: "",
    contratoNombre: "",
    contratoPdf: "",
    firmaContrato: false,
  };
}

function aBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      resolve(raw.includes(",") ? raw.split(",")[1] : raw);
    };
    reader.onerror = () => reject(new Error("No pude abrir el PDF"));
    reader.readAsDataURL(file);
  });
}

function SubirContrato({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }) {
  return (
    <label className="grid cursor-pointer gap-1 rounded-2xl border border-dashed border-navy/30 bg-paper px-3 py-3 text-sm">
      <span className="font-semibold">{busy ? "Leyendo el contrato…" : "Subir contrato firmado"}</span>
      <span className="text-ink-soft">Se llenan placa, propietario, cédula, celular, dirección y el carro.</span>
      <input
        type="file"
        accept="application/pdf,.pdf"
        disabled={busy}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

function DatosContrato({
  direccion,
  correo,
  marca,
  linea,
  modelo,
  fechaFirma,
  onChange,
}: {
  direccion?: string;
  correo?: string;
  marca?: string;
  linea?: string;
  modelo?: string;
  fechaFirma?: string;
  onChange: (patch: Partial<CasoDraft>) => void;
}) {
  if (!direccion && !correo && !marca && !linea && !modelo && !fechaFirma) return null;
  return (
    <div className="grid gap-3 rounded-2xl bg-paper p-3">
      <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Del contrato</p>
      <Field label="Dirección" optional value={direccion ?? ""} onChange={(v) => onChange({ direccion: v })} />
      <Field label="Correo" optional value={correo ?? ""} onChange={(v) => onChange({ correo: v })} />
      <Field label="Marca" optional value={marca ?? ""} onChange={(v) => onChange({ marca: v })} />
      <Field label="Línea" optional value={linea ?? ""} onChange={(v) => onChange({ linea: v })} />
      <Field label="Modelo" optional value={modelo ?? ""} onChange={(v) => onChange({ modelo: v })} />
      <label className="text-sm font-medium">
        Fecha de firma
        <input
          type="date"
          value={fechaFirma ?? ""}
          onChange={(e) => onChange({ fechaFirma: e.target.value })}
          className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
        />
      </label>
    </div>
  );
}

function AsesorSelect({ value, onChange }: { value: string; onChange: (slug: string) => void }) {
  return (
    <label className="text-sm font-medium">
      Asesor
      <select
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
      >
        {ASESORES.map((p) => (
          <option key={p.slug} value={p.slug}>
            {nombreLista(p)}
          </option>
        ))}
      </select>
    </label>
  );
}

function OtrosPropietarios({ valor, onChange }: { valor: string; onChange: (valor: string) => void }) {
  const [otros, setOtros] = useState<{ nombre: string; cc: string; correo: string }[]>(() => {
    try {
      const data = JSON.parse(valor) as { nombre?: string; cc?: string; correo?: string }[];
      if (!Array.isArray(data)) return [];
      return data.map((parte) => ({ nombre: parte.nombre ?? "", cc: parte.cc ?? "", correo: parte.correo ?? "" }));
    } catch {
      return [];
    }
  });
  function actualizar(next: { nombre: string; cc: string; correo: string }[]) {
    setOtros(next);
    const llenos = next.filter((parte) => parte.nombre.trim() || parte.cc.trim() || parte.correo.trim());
    onChange(llenos.length ? JSON.stringify(llenos) : "");
  }
  return (
    <div className="grid gap-2">
      {otros.map((parte, indice) => (
        <div key={indice} className="grid gap-2 rounded-2xl border border-line p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Propietario {indice + 2}</p>
            <button type="button" className="text-sm font-semibold text-danger" onClick={() => actualizar(otros.filter((_, i) => i !== indice))}>
              Quitar
            </button>
          </div>
          <Field label="Nombre" value={parte.nombre} onChange={(nombre) => actualizar(otros.map((item, i) => (i === indice ? { ...item, nombre } : item)))} />
          <Field label="Cédula" value={parte.cc} onChange={(cc) => actualizar(otros.map((item, i) => (i === indice ? { ...item, cc } : item)))} />
          <Field label="Correo" optional value={parte.correo} onChange={(correo) => actualizar(otros.map((item, i) => (i === indice ? { ...item, correo } : item)))} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => actualizar([...otros, { nombre: "", cc: "", correo: "" }])}
        className="h-11 rounded-2xl border border-line text-sm font-semibold"
      >
        Agregar otro propietario
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  optional,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        required={!optional}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11 w-full rounded-2xl border border-line px-3"
      />
    </label>
  );
}
