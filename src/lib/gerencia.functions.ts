import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { esGerencia } from "@/lib/team.public";
import { estadoDe } from "@/lib/casos";
import { mezclarConfig, CAMPOS_CONTRATO, type CampoContrato, type CiudadConfig, type DocConfig, type FlujoConfig, type PasoConfig } from "@/lib/gerencia";

async function exigirGerencia(userId: string) {
  const { profileFor } = await import("./team.server");
  const profile = await profileFor(userId);
  if (!profile || !esGerencia(profile.role)) throw new Error("Esto es solo de gerencia");
  return profile;
}

function plano(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const ROLES_CIUDAD = ["asesor", "lider", "coordinadora", "via_seguros", "operativa", "servicio"] as const;

function leerJson<T>(value: string, vacio: T): T {
  if (!value.trim()) return vacio;
  try {
    return JSON.parse(value) as T;
  } catch {
    return vacio;
  }
}

async function configDe(ciudadId: number): Promise<CiudadConfig> {
  const sql = await getSql();
  const rows = await sql.query<{
    documentos: string;
    pasos: string;
    textos: string;
    flujo: string;
    contrato_nombre: string;
    contrato_nota: string;
    contrato_campos: string;
  }>(
    `select documentos, pasos, textos, flujo, contrato_nombre, contrato_nota, contrato_campos from ciudad_config where ciudad_id = $1`,
    [ciudadId],
  );
  const fila = rows[0];
  if (!fila) return mezclarConfig(null);
  return mezclarConfig({
    documentos: leerJson<DocConfig[]>(fila.documentos, []),
    pasos: leerJson<PasoConfig[]>(fila.pasos, []),
    textos: leerJson<Record<string, string>>(fila.textos, {}),
    flujo: leerJson<FlujoConfig>(fila.flujo, { operativaAntesDePago: true }),
    contratoNombre: fila.contrato_nombre,
    contratoNota: fila.contrato_nota,
    contratoCampos: leerJson<CampoContrato[]>(fila.contrato_campos || "", CAMPOS_CONTRATO),
  });
}

export const resumenPais = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await exigirGerencia(context.userId);
    const sql = await getSql();
    const ciudades = await sql.query<{
      id: number;
      slug: string;
      nombre: string;
      activa: boolean;
      personas: number;
      abiertos: number;
      polizas: number;
      completados: number;
      caidos: number;
    }>(
      `select ci.id, ci.slug, ci.nombre, ci.activa,
              (select count(*) from profiles p where p.ciudad_id = ci.id)::int as personas,
              (select count(*) from casos c where c.ciudad_id = ci.id and c.completado = false and btrim(c.motivo_cierre) = '')::int as abiertos,
              (select count(*) from casos c where c.ciudad_id = ci.id and c.polizas_subidas = true)::int as polizas,
              (select count(*) from casos c where c.ciudad_id = ci.id and c.completado = true)::int as completados,
              (select count(*) from casos c where c.ciudad_id = ci.id and btrim(c.motivo_cierre) <> '')::int as caidos
       from ciudades ci
       order by ci.id`,
    );
    const totales = ciudades.reduce(
      (acc, ciudad) => ({
        abiertos: acc.abiertos + Number(ciudad.abiertos),
        polizas: acc.polizas + Number(ciudad.polizas),
        completados: acc.completados + Number(ciudad.completados),
        caidos: acc.caidos + Number(ciudad.caidos),
        personas: acc.personas + Number(ciudad.personas),
      }),
      { abiertos: 0, polizas: 0, completados: 0, caidos: 0, personas: 0 },
    );
    return { ciudades, totales };
  });

