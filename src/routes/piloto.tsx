import { useEffect, useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { BloquePiloto, ConfigPiloto } from "@/components/piloto";
import { ChatCaso } from "@/components/chat-caso";
import { getMe, listCasos, type Me } from "@/lib/casos.functions";
import type { Caso } from "@/lib/casos";
import { etiquetaOpTarjeta, etiquetaVia } from "@/lib/piloto";
import { estadoPiloto, tableroPiloto, type FilaMano } from "@/lib/piloto.functions";
import { configura, esBandeja, etiquetaRol, veElEquipo } from "@/lib/team.public";

export const Route = createFileRoute("/piloto")({
  component: VistaPiloto,
});

const PASOS = [
  {
    n: "1",
    titulo: "Asesor",
    texto: "Abre el proceso y deja los papeles listos.",
    puntos: ["Sube un PDF con todo, o uno por documento", "Pasa el carro a Vía Seguros"],
  },
  {
    n: "2",
    titulo: "Vía Seguros",
    texto: "Compra de la póliza. No ve el resto de los procesos.",
    puntos: ["Pega el enlace de pago", "Revisa la captura", "Marca pago recibido o que no coincide", "Pide la carta y el contrato"],
  },
  {
    n: "3",
    titulo: "Operativa",
    texto: "Imprime solo los documentos que se le habilitaron.",
    puntos: ["Pólizas cargadas en su sistema", "Paquete impreso", "Tarjeta: pagada, en VUS, en movilidad, radicada, expedida o entregada", "Devuelve el proceso al asesor"],
  },
  {
    n: "4",
    titulo: "Otra vez el asesor",
    texto: "Recibe el carro y avisa el cierre.",
    puntos: ["Ve lo que operativa pidió", "Avisa a servicio al cliente"],
  },
  {
    n: "5",
    titulo: "Servicio al cliente",
    texto: "El proceso ya está completado para ellos.",
    puntos: ["Escribe los consecutivos de los bonos", "Marca los beneficios entregados"],
  },
];

function fallo(err: unknown) {
  return err instanceof Error ? err.message : "No se pudo";
}

function VistaPiloto() {
  const [listo, setListo] = useState(false);
  const [activo, setActivo] = useState(false);
  const [yo, setYo] = useState<Me | null>(null);
  const [manos, setManos] = useState<{ via: FilaMano[]; operativa: FilaMano[]; servicio: FilaMano[] } | null>(null);
  const [casos, setCasos] = useState<Caso[]>([]);
  const [abierto, setAbierto] = useState<Caso | null>(null);
  const [error, setError] = useState("");

  async function cargar(me: Me) {
    const estado = await estadoPiloto().catch(() => null);
    if (estado) setActivo(estado.activo);
    const rows = await listCasos();
    setCasos(rows);
    setAbierto((actual) => (actual ? rows.find((c) => c.id === actual.id) ?? actual : null));
    if (veElEquipo(me.role)) setManos(await tableroPiloto().catch(() => null));
  }

  useEffect(() => {
    let vivo = true;
    getMe()
      .then(async (me) => {
        if (!vivo) return;
        if (!me) return;
        setYo(me);
        await cargar(me);
      })
      .catch(() => {})
      .finally(() => {
        if (vivo) setListo(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  function abrir(id: number) {
    const caso = casos.find((c) => c.id === id);
    if (caso) setAbierto(caso);
  }

  const equipo = yo ? veElEquipo(yo.role) : false;
  const bandeja = yo ? esBandeja(yo.role) : false;
  if (bandeja) return <Navigate to="/" />;

  return (
    <main className="min-h-screen bg-[#071018] text-paper">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 lg:px-10">
        <img src="/taxis-libres-blanco.png" alt="Taxis Libres" className="h-12 w-auto" />
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-paper/60 sm:inline">Sistema de áreas. No es el programa de trabajo.</span>
          {yo && !bandeja ? (
            <Link to="/" className="rounded-full border border-white/20 px-4 py-2 font-semibold">
              Ir al programa
            </Link>
          ) : null}
          {!yo && listo ? (
            <a href="/login?next=/piloto" className="rounded-full bg-lime px-4 py-2 font-semibold text-ink">
              Entrar
            </a>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10 lg:px-10">
        <p className="text-sm font-semibold text-lime">Vinculación conectada</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-semibold leading-tight">Un carro pasa de mano en mano. Cada área ve solo lo suyo.</h1>
        <p className="mt-4 max-w-2xl text-paper/70">
          El asesor no marca un chulito y ya. El proceso llega a Vía Seguros, después a operativa y al final a servicio al cliente. El trabajo de cada día sigue en el programa.
        </p>

        <ol className="mt-10 grid gap-3 lg:grid-cols-5">
          {PASOS.map((paso) => (
            <li key={paso.n} className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-lime">{paso.n}</p>
              <h2 className="mt-2 text-lg font-semibold">{paso.titulo}</h2>
              <p className="mt-2 text-sm text-paper/70">{paso.texto}</p>
              <ul className="mt-3 grid gap-1 text-sm text-paper/80">
                {paso.puntos.map((punto) => (
                  <li key={punto}>{punto}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <section className="mt-10 grid gap-3 sm:grid-cols-3">
          <Nota titulo="Documentos" texto="Operativa imprime el paquete con lo que se le dejó ver. El comprobante de pago lo ve Vía Seguros, no todo el mundo." />
          <Nota titulo="Carta" texto="Sale con el contrato, con la placa, el propietario y la empresa de ese proceso. La misma firma vale para los dos." />
          <Nota titulo="Devolución" texto="Queda anotada y en desarrollo. No mueve plata ni cierra el proceso." />
        </section>

        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl font-semibold">En este momento</h2>
            {yo ? <p className="text-sm text-paper/60">{activo ? "El piloto está prendido." : "El piloto está apagado. Nada se mueve de área."}</p> : null}
          </div>
          {!listo ? <p className="mt-4 text-paper/60">Cargando…</p> : null}
          {listo && !yo ? (
            <p className="mt-4 max-w-xl text-paper/70">Desde afuera no se ven placas ni propietarios. Entra para trabajar los procesos.</p>
          ) : null}
          {equipo && manos ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <Columna titulo="Vía Seguros" filas={manos.via} detalle={(fila) => etiquetaVia(fila.viaEstado)} onAbrir={abrir} />
              <Columna titulo="Operativa" filas={manos.operativa} detalle={(fila) => etiquetaOpTarjeta(fila.opTarjeta) || "Sin marca de tarjeta"} onAbrir={abrir} />
              <Columna titulo="Servicio al cliente" filas={manos.servicio} detalle={(fila) => fila.bonos || "Sin bono"} onAbrir={abrir} />
            </div>
          ) : null}
        </section>
      </div>

      {yo ? (
        <section className="bg-paper px-5 py-8 text-ink lg:px-10">
          <div className="mx-auto grid max-w-6xl gap-6">
            <div>
              <h2 className="text-xl font-semibold">{etiquetaRol(yo.role)}</h2>
              <p className="mt-1 text-sm text-ink-soft">
                {bandeja
                  ? "Aquí trabajas los procesos que te pasaron. El programa de asesores no es esta pantalla."
                  : "Desde aquí se pasa el proceso de un área a otra. Procesos, metas y bitácora siguen en el programa."}
              </p>
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            {equipo ? <ConfigPiloto edita={configura(yo.role)} onAbrir={abrir} /> : null}
            {!equipo ? (
              <ul className="grid gap-2">
                {casos.map((caso) => (
                  <li key={caso.id}>
                    <button
                      type="button"
                      onClick={() => setAbierto(caso)}
                      className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-left"
                    >
                      <span className="font-semibold">{caso.placa}</span>
                      <span className="text-ink-soft"> · {caso.nombre || "Sin nombre"} · {caso.ownerName.split(" ")[0]}</span>
                    </button>
                  </li>
                ))}
                {casos.length === 0 ? (
                  <li className="text-sm text-ink-soft">
                    {bandeja ? "Cuando te pasen un proceso, aparece aquí." : "No tienes procesos abiertos."}
                  </li>
                ) : null}
              </ul>
            ) : null}
            {abierto ? (
              <div className="grid gap-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">{abierto.placa}</h3>
                  <button type="button" onClick={() => setAbierto(null)} className="h-10 rounded-2xl border border-line px-3 text-sm">
                    Cerrar
                  </button>
                </div>
                <ChatCaso casoId={abierto.id} duenoId={abierto.ownerId} yo={yo.id} delEquipo={equipo || bandeja} onCambio={() => {}} />
                <BloquePiloto
                  caso={abierto}
                  rol={yo.role}
                  miSlug={yo.slug}
                  activo={activo}
                  onCaso={(patch) => setAbierto((actual) => (actual ? { ...actual, ...patch } : actual))}
                  onListo={() => {
                    void cargar(yo).catch((err) => setError(fallo(err)));
                  }}
                  onError={setError}
                />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Nota({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-3xl border border-white/10 p-4">
      <p className="font-semibold">{titulo}</p>
      <p className="mt-2 text-sm text-paper/70">{texto}</p>
    </div>
  );
}

function Columna({
  titulo,
  filas,
  detalle,
  onAbrir,
}: {
  titulo: string;
  filas: FilaMano[];
  detalle: (fila: FilaMano) => string;
  onAbrir: (id: number) => void;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm text-paper/60">{titulo}</p>
      <p className="mt-1 text-3xl font-semibold">{filas.length}</p>
      <ul className="mt-3 grid gap-2">
        {filas.map((fila) => (
          <li key={fila.id}>
            <button type="button" onClick={() => onAbrir(fila.id)} className="w-full text-left text-sm">
              <span className="font-semibold">{fila.placa}</span>
              <span className="text-paper/60"> · {fila.nombre || "Sin nombre"} · {fila.ownerName.split(" ")[0]}</span>
              <span className="block text-paper/50">
                {detalle(fila)}
                {fila.asignado ? ` · lo tiene ${fila.asignado}` : ""}
              </span>
            </button>
          </li>
        ))}
        {filas.length === 0 ? <li className="text-sm text-paper/50">Nadie en esta mano.</li> : null}
      </ul>
    </div>
  );
}
