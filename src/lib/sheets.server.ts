import { getSql } from "@/lib/db";
import { estadoDe, hoyBogota, type StepKey } from "@/lib/casos";
import { esTipoAgenda, type TipoAgenda } from "@/lib/agenda";
import { calendarioDe, fechaDelLogro, finDeMes, META_DESDE, rangoDelCorte, resumenMeta } from "@/lib/meta";
import { BOOLS_PROCESO, claveDe, ETIQUETA, HOJA_AGENDA, HOJA_METAS, HOJA_PROCESOS } from "@/lib/sheets.columns";
import { TEAM_PUBLIC, etiquetaRol, llevaProcesos } from "@/lib/team.public";
import { unificarEmpresa } from "@/lib/empresas";

type Persona = { user_id: string; name: string; slug: string; role: string };
type Fila = Record<string, string>;
type Config = {
  webapp_url: string;
  secret: string;
  spreadsheet_url: string;
  callback_url: string;
  last_error: string;
  last_sync: string;
};

let ocupado = false;
let reenviar = false;

function errorClaro(err: unknown) {
  const msg = err instanceof Error ? err.message : "No pude hablar con Google";
  if (/<html|<!doctype|ppConfig|ServiceLogin/i.test(msg)) {
    return "Google contestó con una página y no con los datos. Vuelve a implementar: Aplicación web, ejecutar como Yo, acceso Cualquier persona. Pega la URL que termina en /exec.";
  }
  if (/aborted|timed out|timeout/i.test(msg)) {
    return "Google se demoró y no alcanzó a actualizar el documento. Pulsa Enviar todo y espera, sin cerrar esta ventana.";
  }
  return msg.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}

const BOOL_A_CAMPO: Record<(typeof BOOLS_PROCESO)[number], StepKey | "completado"> = {
  dijo_si: "dijoSi",
  cedula: "cedula",
  tarjeta_propiedad: "tarjetaPropiedad",
  tarjeta_operacion: "tarjetaOperacion",
  soat: "soat",
  tecnomecanica: "tecnomecanica",
  formulario: "formulario",
  documentos: "documentos",
  firma_carta: "firmaCarta",
  firma_contrato: "firmaContrato",
  plata_poliza: "plataPoliza",
  via_seguros: "viaSeguros",
  polizas_subidas: "polizasSubidas",
  operativa: "operativa",
  tarjeta_entregada: "tarjetaEntregada",
  completado: "completado",
};