export const crearCiudad = createServerFn({ method: "POST" })
  .validator((input: { nombre: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigirGerencia(context.userId);
    const nombre = data.nombre.trim();
    if (nombre.length < 3) throw new Error("Falta el nombre de la ciudad");
    const slug = plano(nombre);
    if (slug.length < 3) throw new Error("Ese nombre no sirve como ciudad");
    const sql = await getSql();
    const ya = await sql.query<{ id: number }>(`select id from ciudades where slug = $1`, [slug]);
    if (ya[0]) throw new Error("Esa ciudad ya existe");
    const rows = await sql.query<{ id: number }>(
      `insert into ciudades (slug, nombre) values ($1, $2) returning id`,
      [slug, nombre],
    );
    const id = rows[0]?.id ?? 0;
    const bogota = await sql.query<{ id: number }>(`select id from ciudades where slug = 'bogota'`);
    if (bogota[0]) {
      await sql.query(
        `insert into ciudad_config (ciudad_id, documentos, pasos, textos, flujo, contrato_nombre, contrato_nota)
         select $1, documentos, pasos, textos, flujo, contrato_nombre, contrato_nota
         from ciudad_config where ciudad_id = $2
         on conflict (ciudad_id) do nothing`,
        [id, bogota[0].id],
      );
    }
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, { accion: "creo", entidad: "ciudad", etiqueta: nombre, detalle: `Creó la ciudad ${nombre}` });
    return { id, slug };
  });

export const pausarCiudad = createServerFn({ method: "POST" })
  .validator((input: { id: number; activa: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigirGerencia(context.userId);
    const sql = await getSql();
    const rows = await sql.query<{ slug: string; nombre: string }>(`select slug, nombre from ciudades where id = $1`, [data.id]);
    if (!rows[0]) throw new Error("No encontré esa ciudad");
    if (rows[0].slug === "bogota" && !data.activa) throw new Error("Bogotá no se pausa");
    await sql.query(`update ciudades set activa = $1 where id = $2`, [data.activa, data.id]);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "edito",
      entidad: "ciudad",
      etiqueta: rows[0].nombre,
      detalle: data.activa ? `Reabrió ${rows[0].nombre}` : `Pausó ${rows[0].nombre}`,
    });
    return { ok: true };
  });

export const usuariosCiudad = createServerFn({ method: "GET" })
  .validator((ciudadId: number) => ciudadId)
  .middleware([authMiddleware])
  .handler(async ({ context, data: ciudadId }) => {
    await exigirGerencia(context.userId);
    const sql = await getSql();
    return sql.query<{ slug: string; name: string; role: string; clave: string; activo: boolean }>(
      `select p.slug, p.name, p.role, p.activo, coalesce(k.clave, '') as clave
       from profiles p
       left join claves_equipo k on k.user_id = p.user_id
       where p.ciudad_id = $1
       order by p.name`,
      [ciudadId],
    );
  });

export const crearUsuarioCiudad = createServerFn({ method: "POST" })
  .validator((input: { ciudadId: number; nombre: string; usuario: string; clave: string; rol: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigirGerencia(context.userId);
    const nombre = data.nombre.trim();
    const slug = plano(data.usuario);
    const clave = data.clave.trim();
    if (nombre.length < 3) throw new Error("Falta el nombre");
    if (slug.length < 3) throw new Error("El usuario necesita al menos 3 letras");
    if (clave.length < 8) throw new Error("La clave necesita al menos 8 caracteres");
    if (!ROLES_CIUDAD.includes(data.rol as (typeof ROLES_CIUDAD)[number])) throw new Error("Ese rol no se puede asignar");
    const sql = await getSql();
    const ciudad = await sql.query<{ id: number; nombre: string; activa: boolean }>(
      `select id, nombre, activa from ciudades where id = $1`,
      [data.ciudadId],
    );
    if (!ciudad[0] || !ciudad[0].activa) throw new Error("Esa ciudad no está activa");
    const email = `${slug}@vinculalibre.app`;
    const ya = await sql.query(`select p.slug from profiles p join "user" u on u.id = p.user_id where p.slug = $1 or u.email = $2`, [
      slug,
      email,
    ]);
    if (ya[0]) throw new Error("Ese usuario ya existe");
    const { auth } = await import("./auth/server");
    await auth.api.signUpEmail({ body: { email, password: clave, name: nombre } });
    const usuarios = await sql.query<{ id: string }>(`select id from "user" where email = $1`, [email]);
    const userId = usuarios[0]?.id;
    if (!userId) throw new Error("No pude crear el usuario");
    await sql.query(
      `insert into profiles (user_id, slug, name, role, ciudad_id) values ($1, $2, $3, $4, $5)
       on conflict (user_id) do update set slug = excluded.slug, name = excluded.name, role = excluded.role, ciudad_id = excluded.ciudad_id`,
      [userId, slug, nombre, data.rol, data.ciudadId],
    );
    await sql.query(
      `insert into claves_equipo (user_id, clave) values ($1, $2) on conflict (user_id) do update set clave = excluded.clave, updated_at = now()`,
      [userId, clave],
    );
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "creo",
      entidad: "equipo",
      etiqueta: slug,
      detalle: `Gerencia creó a ${nombre} (${slug}) como ${data.rol} en ${ciudad[0].nombre}`,
    });
    return { ok: true };
  });

