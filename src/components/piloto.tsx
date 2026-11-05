import { useEffect, useState, type FormEvent } from "react";
import type { Caso } from "@/lib/casos";
import { ENTREGA, entregaIds } from "@/lib/casos";
import {
  DOCS_PILOTO,
  MARCAS_OP,
  MARCAS_SERVICIO,
  MARCAS_VIA,
  etiquetaDoc,
  etiquetaMano,
  etiquetaMarca,
  etiquetaOpTarjeta,
  etiquetaVia,
  marcasDe,
} from "@/lib/piloto";
import type { LecturaDoc } from "@/lib/ocr";
import {
  bajarPaquete,
  borrarDocumento,
  crearUsuarioBandeja,
  estadoPiloto,
  guardarPiloto,
  lineaDelProceso,
  listarDocumentos,
  leerDocumento,
  marcarArea,
  marcarEntrega,
  marcarServicio,
  marcarVia,
  ocultarDocumento,
  parteCarga,
  parteDocumento,
  pasarMano,
  quitarUsuarioBandeja,
  recibirTrozo,
  tableroPiloto,
  tomarProceso,
  guardarDevolucion,
  type DocItem,
  type FilaMano,
  type PilotoEstado,
} from "@/lib/piloto.functions";
import { configura, esBandeja, etiquetaRol, llevaProcesos, type Role } from "@/lib/team.public";
import { enviarEnTrozos, prepararArchivo, traerPorTrozos, TOPE_ENVIO } from "@/lib/archivo";

function fallo(err: unknown) {
  return err instanceof Error ? err.message : "No se pudo guardar";
}

async function traerDocumento(id: number) {
  const primero = await parteDocumento({ data: { id, desde: 0 } });
  const archivo = await traerPorTrozos(primero.total, async (desde) => {
    if (desde === 0) return primero.datos;
    const parte = await parteDocumento({ data: { id, desde } });
    return parte.datos;
  });
  return { nombre: primero.nombre, archivo };
}