function texto(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function plano(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function si(value: unknown) {
  const s = plano(texto(value));
  return s === "si" || s === "true" || s === "1" || s === "yes" || s === "x";
}

function marca(value: unknown) {
  return value === true || value === "t" || value === "true" || value === 1 ? "Sí" : si(value) ? "Sí" : "No";
}

function fecha(value: unknown) {
  const s = texto(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function instante(value: unknown) {
  const s = texto(value);
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

function ahoraIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function dueño(nombre: string, personas: Persona[]) {
  const q = plano(nombre);
  if (!q) return null;
  const coincide = (p: Persona) => plano(p.name) === q || plano(p.slug) === q || plano(p.name).split(" ")[0] === q;
  return personas.find((p) => llevaProcesos(p.role) && coincide(p)) ?? personas.find(coincide) ?? null;
}

function tipoTexto(value: string) {
  if (value === "visita") return "Visita";
  if (value === "llamada") return "Llamada";
  if (value === "escribir") return "Escribir";
  return "Otro";
}

function checksDe(fila: Fila) {
  const c = { estadoTarjeta: tarjetaDe(fila.estado_tarjeta) } as Record<StepKey, boolean> & { estadoTarjeta: string };
  for (const key of BOOLS_PROCESO) c[BOOL_A_CAMPO[key]] = si(fila[key]);
  return c;
}

const ETAPAS = [
  "Nuevo",
  "Dijo sí",
  "Documentos",
  "En firma",
  "En Vía Seguros",
  "Póliza lista",
  "En operativa",
  "Tarjeta radicada",
  "Tarjeta expedida",
  "Entregada",
  "Completado",
] as const;

function poner(fila: Fila, key: string, on: boolean) {
  fila[key] = on ? "Sí" : "No";
}

function alinearEtapa(fila: Fila) {
  const pedido = texto(fila.estado);
  const nivel = ETAPAS.indexOf(pedido as (typeof ETAPAS)[number]);
  if (nivel < 0) return;
  poner(fila, "dijo_si", nivel >= 1);
  poner(fila, "documentos", nivel >= 2);
  if (nivel >= 3) {
    if (!si(fila.firma_carta) && !si(fila.firma_contrato)) poner(fila, "firma_carta", true);
  } else {
    poner(fila, "firma_carta", false);
    poner(fila, "firma_contrato", false);
  }
  poner(fila, "via_seguros", nivel >= 4);
  poner(fila, "polizas_subidas", nivel >= 5);
  poner(fila, "operativa", nivel >= 6);
  if (pedido === "Tarjeta radicada") fila.estado_tarjeta = "Radicada";
  else if (pedido === "Tarjeta expedida") fila.estado_tarjeta = "Expedida";
  else if (nivel < 7) fila.estado_tarjeta = "";
  poner(fila, "tarjeta_entregada", nivel >= 9);
  poner(fila, "completado", nivel >= 10);
}

function boolsIguales(fila: Fila, row: Record<string, unknown>) {
  for (const key of BOOLS_PROCESO) {
    if (si(fila[key]) !== (marca(row[key]) === "Sí")) return false;
  }
  return tarjetaDe(fila.estado_tarjeta) === tarjetaDe(texto(row.estado_tarjeta));
}

function tipoDe(value: string): TipoAgenda {
  const p = plano(value);
  if (p.startsWith("visit")) return "visita";
  if (p.startsWith("llam")) return "llamada";
  if (p.startsWith("escrib")) return "escribir";
  if (esTipoAgenda(p)) return p;
  return "otro";
}

function tarjetaDe(value: string) {
  const p = plano(value);
  if (p === "pendiente") return "Pendiente";
  if (p === "radicada") return "Radicada";
  if (p === "expedida") return "Expedida";
  return "";
}

function filasDe(tabla: unknown): Fila[] {
  if (!Array.isArray(tabla) || tabla.length < 2) return [];
  const headers = (tabla[0] as unknown[]).map((h) => claveDe(texto(h)));
  return (tabla as unknown[][]).slice(1).map((row) => {
    const fila: Fila = {};
    headers.forEach((h, i) => {
      if (h) fila[h] = texto(row?.[i]);
    });
    return fila;
  });
}

function normalizarFila(fila: Fila) {
  const out: Fila = {};
  for (const [clave, valor] of Object.entries(fila)) out[claveDe(clave)] = texto(valor);
  return out;
}

async function config(): Promise<Config | null> {
  const sql = await getSql();
  const rows = await sql.query<Config>(
    `select webapp_url, secret, spreadsheet_url, callback_url, last_error, coalesce(last_sync::text, '') as last_sync from sheets_config where id = 1`,
  );
  const row = rows[0];
  if (!row?.webapp_url || !row.secret) return null;
  return row;
}

async function personas() {
  const sql = await getSql();
  return sql.query<Persona>(`select user_id, name, slug, role from profiles order by name`);
}

async function marcar(error: string) {
  const sql = await getSql();
  await sql.query(`update sheets_config set last_error = $1, last_sync = now() where id = 1`, [error.slice(0, 300)]);
}

function matriz(headers: readonly string[], filas: Fila[]) {
  return [headers.map((h) => ETIQUETA[h] ?? h), ...filas.map((fila) => headers.map((h) => fila[h] ?? ""))];
}

function leerRespuesta(text: string) {
  const t = text.trim();
  if (!t) return { ok: true as const };
  if (t.startsWith("<") || /ppConfig|accounts\.google\.com|ServiceLogin|sorry\/index/i.test(t)) {
    throw new Error(
      "Google contestó con una página y no con los datos. Vuelve a implementar: Aplicación web, ejecutar como Yo, acceso Cualquier persona. Pega la URL que termina en /exec.",
    );
  }
  try {
    return JSON.parse(t) as { ok?: boolean; error?: string; triggers?: number };
  } catch {
    throw new Error("El script no contestó. La URL tiene que ser la de la aplicación web y terminar en /exec.");
  }
}

const GOOGLE_HEADERS = {
  "Content-Type": "text/plain;charset=utf-8",
  Accept: "application/json,text/plain,*/*",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

async function postScript(url: string, body: unknown) {
  const payload = JSON.stringify(body);
  const signal = AbortSignal.timeout(55000);
  try {
    const first = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: GOOGLE_HEADERS,
      body: payload,
      signal,
    });
    const loc = first.status >= 300 && first.status < 400 ? first.headers.get("location") : "";
    const res = loc
      ? await fetch(new URL(loc, url), {
          method: "GET",
          redirect: "follow",
          headers: { Accept: GOOGLE_HEADERS.Accept, "User-Agent": GOOGLE_HEADERS["User-Agent"] },
          signal,
        })
      : first;
    const text = await res.text();
    const data = leerRespuesta(text);
    if (res.status >= 400) throw new Error(data.error || "El script de Google no respondió");
    return data;
  } catch (err) {
    if (err instanceof Error && /Google contestó|El script no contestó|no respondió|Google pidió/.test(err.message)) throw err;
    throw new Error(errorClaro(err));
  }
}

async function leerScript(url: string, secret: string) {
  const join = url.includes("?") ? "&" : "?";
  try {
    const res = await fetch(`${url}${join}secret=${encodeURIComponent(secret)}`, {
      redirect: "follow",
      headers: { Accept: GOOGLE_HEADERS.Accept, "User-Agent": GOOGLE_HEADERS["User-Agent"] },
      signal: AbortSignal.timeout(55000),
    });
    const data = leerRespuesta(await res.text()) as {
      ok?: boolean;
      error?: string;
      procesos?: unknown;
      agenda?: unknown;
      metas?: unknown;
    };
    if (!data.ok) throw new Error(data.error === "clave" ? "La clave del script no coincide. Vuelve a conectar con la misma URL." : "No pude leer el documento");
    return data;
  } catch (err) {
    if (err instanceof Error && /Google contestó|El script no contestó|clave del script|No pude leer|Google pidió/.test(err.message)) throw err;
    throw new Error(errorClaro(err));
  }
}

function calendarioMatriz(
  casos: Record<string, unknown>[],
  metas: Record<string, unknown>[],
  diasMeta: { slug: string; fecha: string; cuenta: number }[],
) {
  const hoy = hoyBogota();
  const mes = hoy.slice(0, 7) < META_DESDE.slice(0, 7) ? META_DESDE.slice(0, 7) : hoy.slice(0, 7);
  const dias = rangoDelCorte(mes);
  const desde = dias[0] ?? META_DESDE;
  const hasta = dias[dias.length - 1] ?? finDeMes(mes);
  const porAsesor: Record<string, Record<string, boolean>> = {};
  for (const row of diasMeta) {
    const mapa = porAsesor[row.slug] ?? {};
    mapa[String(row.fecha).slice(0, 10)] = Number(row.cuenta) === 1;
    porAsesor[row.slug] = mapa;
  }
  const logros = casos
    .filter((row) => marca(row.polizas_subidas) === "Sí")
    .map((row) => ({
      ownerName: texto(row.owner_name),
      placa: texto(row.placa),
      nombre: texto(row.nombre),
      fecha: fechaDelLogro(fecha(row.fecha_poliza), fecha(row.fecha_firma), fecha(row.fecha_inicio), hoy),
    }));
  const filas: string[][] = [["Asesor", "Fecha", "Meta del día", "Hechas", "Placas", "Falta", "Nota"]];
  for (const asesor of TEAM_PUBLIC.filter((p) => llevaProcesos(p.role))) {
    const guardada = metas.find((row) => texto(row.mes) === mes && plano(texto(row.owner_name)) === plano(asesor.name));
    const cuota = guardada ? Number(guardada.meta) : undefined;
    const celdas = calendarioDe(
      logros,
      asesor.name,
      desde,
      hasta,
      hoy,
      Number.isFinite(cuota) ? cuota : undefined,
      porAsesor[asesor.slug],
    );
    const resumen = resumenMeta(
      celdas,
      hoy,
      diasMeta.map((row) => String(row.fecha).slice(0, 10)),
    );
    filas.push([asesor.name, mes, "", String(resumen.hechas), "", "", `${resumen.hechas} de ${resumen.meta} · ${resumen.pct}%`]);
    for (const celda of celdas) {
      const nota = celda.cubiertoPor
        ? `Día cubierto por ${celda.cubiertoPor}${celda.placasQueCubren.map((p) => ` ${p.placa}`).join("")}`
        : celda.porque;
      filas.push([
        asesor.name,
        celda.iso,
        String(celda.meta),
        String(celda.cuenta),
        celda.placas.map((p) => p.placa).join(", "),
        celda.iso <= hoy && celda.labor ? String(celda.falta) : "",
        nota,
      ]);
    }
  }
  return filas;
}

async function escribirAhora() {
  const cfg = await config();
  if (!cfg) return;
  const sql = await getSql();
  const equipo = await personas();
  const casos = await sql.query<Record<string, unknown>>(
    `select c.*, p.name as owner_name from casos c join profiles p on p.user_id = c.owner_id order by c.id`,
  );
  const citas = await sql.query<Record<string, unknown>>(
    `select a.*, p.name as owner_name, coalesce(c.placa, '') as placa, coalesce(c.nombre, '') as cliente
     from agenda a
     join profiles p on p.user_id = a.owner_id
     left join casos c on c.id = a.caso_id
     order by a.fecha, a.hora, a.id`,
  );
  const metas = await sql.query<Record<string, unknown>>(
    `select m.mes, m.meta, p.name as owner_name
     from metas_mes m join profiles p on p.user_id = m.owner_id
     order by m.mes, p.name`,
  );
  const diasMeta = await sql.query<{ slug: string; fecha: string; cuenta: number }>(
    `select p.slug, d.fecha, d.cuenta
     from dias_meta d join profiles p on p.user_id = d.owner_id`,
  );

  const procesos = casos.map((row) => {
    const fila: Fila = {};
    for (const key of HOJA_PROCESOS) fila[key] = "";
    fila.id = texto(row.id);
    fila.asesor = texto(row.owner_name);
    fila.placa = texto(row.placa);
    fila.cc = texto(row.cc);
    fila.nombre = texto(row.nombre);
    fila.telefono = texto(row.telefono);
    fila.empresa = unificarEmpresa(texto(row.empresa));
    fila.origen = texto(row.origen);
    fila.direccion = texto(row.direccion);
    fila.correo = texto(row.correo);
    fila.marca = texto(row.marca);
    fila.linea = texto(row.linea);
    fila.modelo = texto(row.modelo);
    fila.fecha_inicio = fecha(row.fecha_inicio);
    fila.fecha_firma = fecha(row.fecha_firma);
    fila.fecha_poliza = fecha(row.fecha_poliza);
    for (const key of BOOLS_PROCESO) fila[key] = marca(row[key]);
    fila.estado_tarjeta = texto(row.estado_tarjeta);
    fila.observacion = texto(row.observacion);
    fila.proxima = texto(row.proxima);
    fila.fecha_proxima = fecha(row.fecha_proxima);
    fila.motivo_cierre = texto(row.motivo_cierre);
    fila.fecha_cierre = fecha(row.fecha_cierre);
    fila.estado = estadoDe({ ...checksDe(fila), motivoCierre: fila.motivo_cierre });
    fila.borrar = "";
    fila.actualizado = texto(row.updated_at) ? new Date(texto(row.updated_at)).toISOString().replace(/\.\d{3}Z$/, "Z") : ahoraIso();
    return fila;
  });

  const agenda = citas.map((row) => {
    const fila: Fila = {};
    for (const key of HOJA_AGENDA) fila[key] = "";
    fila.id = texto(row.id);
    fila.asesor = texto(row.owner_name);
    fila.placa = texto(row.placa);
    fila.cliente = texto(row.cliente);
    fila.tipo = tipoTexto(texto(row.tipo));
    fila.titulo = texto(row.titulo);
    fila.fecha = fecha(row.fecha);
    fila.hora = texto(row.hora).slice(0, 5);
    fila.nota = texto(row.nota);
    fila.hecho = marca(row.hecho);
    fila.caso_id = texto(row.caso_id);
    fila.borrar = "";
    fila.actualizado = texto(row.updated_at) ? new Date(texto(row.updated_at)).toISOString().replace(/\.\d{3}Z$/, "Z") : ahoraIso();
    return fila;
  });

  const metasFilas = metas.map((row) => ({
    mes: texto(row.mes),
    asesor: texto(row.owner_name),
    meta: texto(row.meta),
    actualizado: ahoraIso(),
  }));

  const equipoFilas = equipo.map((p) => ({
    nombre_equipo: p.name,
    usuario: p.slug,
    rol: etiquetaRol(p.role),
  }));

  const respuesta = await postScript(cfg.webapp_url, {
    secret: cfg.secret,
    accion: "escribir",
    procesos: matriz(HOJA_PROCESOS, procesos),
    agenda: matriz(HOJA_AGENDA, agenda),
    metas: matriz(HOJA_METAS, metasFilas),
    equipo: matriz(["nombre_equipo", "usuario", "rol"], equipoFilas as unknown as Fila[]),
    calendario: calendarioMatriz(casos, metas, diasMeta),
  });
  if (respuesta && respuesta.ok === false) throw new Error(respuesta.error || "Google no recibió los datos");
  await marcar("");
}

export async function escribirSheets() {
  reenviar = true;
  if (!ocupado) await notificarSheets();
  const inicio = Date.now();
  while ((ocupado || reenviar) && Date.now() - inicio < 60000) {
    await new Promise((r) => setTimeout(r, 300));
  }
  if (ocupado || reenviar) throw new Error("Google sigue ocupado. Espera un momento y pulsa Enviar todo otra vez.");
  const cfg = await config();
  if (cfg?.last_error) throw new Error(errorClaro(new Error(cfg.last_error)));
}

export async function notificarSheets() {
  reenviar = true;
  if (ocupado) return;
  ocupado = true;
  try {
    while (reenviar) {
      reenviar = false;
      await escribirAhora();
    }
  } catch (err) {
    await marcar(errorClaro(err)).catch(() => {});
  } finally {
    ocupado = false;
    if (reenviar) void notificarSheets();
  }
}

async function aplicarProceso(fila: Fila, equipo: Persona[]) {
  if (plano(fila.borrar) === "si") {
    const id = Number(fila.id);
    if (!id) return "vacio";
    const sql = await getSql();
    await sql.query(`delete from casos where id = $1`, [id]);
    const { anotar, ACTOR_SHEETS } = await import("./auditoria.server");
    await anotar(ACTOR_SHEETS, {
      accion: "borro",
      entidad: "proceso",
      entidadId: id,
      etiqueta: texto(fila.placa),
      detalle: `Google Sheets borró el proceso ${texto(fila.placa) || id}`,
    });
    return "cambio";
  }
  const persona = dueño(fila.asesor, equipo);
  if (!persona) return fila.placa || fila.nombre ? `No encontré al asesor "${fila.asesor}"` : "vacio";
  if (!texto(fila.placa) || !texto(fila.nombre)) return "vacio";
  const sql = await getSql();
  const id = Number(fila.id);
  if (id) {
    const previos = await sql.query<Record<string, unknown>>(
      `select updated_at::text as updated_at, dijo_si, cedula, tarjeta_propiedad, tarjeta_operacion, soat, tecnomecanica,
              formulario, documentos, firma_carta, firma_contrato, plata_poliza, via_seguros, polizas_subidas,
              operativa, estado_tarjeta, tarjeta_entregada, completado
       from casos where id = $1`,
      [id],
    );
    const previo = previos[0];
    if (!previo) return "vacio";
    const cuando = instante(fila.actualizado);
    if (!cuando || instante(previo.updated_at) >= cuando - 1500) return "vacio";
    const cerrando = Boolean(texto(fila.motivo_cierre)) || texto(fila.estado) === "No se concretó";
    if (boolsIguales(fila, previo) && !cerrando) alinearEtapa(fila);
    let motivo = texto(fila.motivo_cierre).slice(0, 300);
    if (!motivo && texto(fila.estado) === "No se concretó") motivo = "No se concretó";
    const completado = !motivo && si(fila.completado);
    const fechaCierre = motivo ? fecha(fila.fecha_cierre) || hoyBogota() : "";
    const poliza = fecha(fila.fecha_poliza) || (si(fila.polizas_subidas) ? hoyBogota() : "");
    await sql.query(
      `update casos set
        owner_id = $1, placa = $2, cc = $3, nombre = $4, telefono = $5, empresa = $6, origen = $7,
        direccion = $8, correo = $9, marca = $10, linea = $11, modelo = $12,
        fecha_inicio = $13, fecha_firma = $14, fecha_poliza = $15,
        dijo_si = $16, cedula = $17, tarjeta_propiedad = $18, tarjeta_operacion = $19, soat = $20,
        tecnomecanica = $21, formulario = $22, documentos = $23, firma_carta = $24, firma_contrato = $25,
        plata_poliza = $26, via_seguros = $27, polizas_subidas = $28, operativa = $29, estado_tarjeta = $30,
        tarjeta_entregada = $31, completado = $32, observacion = $33, proxima = $34, fecha_proxima = $35,
        motivo_cierre = $36, fecha_cierre = $37, updated_at = now()
       where id = $38`,
      [
        persona.user_id,
        texto(fila.placa).toUpperCase(),
        texto(fila.cc).replace(/\D/g, ""),
        texto(fila.nombre),
        texto(fila.telefono).replace(/\D/g, ""),
        unificarEmpresa(texto(fila.empresa)),
        texto(fila.origen).slice(0, 80),
        texto(fila.direccion).slice(0, 120),
        texto(fila.correo).slice(0, 80),
        texto(fila.marca).slice(0, 40),
        texto(fila.linea).slice(0, 40),
        texto(fila.modelo).slice(0, 8),
        fecha(fila.fecha_inicio) || hoyBogota(),
        fecha(fila.fecha_firma),
        poliza,
        si(fila.dijo_si),
        si(fila.cedula),
        si(fila.tarjeta_propiedad),
        si(fila.tarjeta_operacion),
        si(fila.soat),
        si(fila.tecnomecanica),
        si(fila.formulario),
        si(fila.documentos),
        si(fila.firma_carta),
        si(fila.firma_contrato),
        si(fila.plata_poliza),
        si(fila.via_seguros),
        si(fila.polizas_subidas),
        si(fila.operativa),
        tarjetaDe(fila.estado_tarjeta),
        si(fila.tarjeta_entregada),
        completado,
        texto(fila.observacion).slice(0, 500),
        texto(fila.proxima).slice(0, 160),
        motivo ? "" : fecha(fila.fecha_proxima),
        motivo,
        fechaCierre,
        id,
      ],
    );
    const { anotar, ACTOR_SHEETS } = await import("./auditoria.server");
    await anotar(ACTOR_SHEETS, {
      accion: "edito",
      entidad: "proceso",
      entidadId: id,
      etiqueta: texto(fila.placa),
      detalle: `Google Sheets modificó el proceso ${texto(fila.placa)}`,
    });
    return "cambio";
  }
  const cuando = instante(fila.actualizado);
  if (!cuando && !texto(fila.placa)) return "vacio";
  if (texto(fila.estado) && estadoDe({ ...checksDe(fila), motivoCierre: texto(fila.motivo_cierre) }) !== texto(fila.estado)) alinearEtapa(fila);
  let motivoNuevo = texto(fila.motivo_cierre).slice(0, 300);
  if (!motivoNuevo && texto(fila.estado) === "No se concretó") motivoNuevo = "No se concretó";
  const completadoNuevo = !motivoNuevo && si(fila.completado);
  const fechaCierreNuevo = motivoNuevo ? fecha(fila.fecha_cierre) || hoyBogota() : "";
  const ya = await sql.query<{ id: number }>(
    `select id from casos where owner_id = $1 and upper(placa) = $2 and completado = false and btrim(motivo_cierre) = '' order by id desc limit 1`,
    [persona.user_id, texto(fila.placa).toUpperCase()],
  );
  if (ya[0]) return "vacio";
  const poliza = fecha(fila.fecha_poliza) || (si(fila.polizas_subidas) ? hoyBogota() : "");
  await sql.query(
    `insert into casos (
      owner_id, placa, cc, nombre, telefono, empresa, origen, fecha_inicio,
      dijo_si, cedula, tarjeta_propiedad, tarjeta_operacion, soat, tecnomecanica,
      formulario, documentos, firma_carta, firma_contrato, plata_poliza, via_seguros,
      polizas_subidas, operativa, estado_tarjeta, tarjeta_entregada, completado,
      observacion, proxima, fecha_proxima, direccion, correo, marca, linea, modelo,
      fecha_firma, fecha_poliza, motivo_cierre, fecha_cierre
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,
      $9,$10,$11,$12,$13,$14,
      $15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24,$25,
      $26,$27,$28,$29,$30,$31,$32,$33,
      $34,$35,$36,$37
    )`,
    [
      persona.user_id,
      texto(fila.placa).toUpperCase(),
      texto(fila.cc).replace(/\D/g, ""),
      texto(fila.nombre),
      texto(fila.telefono).replace(/\D/g, ""),
      unificarEmpresa(texto(fila.empresa)),
      texto(fila.origen).slice(0, 80),
      fecha(fila.fecha_inicio) || hoyBogota(),
      si(fila.dijo_si),
      si(fila.cedula),
      si(fila.tarjeta_propiedad),
      si(fila.tarjeta_operacion),
      si(fila.soat),
      si(fila.tecnomecanica),
      si(fila.formulario),
      si(fila.documentos),
      si(fila.firma_carta),
      si(fila.firma_contrato),
      si(fila.plata_poliza),
      si(fila.via_seguros),
      si(fila.polizas_subidas),
      si(fila.operativa),
      tarjetaDe(fila.estado_tarjeta),
      si(fila.tarjeta_entregada),
      completadoNuevo,
      texto(fila.observacion).slice(0, 500),
      texto(fila.proxima).slice(0, 160),
      motivoNuevo ? "" : fecha(fila.fecha_proxima),
      texto(fila.direccion).slice(0, 120),
      texto(fila.correo).slice(0, 80),
      texto(fila.marca).slice(0, 40),
      texto(fila.linea).slice(0, 40),
      texto(fila.modelo).slice(0, 8),
      fecha(fila.fecha_firma),
      poliza,
      motivoNuevo,
      fechaCierreNuevo,
    ],
  );
  const { anotar, ACTOR_SHEETS } = await import("./auditoria.server");
  await anotar(ACTOR_SHEETS, {
    accion: "creo",
    entidad: "proceso",
    etiqueta: texto(fila.placa),
    detalle: `Google Sheets creó el proceso ${texto(fila.placa)} · ${texto(fila.nombre)}`,
  });
  return "nuevo";
}

async function aplicarAgenda(fila: Fila, equipo: Persona[]) {
  const sql = await getSql();
  const id = Number(fila.id);
  if (plano(fila.borrar) === "si") {
    if (!id) return "vacio";
    await sql.query(`delete from agenda where id = $1`, [id]);
    return "cambio";
  }
  if (!texto(fila.titulo) || !fecha(fila.fecha)) return "vacio";
  const persona = dueño(fila.asesor, equipo);
  if (!persona) return `No encontré al asesor de la agenda "${fila.titulo}"`;
  const casoId = Number(fila.caso_id) || null;
  const cuando = instante(fila.actualizado);
  if (!id) {
    const ya = await sql.query<{ id: number }>(
      `select id from agenda where owner_id = $1 and titulo = $2 and fecha = $3 limit 1`,
      [persona.user_id, texto(fila.titulo).slice(0, 160), fecha(fila.fecha)],
    );
    if (ya[0]) return "vacio";
  }
  if (id) {
    const previos = await sql.query<{ updated_at: string }>(`select updated_at::text from agenda where id = $1`, [id]);
    if (!previos[0]) return "vacio";
    if (!cuando || instante(previos[0].updated_at) >= cuando - 1500) return "vacio";
    await sql.query(
      `update agenda set owner_id = $2, caso_id = $3, tipo = $4, titulo = $5, fecha = $6, hora = $7, nota = $8, hecho = $9, updated_at = now() where id = $1`,
      [id, persona.user_id, casoId, tipoDe(fila.tipo), texto(fila.titulo).slice(0, 160), fecha(fila.fecha), texto(fila.hora).slice(0, 5), texto(fila.nota).slice(0, 400), si(fila.hecho)],
    );
    return "cambio";
  }
  await sql.query(
    `insert into agenda (owner_id, caso_id, tipo, titulo, fecha, hora, nota, hecho) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [persona.user_id, casoId, tipoDe(fila.tipo), texto(fila.titulo).slice(0, 160), fecha(fila.fecha), texto(fila.hora).slice(0, 5), texto(fila.nota).slice(0, 400), si(fila.hecho)],
  );
  return "nuevo";
}

async function aplicarMeta(fila: Fila, equipo: Persona[]) {
  if (!/^\d{4}-\d{2}$/.test(texto(fila.mes))) return "vacio";
  const persona = dueño(fila.asesor, equipo);
  if (!persona) return fila.asesor ? `No encontré al asesor de la meta "${fila.asesor}"` : "vacio";
  const meta = Math.max(0, Math.min(999, Math.round(Number(texto(fila.meta)) || 0)));
  const sql = await getSql();
  const actuales = await sql.query<{ meta: number }>(`select meta from metas_mes where mes = $1 and owner_id = $2`, [fila.mes, persona.user_id]);
  if (actuales[0] && Number(actuales[0].meta) === meta) return "vacio";
  await sql.query(
    `insert into metas_mes (mes, owner_id, meta) values ($1, $2, $3)
     on conflict (mes, owner_id) do update set meta = excluded.meta`,
    [texto(fila.mes), persona.user_id, meta],
  );
  return "cambio";
}

async function aplicarLista(hoja: string, filas: Fila[], equipo: Persona[]) {
  let cambios = 0;
  let necesitaPush = false;
  const errores: string[] = [];
  for (const fila of filas) {
    const resultado =
      hoja === "Procesos" ? await aplicarProceso(fila, equipo) : hoja === "Agenda" ? await aplicarAgenda(fila, equipo) : await aplicarMeta(fila, equipo);
    if (resultado === "cambio") cambios += 1;
    if (resultado === "nuevo") {
      cambios += 1;
      necesitaPush = true;
    }
    if (resultado !== "vacio" && resultado !== "cambio" && resultado !== "nuevo") errores.push(resultado);
  }
  return { cambios, necesitaPush, errores };
}

export async function traerSheets() {
  const cfg = await config();
  if (!cfg) return { cambios: 0, conectado: false, error: "", spreadsheetUrl: "" };
  if (ocupado) return { cambios: 0, conectado: true, error: "", spreadsheetUrl: cfg.spreadsheet_url };
  ocupado = true;
  try {
    const data = await leerScript(cfg.webapp_url, cfg.secret);
    const equipo = await personas();
    const procesos = await aplicarLista("Procesos", filasDe(data.procesos), equipo);
    const agenda = await aplicarLista("Agenda", filasDe(data.agenda), equipo);
    const metas = await aplicarLista("Metas", filasDe(data.metas), equipo);
    const cambios = procesos.cambios + agenda.cambios + metas.cambios;
    const errores = [...procesos.errores, ...agenda.errores, ...metas.errores];
    if (procesos.necesitaPush || agenda.necesitaPush) reenviar = true;
    else await marcar(errores[0] ?? "");
    return { cambios, conectado: true, error: errores[0] ?? "", spreadsheetUrl: cfg.spreadsheet_url };
  } catch (err) {
    const error = errorClaro(err);
    await marcar(error).catch(() => {});
    return { cambios: 0, conectado: true, error, spreadsheetUrl: cfg.spreadsheet_url };
  } finally {
    ocupado = false;
    if (reenviar) void notificarSheets();
  }
}

export async function aplicarFilasSheets(hoja: string, filas: Fila[]) {
  if (!["Procesos", "Agenda", "Metas"].includes(hoja)) return { ok: false, error: "Hoja desconocida" };
  const inicio = Date.now();
  while (ocupado && Date.now() - inicio < 20000) await new Promise((r) => setTimeout(r, 200));
  if (ocupado) return { ok: false, error: "Estoy actualizando el documento. Edita esa fila otra vez en unos segundos." };
  ocupado = true;
  try {
    const equipo = await personas();
    const resultado = await aplicarLista(hoja, filas.map(normalizarFila), equipo);
    if (resultado.necesitaPush) reenviar = true;
    else if (resultado.errores[0]) await marcar(resultado.errores[0]);
    return { ok: true, cambios: resultado.cambios, error: resultado.errores[0] ?? "" };
  } finally {
    ocupado = false;
    if (reenviar) void notificarSheets();
  }
}

export async function aplicarFilaSheets(hoja: string, fila: Fila) {
  return aplicarFilasSheets(hoja, [fila]);
}

export async function estadoSheets() {
  const cfg = await config();
  return {
    conectado: Boolean(cfg),
    spreadsheetUrl: cfg?.spreadsheet_url ?? "",
    webappUrl: cfg?.webapp_url ?? "",
    lastError: errorClaro(new Error(cfg?.last_error ?? "")),
    lastSync: cfg?.last_sync ?? "",
  };
}

export async function conectarSheets(webappUrl: string, spreadsheetUrl: string, callbackUrl: string) {
  let url = webappUrl.trim().split("?")[0].replace(/\/$/, "");
  if (!url.startsWith("https://script.google.com/macros/s/")) {
    throw new Error("Esa no es la URL de la aplicación web. Tiene que empezar por https://script.google.com/macros/s/ y terminar en /exec.");
  }
  url = url.replace(/\/dev$/, "");
  if (!url.endsWith("/exec")) url += "/exec";
  const sql = await getSql();
  const actuales = await sql.query<{ secret: string }>(`select secret from sheets_config where id = 1`);
  const secret = actuales[0]?.secret || crypto.randomUUID().replace(/-/g, "");
  await sql.query(
    `insert into sheets_config (id, webapp_url, secret, spreadsheet_url, callback_url, last_error)
     values (1, $1, $2, $3, $4, '')
     on conflict (id) do update set webapp_url = excluded.webapp_url, secret = excluded.secret,
       spreadsheet_url = excluded.spreadsheet_url, callback_url = excluded.callback_url, last_error = ''`,
    [url, secret, spreadsheetUrl.trim(), callbackUrl],
  );
  const respuesta = await postScript(url, { accion: "vincular", secret, callback: `${callbackUrl}/api/sheets` });
  if (respuesta && respuesta.ok === false) {
    const fallo =
      respuesta.error === "clave"
        ? "La clave del script no coincide. En Apps Script pega el script de nuevo, elige autorizar, pulsa Ejecutar y luego Conectar."
        : respuesta.error || "El script no aceptó la conexión";
    await marcar(fallo);
    throw new Error(fallo);
  }
  try {
    await escribirSheets();
  } catch (err) {
    const fallo = errorClaro(err);
    await marcar(fallo).catch(() => {});
    throw new Error(fallo);
  }
  return { ok: true };
}