export const configMia = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile?.ciudad_id) return mezclarConfig(null);
    return configDe(profile.ciudad_id);
  });

export const leerConfigCiudad = createServerFn({ method: "GET" })
  .validator((ciudadId: number) => ciudadId)
  .middleware([authMiddleware])
  .handler(async ({ context, data: ciudadId }) => {
    await exigirGerencia(context.userId);
    return configDe(ciudadId);
  });

export const guardarConfigCiudad = createServerFn({ method: "POST" })
  .validator((input: { ciudadId: number; config: CiudadConfig }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigirGerencia(context.userId);
    const config = mezclarConfig(data.config);
    const sql = await getSql();
    await sql.query(
      `insert into ciudad_config (ciudad_id, documentos, pasos, textos, flujo, contrato_nombre, contrato_nota, contrato_campos)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (ciudad_id) do update set
         documentos = excluded.documentos,
         pasos = excluded.pasos,
         textos = excluded.textos,
         flujo = excluded.flujo,
         contrato_nombre = excluded.contrato_nombre,
         contrato_nota = excluded.contrato_nota,
         contrato_campos = excluded.contrato_campos`,
      [
        data.ciudadId,
        JSON.stringify(config.documentos),
        JSON.stringify(config.pasos),
        JSON.stringify(config.textos),
        JSON.stringify(config.flujo),
        config.contratoNombre.slice(0, 160),
        config.contratoNota.slice(0, 800),
        JSON.stringify(config.contratoCampos),
      ],
    );
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "edito",
      entidad: "ciudad",
      entidadId: data.ciudadId,
      etiqueta: "Configuración",
      detalle: "Gerencia actualizó documentos, pasos, textos o flujo",
    });
    return { ok: true };
  });

export const entrarCiudad = createServerFn({ method: "POST" })
  .validator((ciudadId: number) => ciudadId)
  .middleware([authMiddleware])
  .handler(async ({ context, data: ciudadId }) => {
    await exigirGerencia(context.userId);
    const sql = await getSql();
    const ciudad = await sql.query<{ id: number }>(`select id from ciudades where id = $1 and activa = true`, [ciudadId]);
    if (!ciudad[0]) throw new Error("Esa ciudad no está activa");
    await sql.query(`update profiles set ciudad_vista = $1 where user_id = $2`, [ciudadId, context.userId]);
    return { ok: true };
  });

export const salirCiudad = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await exigirGerencia(context.userId);
    const sql = await getSql();
    await sql.query(`update profiles set ciudad_vista = null where user_id = $1`, [context.userId]);
    return { ok: true };
  });

export const listarGerencias = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await exigirGerencia(context.userId);
    const sql = await getSql();
    return sql.query<{ slug: string; name: string; clave: string; activo: boolean }>(
      `select p.slug, p.name, p.activo, coalesce(k.clave, '') as clave
       from profiles p
       left join claves_equipo k on k.user_id = p.user_id
       where p.role = 'gerencia'
       order by p.name`,
    );
  });