function whatsApp(telefono: string, texto: string) {
  const digits = telefono.replace(/\D/g, "");
  const n = digits.startsWith("57") ? digits : `57${digits}`;
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

function bytesDe(archivo: string) {
  const bin = atob(archivo);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function textoBase64(bytes: Uint8Array) {
  let texto = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(texto);
}

function esPdf(nombre: string, bytes: Uint8Array) {
  return nombre.toLowerCase().endsWith(".pdf") || (bytes[0] === 0x25 && bytes[1] === 0x50);
}

function esFoto(nombre: string, bytes: Uint8Array) {
  const n = nombre.toLowerCase();
  return /\.(jpe?g|png|webp|gif)$/.test(n) || bytes[0] === 0xff || bytes[0] === 0x89;
}

async function girarArchivo(nombre: string, archivo: string) {
  const bytes = bytesDe(archivo);
  if (esPdf(nombre, bytes)) {
    const { PDFDocument, degrees } = await import("pdf-lib");
    const pdf = await PDFDocument.load(bytes);
    for (const page of pdf.getPages()) page.setRotation(degrees((page.getRotation().angle + 90) % 360));
    return textoBase64(await pdf.save());
  }
  if (!esFoto(nombre, bytes)) throw new Error("Solo se giran fotos y PDF");
  const mime = nombre.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("No pude abrir la foto"));
    img.src = `data:${mime};base64,${archivo}`;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.height;
  canvas.height = img.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No pude girar la foto");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  const data = canvas.toDataURL(mime, 0.92);
  return data.split(",")[1] || "";
}

function bajar(nombre: string, archivo: string) {
  const bytes = Uint8Array.from(atob(archivo), (c) => c.charCodeAt(0));
  const tipo = nombre.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export function ConfigPiloto({ edita, onAbrir }: { edita: boolean; onAbrir?: (id: number) => void }) {
  const [estado, setEstado] = useState<PilotoEstado | null>(null);
  const [docs, setDocs] = useState<string[]>([]);
  const [activo, setActivo] = useState(false);
  const [aviso, setAviso] = useState("");
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [rol, setRol] = useState<Role>("via_seguros");
  const [manos, setManos] = useState<{ via: FilaMano[]; operativa: FilaMano[]; servicio: FilaMano[] } | null>(null);

  async function cargar() {
    const row = await estadoPiloto();
    setEstado(row);
    setDocs(row.docs);
    setActivo(row.activo);
    setManos(await tableroPiloto());
  }

  useEffect(() => {
    cargar().catch((err) => setAviso(fallo(err)));
  }, []);

  async function guardar() {
    setAviso("");
    try {
      await guardarPiloto({ data: { activo, docs } });
      setAviso(activo ? "Piloto prendido." : "Piloto apagado. Las otras áreas no ven procesos.");
      await cargar();
    } catch (err) {
      setAviso(fallo(err));
    }
  }

  async function quitar(slug: string, nombrePersona: string) {
    if (!window.confirm(`¿Quitar el acceso de ${nombrePersona}? No borra procesos. Solo deja de poder entrar.`)) return;
    setAviso("");
    try {
      await quitarUsuarioBandeja({ data: slug });
      setAviso(`Quité el acceso de ${nombrePersona}.`);
      await cargar();
    } catch (err) {
      setAviso(fallo(err));
    }
  }

  async function crear(event: FormEvent) {
    event.preventDefault();
    setAviso("");
    try {
      await crearUsuarioBandeja({ data: { nombre, usuario, clave, rol } });
      setNombre("");
      setUsuario("");
      setClave("");
      setAviso("Usuario creado. Entra con ese usuario y esa clave.");
      await cargar();
    } catch (err) {
      setAviso(fallo(err));
    }
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-card border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">Plan piloto</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Apagado, el programa sigue como está. Prendido, un proceso se pasa de verdad a Vía Seguros, después a operativa y al final a servicio al cliente. La vista para mostrar, aparte del programa, está en /piloto.
        </p>
        <a href="/piloto" className="mt-3 inline-flex h-11 items-center rounded-2xl border border-line px-4 text-sm font-semibold">
          Abrir la vista para mostrar
        </a>
        {edita ? (
          <>
            <button
              type="button"
              onClick={() => setActivo((v) => !v)}
              className={"mt-3 h-11 rounded-2xl px-4 text-sm font-semibold " + (activo ? "bg-lime text-ink" : "border border-line")}
            >
              {activo ? "Piloto prendido" : "Piloto apagado"}
            </button>
            <p className="mt-4 text-sm font-medium">Qué documentos ve operativa</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {DOCS_PILOTO.filter((d) => d.id !== "comprobante").map((doc) => (
                <label key={doc.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={docs.includes(doc.id)}
                    onChange={() => setDocs((lista) => (lista.includes(doc.id) ? lista.filter((id) => id !== doc.id) : [...lista, doc.id]))}
                  />
                  {doc.label}
                </label>
              ))}
            </div>
            <button type="button" onClick={() => void guardar()} className="mt-4 h-11 rounded-2xl bg-navy px-4 text-sm font-semibold text-paper">
              Guardar piloto
            </button>
          </>
        ) : (
          <p className="mt-3 text-sm">{estado?.activo ? "David lo tiene prendido." : "David todavía no lo prende."}</p>
        )}
        {aviso ? <p className="mt-3 text-sm text-ink-soft">{aviso}</p> : null}
      </section>
      <section className="grid gap-3 lg:grid-cols-3">
        <Cola titulo="Vía Seguros" filas={manos?.via ?? []} detalle={(fila) => etiquetaVia(fila.viaEstado)} onAbrir={onAbrir} />
        <Cola titulo="Operativa" filas={manos?.operativa ?? []} detalle={(fila) => etiquetaOpTarjeta(fila.opTarjeta) || "Sin marca de tarjeta"} onAbrir={onAbrir} />
        <Cola titulo="Servicio al cliente" filas={manos?.servicio ?? []} detalle={(fila) => fila.bonos || "Sin bono"} onAbrir={onAbrir} />
      </section>
      {edita ? (
        <section className="rounded-card border border-line bg-card p-4">
          <h2 className="font-semibold">Usuarios de las otras áreas</h2>
          <p className="mt-1 text-sm text-ink-soft">No salen en el equipo de asesores y no tienen horario.</p>
          <form onSubmit={(event) => void crear(event)} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className="h-11 rounded-2xl border border-line px-3" />
            <input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Usuario, sin espacios" className="h-11 rounded-2xl border border-line px-3" />
            <input value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Clave, mínimo 8" className="h-11 rounded-2xl border border-line px-3" />
            <select value={rol} onChange={(e) => setRol(e.target.value as Role)} className="h-11 rounded-2xl border border-line px-3">
              <option value="via_seguros">Vía Seguros</option>
              <option value="operativa">Operativa</option>
              <option value="servicio">Servicio al cliente</option>
            </select>
            <button className="h-11 rounded-2xl bg-lime font-semibold text-ink sm:col-span-2">Crear usuario</button>
          </form>
          <ul className="mt-4 grid gap-2">
            {(estado?.usuarios ?? []).map((persona) => (
              <li key={persona.slug} className="rounded-2xl border border-line px-3 py-2 text-sm">
                <span className="font-semibold">{persona.name}</span>
                <span className="text-ink-soft"> · {etiquetaRol(persona.role)} · {persona.slug}</span>
                {persona.clave ? <span className="block text-ink-soft">Clave: {persona.clave}</span> : null}
                <button
                  type="button"
                  className="mt-1 mr-2 h-8 rounded-xl border border-line px-2 text-xs"
                  onClick={() => void navigator.clipboard.writeText(`Usuario: ${persona.slug}\nClave: ${persona.clave}`)}
                >
                  Copiar credenciales
                </button>
                <button
                  type="button"
                  className="mt-1 h-8 rounded-xl px-2 text-xs text-danger"
                  onClick={() => void quitar(persona.slug, persona.name)}
                >
                  Quitar acceso
                </button>
              </li>
            ))}
            {estado && estado.usuarios.length === 0 ? <li className="text-sm text-ink-soft">Todavía no hay usuarios de esas áreas.</li> : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function BloquePiloto({
  caso,
  rol,
  miSlug,
  activo,
  onCaso,
  onListo,
  onError,
  soloDocs = false,
  soloTipos,
}: {
  caso: Caso;
  rol: string;
  miSlug: string;
  activo: boolean;
  onCaso: (patch: Partial<Caso>) => void;
  onListo: () => void;
  onError: (msg: string) => void;
  soloDocs?: boolean;
  soloTipos?: string[];
}) {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [tipo, setTipo] = useState("cedula");
  const [modo, setModo] = useState<"paquete" | "uno">("paquete");
  const [enlace, setEnlace] = useState(caso.viaEnlace);
  const [nota, setNota] = useState("");
  const [bonos, setBonos] = useState(caso.bonos);
  const [notaServicio, setNotaServicio] = useState(caso.servicioNota);
  const [beneficios, setBeneficios] = useState(caso.beneficios.split(",").filter(Boolean));
  const [devolucion, setDevolucion] = useState(caso.devolucion);
  const [marcas, setMarcas] = useState<string[]>(marcasDe(caso.areaMarcas));
  const [entrega, setEntrega] = useState(caso.entrega || "");
  const [copiado, setCopiado] = useState(false);
  const [linea, setLinea] = useState<{ actor: string; detalle: string; cuando: string }[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [vista, setVista] = useState<{ id: number; nombre: string; archivo: string } | null>(null);
  const [lectura, setLectura] = useState<LecturaDoc | null>(null);
  const tiposSubida = (soloTipos ?? DOCS_PILOTO.map((doc) => doc.id)).filter((id) => id !== "unificado");
  const docsVisibles = soloTipos ? docs.filter((doc) => soloTipos.includes(doc.tipo)) : docs;
  const lider = configura(rol);
  const asesor = llevaProcesos(rol);
  const sube = lider || (asesor && !esBandeja(rol));

  async function cargar() {
    const [archivos, pasos] = await Promise.all([listarDocumentos({ data: caso.id }), lineaDelProceso({ data: caso.id })]);
    setDocs(archivos);
    setLinea(pasos);
  }

  useEffect(() => {
    if (!activo && !soloDocs) return;
    cargar().catch((err) => onError(fallo(err)));
  }, [caso.id, activo, soloDocs]);

  useEffect(() => {
    setMarcas(marcasDe(caso.areaMarcas));
    setEntrega(caso.entrega || "");
  }, [caso.id, caso.areaMarcas, caso.entrega]);

  if (!activo && !soloDocs) return null;

  async function correr(trabajo: () => Promise<void>) {
    setOcupado(true);
    try {
      await trabajo();
      await cargar();
      onListo();
    } catch (err) {
      onError(fallo(err));
    } finally {
      setOcupado(false);
    }
  }

  async function tocar(marca: string, on: boolean) {
    await correr(async () => {
      const listo = await marcarArea({ data: { id: caso.id, marca, on } });
      setMarcas(marcasDe(listo.marcas));
      const patch: Partial<Caso> = { areaMarcas: listo.marcas };
      if (marca === "pago_recibido" && on) {
        patch.viaEstado = "recibido";
        patch.polizasSubidas = true;
      }
      if (marca === "polizas_a_david" && on) {
        patch.polizasSubidas = true;
        if (!caso.polizaFase || caso.polizaFase === "espera") patch.polizaFase = "recibida";
      }
      onCaso(patch);
    });
  }

  async function tocarEntrega(marca: string, on: boolean) {
    await correr(async () => {
      const listo = await marcarEntrega({ data: { id: caso.id, marca, on } });
      setEntrega(listo.entrega);
      onCaso({ entrega: listo.entrega });
    });
  }

  async function subir(file: File) {
    if (file.size > 30 * 1024 * 1024) {
      onError("El archivo pesa más de 30 MB");
      return;
    }
    const elegido =
      soloTipos && !soloTipos.includes("unificado")
        ? tiposSubida.includes(tipo) ? tipo : tiposSubida[0] || "autorizacion"
        : modo === "paquete"
          ? "unificado"
          : tipo === "unificado"
            ? "cedula"
            : tipo;
    await correr(async () => {
      const listo = await prepararArchivo(file);
      const actual = {
        placa: caso.placa,
        cc: caso.cc,
        nombre: caso.nombre,
        telefono: caso.telefono,
        direccion: caso.direccion,
        correo: caso.correo,
        marca: caso.marca,
        linea: caso.linea,
        modelo: caso.modelo,
        empresa: caso.empresa,
      };
      let leida: LecturaDoc | null = null;
      if (listo.archivo.length <= TOPE_ENVIO) {
        try {
          leida = await leerDocumento({ data: { tipo: elegido, nombre: listo.nombre, archivo: listo.archivo, actual } });
        } catch {
          leida = null;
        }
      }
      const cargaId = crypto.randomUUID();
      await enviarEnTrozos(listo.archivo, async (orden, datos, fin) => {
        await recibirTrozo({
          data: {
            cargaId,
            orden,
            datos,
            fin,
            casoId: caso.id,
            tipo: elegido,
            nombre: listo.nombre,
            lectura: leida ? JSON.stringify(leida) : "",
          },
        });
      });
      if (elegido === "comprobante" && caso.mano === "via") onCaso({ viaEstado: "comprobante" });
      if (elegido !== "comprobante") onCaso({ documentos: true });
      setLectura(leida);
      await cargar();
    });
  }

  async function abrir(doc: DocItem) {
    const file = await traerDocumento(doc.id);
    setVista({ id: doc.id, nombre: file.nombre, archivo: file.archivo });
  }

  async function girar(id: number, tipoDoc: string, nombre: string, archivo: string) {
    const nuevo = await girarArchivo(nombre, archivo);
    const cargaId = crypto.randomUUID();
    await enviarEnTrozos(nuevo, async (orden, datos, fin) => {
      await recibirTrozo({
        data: { cargaId, orden, datos, fin, casoId: caso.id, tipo: tipoDoc, nombre, reemplazaId: id },
      });
    });
    setVista({ id, nombre, archivo: nuevo });
    await cargar();
  }

  async function quitar(id: number) {
    await borrarDocumento({ data: id });
    setVista(null);
    await cargar();
  }

  async function cambiar(id: number, file: File) {
    if (file.size > 30 * 1024 * 1024) {
      onError("El archivo pesa más de 30 MB");
      return;
    }
    const listo = await prepararArchivo(file);
    const cargaId = crypto.randomUUID();
    await enviarEnTrozos(listo.archivo, async (orden, datos, fin) => {
      await recibirTrozo({
        data: { cargaId, orden, datos, fin, casoId: caso.id, tipo, nombre: listo.nombre, reemplazaId: id },
      });
    });
    setVista(null);
    await cargar();
  }

  const ocultos = new Set(caso.docsOcultos.split(",").filter(Boolean));
  const enVia = caso.mano === "via";
  const enOperativa = caso.mano === "operativa";
  const enServicio = caso.mano === "servicio";
  const esOp = rol === "operativa";
  const esVia = rol === "via_seguros";
  const esServicioRol = rol === "servicio";
  const veAccionVia = esVia || (lider && enVia);

  return (
    <section className="grid gap-3 rounded-2xl border border-line bg-paper p-3 lg:col-span-2">
      {!soloDocs ? (
      <>
      <div className="rounded-2xl border border-line bg-card p-3 text-sm">
        <p className="font-semibold">{caso.placa} · {caso.nombre || "Sin propietario"}</p>
        <p className="mt-1 text-ink-soft">
          {[caso.cc && `CC ${caso.cc}`, caso.telefono, caso.empresa].filter(Boolean).join(" · ")}
        </p>
        <p className="text-ink-soft">{[caso.marca, caso.linea, caso.modelo].filter(Boolean).join(" ") || "Sin datos del carro"}</p>
        {caso.direccion ? <p className="text-ink-soft">{caso.direccion}</p> : null}
        <p className="mt-1">Asesor: {caso.ownerName}</p>
        {caso.manoAsignado ? <p>Lo tiene: {caso.manoAsignado}</p> : null}
      </div>
      {caso.opPedido ? <p className="text-sm text-danger">Operativa pide: {caso.opPedido}</p> : null}
      {caso.bonos || caso.servicioNota ? (
        <p className="text-sm">
          {caso.bonos ? `Bonos: ${caso.bonos}. ` : ""}
          {caso.servicioNota}
        </p>
      ) : null}
      {caso.devolucion ? <p className="text-sm text-ink-soft">Devolución, en desarrollo: {caso.devolucion}</p> : null}
      {esOp ? null : (
      <div>
        <p className="text-sm font-semibold">Manos del proceso</p>
        <p className="mt-1 text-sm text-ink-soft">
          Ahora: {etiquetaMano(caso.mano)}
          {caso.viaEstado ? ` · ${etiquetaVia(caso.viaEstado)}` : ""}
        </p>
        {caso.mano && (esBandeja(rol) || lider) ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() =>
              void correr(async () => {
                const mio = caso.manoAsignado === miSlug;
                const listo = await tomarProceso({ data: { id: caso.id, soltar: mio } });
                onCaso({ manoAsignado: listo.asignado });
              })
            }
            className="mt-2 h-10 rounded-2xl border border-line bg-card px-3 text-sm font-semibold"
          >
            {caso.manoAsignado === miSlug ? "Soltar" : "Tomar este proceso"}
          </button>
        ) : null}
        {linea.length > 0 ? (
          <ol className="mt-2 grid gap-1">
            {linea.map((paso, i) => (
              <li key={`${paso.cuando}-${i}`} className="text-sm text-ink-soft">
                <span className="font-medium text-ink">{paso.cuando}</span> {paso.actor}: {paso.detalle}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      )}
      </>
      ) : null}

      {soloDocs || sube || esOp || docs.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Documentos</p>
          {(rol === "operativa" || lider || (asesor && !esBandeja(rol))) && docs.length > 0 ? (
            <button
              type="button"
              disabled={ocupado}
              onClick={() =>
                void correr(async () => {
                  const file = await bajarPaquete({ data: caso.id });
                  const archivo = file.archivo || (file.cargaId
                    ? await traerPorTrozos(file.total, async (desde) => (await parteCarga({ data: { cargaId: file.cargaId, desde } })).datos)
                    : "");
                  bajar(file.nombre, archivo);
                })
              }
              className="h-10 w-fit rounded-2xl border border-line bg-card px-3 text-sm font-semibold disabled:opacity-60"
            >
              Bajar paquete para imprimir
            </button>
          ) : null}
          {sube ? (
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-2">
                {!soloTipos || soloTipos.includes("unificado") ? (
                <button type="button" onClick={() => setModo("paquete")} className={`h-10 rounded-2xl px-3 text-sm font-semibold ${modo === "paquete" ? "bg-navy text-paper" : "border border-line bg-card"}`}>
                  Paquete completo
                </button>
                ) : null}
                <button type="button" onClick={() => setModo("uno")} className={`h-10 rounded-2xl px-3 text-sm font-semibold ${modo === "uno" || (soloTipos && !soloTipos.includes("unificado")) ? "bg-navy text-paper" : "border border-line bg-card"}`}>
                  Uno por uno
                </button>
              </div>
              <p className="text-sm text-ink-soft">
                {modo === "paquete"
                  ? "Un solo archivo con todos los documentos. Foto o PDF, hasta 30 MB."
                  : "Elige cuál es y súbelo. Puedes repetir con el siguiente. Foto o PDF, hasta 30 MB."}
              </p>
              <div className="flex flex-wrap gap-2">
                {modo === "uno" ? (
                  <select value={tipo === "unificado" ? "cedula" : tipo} onChange={(e) => setTipo(e.target.value)} className="h-11 rounded-2xl border border-line bg-card px-3 text-sm">
                    {DOCS_PILOTO.filter((doc) => doc.id !== "unificado" && tiposSubida.includes(doc.id)).map((doc) => (
                      <option key={doc.id} value={doc.id}>{doc.label}</option>
                    ))}
                  </select>
                ) : null}
                <label className="inline-flex h-11 cursor-pointer items-center rounded-2xl bg-navy px-4 text-sm font-semibold text-paper">
                  {modo === "paquete" ? "Subir paquete" : "Subir este"}
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    multiple={modo === "uno"}
                    className="sr-only"
                    onChange={(e) => {
                      const files = [...(e.target.files ?? [])];
                      e.target.value = "";
                      for (const file of files) void subir(file);
                    }}
                  />
                </label>
              </div>
            </div>
          ) : null}
          {lectura ? (
            <div className={`grid gap-2 rounded-2xl border p-3 ${lectura.vigencia === "vencido" ? "border-danger" : "border-line"}`}>
              <p className={`text-sm font-semibold ${lectura.vigencia === "vencido" ? "text-danger" : ""}`}>{lectura.aviso}</p>
              {lectura.campos.length > 0 ? (
                <>
                  <p className="text-xs text-ink-soft">V usa lo del documento. X deja lo que ya está en el proceso.</p>
                  {lectura.campos.map((campo) => (
                    <div key={campo.key} className="grid gap-1 rounded-xl bg-card px-3 py-2 text-sm">
                      <p className="font-semibold">{campo.label}</p>
                      <p className="text-ink-soft">En el proceso: {campo.actual || "vacío"}</p>
                      <p>En el documento: {campo.leido}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="h-9 rounded-xl bg-navy px-3 font-semibold text-paper"
                            onClick={() => {
                              onCaso({ [campo.key]: campo.leido } as Partial<Caso>);
                              setLectura((actual) => actual ? { ...actual, campos: actual.campos.filter((item) => item.key !== campo.key) } : actual);
                            }}
                        >
                          V
                        </button>
                        <button
                          type="button"
                          className="h-9 rounded-xl border border-line px-3 font-semibold"
                          onClick={() => setLectura((actual) => actual ? { ...actual, campos: actual.campos.filter((item) => item.key !== campo.key) } : actual)}
                        >
                          X
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
              <button type="button" className="h-9 w-fit text-sm text-ink-soft" onClick={() => setLectura(null)}>
                Cerrar
              </button>
            </div>
          ) : null}
          <ul className="grid gap-2">
            {docsVisibles.map((doc) => (
              <li key={doc.id} className="grid gap-1 rounded-2xl border border-line bg-card px-3 py-2 text-sm">
                <button type="button" className="text-left font-semibold text-navy" onClick={() => void correr(() => abrir(doc))}>
                  {etiquetaDoc(doc.tipo)} · {doc.nombre}
                </button>
                <span className="text-ink-soft">
                  {doc.cuando}
                  {doc.subidoPor ? ` · ${doc.subidoPor}` : ""}
                  {doc.vigencia === "vencido" ? ` · Vencido ${doc.vence}` : ""}
                  {doc.vigencia === "vigente" ? ` · Vigente hasta ${doc.vence}` : ""}
                </span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="h-9 rounded-xl border border-line px-3" onClick={() => void correr(() => abrir(doc))}>
                    Ver
                  </button>
                  {sube ? (
                    <>
                      <button
                        type="button"
                        className="h-9 rounded-xl border border-line px-3"
                        onClick={() => void correr(async () => {
                          const file = await traerDocumento(doc.id);
                          await girar(doc.id, doc.tipo, file.nombre, file.archivo);
                        })}
                      >
                        Girar
                      </button>
                      <label className="inline-flex h-9 cursor-pointer items-center rounded-xl border border-line px-3">
                        Cambiar
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) void correr(() => cambiar(doc.id, file));
                          }}
                        />
                      </label>
                      <button type="button" className="h-9 rounded-xl px-3 text-danger" onClick={() => void correr(() => quitar(doc.id))}>
                        Borrar
                      </button>
                    </>
                  ) : null}
                </div>
                {sube ? (
                  <label className="text-ink-soft">
                    <input
                      type="checkbox"
                      checked={ocultos.has(doc.tipo)}
                      onChange={(e) =>
                        void correr(async () => {
                          const listo = await ocultarDocumento({ data: { casoId: caso.id, tipo: doc.tipo, oculto: e.target.checked } });
                          onCaso({ docsOcultos: listo.ocultos });
                        })
                      }
                    />{" "}
                    Operativa no lo ve
                  </label>
                ) : null}
              </li>
            ))}
            {docsVisibles.length === 0 ? <li className="text-sm text-ink-soft">Todavía no hay archivos. Sube el paquete completo o cada documento por separado.</li> : null}
          </ul>
          {vista ? (
            <div className="fixed inset-0 z-40 grid place-items-center bg-ink/50 p-4" onClick={() => setVista(null)}>
              <div className="grid max-h-[90vh] w-full max-w-3xl gap-3 overflow-auto rounded-card bg-card p-4" onClick={(e) => e.stopPropagation()}>
                <p className="font-semibold">{vista.nombre}</p>
                {esFoto(vista.nombre, bytesDe(vista.archivo)) ? (
                  <img src={`data:${vista.nombre.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg"};base64,${vista.archivo}`} alt={vista.nombre} className="max-h-[65vh] w-full object-contain" />
                ) : esPdf(vista.nombre, bytesDe(vista.archivo)) ? (
                  <iframe title={vista.nombre} src={`data:application/pdf;base64,${vista.archivo}`} className="h-[65vh] w-full rounded-2xl border border-line bg-white" />
                ) : (
                  <p className="text-sm text-ink-soft">Este archivo se descarga. Aquí no se puede ver.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold" onClick={() => bajar(vista.nombre, vista.archivo)}>
                    Descargar
                  </button>
                  {sube ? (
                    <>
                      <button type="button" className="h-10 rounded-2xl border border-line px-3 text-sm font-semibold" onClick={() => void correr(() => girar(vista.id, docs.find((doc) => doc.id === vista.id)?.tipo || "cedula", vista.nombre, vista.archivo))}>
                        Girar
                      </button>
                      <button type="button" className="h-10 rounded-2xl px-3 text-sm font-semibold text-danger" onClick={() => void correr(() => quitar(vista.id))}>
                        Borrar
                      </button>
                    </>
                  ) : null}
                  <button type="button" className="h-10 rounded-2xl bg-navy px-3 text-sm font-semibold text-paper" onClick={() => setVista(null)}>
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {!soloDocs ? (
      <>
      {(asesor || lider) && !esBandeja(rol) ? (
        <div className="flex flex-wrap gap-2">
          {!caso.mano ? (
            <>
              <button type="button" disabled={ocupado} onClick={() => void correr(async () => { await pasarMano({ data: { id: caso.id, mano: "via", atencion: "virtual" } }); onCaso({ mano: "via", viaAtencion: "virtual", manoAsignado: "", viaSeguros: true, viaEstado: caso.viaEstado || "pedido" }); })} className="h-11 rounded-2xl bg-navy px-4 text-sm font-semibold text-paper disabled:opacity-60">
                Pasar a Vía Seguros, virtual
              </button>
              <button type="button" disabled={ocupado} onClick={() => void correr(async () => { await pasarMano({ data: { id: caso.id, mano: "via", atencion: "presencial" } }); onCaso({ mano: "via", viaAtencion: "presencial", manoAsignado: "", viaSeguros: true, viaEstado: caso.viaEstado || "pedido" }); })} className="h-11 rounded-2xl border border-line bg-card px-4 text-sm font-semibold disabled:opacity-60">
                Pasar a Vía Seguros, presencial
              </button>
            </>
          ) : null}
          {(caso.mano === "" || caso.mano === "via") && (caso.polizasSubidas || caso.viaEstado === "recibido") ? (
            <button type="button" disabled={ocupado} onClick={() => void correr(async () => { await pasarMano({ data: { id: caso.id, mano: "operativa" } }); onCaso({ mano: "operativa", manoAsignado: "", operativa: true, viaSeguros: true }); })} className="h-11 rounded-2xl border border-line bg-card px-4 text-sm font-semibold disabled:opacity-60">
              Pasar a operativa
            </button>
          ) : null}
          {!caso.mano && caso.operativa ? (
            <button type="button" disabled={ocupado} onClick={() => void correr(async () => { await pasarMano({ data: { id: caso.id, mano: "servicio" } }); onCaso({ mano: "servicio", manoAsignado: "" }); })} className="h-11 rounded-2xl border border-line bg-card px-4 text-sm font-semibold disabled:opacity-60">
              Avisar a servicio al cliente
            </button>
          ) : null}
        </div>
      ) : null}

      {enVia && caso.viaEnlace && (asesor || lider) ? (
        <p className="text-sm">
          Enlace de pago:{" "}
          <a href={caso.viaEnlace} target="_blank" rel="noreferrer" className="font-semibold text-navy">{caso.viaEnlace}</a>
          <button
            type="button"
            className="ml-2 text-sm text-navy"
            onClick={() =>
              void navigator.clipboard.writeText(caso.viaEnlace).then(() => {
                setCopiado(true);
                window.setTimeout(() => setCopiado(false), 1500);
              })
            }
          >
            {copiado ? "Copiado" : "Copiar"}
          </button>
          {caso.telefono ? (
            <a
              className="ml-2 text-sm font-semibold text-navy"
              href={whatsApp(caso.telefono, `Hola. Le comparto el enlace para el pago de la póliza: ${caso.viaEnlace}`)}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          ) : null}
        </p>
      ) : null}
      {enVia && sube && caso.viaEstado !== "recibido" ? (
        <p className="text-sm text-ink-soft">Cuando el propietario pague, sube la captura como Comprobante de pago.</p>
      ) : null}
      {enVia && (caso.viaPideCarta || caso.viaPideContrato) ? (
        <p className="text-sm text-danger">
          Vía Seguros pide {caso.viaPideCarta ? "la carta de desvinculación" : ""}{caso.viaPideCarta && caso.viaPideContrato ? " y " : ""}{caso.viaPideContrato ? "el contrato firmado" : ""}.
        </p>
      ) : null}
      {caso.viaNota ? <p className="text-sm text-ink-soft">{caso.viaNota}</p> : null}

      {veAccionVia ? (
        <div className="grid gap-2">
          <p className="text-sm font-semibold">
            {caso.viaAtencion === "presencial" ? "Atención presencial. El pago se recibe en cajas." : "Atención virtual."}
          </p>
          <Marcas items={MARCAS_VIA} activas={marcas} atencion={caso.viaAtencion} disabled={ocupado || !esVia} onToggle={tocar} />
          {esVia && caso.viaAtencion !== "presencial" ? (
            <div className="flex flex-wrap gap-2">
              <input value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="Link de pago, https://…" className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-card px-3" />
              <button type="button" disabled={ocupado} onClick={() => void correr(async () => { await marcarVia({ data: { id: caso.id, accion: "enlace", enlace, nota } }); onCaso({ viaEnlace: enlace, viaEstado: "enlace" }); })} className="h-11 rounded-2xl bg-navy px-3 text-sm font-semibold text-paper">
                Guardar link
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {esOp ? (
        <>
        <Marcas items={MARCAS_OP} activas={marcas} disabled={ocupado} onToggle={tocar} />
        {marcas.includes("tarjeta_recibida") || caso.estadoTarjeta === "Expedida" || caso.tarjetaEntregada ? (
          <>
          <p className="text-sm text-ink-soft">
            {caso.citaFecha ? `Cita de entrega: ${caso.citaFecha}${caso.citaHora ? ` a las ${caso.citaHora}` : ""}.` : "El asesor todavía no pone la cita."}
          </p>
          <EntregaMarcas
            titulo="Entrega de la tarjeta"
            ids={["carta", "tarjeta_nueva", "tarjeton"]}
            entrega={entrega}
            disabled={ocupado}
            onToggle={tocarEntrega}
          />
          </>
        ) : null}
        </>
      ) : null}

      {esServicioRol ? (
        <div className="grid gap-2">
          <EntregaMarcas
            titulo="Bonos de la cita"
            ids={["bono_rodamiento", "bono_app", "bono_distintivos", "bono_equipo", "bono_espia"]}
            entrega={entrega}
            disabled={ocupado}
            onToggle={tocarEntrega}
          />
          <Marcas items={MARCAS_SERVICIO} activas={marcas} disabled={ocupado} onToggle={tocar} />
          <ConsecutivosBonos
            valor={bonos}
            onChange={setBonos}
            disabled={ocupado}
            onGuardar={() => void correr(async () => { await marcarServicio({ data: { id: caso.id, bonos, beneficios, nota: notaServicio } }); onCaso({ bonos }); })}
          />
        </div>
      ) : null}

      {(asesor || lider) && !esBandeja(rol) ? (
        <div className="grid gap-2 text-sm">
          <p className="text-ink-soft">La carta de desvinculación sale con el contrato, con los datos de este proceso, y queda en Documentos cuando la firman.</p>
          <p className="text-ink-soft">Devolución de dineros, en desarrollo. La nota queda guardada y no mueve plata.</p>
          <input value={devolucion} onChange={(e) => setDevolucion(e.target.value)} placeholder="Si piden devolución, anótalo aquí" className="h-11 rounded-2xl border border-line bg-card px-3" />
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void correr(async () => { await guardarDevolucion({ data: { id: caso.id, texto: devolucion } }); onCaso({ devolucion }); })}
            className="h-10 w-fit rounded-2xl border border-line bg-card px-3 text-sm"
          >
            Guardar nota de devolución
          </button>
        </div>
      ) : null}
      </>
      ) : null}
    </section>
  );
}

function Cola({
  titulo,
  filas,
  detalle,
  onAbrir,
}: {
  titulo: string;
  filas: FilaMano[];
  detalle: (fila: FilaMano) => string;
  onAbrir?: (id: number) => void;
}) {
  return (
    <section className="rounded-card border border-line bg-card p-4">
      <p className="text-sm font-semibold">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold">{filas.length}</p>
      <ul className="mt-3 grid gap-2">
        {filas.map((fila) => (
          <li key={fila.id}>
            <button type="button" onClick={() => onAbrir?.(fila.id)} className="w-full text-left text-sm">
              <span className="font-semibold">{fila.placa}</span>
              <span className="text-ink-soft"> · {fila.nombre || "Sin nombre"} · {fila.ownerName.split(" ")[0]}</span>
              <span className="block text-ink-soft">
                {detalle(fila)}
                {fila.asignado ? ` · lo tiene ${fila.asignado}` : " · sin tomar"}
              </span>
            </button>
          </li>
        ))}
        {filas.length === 0 ? <li className="text-sm text-ink-soft">Nadie en esta mano.</li> : null}
      </ul>
    </section>
  );
}

function ConsecutivosBonos({
  valor,
  onChange,
  disabled,
  onGuardar,
}: {
  valor: string;
  onChange: (valor: string) => void;
  disabled: boolean;
  onGuardar: () => void;
}) {
  const ids = ["bono_rodamiento", "bono_app", "bono_distintivos", "bono_equipo", "bono_espia"];
  const mapa: Record<string, string> = {};
  let suelto = "";
  if (valor.includes("=")) {
    for (const parte of valor.split("|")) {
      const corte = parte.indexOf("=");
      if (corte > 0) mapa[parte.slice(0, corte)] = parte.slice(corte + 1);
    }
  } else {
    suelto = valor;
  }
  function poner(id: string, texto: string) {
    const next = { ...mapa, [id]: texto };
    onChange(ids.map((item) => `${item}=${next[item] ?? ""}`).join("|"));
  }
  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold">Consecutivo de cada bono</p>
      {suelto ? <p className="text-sm text-ink-soft">Antes estaba anotado así: {suelto}</p> : null}
      {ids.map((id) => (
        <label key={id} className="text-sm">
          {ENTREGA.find((item) => item.id === id)?.label ?? id}
          <input
            value={mapa[id] ?? ""}
            disabled={disabled}
            onChange={(e) => poner(id, e.target.value.slice(0, 40))}
            placeholder="Número"
            className="mt-1 h-11 w-full rounded-2xl border border-line bg-card px-3"
          />
        </label>
      ))}
      <button type="button" disabled={disabled} onClick={onGuardar} className="h-10 w-fit rounded-2xl bg-navy px-3 text-sm font-semibold text-paper">
        Guardar consecutivos
      </button>
    </div>
  );
}

function EntregaMarcas({
  titulo,
  ids,
  entrega,
  disabled,
  onToggle,
}: {
  titulo: string;
  ids: string[];
  entrega: string;
  disabled: boolean;
  onToggle: (id: string, on: boolean) => void;
}) {
  const activas = new Set(entregaIds(entrega));
  const items = ENTREGA.filter((item) => ids.includes(item.id));
  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold">{titulo}</p>
      {items.map((item) => {
        const on = activas.has(item.id);
        return (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(item.id, !on)}
            className={"flex min-h-11 items-center gap-3 rounded-2xl border px-3 text-left text-sm disabled:opacity-60 " + (on ? "border-navy bg-navy text-paper" : "border-line bg-card")}
          >
            <span className={"grid h-6 w-8 place-items-center rounded-md text-xs font-bold " + (on ? "bg-lime text-navy" : "bg-paper text-ink-soft")}>{on ? "Sí" : "No"}</span>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function Marcas({
  items,
  activas,
  atencion,
  disabled,
  onToggle,
}: {
  items: readonly { id: string; label: string }[];
  activas: string[];
  atencion?: string;
  disabled?: boolean;
  onToggle: (id: string, on: boolean) => void;
}) {
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <label key={item.id} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={activas.includes(item.id)}
            disabled={disabled}
            onChange={(e) => onToggle(item.id, e.target.checked)}
          />
          <span>{etiquetaMarca(item.id, atencion) || item.label}</span>
        </label>
      ))}
    </div>
  );
}
