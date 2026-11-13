import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { hoyBogota, entregaIds, entregaLista } from "@/lib/casos";
import { DOCS_PILOTO, copiasAlImprimir, docsDe, etiquetaDoc, etiquetaMano, etiquetaMarca, MARCAS_OP, MARCAS_SERVICIO, MARCAS_VIA, marcasDe, tipoVisible, type DocTipo, type OpTarjeta } from "@/lib/piloto";
import { configura, esBandeja, llevaProcesos, manoDeRol, veElEquipo, type Role } from "@/lib/team.public";

export type PilotoEstado = {
  activo: boolean;
  docs: string[];
  usuarios: { slug: string; name: string; role: string; clave: string }[];
};

export type DocItem = { id: number; tipo: string; nombre: string; subidoPor: string; cuando: string; vigencia: string; vence: string };

type CasoMano = {
  id: number;
  owner_id: string;
  placa: string;
  mano: string;
  via_estado: string;
  polizas_subidas: boolean;
  operativa: boolean;
  docs_ocultos: string;
  estado_tarjeta: string;
  tarjeta_entregada: boolean;
  completado: boolean;
  area_marcas: string;
  poliza_fase: string;
  entrega: string;
  cita_fecha: string;
  ciudad_id: number | null;
};

const ROLES_BANDEJA = ["via_seguros", "operativa", "servicio"] as const;

function plano(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function tipoDoc(value: string): string {
  const tipo = DOCS_PILOTO.find((d) => d.id === value);
  if (tipo) return tipo.id;
  const limpio = value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!/^[a-z0-9_]{2,40}$/.test(limpio)) throw new Error("Ese documento no está en la lista");
  return limpio;
}

async function perfil() {
  return import("./team.server");
}