export const crearOtraGerencia = createServerFn({ method: "POST" })
  .validator((input: { nombre: string; usuario: string; clave: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigirGerencia(context.userId);
    const nombre = data.nombre.trim();
    const slug = plano(data.usuario);
    const clave = data.clave.trim();
    if (nombre.length < 3) throw new Error("Falta el nombre");
    if (slug.length < 3) throw new Error("El usuario necesita al menos 3 letras");
    if (clave.length < 8) throw new Error("La clave necesita al menos 8 caracteres");
    const sql = await getSql();
    const email = `${slug}@vinculalibre.app`;
    const ya = await sql.query(`select p.slug from profiles p join "user" u on u.id = p.user_id where p.slug = $1 or u.email = $2`, [slug, email]);
    if (ya[0]) throw new Error("Ese usuario ya existe");
    const { auth } = await import("./auth/server");
    await auth.api.signUpEmail({ body: { email, password: clave, name: nombre } });
    const usuarios = await sql.query<{ id: string }>(`select id from "user" where email = $1`, [email]);
    const userId = usuarios[0]?.id;
    if (!userId) throw new Error("No pude crear el usuario");
    await sql.query(
      `insert into profiles (user_id, slug, name, role, ciudad_id) values ($1, $2, $3, 'gerencia', null)
       on conflict (user_id) do update set slug = excluded.slug, name = excluded.name, role = 'gerencia', ciudad_id = null`,
      [userId, slug, nombre],
    );
    await sql.query(
      `insert into claves_equipo (user_id, clave) values ($1, $2) on conflict (user_id) do update set clave = excluded.clave, updated_at = now()`,
      [userId, clave],
    );
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, { accion: "creo", entidad: "equipo", etiqueta: slug, detalle: `Gerencia creó otro acceso de país para ${nombre}` });
    return { ok: true };
  });

export const claveUsuario = createServerFn({ method: "POST" })
  .validator((input: { slug: string; clave: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigirGerencia(context.userId);
    const clave = data.clave.trim();
    if (clave.length < 8) throw new Error("La clave necesita al menos 8 caracteres");
    const sql = await getSql();
    const dueños = await sql.query<{ user_id: string; name: string }>(`select user_id, name from profiles where slug = $1 and role <> 'gerencia'`, [data.slug]);
    const persona = dueños[0];
    if (!persona) throw new Error("No encontré a esa persona");
    const { hashPassword } = await import("better-auth/crypto");
    const hash = await hashPassword(clave);
    await sql.query(`update "account" set password = $1, "updatedAt" = now() where "userId" = $2 and "providerId" = 'credential'`, [hash, persona.user_id]);
    await sql.query(
      `insert into claves_equipo (user_id, clave) values ($1, $2) on conflict (user_id) do update set clave = excluded.clave, updated_at = now()`,
      [persona.user_id, clave],
    );
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, { accion: "edito", entidad: "clave", etiqueta: data.slug, detalle: `Gerencia cambió la clave de ${persona.name}` });
    return { ok: true };
  });

export const estadoUsuario = createServerFn({ method: "POST" })
  .validator((input: { slug: string; activo: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigirGerencia(context.userId);
    if (data.slug === profile.slug) throw new Error("No puedes desactivar tu propio usuario");
    const sql = await getSql();
    const rows = await sql.query<{ name: string }>(`update profiles set activo = $1 where slug = $2 and user_id <> $3 returning name`, [data.activo, data.slug, context.userId]);
    if (!rows[0]) throw new Error("No encontré a esa persona");
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "edito",
      entidad: "equipo",
      etiqueta: data.slug,
      detalle: data.activo ? `Gerencia reactivó a ${rows[0].name}` : `Gerencia desactivó a ${rows[0].name}`,
    });
    return { ok: true };
  });

type FilaProceso = {
  id: number;
  placa: string;
  nombre: string;
  asesor: string;
  empresa: string;
  origen: string;
  motivo_cierre: string;
  dias: number;
  dijo_si: boolean;
  cedula: boolean;
  tarjeta_propiedad: boolean;
  tarjeta_operacion: boolean;
  soat: boolean;
  tecnomecanica: boolean;
  formulario: boolean;
  documentos: boolean;
  firma_carta: boolean;
  firma_contrato: boolean;
  plata_poliza: boolean;
  via_seguros: boolean;
  polizas_subidas: boolean;
  operativa: boolean;
  estado_tarjeta: string;
  tarjeta_entregada: boolean;
  completado: boolean;
  poliza_fase: string;
  poliza_entrega: string;
  cita_fecha: string;
};

const COLUMNAS_ETAPA = `
  c.id, c.placa, c.nombre, p.name as asesor,
  coalesce(nullif(btrim(c.empresa), ''), 'Sin empresa') as empresa,
  coalesce(nullif(btrim(c.origen), ''), 'Sin origen') as origen,
  c.motivo_cierre, c.cita_fecha,
  greatest(0, (current_date - c.created_at::date))::int as dias,
  c.dijo_si, c.cedula, c.tarjeta_propiedad, c.tarjeta_operacion, c.soat, c.tecnomecanica,
  c.formulario, c.documentos, c.firma_carta, c.firma_contrato, c.plata_poliza, c.via_seguros,
  c.polizas_subidas, c.operativa, c.estado_tarjeta, c.tarjeta_entregada, c.completado,
  c.poliza_fase, c.poliza_entrega
`;

function etapaDe(fila: FilaProceso) {
  return estadoDe({
    dijoSi: fila.dijo_si,
    cedula: fila.cedula,
    tarjetaPropiedad: fila.tarjeta_propiedad,
    tarjetaOperacion: fila.tarjeta_operacion,
    soat: fila.soat,
    tecnomecanica: fila.tecnomecanica,
    formulario: fila.formulario,
    documentos: fila.documentos,
    firmaCarta: fila.firma_carta,
    firmaContrato: fila.firma_contrato,
    plataPoliza: fila.plata_poliza,
    viaSeguros: fila.via_seguros,
    polizasSubidas: fila.polizas_subidas,
    operativa: fila.operativa,
    tarjetaEntregada: fila.tarjeta_entregada,
    completado: fila.completado,
    estadoTarjeta: fila.estado_tarjeta,
    motivoCierre: fila.motivo_cierre,
    polizaFase: fila.poliza_fase as "" | "espera" | "recibida" | "avisada",
    polizaEntrega: fila.poliza_entrega as "" | "pide_foto" | "pide_final" | "foto" | "final",
  });
}

export const procesosCiudad = createServerFn({ method: "GET" })
  .validator((ciudadId: number) => ciudadId)
  .middleware([authMiddleware])
  .handler(async ({ context, data: ciudadId }) => {
    await exigirGerencia(context.userId);
    const sql = await getSql();
    const filas = await sql.query<FilaProceso>(
      `select ${COLUMNAS_ETAPA}
       from casos c
       join profiles p on p.user_id = c.owner_id
       where coalesce(c.ciudad_id, 1) = $1
       order by c.updated_at desc
       limit 80`,
      [ciudadId],
    );
    return filas.map((fila) => ({
      id: fila.id,
      placa: fila.placa,
      nombre: fila.nombre,
      estado: etapaDe(fila),
      asesor: fila.asesor,
      dias: fila.dias,
    }));
  });