async function casoDe(id: number) {
  const sql = await getSql();
  const rows = await sql.query<CasoMano>(
    `select id, owner_id, placa, mano, via_estado, polizas_subidas, operativa, docs_ocultos, estado_tarjeta, tarjeta_entregada, completado, area_marcas, poliza_fase, entrega, cita_fecha, ciudad_id from casos where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

function puedeVer(role: string, userId: string, caso: CasoMano) {
  if (veElEquipo(role) || llevaProcesos(role)) return userId === caso.owner_id || veElEquipo(role);
  if (role === "operativa") return caso.mano === "operativa" || caso.operativa || Boolean(caso.estado_tarjeta) || caso.tarjeta_entregada;
  if (role === "via_seguros") return caso.mano === "via";
  if (role === "servicio") return caso.mano === "servicio" || caso.completado || Boolean(caso.cita_fecha);
  return false;
}

function puedeArchivo(role: string, tipo: string, caso: CasoMano, docsOperativa: string[]) {
  if (veElEquipo(role) || role === "asesor" || role === "lider") return true;
  if (role === "via_seguros") return tipo === "comprobante" || tipo === "contrato" || tipo === "carta";
  if (role === "operativa") {
    const ocultos = new Set(docsDe(caso.docs_ocultos));
    if (tipo === "autorizacion") return !ocultos.has(tipo);
    return docsOperativa.includes(tipoVisible(tipo)) && !ocultos.has(tipo) && !ocultos.has(tipoVisible(tipo));
  }
  return false;
}

async function docsOperativa() {
  const sql = await getSql();
  const rows = await sql.query<{ docs_operativa: string }>(`select docs_operativa from piloto where id = 1`);
  return docsDe(rows[0]?.docs_operativa);
}

async function aviso(casoId: number, userId: string, body: string) {
  const sql = await getSql();
  await sql.query(`insert into mensajes (caso_id, author_id, body) values ($1, $2, $3)`, [casoId, userId, body]);
}

export const estadoPiloto = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PilotoEstado> => {
    const { profileFor } = await perfil();
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const sql = await getSql();
    const rows = await sql.query<{ activo: boolean; docs_operativa: string }>(`select activo, docs_operativa from piloto where id = 1`);
    const usuarios = configura(profile.role)
      ? await sql.query<{ slug: string; name: string; role: string; clave: string }>(
          `select p.slug, p.name, p.role, coalesce(k.clave, '') as clave
           from profiles p
           left join claves_equipo k on k.user_id = p.user_id
           where p.role in ('via_seguros', 'operativa', 'servicio')
           order by p.role, p.name`,
        )
      : [];
    return {
      activo: Boolean(rows[0]?.activo),
      docs: docsDe(rows[0]?.docs_operativa),
      usuarios: usuarios.map((u) => ({ slug: u.slug, name: u.name, role: u.role, clave: u.clave ?? "" })),
    };
  });

export const guardarPiloto = createServerFn({ method: "POST" })
  .validator((input: { activo: boolean; docs: string[] }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await perfil();
    const profile = await profileFor(context.userId);
    if (!profile || !configura(profile.role)) throw new Error("Solo David configura el piloto");
    const docs = docsDe(data.docs.join(","));
    if (!docs.length) throw new Error("Operativa tiene que ver al menos un documento");
    const sql = await getSql();
    await sql.query(`update piloto set activo = $1, docs_operativa = $2 where id = 1`, [Boolean(data.activo), docs.join(",")]);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "edito",
      entidad: "piloto",
      etiqueta: "piloto",
      detalle: data.activo ? `Prendió el piloto. Operativa ve: ${docs.map(etiquetaDoc).join(", ")}` : "Apagó el piloto",
    });
    return { ok: true };
  });

export const crearUsuarioBandeja = createServerFn({ method: "POST" })
  .validator((input: { nombre: string; usuario: string; clave: string; rol: Role }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await perfil();
    const profile = await profileFor(context.userId);
    if (!profile || !configura(profile.role)) throw new Error("Solo David crea estos usuarios");
    if (!ROLES_BANDEJA.includes(data.rol as (typeof ROLES_BANDEJA)[number])) throw new Error("Elige Vía Seguros, operativa o servicio al cliente");
    const nombre = data.nombre.trim();
    const slug = plano(data.usuario);
    if (nombre.length < 3) throw new Error("Falta el nombre");
    if (slug.length < 3) throw new Error("El usuario necesita al menos 3 letras, sin espacios");
    if (data.clave.trim().length < 8) throw new Error("La clave necesita al menos 8 caracteres");
    const email = `${slug}@vinculalibre.app`;
    const sql = await getSql();
    const ya = await sql.query<{ slug: string }>(
      `select p.slug from profiles p join "user" u on u.id = p.user_id where p.slug = $1 or u.email = $2`,
      [slug, email],
    );
    if (ya[0]) throw new Error("Ese usuario ya existe");
    const { auth } = await import("./auth/server");
    await auth.api.signUpEmail({ body: { email, password: data.clave.trim(), name: nombre } });
    const usuarios = await sql.query<{ id: string }>(`select id from "user" where email = $1`, [email]);
    const userId = usuarios[0]?.id;
    if (!userId) throw new Error("No pude crear el usuario");
    await sql.query(
      `insert into profiles (user_id, slug, name, role) values ($1, $2, $3, $4)
       on conflict (user_id) do update set slug = excluded.slug, name = excluded.name, role = excluded.role`,
      [userId, slug, nombre, data.rol],
    );
    await sql.query(
      `insert into claves_equipo (user_id, clave, updated_at) values ($1, $2, now())
       on conflict (user_id) do update set clave = excluded.clave, updated_at = now()`,
      [userId, data.clave.trim()],
    );
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "creo",
      entidad: "piloto",
      etiqueta: slug,
      detalle: `Creó a ${nombre} (${slug}) en ${data.rol}`,
    });
    return { ok: true, slug };
  });

async function asegurarCargas(sql: Awaited<ReturnType<typeof getSql>>) {
  await sql.query(
    `create table if not exists carga_trozos (
      carga_id text not null,
      orden integer not null,
      datos text not null,
      caso_id integer not null default 0,
      tipo text not null default '',
      nombre text not null default '',
      lectura text not null default '',
      reemplaza_id integer not null default 0,
      primary key (carga_id, orden)
    )`,
  );
}

async function quien(userId: string) {
  const { profileFor } = await perfil();
  const profile = await profileFor(userId);
  if (!profile) throw new Error("No encontré tu usuario");
  return profile;
}

async function exigir(userId: string) {
  const profile = await quien(userId);
  const sql = await getSql();
  const prendido = await sql.query<{ activo: boolean }>(`select activo from piloto where id = 1`);
  if (!prendido[0]?.activo) throw new Error("El piloto está apagado");
  return profile;
}

export const pasarMano = createServerFn({ method: "POST" })
  .validator((input: { id: number; mano: "via" | "operativa" | "asesor" | "servicio"; atencion?: "presencial" | "virtual" }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigir(context.userId);
    const caso = await casoDe(data.id);
    if (!caso) throw new Error("No encontré ese proceso");
    const dueno = caso.owner_id === context.userId && llevaProcesos(profile.role);
    const lider = configura(profile.role);
    const sql = await getSql();
    let texto = "";
    if (data.mano === "via") {
      if (!dueno && !lider) throw new Error("Lo pasa el asesor del proceso");
      if (caso.mano && caso.mano !== "via") throw new Error("Ese proceso está en otra mano");
      const atencion = data.atencion === "presencial" ? "presencial" : "virtual";
      await sql.query(
        `update casos set mano = 'via', mano_asignado = '', via_seguros = true, via_atencion = $2, via_estado = case when via_estado = '' then 'pedido' else via_estado end, updated_at = now() where id = $1`,
        [caso.id, atencion],
      );
      texto =
        atencion === "presencial"
          ? `Pasó ${caso.placa} a Vía Seguros, atención presencial. El pago se recibe en cajas.`
          : `Pasó ${caso.placa} a Vía Seguros, atención virtual. Falta el link de pago.`;
    } else if (data.mano === "operativa") {
      if (!dueno && !lider) throw new Error("Lo pasa el asesor del proceso");
      if (caso.mano === "operativa" || caso.mano === "servicio") throw new Error("Ese proceso ya salió de esta mano");
      const { flujoDeCiudad } = await import("./gerencia.functions");
      const flujo = await flujoDeCiudad(caso.ciudad_id);
      if (!flujo.operativaAntesDePago && !caso.polizas_subidas && caso.via_estado !== "recibido") {
        throw new Error("En esta ciudad, operativa espera a que Vía Seguros reciba el pago");
      }
      await sql.query(
        `update casos set mano = 'operativa', mano_asignado = '', operativa = true, docs_ocultos = '', updated_at = now() where id = $1`,
        [caso.id],
      );
      texto = `Pasó ${caso.placa} a operativa. Ya pueden ver los documentos.`;
    } else if (data.mano === "asesor") {
      if (!lider && profile.role !== "operativa") throw new Error("Lo devuelve operativa");
      if (caso.mano !== "operativa") throw new Error("Ese proceso no está en operativa");
      await sql.query(`update casos set mano = '', mano_asignado = '', updated_at = now() where id = $1`, [caso.id]);
      texto = `Operativa devolvió ${caso.placa} al asesor.`;
    } else {
      if (!dueno && !lider) throw new Error("Lo avisa el asesor del proceso");
      if (caso.mano) throw new Error("Primero tiene que volver al asesor");
      if (!caso.operativa) throw new Error("Todavía no pasa por operativa");
      await sql.query(`update casos set mano = 'servicio', mano_asignado = '', updated_at = now() where id = $1`, [caso.id]);
      texto = `${caso.placa} quedó completado para servicio al cliente. Falta asignar bonos y beneficios.`;
    }
    await aviso(caso.id, context.userId, texto);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "movio",
      entidad: "proceso",
      entidadId: caso.id,
      etiqueta: caso.placa,
      detalle: texto,
      antes: etiquetaMano(caso.mano),
      despues: etiquetaMano(data.mano === "asesor" ? "" : data.mano),
    });
    return { ok: true };
  });

export const marcarVia = createServerFn({ method: "POST" })
  .validator((input: { id: number; accion: "enlace" | "recibido" | "no_coincide" | "pedir"; enlace?: string; nota?: string; carta?: boolean; contrato?: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigir(context.userId);
    const caso = await casoDe(data.id);
    if (!caso) throw new Error("No encontré ese proceso");
    if (caso.mano !== "via") throw new Error("Ese proceso no está en Vía Seguros");
    if (!configura(profile.role) && profile.role !== "via_seguros") throw new Error("Eso lo marca Vía Seguros");
    const sql = await getSql();
    const nota = (data.nota ?? "").trim().slice(0, 300);
    let texto = "";
    if (data.accion === "enlace") {
      const enlace = (data.enlace ?? "").trim().slice(0, 300);
      if (!/^https?:\/\//i.test(enlace)) throw new Error("Pega el enlace de pago, con https");
      await sql.query(`update casos set via_enlace = $1, via_estado = 'enlace', via_nota = $2, updated_at = now() where id = $3`, [enlace, nota, caso.id]);
      texto = `Vía Seguros dejó el enlace de pago de ${caso.placa}.`;
    } else if (data.accion === "recibido") {
      await sql.query(
        `update casos set via_estado = 'recibido', via_nota = $1, polizas_subidas = true,
           fecha_poliza = case when fecha_poliza = '' then $2 else fecha_poliza end, updated_at = now()
         where id = $3`,
        [nota, hoyBogota(), caso.id],
      );
      texto = `Vía Seguros recibió el pago de ${caso.placa}.`;
    } else if (data.accion === "no_coincide") {
      if (!nota) throw new Error("Escribe qué no coincide");
      await sql.query(`update casos set via_estado = 'no_coincide', via_nota = $1, updated_at = now() where id = $2`, [nota, caso.id]);
      texto = `Vía Seguros dice que el pago de ${caso.placa} no coincide. ${nota}`;
    } else {
      await sql.query(`update casos set via_pide_carta = $1, via_pide_contrato = $2, updated_at = now() where id = $3`, [
        Boolean(data.carta),
        Boolean(data.contrato),
        caso.id,
      ]);
      const pide = [data.carta ? "la carta de desvinculación" : "", data.contrato ? "el contrato firmado" : ""].filter(Boolean);
      texto = pide.length ? `Vía Seguros pide ${pide.join(" y ")} de ${caso.placa}.` : `Vía Seguros ya no pide documentos extra de ${caso.placa}.`;
    }
    await aviso(caso.id, context.userId, texto);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, { accion: "movio", entidad: "poliza", entidadId: caso.id, etiqueta: caso.placa, detalle: texto });
    return { ok: true };
  });

const PERMITE: Record<string, readonly string[]> = {
  operativa: MARCAS_OP.map((m) => m.id),
  via_seguros: MARCAS_VIA.map((m) => m.id),
  servicio: MARCAS_SERVICIO.map((m) => m.id),
};

export const marcarArea = createServerFn({ method: "POST" })
  .validator((input: { id: number; marca: string; on: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigir(context.userId);
    const caso = await casoDe(data.id);
    if (!caso) throw new Error("No encontré ese proceso");
    const lider = configura(profile.role);
    const propias = PERMITE[profile.role] ?? [];
    if (!lider && !propias.includes(data.marca)) throw new Error("Esa marca no es de tu área");
    if (!lider && !puedeVer(profile.role, context.userId, caso)) throw new Error("Ese proceso no está en tu área");
    if (profile.role === "via_seguros" && caso.mano !== "via") throw new Error("Ese proceso no te lo han pasado");
    const marcas = new Set(marcasDe(caso.area_marcas));
    if (data.on) marcas.add(data.marca);
    else marcas.delete(data.marca);
    const lista = [...marcas].join(",");
    const sql = await getSql();
    if (data.marca === "pago_recibido" && data.on) {
      await sql.query(
        `update casos set area_marcas = $1, via_estado = 'recibido', polizas_subidas = true,
           fecha_poliza = case when fecha_poliza = '' then $2 else fecha_poliza end, updated_at = now()
         where id = $3`,
        [lista, hoyBogota(), caso.id],
      );
    } else if (data.marca === "polizas_a_david" && data.on) {
      await sql.query(
        `update casos set area_marcas = $1, polizas_subidas = true,
           poliza_fase = case when poliza_fase in ('', 'espera') then 'recibida' else poliza_fase end,
           updated_at = now()
         where id = $2`,
        [lista, caso.id],
      );
    } else {
      await sql.query(`update casos set area_marcas = $1, updated_at = now() where id = $2`, [lista, caso.id]);
    }
    const texto = `${profile.name} ${data.on ? "marcó" : "quitó"} «${etiquetaMarca(data.marca)}» en ${caso.placa}.`;
    await aviso(caso.id, context.userId, texto);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, { accion: "edito", entidad: "proceso", entidadId: caso.id, etiqueta: caso.placa, detalle: texto });
    return { marcas: lista };
  });

export const marcarOperativa = createServerFn({ method: "POST" })
  .validator((input: { id: number; polizas: boolean; impreso: boolean; pedido: string; tarjeta: OpTarjeta }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigir(context.userId);
    const caso = await casoDe(data.id);
    if (!caso) throw new Error("No encontré ese proceso");
    if (caso.mano !== "operativa") throw new Error("Ese proceso no está en operativa");
    if (!configura(profile.role) && profile.role !== "operativa") throw new Error("Eso lo marca operativa");
    const pedido = data.pedido.trim().slice(0, 300);
    const sql = await getSql();
    if (data.tarjeta) {
      const estado = data.tarjeta === "radicada" ? "Radicada" : data.tarjeta === "expedida" || data.tarjeta === "entregada" ? "Expedida" : "Pendiente";
      await sql.query(
        `update casos set op_polizas = $1, op_impreso = $2, op_pedido = $3, op_tarjeta = $4,
           estado_tarjeta = $5, tarjeta_entregada = $6, updated_at = now() where id = $7`,
        [data.polizas, data.impreso, pedido, data.tarjeta, estado, data.tarjeta === "entregada", caso.id],
      );
    } else {
      await sql.query(
        `update casos set op_polizas = $1, op_impreso = $2, op_pedido = $3, updated_at = now() where id = $4`,
        [data.polizas, data.impreso, pedido, caso.id],
      );
    }
    const texto = pedido
      ? `Operativa pide algo de ${caso.placa}: ${pedido}`
      : `Operativa actualizó ${caso.placa}.`;
    if (pedido) await aviso(caso.id, context.userId, texto);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, { accion: "edito", entidad: "proceso", entidadId: caso.id, etiqueta: caso.placa, detalle: texto });
    return { ok: true };
  });

export const marcarServicio = createServerFn({ method: "POST" })
  .validator((input: { id: number; bonos: string; beneficios: string[]; nota: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigir(context.userId);
    const caso = await casoDe(data.id);
    if (!caso) throw new Error("No encontré ese proceso");
    if (caso.mano !== "servicio" && !caso.completado && !caso.cita_fecha) throw new Error("Ese proceso no está en servicio al cliente");
    if (!configura(profile.role) && profile.role !== "servicio") throw new Error("Eso lo marca servicio al cliente");
    const bonos = data.bonos.trim().slice(0, 200);
    const beneficios = data.beneficios.map((b) => b.trim()).filter(Boolean).slice(0, 8).join(",");
    const nota = data.nota.trim().slice(0, 300);
    const sql = await getSql();
    await sql.query(`update casos set bonos = $1, beneficios = $2, servicio_nota = $3, updated_at = now() where id = $4`, [
      bonos,
      beneficios,
      nota,
      caso.id,
    ]);
    const texto = `Servicio al cliente dejó los bonos de ${caso.placa}${bonos ? `: ${bonos}` : ""}.`;
    await aviso(caso.id, context.userId, texto);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, { accion: "edito", entidad: "proceso", entidadId: caso.id, etiqueta: caso.placa, detalle: texto });
    return { ok: true };
  });

const ENTREGA_OP = ["carta", "tarjeta_nueva", "tarjeton"];
const ENTREGA_SERVICIO = ["bono_rodamiento", "bono_app", "bono_distintivos", "bono_equipo", "bono_espia"];

export const marcarEntrega = createServerFn({ method: "POST" })
  .validator((input: { id: number; marca: string; on: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigir(context.userId);
    const caso = await casoDe(data.id);
    if (!caso) throw new Error("No encontré ese proceso");
    const lider = configura(profile.role);
    if (!lider && profile.role === "operativa" && !ENTREGA_OP.includes(data.marca)) throw new Error("Esa marca no es de operativa");
    if (!lider && profile.role === "servicio" && !ENTREGA_SERVICIO.includes(data.marca)) throw new Error("Esa marca no es de servicio al cliente");
    if (!lider && profile.role !== "operativa" && profile.role !== "servicio") throw new Error("Eso lo marca el área");
    if (!lider && !puedeVer(profile.role, context.userId, caso)) throw new Error("Ese proceso no está en tu área");
    const ids = new Set(entregaIds(caso.entrega));
    if (data.on) ids.add(data.marca);
    else ids.delete(data.marca);
    const lista = entregaLista([...ids].join(","));
    const sql = await getSql();
    await sql.query(
      `update casos set entrega = $1, mano = case when $3 and $4 then 'servicio' else mano end, updated_at = now() where id = $2`,
      [lista, caso.id, data.marca === "tarjeta_nueva", data.on],
    );
    const texto = `${profile.name} ${data.on ? "marcó" : "quitó"} la entrega de ${caso.placa}.`;
    await aviso(caso.id, context.userId, texto);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, { accion: "edito", entidad: "proceso", entidadId: caso.id, etiqueta: caso.placa, detalle: texto });
    return { entrega: lista };
  });

export const listarDocumentos = createServerFn({ method: "POST" })
  .validator((casoId: number) => casoId)
  .middleware([authMiddleware])
  .handler(async ({ context, data: casoId }): Promise<DocItem[]> => {
    const { profileFor } = await perfil();
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const caso = await casoDe(casoId);
    if (!caso || !puedeVer(profile.role, context.userId, caso)) throw new Error("No encontré ese proceso");
    const permitidos = await docsOperativa();
    const sql = await getSql();
    const rows = await sql.query<{ id: number; tipo: string; nombre: string; subido_por: string; cuando: string; lectura: string }>(
      `select id, tipo, nombre, subido_por, lectura, to_char(created_at at time zone 'America/Bogota', 'DD/MM HH24:MI') as cuando
       from documentos where caso_id = $1 order by id`,
      [casoId],
    );
    return rows
      .filter((row) => puedeArchivo(profile.role, row.tipo, caso, permitidos))
      .map((row) => {
        let vigencia = "";
        let vence = "";
        try {
          const leido = JSON.parse(row.lectura || "{}") as { vigencia?: string; vence?: string };
          vigencia = leido.vigencia || "";
          vence = leido.vence || "";
        } catch {
          vigencia = "";
        }
        return { id: Number(row.id), tipo: row.tipo, nombre: row.nombre, subidoPor: row.subido_por, cuando: row.cuando, vigencia, vence };
      });
  });

export const subirDocumento = createServerFn({ method: "POST" })
  .validator((input: { casoId: number; tipo: string; nombre: string; archivo: string; lectura?: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await quien(context.userId);
    const caso = await casoDe(data.casoId);
    if (!caso || !puedeVer(profile.role, context.userId, caso)) throw new Error("No encontré ese proceso");
    const dueno = (caso.owner_id === context.userId && llevaProcesos(profile.role)) || configura(profile.role);
    if (!dueno) throw new Error("Los documentos los sube el asesor");
    const tipo = tipoDoc(data.tipo);
    const nombre = data.nombre.trim().slice(0, 120) || etiquetaDoc(tipo);
    if (!data.archivo || data.archivo.length < 40) throw new Error("El archivo llegó vacío");
    if (data.archivo.length > 42_000_000) throw new Error("El archivo pesa más de 30 MB");
    const sql = await getSql();
    const { guardarEnDrive } = await import("./drive.server");
    const drive = await guardarEnDrive(`${caso.placa}-${nombre}`, data.archivo, caso.placa);
    const guardarCopia = !drive.enLaNube;
    const lectura = (data.lectura ?? "").slice(0, 8000);
    await sql.query(
      `insert into documentos (caso_id, tipo, nombre, archivo, subido_por, drive_id, lectura) values ($1, $2, $3, $4, $5, $6, $7)`,
      [caso.id, tipo, nombre, guardarCopia ? data.archivo : "", profile.name, drive.id, lectura],
    );
    if (tipo === "comprobante" && caso.mano === "via") {
      await sql.query(`update casos set via_estado = 'comprobante', updated_at = now() where id = $1 and via_estado in ('pedido', 'enlace', 'no_coincide')`, [caso.id]);
      await aviso(caso.id, context.userId, `El asesor subió el comprobante de pago de ${caso.placa}.`);
    }
    if (tipo !== "comprobante") {
      await sql.query(`update casos set documentos = true, updated_at = now() where id = $1`, [caso.id]);
    }
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "subio",
      entidad: "proceso",
      entidadId: caso.id,
      etiqueta: caso.placa,
      detalle: `Subió ${etiquetaDoc(tipo)} en ${caso.placa}: ${nombre}`,
    });
    return { ok: true };
  });

export const recibirTrozo = createServerFn({ method: "POST" })
  .validator((input: { cargaId: string; orden: number; datos: string; fin: boolean; casoId: number; tipo: string; nombre: string; lectura?: string; reemplazaId?: number }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    if (!/^[\w-]{8,80}$/.test(data.cargaId)) throw new Error("La carga no sirve");
    if (data.orden < 0 || data.orden > 80) throw new Error("La carga no sirve");
    if (data.datos.length > 700_000) throw new Error("El trozo es muy grande");
    const profile = await quien(context.userId);
    const caso = await casoDe(data.casoId);
    if (!caso || !puedeVer(profile.role, context.userId, caso)) throw new Error("No encontré ese proceso");
    const dueno = (caso.owner_id === context.userId && llevaProcesos(profile.role)) || configura(profile.role);
    if (!dueno) throw new Error("Los documentos los sube el asesor");
    const tipo = tipoDoc(data.tipo);
    const nombre = data.nombre.trim().slice(0, 120) || etiquetaDoc(tipo);
    const sql = await getSql();
    await asegurarCargas(sql);
    await sql.query(
      `insert into carga_trozos (carga_id, orden, datos, caso_id, tipo, nombre, lectura, reemplaza_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (carga_id, orden) do update set datos = excluded.datos`,
      [data.cargaId, data.orden, data.datos, caso.id, tipo, nombre, (data.lectura ?? "").slice(0, 8000), data.reemplazaId ?? 0],
    );
    if (!data.fin) return { ok: true };
    const partes = await sql.query<{ datos: string }>(
      `select datos from carga_trozos where carga_id = $1 order by orden`,
      [data.cargaId],
    );
    const archivo = partes.map((parte) => parte.datos).join("");
    await sql.query(`delete from carga_trozos where carga_id = $1`, [data.cargaId]);
    if (archivo.length < 40) throw new Error("El archivo llegó vacío");
    if (archivo.length > 42_000_000) throw new Error("El archivo pesa más de 30 MB");
    const { guardarEnDrive } = await import("./drive.server");
    const drive = await guardarEnDrive(`${caso.placa}-${nombre}`, archivo, caso.placa);
    const copia = drive.enLaNube ? "" : archivo;
    const lectura = (data.lectura ?? "").slice(0, 8000);
    if (data.reemplazaId) {
      const previos = await sql.query<{ drive_id: string }>(`select drive_id from documentos where id = $1 and caso_id = $2`, [data.reemplazaId, caso.id]);
      const previo = previos[0];
      if (!previo) throw new Error("No encontré ese archivo");
      if (previo.drive_id && previo.drive_id !== drive.id) {
        const { borrarDeDrive } = await import("./drive.server");
        await borrarDeDrive(previo.drive_id);
      }
      await sql.query(`update documentos set nombre = $1, archivo = $2, drive_id = $3 where id = $4`, [nombre, copia, drive.id || previo.drive_id, data.reemplazaId]);
    } else if (tipo === "contrato") {
      const ya = await sql.query<{ id: number; drive_id: string }>(
        `select id, drive_id from documentos where caso_id = $1 and tipo = 'contrato' order by id desc limit 1`,
        [caso.id],
      );
      if (ya[0]) {
        if (ya[0].drive_id && ya[0].drive_id !== drive.id) {
          const { borrarDeDrive } = await import("./drive.server");
          await borrarDeDrive(ya[0].drive_id);
        }
        await sql.query(`update documentos set nombre = $1, archivo = $2, subido_por = $3, drive_id = $4, lectura = $5 where id = $6`, [
          nombre, copia, profile.name, drive.id || ya[0].drive_id, lectura, ya[0].id,
        ]);
      } else {
        await sql.query(
          `insert into documentos (caso_id, tipo, nombre, archivo, subido_por, drive_id, lectura) values ($1, $2, $3, $4, $5, $6, $7)`,
          [caso.id, tipo, nombre, copia, profile.name, drive.id, lectura],
        );
      }
    } else {
      await sql.query(
        `insert into documentos (caso_id, tipo, nombre, archivo, subido_por, drive_id, lectura) values ($1, $2, $3, $4, $5, $6, $7)`,
        [caso.id, tipo, nombre, copia, profile.name, drive.id, lectura],
      );
    }
    if (tipo === "comprobante" && caso.mano === "via") {
      await sql.query(`update casos set via_estado = 'comprobante', updated_at = now() where id = $1 and via_estado in ('pedido', 'enlace', 'no_coincide')`, [caso.id]);
      await aviso(caso.id, context.userId, `El asesor subió el comprobante de pago de ${caso.placa}.`);
    }
    if (tipo !== "comprobante") {
      await sql.query(`update casos set documentos = true, updated_at = now() where id = $1`, [caso.id]);
    }
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: data.reemplazaId ? "cambio" : "subio",
      entidad: "proceso",
      entidadId: caso.id,
      etiqueta: caso.placa,
      detalle: `${data.reemplazaId ? "Cambió" : "Subió"} ${etiquetaDoc(tipo)} en ${caso.placa}: ${nombre}`,
    });
    return { ok: true };
  });

export const parteDocumento = createServerFn({ method: "POST" })
  .validator((input: { id: number; desde: number }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await perfil();
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const sql = await getSql();
    const cargaId = `doc-${data.id}`;
    const desde = Math.max(0, data.desde);
    await asegurarCargas(sql);
    if (desde === 0) {
      const rows = await sql.query<{ caso_id: number; tipo: string; nombre: string; archivo: string; drive_id: string }>(
        `select caso_id, tipo, nombre, archivo, drive_id from documentos where id = $1`,
        [data.id],
      );
      const doc = rows[0];
      if (!doc) throw new Error("No encontré ese archivo");
      const caso = await casoDe(Number(doc.caso_id));
      if (!caso || !puedeVer(profile.role, context.userId, caso)) throw new Error("No encontré ese archivo");
      const permitidos = await docsOperativa();
      if (!puedeArchivo(profile.role, doc.tipo, caso, permitidos)) throw new Error("Ese documento no está habilitado para tu área");
      let archivo = doc.archivo;
      if (!archivo && doc.drive_id) {
        const { leerDeDrive } = await import("./drive.server");
        archivo = await leerDeDrive(doc.drive_id);
      }
      if (!archivo) throw new Error("El archivo no está en Drive ni en el programa");
      await sql.query(`delete from carga_trozos where carga_id = $1`, [cargaId]);
      const tope = 600_000;
      for (let i = 0, orden = 0; i < archivo.length; i += tope, orden += 1) {
        await sql.query(
          `insert into carga_trozos (carga_id, orden, datos, caso_id, tipo, nombre) values ($1, $2, $3, $4, $5, $6)`,
          [cargaId, orden, archivo.slice(i, i + tope), caso.id, doc.tipo, doc.nombre],
        );
      }
    }
    const orden = Math.floor(desde / 600_000);
    const trozo = await sql.query<{ datos: string; nombre: string }>(
      `select datos, nombre from carga_trozos where carga_id = $1 and orden = $2`,
      [cargaId, orden],
    );
    const cuenta = await sql.query<{ n: string }>(`select coalesce(sum(length(datos)), 0)::text as n from carga_trozos where carga_id = $1`, [cargaId]);
    const item = trozo[0];
    if (!item) throw new Error("No encontré ese archivo");
    return { nombre: item.nombre, total: Number(cuenta[0]?.n ?? 0), datos: item.datos };
  });

export const parteCarga = createServerFn({ method: "POST" })
  .validator((input: { cargaId: string; desde: number }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data }) => {
    if (!/^paq-\d+-\d+$/.test(data.cargaId)) throw new Error("No encontré ese archivo");
    const sql = await getSql();
    const orden = Math.floor(Math.max(0, data.desde) / 600_000);
    const trozo = await sql.query<{ datos: string }>(
      `select datos from carga_trozos where carga_id = $1 and orden = $2`,
      [data.cargaId, orden],
    );
    const item = trozo[0];
    if (!item) throw new Error("No encontré ese archivo");
    return { datos: item.datos };
  });

export const leerDocumento = createServerFn({ method: "POST" })
  .validator((input: { tipo: string; nombre: string; archivo: string; actual?: Record<string, string> }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data }) => {
    if (!data.archivo || data.archivo.length < 40) throw new Error("El archivo llegó vacío");
    if (data.archivo.length > 42_000_000) throw new Error("El archivo pesa más de 30 MB");
    const { leerArchivo } = await import("./ocr.server");
    return leerArchivo(data.nombre, data.archivo, data.tipo, data.actual ?? {});
  });

export const leerPaginas = createServerFn({ method: "POST" })
  .validator((input: { paginas: { nombre: string; archivo: string }[]; preferido?: string; actual?: Record<string, string> }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data }) => {
    const paginas = (data.paginas || []).filter((pagina) => pagina.archivo && pagina.archivo.length > 40).slice(0, 8);
    if (!paginas.length) throw new Error("El archivo llegó vacío");
    if (paginas.some((pagina) => pagina.archivo.length > 12_000_000)) throw new Error("Una página pesa demasiado");
    const { leerVarias } = await import("./ocr.server");
    const leidas = await leerVarias(paginas, data.preferido || "", data.actual ?? {});
    return { paginas: leidas };
  });

export const bajarDocumento = createServerFn({ method: "POST" })
  .validator((id: number) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const { profileFor } = await perfil();
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const sql = await getSql();
    const rows = await sql.query<{ caso_id: number; tipo: string; nombre: string; archivo: string; drive_id: string }>(
      `select caso_id, tipo, nombre, archivo, drive_id from documentos where id = $1`,
      [id],
    );
    const doc = rows[0];
    if (!doc) throw new Error("No encontré ese archivo");
    const caso = await casoDe(Number(doc.caso_id));
    if (!caso || !puedeVer(profile.role, context.userId, caso)) throw new Error("No encontré ese archivo");
    const permitidos = await docsOperativa();
    if (!puedeArchivo(profile.role, doc.tipo, caso, permitidos)) throw new Error("Ese documento no está habilitado para tu área");
    let archivo = doc.archivo;
    if (!archivo && doc.drive_id) {
      const { leerDeDrive } = await import("./drive.server");
      archivo = await leerDeDrive(doc.drive_id);
    }
    if (!archivo) throw new Error("El archivo no está en Drive ni en el programa");
    return { nombre: doc.nombre, archivo };
  });

async function duenoDelCaso(userId: string, casoId: number) {
  const profile = await quien(userId);
  const caso = await casoDe(casoId);
  if (!caso) throw new Error("No encontré ese proceso");
  const dueno = (caso.owner_id === userId && llevaProcesos(profile.role)) || configura(profile.role);
  if (!dueno) throw new Error("Eso lo hace el asesor del proceso");
  return { profile, caso };
}

export const borrarDocumento = createServerFn({ method: "POST" })
  .validator((id: number) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    const rows = await sql.query<{ caso_id: number; tipo: string; nombre: string; drive_id: string }>(
      `select caso_id, tipo, nombre, drive_id from documentos where id = $1`,
      [id],
    );
    const doc = rows[0];
    if (!doc) throw new Error("No encontré ese archivo");
    const { profile, caso } = await duenoDelCaso(context.userId, Number(doc.caso_id));
    if (doc.drive_id) {
      const { borrarDeDrive } = await import("./drive.server");
      await borrarDeDrive(doc.drive_id);
    }
    await sql.query(`delete from documentos where id = $1`, [id]);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "borro",
      entidad: "proceso",
      entidadId: caso.id,
      etiqueta: caso.placa,
      detalle: `Borró ${etiquetaDoc(doc.tipo)} de ${caso.placa}: ${doc.nombre}`,
    });
    return { ok: true };
  });

export const reemplazarDocumento = createServerFn({ method: "POST" })
  .validator((input: { id: number; archivo: string; motivo: "giro" | "cambio" }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    if (!data.archivo || data.archivo.length < 40) throw new Error("El archivo llegó vacío");
    if (data.archivo.length > 42_000_000) throw new Error("El archivo pesa más de 30 MB");
    const sql = await getSql();
    const rows = await sql.query<{ caso_id: number; tipo: string; nombre: string; drive_id: string }>(
      `select caso_id, tipo, nombre, drive_id from documentos where id = $1`,
      [data.id],
    );
    const doc = rows[0];
    if (!doc) throw new Error("No encontré ese archivo");
    const { profile, caso } = await duenoDelCaso(context.userId, Number(doc.caso_id));
    const { guardarEnDrive, borrarDeDrive } = await import("./drive.server");
    const drive = await guardarEnDrive(`${caso.placa}-${doc.nombre}`, data.archivo, caso.placa);
    if (doc.drive_id && doc.drive_id !== drive.id) await borrarDeDrive(doc.drive_id);
    await sql.query(`update documentos set archivo = $1, drive_id = $2 where id = $3`, [
      drive.enLaNube ? "" : data.archivo,
      drive.id || doc.drive_id,
      data.id,
    ]);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: data.motivo === "giro" ? "giro" : "cambio",
      entidad: "proceso",
      entidadId: caso.id,
      etiqueta: caso.placa,
      detalle: `${data.motivo === "giro" ? "Giró" : "Cambió"} ${etiquetaDoc(doc.tipo)} de ${caso.placa}: ${doc.nombre}`,
    });
    return { ok: true };
  });

export const ocultarDocumento = createServerFn({ method: "POST" })
  .validator((input: { casoId: number; tipo: string; oculto: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await quien(context.userId);
    const caso = await casoDe(data.casoId);
    if (!caso) throw new Error("No encontré ese proceso");
    const dueno = (caso.owner_id === context.userId && llevaProcesos(profile.role)) || configura(profile.role);
    if (!dueno) throw new Error("Eso lo decide el asesor");
    const tipo = tipoDoc(data.tipo);
    const lista = new Set(docsDe(caso.docs_ocultos));
    if (data.oculto) lista.add(tipo);
    else lista.delete(tipo);
    const sql = await getSql();
    await sql.query(`update casos set docs_ocultos = $1, updated_at = now() where id = $2`, [[...lista].join(","), caso.id]);
    return { ok: true, ocultos: [...lista].join(",") };
  });

export const tomarProceso = createServerFn({ method: "POST" })
  .validator((input: { id: number; soltar: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigir(context.userId);
    const caso = await casoDe(data.id);
    if (!caso) throw new Error("No encontré ese proceso");
    const mano = manoDeRol(profile.role);
    if (!configura(profile.role) && caso.mano !== mano) throw new Error("Ese proceso no está en tu área");
    if (!caso.mano) throw new Error("Ese proceso está con el asesor");
    const sql = await getSql();
    const queda = data.soltar ? "" : profile.slug;
    await sql.query(`update casos set mano_asignado = $1, updated_at = now() where id = $2`, [queda, caso.id]);
    const texto = queda ? `${profile.name} tomó ${caso.placa}.` : `${profile.name} soltó ${caso.placa}. Sigue visible para toda el área.`;
    await aviso(caso.id, context.userId, texto);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, { accion: "movio", entidad: "proceso", entidadId: caso.id, etiqueta: caso.placa, detalle: texto });
    return { asignado: queda };
  });

export const guardarDevolucion = createServerFn({ method: "POST" })
  .validator((input: { id: number; texto: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigir(context.userId);
    const caso = await casoDe(data.id);
    if (!caso) throw new Error("No encontré ese proceso");
    const dueno = (caso.owner_id === context.userId && llevaProcesos(profile.role)) || configura(profile.role);
    if (!dueno) throw new Error("La devolución la anota el asesor");
    const texto = data.texto.trim().slice(0, 300);
    const sql = await getSql();
    await sql.query(`update casos set devolucion = $1, updated_at = now() where id = $2`, [texto, caso.id]);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "edito",
      entidad: "proceso",
      entidadId: caso.id,
      etiqueta: caso.placa,
      detalle: texto ? `Anotó devolución de ${caso.placa}, en desarrollo: ${texto}` : `Quitó la nota de devolución de ${caso.placa}`,
    });
    return { ok: true };
  });

export const quitarUsuarioBandeja = createServerFn({ method: "POST" })
  .validator((slug: string) => slug)
  .middleware([authMiddleware])
  .handler(async ({ context, data: slug }) => {
    const { profileFor } = await perfil();
    const profile = await profileFor(context.userId);
    if (!profile || !configura(profile.role)) throw new Error("Solo David quita estos usuarios");
    const sql = await getSql();
    const rows = await sql.query<{ user_id: string; role: string; name: string }>(
      `select user_id, role, name from profiles where slug = $1`,
      [slug],
    );
    const persona = rows[0];
    if (!persona || !esBandeja(persona.role)) throw new Error("Ese usuario no es de Vía Seguros, operativa o servicio");
    await sql.query(`delete from "session" where "userId" = $1`, [persona.user_id]);
    await sql.query(`delete from claves_equipo where user_id = $1`, [persona.user_id]);
    await sql.query(`delete from profiles where user_id = $1`, [persona.user_id]);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "borro",
      entidad: "piloto",
      etiqueta: slug,
      detalle: `Quitó el acceso de ${persona.name} (${slug})`,
    });
    return { ok: true };
  });

export type FilaMano = {
  id: number;
  placa: string;
  nombre: string;
  ownerName: string;
  viaEstado: string;
  opTarjeta: string;
  bonos: string;
  asignado: string;
};

export const tableroPiloto = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { profileFor } = await perfil();
    const profile = await profileFor(context.userId);
    if (!profile || !veElEquipo(profile.role)) throw new Error("Eso lo ve coordinación");
    const sql = await getSql();
    const rows = await sql.query<{
      id: number;
      placa: string;
      nombre: string;
      owner_name: string;
      mano: string;
      via_estado: string;
      op_tarjeta: string;
      bonos: string;
      mano_asignado: string;
    }>(
      `select c.id, c.placa, c.nombre, p.name as owner_name, c.mano, c.via_estado, c.op_tarjeta, c.bonos, c.mano_asignado
       from casos c join profiles p on p.user_id = c.owner_id
       where c.mano in ('via', 'operativa', 'servicio')
       order by c.updated_at desc`,
    );
    const fila = (mano: string): FilaMano[] =>
      rows
        .filter((row) => row.mano === mano)
        .map((row) => ({
          id: Number(row.id),
          placa: row.placa,
          nombre: row.nombre,
          ownerName: row.owner_name,
          viaEstado: row.via_estado,
          opTarjeta: row.op_tarjeta,
          bonos: row.bonos,
          asignado: row.mano_asignado,
        }));
    return { via: fila("via"), operativa: fila("operativa"), servicio: fila("servicio") };
  });

export const lineaDelProceso = createServerFn({ method: "POST" })
  .validator((casoId: number) => casoId)
  .middleware([authMiddleware])
  .handler(async ({ context, data: casoId }) => {
    const { profileFor } = await perfil();
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const caso = await casoDe(casoId);
    if (!caso || !puedeVer(profile.role, context.userId, caso)) throw new Error("No encontré ese proceso");
    const sql = await getSql();
    const rows = await sql.query<{ actor: string; detalle: string; cuando: string }>(
      `select actor_name as actor, detalle, to_char(created_at at time zone 'America/Bogota', 'DD/MM HH24:MI') as cuando
       from auditoria
       where entidad_id = $1 and entidad in ('proceso', 'poliza') and accion in ('movio', 'subio')
       order by id asc
       limit 40`,
      [String(casoId)],
    );
    return rows.map((row) => ({ actor: row.actor, detalle: row.detalle, cuando: row.cuando }));
  });

export const bajarPaquete = createServerFn({ method: "POST" })
  .validator((casoId: number) => casoId)
  .middleware([authMiddleware])
  .handler(async ({ context, data: casoId }) => {
    const { profileFor } = await perfil();
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const caso = await casoDe(casoId);
    if (!caso || !puedeVer(profile.role, context.userId, caso)) throw new Error("No encontré ese proceso");
    if (profile.role === "via_seguros" || profile.role === "servicio") throw new Error("El paquete lo imprime operativa");
    const permitidos = await docsOperativa();
    const sql = await getSql();
    const rows = await sql.query<{ tipo: string; nombre: string; archivo: string; drive_id: string }>(
      `select tipo, nombre, archivo, drive_id from documentos where caso_id = $1 order by id`,
      [casoId],
    );
    const lista = rows.filter((row) => puedeArchivo(profile.role, row.tipo, caso, permitidos));
    if (!lista.length) throw new Error("No hay documentos para imprimir");
    const { leerDeDrive } = await import("./drive.server");
    const { PDFDocument } = await import("pdf-lib");
    const out = await PDFDocument.create();
    let metio = 0;
    for (const doc of lista) {
      let crudo = doc.archivo;
      if (!crudo && doc.drive_id) crudo = await leerDeDrive(doc.drive_id);
      if (!crudo) continue;
      const raw = bytesDe(crudo);
      const nombre = doc.nombre.toLowerCase();
      const vecesConfig = await (await import("./gerencia.functions")).copiasConfig(caso.ciudad_id, doc.tipo);
      const veces = vecesConfig && vecesConfig > 0 ? vecesConfig : copiasAlImprimir(doc.tipo);
      try {
        if (nombre.endsWith(".pdf") || (raw[0] === 0x25 && raw[1] === 0x50)) {
          const src = await PDFDocument.load(raw, { ignoreEncryption: true });
          for (let copia = 0; copia < veces; copia += 1) {
            const pages = await out.copyPages(src, src.getPageIndices());
            for (const page of pages) out.addPage(page);
          }
          metio += 1;
        } else if (nombre.endsWith(".jpg") || nombre.endsWith(".jpeg") || raw[0] === 0xff) {
          const img = await out.embedJpg(raw);
          for (let copia = 0; copia < veces; copia += 1) {
            const page = out.addPage([612, 792]);
            const scale = Math.min(560 / img.width, 740 / img.height);
            page.drawImage(img, { x: 26, y: 792 - 26 - img.height * scale, width: img.width * scale, height: img.height * scale });
          }
          metio += 1;
        } else if (nombre.endsWith(".png") || raw[0] === 0x89) {
          const img = await out.embedPng(raw);
          for (let copia = 0; copia < veces; copia += 1) {
            const page = out.addPage([612, 792]);
            const scale = Math.min(560 / img.width, 740 / img.height);
            page.drawImage(img, { x: 26, y: 792 - 26 - img.height * scale, width: img.width * scale, height: img.height * scale });
          }
          metio += 1;
        }
      } catch {
        metio += 0;
      }
    }
    if (!metio) throw new Error("Esos archivos no se pudieron juntar. Bájalos uno por uno.");
    const pdf = await out.save();
    const archivo = base64De(pdf);
    const nombre = `${caso.placa}-paquete.pdf`;
    if (archivo.length <= 600_000) return { nombre, archivo, cargaId: "", total: archivo.length };
    await asegurarCargas(sql);
    const cargaId = `paq-${caso.id}-${Date.now()}`;
    const tope = 600_000;
    for (let i = 0, orden = 0; i < archivo.length; i += tope, orden += 1) {
      await sql.query(
        `insert into carga_trozos (carga_id, orden, datos, caso_id, nombre) values ($1, $2, $3, $4, $5)`,
        [cargaId, orden, archivo.slice(i, i + tope), caso.id, nombre],
      );
    }
    return { nombre, archivo: "", cargaId, total: archivo.length };
  });

function bytesDe(value: string) {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64De(bytes: Uint8Array) {
  let texto = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(texto);
}