export const informeCiudad = createServerFn({ method: "GET" })
  .validator((ciudadId: number) => ciudadId)
  .middleware([authMiddleware])
  .handler(async ({ context, data: ciudadId }) => {
    await exigirGerencia(context.userId);
    const sql = await getSql();
    const filas = await sql.query<FilaProceso>(
      `select ${COLUMNAS_ETAPA}
       from casos c
       join profiles p on p.user_id = c.owner_id
       where coalesce(c.ciudad_id, 1) = $1`,
      [ciudadId],
    );
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const mes = hoy.slice(0, 7);
    const embudoMapa = new Map<string, number>();
    const empresaMapa = new Map<string, { total: number; polizas: number }>();
    const origenMapa = new Map<string, { total: number; polizas: number }>();
    const motivoMapa = new Map<string, number>();
    for (const fila of filas) {
      const estado = etapaDe(fila);
      embudoMapa.set(estado, (embudoMapa.get(estado) ?? 0) + 1);
      const empresa = empresaMapa.get(fila.empresa) ?? { total: 0, polizas: 0 };
      empresa.total += 1;
      if (fila.polizas_subidas) empresa.polizas += 1;
      empresaMapa.set(fila.empresa, empresa);
      const origen = origenMapa.get(fila.origen) ?? { total: 0, polizas: 0 };
      origen.total += 1;
      if (fila.polizas_subidas) origen.polizas += 1;
      origenMapa.set(fila.origen, origen);
      const motivo = fila.motivo_cierre.trim();
      if (motivo) motivoMapa.set(motivo, (motivoMapa.get(motivo) ?? 0) + 1);
    }
    const demorados = filas
      .filter((fila) => !fila.completado && !fila.motivo_cierre.trim())
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 8)
      .map((fila) => ({ placa: fila.placa, nombre: fila.nombre, estado: etapaDe(fila), dias: fila.dias }));
    const citas = filas
      .filter((fila) => !fila.completado && !fila.motivo_cierre.trim() && /^\d{4}-\d{2}-\d{2}$/.test(fila.cita_fecha) && fila.cita_fecha < hoy)
      .sort((a, b) => a.cita_fecha.localeCompare(b.cita_fecha))
      .slice(0, 12)
      .map((fila) => ({ placa: fila.placa, nombre: fila.nombre, cita_fecha: fila.cita_fecha }));
    const metas = await sql.query<{ nombre: string; meta: number; hechas: number }>(
      `select p.name as nombre, coalesce(m.meta, 0)::int as meta,
              count(c.id) filter (where c.polizas_subidas and c.fecha_poliza like $2 || '%')::int as hechas
       from profiles p
       left join metas_mes m on m.owner_id = p.user_id and m.mes = $2
       left join casos c on c.owner_id = p.user_id and coalesce(c.ciudad_id, 1) = $1
       where p.ciudad_id = $1 and p.role in ('asesor', 'lider') and p.activo = true
       group by p.name, m.meta
       order by p.name`,
      [ciudadId, mes],
    );
    const ordenar = (mapa: Map<string, { total: number; polizas: number }>) =>
      [...mapa.entries()].map(([nombre, valor]) => ({ nombre, ...valor })).sort((a, b) => b.total - a.total).slice(0, 12);
    return {
      embudo: [...embudoMapa.entries()].map(([estado, total]) => ({ estado, total })).sort((a, b) => b.total - a.total),
      empresas: ordenar(empresaMapa).map((fila) => ({ empresa: fila.nombre, total: fila.total, polizas: fila.polizas })),
      origenes: ordenar(origenMapa).map((fila) => ({ origen: fila.nombre, total: fila.total, polizas: fila.polizas })),
      motivos: [...motivoMapa.entries()].map(([motivo, total]) => ({ motivo, total })).sort((a, b) => b.total - a.total).slice(0, 8),
      demorados,
      citas,
      metas,
    };
  });

export const marcarPasoExtra = createServerFn({ method: "POST" })
  .validator((input: { casoId: number; paso: string; on: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const paso = data.paso.replace(/[^a-z0-9_]/g, "");
    if (!paso) throw new Error("Ese paso no sirve");
    const sql = await getSql();
    const rows = await sql.query<{ pasos_extra: string; ciudad_id: number | null }>(
      `select pasos_extra, ciudad_id from casos where id = $1`,
      [data.casoId],
    );
    if (!rows[0]) throw new Error("No encontré ese proceso");
    if (profile.ciudad_id && rows[0].ciudad_id && profile.ciudad_id !== rows[0].ciudad_id && !esGerencia(profile.role)) {
      throw new Error("Ese proceso es de otra ciudad");
    }
    const mapa = leerJson<Record<string, boolean>>(rows[0].pasos_extra, {});
    mapa[paso] = data.on;
    await sql.query(`update casos set pasos_extra = $1, updated_at = now() where id = $2`, [JSON.stringify(mapa), data.casoId]);
    return { pasos: mapa };
  });

export const leerPasosExtra = createServerFn({ method: "GET" })
  .validator((casoId: number) => casoId)
  .middleware([authMiddleware])
  .handler(async ({ data: casoId }) => {
    const sql = await getSql();
    const rows = await sql.query<{ pasos_extra: string }>(`select pasos_extra from casos where id = $1`, [casoId]);
    return leerJson<Record<string, boolean>>(rows[0]?.pasos_extra ?? "", {});
  });

export const parteContrato = createServerFn({ method: "POST" })
  .validator((input: { ciudadId: number; cargaId: string; orden: number; datos: string; fin: boolean; nombre: string; campos: CampoContrato[] }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await exigirGerencia(context.userId);
    if (data.datos.length > 700_000) throw new Error("Ese trozo pesa demasiado");
    const sql = await getSql();
    await sql.query(
      `insert into carga_trozos (carga_id, orden, datos, caso_id, tipo, nombre) values ($1, $2, $3, 0, 'contrato_ciudad', $4)
       on conflict (carga_id, orden) do update set datos = excluded.datos`,
      [data.cargaId, data.orden, data.datos, data.nombre.slice(0, 160)],
    );
    if (!data.fin) return { ok: true };
    const trozos = await sql.query<{ datos: string }>(`select datos from carga_trozos where carga_id = $1 order by orden`, [data.cargaId]);
    const pdf = trozos.map((t) => t.datos).join("");
    const campos = (data.campos.length ? data.campos : CAMPOS_CONTRATO).slice(0, 20);
    await sql.query(
      `insert into ciudad_config (ciudad_id, contrato_nombre, contrato_pdf, contrato_campos)
       values ($1, $2, $3, $4)
       on conflict (ciudad_id) do update set contrato_nombre = excluded.contrato_nombre, contrato_pdf = excluded.contrato_pdf, contrato_campos = excluded.contrato_campos`,
      [data.ciudadId, data.nombre.slice(0, 160), pdf, JSON.stringify(campos)],
    );
    await sql.query(`delete from carga_trozos where carga_id = $1`, [data.cargaId]);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, { accion: "subio", entidad: "ciudad", entidadId: data.ciudadId, etiqueta: data.nombre, detalle: "Gerencia subió el formato de contrato de la ciudad" });
    return { ok: true };
  });

export const seriePais = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await exigirGerencia(context.userId);
    const sql = await getSql();
    return sql.query<{ mes: string; ciudad: string; procesos: number; polizas: number; completados: number }>(
      `select to_char(c.created_at at time zone 'America/Bogota', 'YYYY-MM') as mes,
              coalesce(ci.nombre, 'Bogotá') as ciudad,
              count(*)::int as procesos,
              count(*) filter (where c.polizas_subidas)::int as polizas,
              count(*) filter (where c.completado)::int as completados
       from casos c
       left join ciudades ci on ci.id = c.ciudad_id
       group by 1, 2
       order by 1, 2`,
    );
  });

export const pdfDeCiudad = createServerFn({ method: "GET" })
  .validator((ciudadId: number) => ciudadId)
  .middleware([authMiddleware])
  .handler(async ({ context, data: ciudadId }) => {
    await exigirGerencia(context.userId);
    const sql = await getSql();
    const rows = await sql.query<{ contrato_pdf: string }>(`select contrato_pdf from ciudad_config where ciudad_id = $1`, [ciudadId]);
    if (rows[0]?.contrato_pdf) return { pdf: rows[0].contrato_pdf, oficial: false };
    const { PLANTILLA } = await import("./contrato-plantilla");
    return { pdf: PLANTILLA, oficial: true };
  });

export async function plantillaDeCaso(casoId: number) {
  const sql = await getSql();
  const rows = await sql.query<{ contrato_pdf: string; contrato_campos: string }>(
    `select ci.contrato_pdf, ci.contrato_campos
     from casos c
     join ciudad_config ci on ci.ciudad_id = c.ciudad_id
     where c.id = $1`,
    [casoId],
  );
  const fila = rows[0];
  if (!fila?.contrato_pdf) return undefined;
  const campos = leerJson<CampoContrato[]>(fila.contrato_campos, []);
  return { pdf: fila.contrato_pdf, campos: campos.length ? campos : CAMPOS_CONTRATO };
}

export async function flujoDeCiudad(ciudadId: number | null | undefined) {
  if (!ciudadId) return { operativaAntesDePago: true };
  const config = await configDe(ciudadId);
  return config.flujo;
}

export async function copiasConfig(ciudadId: number | null | undefined, tipo: string) {
  if (!ciudadId) return null;
  const config = await configDe(ciudadId);
  return config.documentos.find((doc) => doc.id === tipo)?.copias ?? null;
}
