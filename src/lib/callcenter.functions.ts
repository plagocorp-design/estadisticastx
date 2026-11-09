import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { hoyBogota } from "@/lib/casos";
import { horaBogota } from "@/lib/bitacora";
import { llevaProcesos, veElEquipo } from "@/lib/team.public";
import {
  BRIEFING_BASE,
  BRIEFING_SEMILLA,
  armarSao,
  duracionTexto,
  esWhatsapp,
  fechaIso,
  limpiarBase,
  normalizar,
  telefonoBase,
  type ContactoCall,
  type ContactoLimpio,
  type GestionImportada,
  type GestionVista,
  type LlamadaDraft,
  type TipoPersona,
} from "@/lib/callcenter";

type Perfil = {
  user_id: string;
  slug: string;
  name: string;
  role: string;
  ciudad_id: number | null;
  ciudad_vista: number | null;
};

function ciudadDe(profile: Perfil) {
  if (profile.role === "gerencia") return profile.ciudad_vista || profile.ciudad_id || 1;
  return profile.ciudad_id || 1;
}

async function perfilDe(userId: string) {
  const { profileFor } = await import("./team.server");
  const profile = await profileFor(userId);
  if (!profile) throw new Error("No encontré tu usuario");
  if (!llevaProcesos(profile.role) && !veElEquipo(profile.role)) throw new Error("El call center es del equipo comercial");
  return profile as Perfil;
}

function texto(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function flag(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "on";
}

function tipoPersona(value: string): TipoPersona {
  return value === "propietario" || value === "desconocido" ? value : "conductor";
}

const PENDIENTE = `
  (
    exists (
      select 1 from call_gestiones g
      where g.contacto_id = c.id
        and g.id = (select max(g2.id) from call_gestiones g2 where g2.contacto_id = c.id)
        and lower(g.proxima) in ('llamar', 'whatsapp', 'agendar')
        and (g.fecha_proxima = '' or g.fecha_proxima <= $HOY)
        and lower(coalesce(g.resultado, '')) <> 'afiliado'
    )
    or (
      not exists (select 1 from call_gestiones g where g.contacto_id = c.id)
      and not exists (
        select 1 from call_contactos o
        where o.ciudad_id = c.ciudad_id
          and o.empresa = c.empresa
          and o.placa = c.placa
          and o.placa <> ''
          and o.id <> c.id
          and exists (select 1 from call_gestiones g where g.contacto_id = o.id)
      )
    )
  )
`;

function visible() {
  return `
    c.ciudad_id = $1
    and $3::text <> ''
    and exists (
      select 1 from call_empresas e
      where e.ciudad_id = c.ciudad_id and e.empresa = c.empresa and e.activa = 1
    )
    and (
      not exists (
        select 1 from call_asignaciones a
        where a.ciudad_id = c.ciudad_id and a.empresa = c.empresa
      )
      or exists (
        select 1 from call_asignaciones a
        where a.ciudad_id = c.ciudad_id and a.empresa = c.empresa and a.slug = $2
      )
    )
    and (
      exists (
        select 1 from call_gestiones g
        where g.contacto_id = c.id
          and g.id = (select max(g2.id) from call_gestiones g2 where g2.contacto_id = c.id)
          and g.asesor_slug = $2
      )
      or (
        not exists (
          select 1 from call_gestiones g
          where g.contacto_id = c.id and coalesce(g.asesor_slug, '') <> ''
        )
        and c.turno_slug = $2
      )
    )
  `;
}

type FilaContacto = {
  id: number;
  empresa: string;
  nombre: string;
  estado: string;
  telefono: string;
  propietario: string;
  tel_propietario: string;
  vehiculo: string;
  placa: string;
  anio: string;
  cc: string;
  duplicado: number;
  caso_id: number | null;
  orden: number;
};

type FilaGestion = {
  id: number;
  asesor_nombre: string;
  fecha: string;
  hora: string;
  segundos: number;
  tipo_persona: string;
  nombre_prop: string;
  cc: string;
  tel_prop: string;
  tiene_nuevo: number;
  nuevo_nombre: string;
  nuevo_tel: string;
  solo_propietario: number;
  clasificacion: string;
  calificacion: string;
  obs_conductor: string;
  obs_propietario: string;
  intencion: string;
  proxima: string;
  fecha_proxima: string;
  no_aplica_proxima: number;
  resultado: string;
  fecha_afiliacion: string;
  no_aplica_afiliacion: number;
  motivo: string;
  observacion_final: string;
  caso_id: number | null;
};

function aGestion(row: FilaGestion | undefined): GestionVista | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    asesor: row.asesor_nombre,
    fecha: String(row.fecha || "").slice(0, 10),
    hora: String(row.hora || "").slice(0, 5),
    segundos: Number(row.segundos) || 0,
    tipoPersona: row.tipo_persona,
    nombre: row.nombre_prop,
    cc: row.cc,
    tel: row.tel_prop,
    tieneNuevo: Number(row.tiene_nuevo) === 1,
    nuevoNombre: row.nuevo_nombre,
    nuevoTel: row.nuevo_tel,
    soloPropietario: Number(row.solo_propietario) === 1,
    clasificacion: row.clasificacion,
    calificacion: row.calificacion,
    conductor: row.obs_conductor,
    propietario: row.obs_propietario,
    intencion: row.intencion,
    proxima: row.proxima,
    fechaProxima: String(row.fecha_proxima || "").slice(0, 10),
    noAplicaProxima: Number(row.no_aplica_proxima) === 1,
    resultado: row.resultado,
    fechaAfiliacion: String(row.fecha_afiliacion || "").slice(0, 10),
    noAplicaAfiliacion: Number(row.no_aplica_afiliacion) === 1,
    motivo: row.motivo,
    observacionFinal: row.observacion_final,
    casoId: row.caso_id,
  };
}

async function armarContacto(sql: Sql, ciudad: number, slug: string, fila: FilaContacto, hoy: string): Promise<ContactoCall> {
  const where = visible();
  const paramsBase = [ciudad, slug, hoy];
  const [totalRow, pendRow, posRow, ant, sig, libre, hoyRow, gestiones] = await Promise.all([
    sql.query<{ n: number }>(`select count(*)::int as n from call_contactos c where ${where}`, paramsBase),
    sql.query<{ n: number }>(
      `select count(*)::int as n from call_contactos c where ${where} and ${PENDIENTE.replaceAll("$HOY", "$3")}`,
      paramsBase,
    ),
    sql.query<{ n: number }>(
      `select count(*)::int as n from call_contactos c where ${where} and (c.empresa, c.orden, c.id) <= ($4, $5, $6)`,
      [...paramsBase, fila.empresa, Number(fila.orden), Number(fila.id)],
    ),
    sql.query<{ id: number }>(
      `select c.id from call_contactos c where ${where} and (c.empresa, c.orden, c.id) < ($4, $5, $6) order by c.empresa desc, c.orden desc, c.id desc limit 1`,
      [...paramsBase, fila.empresa, Number(fila.orden), Number(fila.id)],
    ),
    sql.query<{ id: number }>(
      `select c.id from call_contactos c where ${where} and (c.empresa, c.orden, c.id) > ($4, $5, $6) order by c.empresa, c.orden, c.id limit 1`,
      [...paramsBase, fila.empresa, Number(fila.orden), Number(fila.id)],
    ),
    sql.query<{ id: number }>(
      `select c.id from call_contactos c where ${where} and ${PENDIENTE.replaceAll("$HOY", "$3")} and (c.empresa, c.orden, c.id) > ($4, $5, $6) order by c.empresa, c.orden, c.id limit 1`,
      [...paramsBase, fila.empresa, Number(fila.orden), Number(fila.id)],
    ),
    sql.query<{ n: number; segundos: number }>(
      `select count(*)::int as n, coalesce(sum(segundos), 0)::int as segundos
       from call_gestiones where ciudad_id = $1 and asesor_slug = $2 and fecha = $3`,
      [ciudad, slug, hoy],
    ),
    sql.query<FilaGestion>(
      `select id, asesor_nombre, fecha, hora, segundos, tipo_persona, nombre_prop, cc, tel_prop, tiene_nuevo, nuevo_nombre, nuevo_tel, solo_propietario,
              clasificacion, calificacion, obs_conductor, obs_propietario, intencion, proxima, fecha_proxima, no_aplica_proxima, resultado,
              fecha_afiliacion, no_aplica_afiliacion, motivo, observacion_final, caso_id
       from call_gestiones where contacto_id = $1 order by id desc limit 1`,
      [fila.id],
    ),
  ]);
  let siguienteLibreId = libre[0] ? Number(libre[0].id) : null;
  if (!siguienteLibreId) {
    const primero = await sql.query<{ id: number }>(
      `select c.id from call_contactos c where ${where} and ${PENDIENTE.replaceAll("$HOY", "$3")} order by c.empresa, c.orden, c.id limit 1`,
      paramsBase,
    );
    siguienteLibreId = primero[0] && Number(primero[0].id) !== Number(fila.id) ? Number(primero[0].id) : null;
  }
  return {
    id: Number(fila.id),
    empresa: fila.empresa,
    nombreLista: fila.nombre,
    estado: fila.estado,
    telefonoLista: fila.telefono,
    propietario: fila.propietario,
    telPropietario: fila.tel_propietario,
    vehiculo: fila.vehiculo,
    placa: fila.placa,
    anio: fila.anio,
    cc: fila.cc,
    duplicado: Number(fila.duplicado) === 1,
    casoId: fila.caso_id,
    posicion: Number(posRow[0]?.n) || 1,
    total: Number(totalRow[0]?.n) || 0,
    pendientes: Number(pendRow[0]?.n) || 0,
    anteriorId: ant[0] ? Number(ant[0].id) : null,
    siguienteId: sig[0] ? Number(sig[0].id) : null,
    siguienteLibreId,
    hoyLlamadas: Number(hoyRow[0]?.n) || 0,
    hoySegundos: Number(hoyRow[0]?.segundos) || 0,
    gestion: aGestion(gestiones[0]),
  };
}

async function filaPorId(sql: Sql, id: number) {
  const rows = await sql.query<FilaContacto>(
    `select id, empresa, nombre, estado, telefono, propietario, tel_propietario, vehiculo, placa, anio, cc, duplicado, caso_id, orden
     from call_contactos where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

async function slugDeCola(sql: Sql, profile: Perfil, pedido: string) {
  if (!veElEquipo(profile.role)) return profile.slug;
  const slug = pedido || profile.slug;
  const ok = await sql.query<{ slug: string }>(
    `select slug from profiles where slug = $1 and role in ('asesor', 'lider') and coalesce(ciudad_id, 1) = $2`,
    [slug, ciudadDe(profile)],
  );
  return ok[0]?.slug || profile.slug;
}

async function duenoDe(sql: Sql, contactoId: number) {
  const rows = await sql.query<{ nombre: string }>(
    `select coalesce(
       (select g.asesor_nombre from call_gestiones g where g.contacto_id = $1 and coalesce(g.asesor_slug, '') <> '' order by g.id desc limit 1),
       (select p.name from call_contactos c join profiles p on p.slug = c.turno_slug where c.id = $1 limit 1),
       ''
     ) as nombre`,
    [contactoId],
  );
  return rows[0]?.nombre || "";
}

async function puedeVer(sql: Sql, ciudad: number, slug: string, id: number, hoy: string) {
  const rows = await sql.query<{ id: number }>(
    `select c.id from call_contactos c where c.id = $4 and ${visible()}`,
    [ciudad, slug, hoy, id],
  );
  return Boolean(rows[0]);
}

async function primerPendiente(sql: Sql, ciudad: number, slug: string, hoy: string) {
  const activas = await sql.query<{ empresa: string }>(
    `select empresa from call_empresas where ciudad_id = $1 and activa = 1 limit 1`,
    [ciudad],
  );
  if (!activas[0]) return null;
  const rows = await sql.query<FilaContacto>(
    `select c.id, c.empresa, c.nombre, c.estado, c.telefono, c.propietario, c.tel_propietario, c.vehiculo, c.placa, c.anio, c.cc, c.duplicado, c.caso_id, c.orden
     from call_contactos c
     where ${visible()} and ${PENDIENTE.replaceAll("$HOY", "$3")}
     order by c.empresa, c.orden, c.id
     limit 1`,
    [ciudad, slug, hoy],
  );
  return rows[0] ?? null;
}

function claveContacto(empresa: string, placa: string, telefono: string, nombre: string) {
  return `${placa}|${telefono}|${normalizar(nombre)}|${normalizar(empresa)}`;
}

const placasCruzadas = new Set<number>();
const placasRepartidas = new Set<number>();

async function repartirPlacas(sql: Sql, ciudad: number) {
  await sql.query(`alter table call_contactos add column if not exists turno_slug text not null default ''`);
  await sql.query(`create index if not exists call_contactos_turno_idx on call_contactos (ciudad_id, turno_slug)`);
  await sql.query(
    `update call_contactos c
     set turno_slug = pick.slug
     from (
       select c2.id, elegido.slug
       from call_contactos c2
       join lateral (
         select q.slug
         from (
           select s.slug, row_number() over (order by s.slug) - 1 as n, count(*) over () as total
           from (
             select a.slug
             from call_asignaciones a
             where a.ciudad_id = c2.ciudad_id and a.empresa = c2.empresa
             union
             select p.slug
             from profiles p
             where p.role in ('asesor', 'lider')
               and coalesce(p.ciudad_id, 1) = c2.ciudad_id
               and not exists (
                 select 1 from call_asignaciones a
                 where a.ciudad_id = c2.ciudad_id and a.empresa = c2.empresa
               )
           ) s
         ) q
         where q.total > 0
           and mod(abs(hashtext(case when c2.placa <> '' then c2.placa else c2.id::text end))::bigint, q.total) = q.n
         limit 1
       ) elegido on true
       where c2.ciudad_id = $1
         and not exists (
           select 1 from call_gestiones g
           where g.contacto_id = c2.id and coalesce(g.asesor_slug, '') <> ''
         )
     ) pick
     where c.id = pick.id and c.turno_slug is distinct from pick.slug`,
    [ciudad],
  );
  placasRepartidas.add(ciudad);
}

async function repartirPlacasUnaVez(sql: Sql, ciudad: number) {
  if (placasRepartidas.has(ciudad)) return;
  await repartirPlacas(sql, ciudad);
}

/** Una placa en una empresa es un solo contacto. La tipificación se queda; el duplicado sin llamada se va. */
async function pegarTipificacionEnBase(sql: Sql, ciudad: number) {
  await sql.query(
    `with contactos as (
       select c.id, c.placa, lower(c.empresa) as empresa, coalesce(b.nombre, '') as base
       from call_contactos c
       left join call_bases b on b.id = c.base_id
       where c.ciudad_id = $1 and c.placa <> ''
     ),
     reales as (
       select * from contactos where base <> 'Gestiones fuera de la base'
     ),
     canon as (
       select distinct on (g.id) g.id as gestion_id, r.id as contacto_id
       from call_gestiones g
       join contactos actual on actual.id = g.contacto_id
       join reales r on r.placa = actual.placa
       where g.ciudad_id = $1
       order by g.id,
         case
           when r.empresa = actual.empresa then 0
           when actual.empresa <> '' and (r.empresa like '%' || actual.empresa || '%' or actual.empresa like '%' || r.empresa || '%') then 1
           else 2
         end,
         r.id
     )
     update call_gestiones g
     set contacto_id = canon.contacto_id
     from canon
     where g.id = canon.gestion_id and g.contacto_id <> canon.contacto_id`,
    [ciudad],
  );
  await sql.query(
    `delete from call_contactos c
     using call_bases b
     where c.base_id = b.id and c.ciudad_id = $1 and b.nombre = 'Gestiones fuera de la base'
       and not exists (select 1 from call_gestiones g where g.contacto_id = c.id)
       and exists (
         select 1 from call_contactos o
         join call_bases ob on ob.id = o.base_id
         where o.ciudad_id = c.ciudad_id and o.placa = c.placa and o.id <> c.id
           and ob.nombre <> 'Gestiones fuera de la base'
       )`,
    [ciudad],
  );
}

async function cruzarPlacas(sql: Sql, ciudad: number) {
  await sql.query(`create index if not exists call_contactos_placa_idx on call_contactos (ciudad_id, empresa, placa)`);
  const rows = await sql.query<{ n: number }>(
    `with borrados as (
       delete from call_contactos c
       using call_contactos o
       where c.ciudad_id = $1
         and c.placa <> ''
         and c.caso_id is null
         and o.ciudad_id = c.ciudad_id
         and o.empresa = c.empresa
         and o.placa = c.placa
         and o.id <> c.id
         and not exists (select 1 from call_gestiones g where g.contacto_id = c.id)
         and (
           exists (select 1 from call_gestiones g where g.contacto_id = o.id)
           or o.id < c.id
         )
       returning 1
     )
     select count(*)::int as n from borrados`,
    [ciudad],
  );
  return Number(rows[0]?.n) || 0;
}

async function cruzarPlacasUnaVez(sql: Sql, ciudad: number) {
  if (placasCruzadas.has(ciudad)) return 0;
  const n = await cruzarPlacas(sql, ciudad);
  placasCruzadas.add(ciudad);
  return n;
}

async function sembrarBriefing(sql: Sql, ciudad: number) {
  const ya = await sql.query<{ seccion: string }>(`select seccion from call_briefing where ciudad_id = $1`, [ciudad]);
  const puestos = new Set(ya.map((row) => row.seccion));
  for (const item of BRIEFING_BASE) {
    if (puestos.has(item.seccion)) continue;
    await sql.query(
      `insert into call_briefing (ciudad_id, seccion, titulo, cuerpo, orden) values ($1, $2, $3, $4, $5)`,
      [ciudad, item.seccion, item.titulo, BRIEFING_SEMILLA[item.seccion] ?? "", item.orden],
    );
  }
}

async function asegurarWhatsapp(sql: Sql, ciudad: number) {
  const rows = await sql.query<{ id: number }>(
    `select id from control_tipos
     where ciudad_id = $1 and activo = 1 and paralela = 1 and pide_contacto = 1
       and (lower(nombre) like '%whatsapp%' or lower(nombre) like '%wasap%' or lower(nombre) like '%wpp%')
     order by id limit 1`,
    [ciudad],
  );
  if (rows[0]) return Number(rows[0].id);
  const creados = await sql.query<{ id: number }>(
    `insert into control_tipos (ciudad_id, nombre, pide_contacto, paralela, todos) values ($1, 'Atención por WhatsApp', 1, 1, 1) returning id`,
    [ciudad],
  );
  return Number(creados[0]?.id) || 0;
}

async function anotarWhatsapp(sql: Sql, ownerId: string, ciudad: number, nombre: string, telefono: string, placa: string, nota: string, hora: string, fecha: string) {
  const puntos = await sql.query<{ tipo: string }>(
    `select tipo from control_marcas where owner_id = $1 and fecha = $2 and tipo in ('ingreso', 'salida') order by id`,
    [ownerId, fecha],
  );
  if (puntos[puntos.length - 1]?.tipo !== "ingreso") {
    return "La llamada quedó guardada. En Control falta marcar la entrada, así que el WhatsApp no se abrió solo.";
  }
  const tipoId = await asegurarWhatsapp(sql, ciudad);
  if (!tipoId) return "La llamada quedó guardada. No encontré la tipificación de WhatsApp en Control.";
  const abiertas = await sql.query<{ id: number; paralela: number; tipo_id: number | null }>(
    `select m.id, coalesce(t.paralela, 0) as paralela, m.tipo_id
     from control_marcas m
     left join control_tipos t on t.id = m.tipo_id
     where m.owner_id = $1 and m.fecha = $2 and m.hora_fin = ''
       and m.tipo in ('break', 'almuerzo', 'visita', 'otro', 'actividad')`,
    [ownerId, fecha],
  );
  const misma = abiertas.find((fila) => Number(fila.paralela) === 1 && Number(fila.tipo_id) === tipoId);
  if (misma) {
    await sql.query(
      `insert into control_atenciones (marca_id, contacto, telefono, placa_libre, nota, hora) values ($1, $2, $3, $4, $5, $6)`,
      [misma.id, nombre, telefono, placa, nota, hora],
    );
    return `Sumé a ${nombre} en el WhatsApp de Control. Sigues en llamadas.`;
  }
  for (const fila of abiertas) {
    if (Number(fila.paralela) === 1) continue;
    await sql.query(`update control_marcas set hora_fin = $1 where id = $2 and hora_fin = ''`, [hora, fila.id]);
  }
  const creadas = await sql.query<{ id: number }>(
    `insert into control_marcas (owner_id, tipo, fecha, hora, tipo_id, nota, contacto, telefono, placa_libre)
     values ($1, 'actividad', $2, $3, $4, $5, $6, $7, $8) returning id`,
    [ownerId, fecha, hora, tipoId, nota, nombre, telefono, placa],
  );
  if (creadas[0]) {
    await sql.query(
      `insert into control_atenciones (marca_id, contacto, telefono, placa_libre, nota, hora) values ($1, $2, $3, $4, $5, $6)`,
      [creadas[0].id, nombre, telefono, placa, nota, hora],
    );
  }
  return `Quedó en Control la atención por WhatsApp de ${nombre}. Las llamadas siguen abiertas.`;
}

async function anotarBitacora(sql: Sql, ownerId: string, fecha: string, linea: string) {
  await sql.query(
    `insert into bitacoras (owner_id, fecha, modo, llamadas, detalle_call, que_hizo)
     values ($1, $2, 'call', 1, $3, 'Llamadas del contact center')
     on conflict (owner_id, fecha) do update set
       llamadas = bitacoras.llamadas + 1,
       modo = case
         when bitacoras.modo = 'calle' then 'mixto'
         when bitacoras.modo = '' then 'call'
         else bitacoras.modo
       end,
       detalle_call = case
         when length(bitacoras.detalle_call) > 7000 then right(bitacoras.detalle_call, 6000) || chr(10) || $3
         when bitacoras.detalle_call = '' then $3
         else bitacoras.detalle_call || chr(10) || $3
       end,
       updated_at = now()`,
    [ownerId, fecha, linea],
  );
}

async function insertarGestion(sql: Sql, contactoId: number, ciudad: number, g: GestionImportada, asesor: { id: string; slug: string; nombre: string; fecha: string; hora: string; segundos: number }) {
  const rows = await sql.query<{ id: number }>(
    `insert into call_gestiones (
       contacto_id, ciudad_id, asesor_id, asesor_slug, asesor_nombre, fecha, hora, segundos,
       tipo_persona, nombre_prop, cc, tel_prop, tiene_nuevo, nuevo_nombre, nuevo_tel, solo_propietario,
       clasificacion, calificacion, obs_sao, obs_conductor, obs_propietario, intencion, proxima,
       fecha_proxima, no_aplica_proxima, resultado, fecha_afiliacion, no_aplica_afiliacion, motivo, observacion_final
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,
       $9,$10,$11,$12,$13,$14,$15,$16,
       $17,$18,$19,$20,$21,$22,$23,
       $24,$25,$26,$27,$28,$29,$30
     ) returning id`,
    [
      contactoId, ciudad, asesor.id, asesor.slug, asesor.nombre || g.agente, asesor.fecha || g.fecha, asesor.hora, asesor.segundos,
      g.tipoPersona, g.nombreProp, g.cc, g.telProp, g.tieneNuevo ? 1 : 0, g.nuevoNombre, g.nuevoTel, g.soloPropietario ? 1 : 0,
      g.clasificacion, g.calificacion, g.sao, g.conductor, g.propietario, g.intencion, g.proxima,
      g.fechaProxima, g.noAplicaProxima ? 1 : 0, g.resultado, g.fechaAfiliacion, g.noAplicaAfiliacion ? 1 : 0, g.motivo, g.observacionFinal,
    ],
  );
  return Number(rows[0]?.id) || 0;
}

function valoresGestion(ciudad: number, g: GestionImportada, asesor: { id: string; slug: string; nombre: string; fecha: string; hora: string; segundos: number }) {
  return [
    ciudad, asesor.id, asesor.slug, asesor.nombre || g.agente, asesor.fecha || g.fecha, asesor.hora,
    g.tipoPersona, g.nombreProp, g.cc, g.telProp, g.tieneNuevo ? 1 : 0, g.nuevoNombre, g.nuevoTel, g.soloPropietario ? 1 : 0,
    g.clasificacion, g.calificacion, g.sao, g.conductor, g.propietario, g.intencion, g.proxima,
    g.fechaProxima, g.noAplicaProxima ? 1 : 0, g.resultado, g.fechaAfiliacion, g.noAplicaAfiliacion ? 1 : 0, g.motivo, g.observacionFinal,
  ];
}

async function actualizarGestion(sql: Sql, gestionId: number, ciudad: number, g: GestionImportada, asesor: { id: string; slug: string; nombre: string; fecha: string; hora: string; segundos: number }) {
  await sql.query(
    `update call_gestiones set
       ciudad_id=$2, asesor_id=$3, asesor_slug=$4, asesor_nombre=$5, fecha=$6, hora=$7,
       tipo_persona=$8, nombre_prop=$9, cc=$10, tel_prop=$11, tiene_nuevo=$12, nuevo_nombre=$13, nuevo_tel=$14, solo_propietario=$15,
       clasificacion=$16, calificacion=$17, obs_sao=$18, obs_conductor=$19, obs_propietario=$20, intencion=$21, proxima=$22,
       fecha_proxima=$23, no_aplica_proxima=$24, resultado=$25, fecha_afiliacion=$26, no_aplica_afiliacion=$27, motivo=$28, observacion_final=$29
     where id=$1`,
    [gestionId, ...valoresGestion(ciudad, g, asesor)],
  );
}

function gestionMasNueva(entrante: GestionImportada, actual: { fecha: string; hora: string }) {
  const fechaNueva = entrante.fecha || "";
  const fechaVieja = String(actual.fecha || "").slice(0, 10);
  if (!fechaNueva) return false;
  if (fechaNueva > fechaVieja) return true;
  if (fechaNueva < fechaVieja) return false;
  const horaNueva = entrante.hora || "";
  const horaVieja = String(actual.hora || "").slice(0, 5);
  if (horaNueva && horaVieja && horaNueva < horaVieja) return false;
  return true;
}

function gestionIgual(
  entrante: GestionImportada,
  actual: { fecha: string; hora: string; clasificacion: string; calificacion: string; resultado: string; proxima: string; fecha_proxima: string; observacion_final: string },
) {
  return (
    (entrante.fecha || "") === String(actual.fecha || "").slice(0, 10) &&
    (entrante.hora || "") === String(actual.hora || "").slice(0, 5) &&
    entrante.clasificacion === (actual.clasificacion || "") &&
    entrante.calificacion === (actual.calificacion || "") &&
    entrante.resultado === (actual.resultado || "") &&
    entrante.proxima === (actual.proxima || "") &&
    entrante.fechaProxima === (actual.fecha_proxima || "") &&
    entrante.observacionFinal === (actual.observacion_final || "")
  );
}

async function meterContactos(sql: Sql, baseId: number, ciudad: number, lista: ContactoLimpio[]) {
  const ids: number[] = [];
  const TAM = 120;
  for (let i = 0; i < lista.length; i += TAM) {
    const trozo = lista.slice(i, i + TAM);
    const params: unknown[] = [];
    const grupos: string[] = [];
    trozo.forEach((item, n) => {
      const b = n * 14;
      grupos.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14})`,
      );
      params.push(
        baseId, ciudad, item.empresa, item.nombre, item.estado, item.telefono, item.propietario, item.telPropietario,
        item.vehiculo, item.placa, item.anio, item.cc, item.orden, item.duplicado ? 1 : 0,
      );
    });
    const rows = await sql.query<{ id: number }>(
      `insert into call_contactos (
         base_id, ciudad_id, empresa, nombre, estado, telefono, propietario, tel_propietario, vehiculo, placa, anio, cc, orden, duplicado
       ) values ${grupos.join(",")} returning id`,
      params,
    );
    for (const row of rows) ids.push(Number(row.id));
  }
  return ids;
}

export type BaseCall = {
  id: number;
  nombre: string;
  subidoPor: string;
  filas: number;
  separados: number;
  repetidos: number;
  empresas: number;
  creado: string;
};

export type EmpresaCall = {
  empresa: string;
  total: number;
  pendientes: number;
  llamadas: number;
  activa: boolean;
  slugs: string[];
};

export type AsesorMini = { slug: string; name: string };

export type BriefingItem = { seccion: string; titulo: string; cuerpo: string; orden: number };

export type DistintivoItem = {
  id: number;
  fecha: string;
  hora: string;
  placa: string;
  conductor: string;
  cedula: string;
  promotor: string;
  estado: string;
  nota: string;
  festivo: string;
};

export type MesCall = {
  mes: string;
  total: number;
  efectivos: number;
  noEfectivos: number;
  segundos: number;
  porAsesor: { nombre: string; total: number; efectivos: number; segundos: number }[];
  porEmpresa: { empresa: string; total: number; efectivos: number }[];
  porCalificacion: { calificacion: string; clasificacion: string; total: number }[];
  porDia: { fecha: string; total: number; efectivos: number }[];
};

export type StatsCall = {
  meses: MesCall[];
  dia: string;
  minutos: { hora: string; asesor: string; placa: string; nombre: string; clasificacion: string; segundos: number }[];
};

export const resumenCall = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const profile = await perfilDe(context.userId);
    const sql = await getSql();
    const ciudad = ciudadDe(profile);
    const hoy = hoyBogota();
    await sembrarBriefing(sql, ciudad);
    await repartirPlacasUnaVez(sql, ciudad);
    const asesores = await sql.query<AsesorMini>(
      `select slug, name from profiles where role in ('asesor', 'lider') and coalesce(ciudad_id, 1) = $1 order by name`,
      [ciudad],
    );
    const slug = llevaProcesos(profile.role) ? profile.slug : asesores[0]?.slug || profile.slug;
    const activas = await sql.query<{ n: number }>(`select count(*)::int as n from call_empresas where ciudad_id = $1 and activa = 1`, [ciudad]);
    let pendientes = 0;
    let hoyN = 0;
    let hoySeg = 0;
    if (llevaProcesos(profile.role) && Number(activas[0]?.n) > 0) {
      const pend = await sql.query<{ n: number }>(
        `select count(*)::int as n from call_contactos c where ${visible()} and ${PENDIENTE.replaceAll("$HOY", "$3")}`,
        [ciudad, profile.slug, hoy],
      );
      const dia = await sql.query<{ n: number; segundos: number }>(
        `select count(*)::int as n, coalesce(sum(segundos), 0)::int as segundos from call_gestiones where ciudad_id = $1 and asesor_slug = $2 and fecha = $3`,
        [ciudad, profile.slug, hoy],
      );
      pendientes = Number(pend[0]?.n) || 0;
      hoyN = Number(dia[0]?.n) || 0;
      hoySeg = Number(dia[0]?.segundos) || 0;
    }
    return {
      llama: llevaProcesos(profile.role),
      coordina: veElEquipo(profile.role),
      slug,
      activas: Number(activas[0]?.n) || 0,
      pendientes,
      hoy: hoyN,
      hoySegundos: hoySeg,
      asesores,
    };
  });

export const listBases = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BaseCall[]> => {
    const profile = await perfilDe(context.userId);
    if (!veElEquipo(profile.role)) throw new Error("Las bases las ve coordinación");
    const sql = await getSql();
    const rows = await sql.query<{
      id: number; nombre: string; subido_por: string; filas: number; separados: number; repetidos: number; empresas: number; creado: string;
    }>(
      `select id, nombre, subido_por, filas, separados, repetidos, empresas,
              to_char(creado at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') as creado
       from call_bases where ciudad_id = $1 order by id desc`,
      [ciudadDe(profile)],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      nombre: row.nombre,
      subidoPor: row.subido_por,
      filas: Number(row.filas) || 0,
      separados: Number(row.separados) || 0,
      repetidos: Number(row.repetidos) || 0,
      empresas: Number(row.empresas) || 0,
      creado: row.creado,
    }));
  });

function asesorDeNombre(equipo: { user_id: string; slug: string; name: string }[], agente: string) {
  const n = normalizar(agente);
  if (!n) return { id: "", slug: "", nombre: "" };
  const pistas: { slug: string; token: string }[] = [
    { slug: "david", token: "david" },
    { slug: "alison", token: "alison" },
    { slug: "laura", token: "laura" },
    { slug: "jose", token: "jose" },
    { slug: "patricia", token: "patricia" },
    { slug: "patricia", token: "leidi" },
  ];
  const pista = pistas.find((item) => n.includes(item.token));
  const persona = pista
    ? equipo.find((item) => item.slug === pista.slug)
    : equipo.find((item) => n === normalizar(item.name) || n.includes(normalizar(item.name)));
  if (!persona) return { id: "", slug: "", nombre: agente.slice(0, 120) };
  return { id: persona.user_id, slug: persona.slug, nombre: persona.name };
}

export const trozoBase = createServerFn({ method: "POST" })
  .validator((input: { cargaId: string; orden: number; datos: string; fin: boolean; nombre: string }) => {
    const cargaId = texto(input.cargaId, 80);
    if (!cargaId) throw new Error("La carga no tiene identificador");
    if (!Number.isInteger(input.orden) || input.orden < 0 || input.orden > 80) throw new Error("Pedazo de archivo inválido");
    if (typeof input.datos !== "string" || input.datos.length > 700_000) throw new Error("Ese pedazo del archivo es demasiado grande");
    return { cargaId, orden: input.orden, datos: input.datos, fin: Boolean(input.fin), nombre: texto(input.nombre, 160) || "base.xlsx" };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await perfilDe(context.userId);
    if (!veElEquipo(profile.role)) throw new Error("Solo coordinación carga bases");
    const sql = await getSql();
    await sql.query(
      `insert into carga_trozos (carga_id, orden, datos, caso_id, tipo, nombre)
       values ($1, $2, $3, 0, 'call_base', $4)
       on conflict (carga_id, orden) do update set datos = excluded.datos, nombre = excluded.nombre`,
      [data.cargaId, data.orden, data.datos, data.nombre],
    );
    if (!data.fin) return { ok: true as const, listo: false as const, filas: 0, aviso: "" };
    const partes = await sql.query<{ orden: number; datos: string; nombre: string }>(
      `select orden, datos, nombre from carga_trozos where carga_id = $1 and tipo = 'call_base' order by orden`,
      [data.cargaId],
    );
    await sql.query(`delete from carga_trozos where carga_id = $1 and tipo = 'call_base'`, [data.cargaId]);
    for (let i = 0; i < partes.length; i++) {
      if (Number(partes[i].orden) !== i) throw new Error("La carga llegó incompleta. Vuelve a subir el archivo.");
    }
    const archivo = partes.map((parte) => parte.datos).join("");
    const nombre = partes[0]?.nombre || data.nombre;
    const { leerBaseArchivo } = await import("./callcenter.server");
    const crudas = await leerBaseArchivo(archivo, nombre);
    if (crudas.length === 0) throw new Error("No encontré placa, nombre o teléfono. Revisa que el archivo tenga la hoja BD.");
    const limpio = limpiarBase(crudas);
    if (limpio.limpios.length > 120_000) throw new Error("Esa base pasa de 120.000 contactos. Divídela por empresa.");
    const ciudad = ciudadDe(profile);
    const equipo = await sql.query<{ user_id: string; slug: string; name: string }>(
      `select user_id, slug, name from profiles where role in ('asesor', 'lider') and coalesce(ciudad_id, 1) = $1`,
      [ciudad],
    );
    const porAsesor = new Map<string, number>();
    const sinAsesor = new Set<string>();
    const credencial = (gestion: GestionImportada) => {
      const quien = asesorDeNombre(equipo, gestion.agente);
      if (quien.id) porAsesor.set(quien.nombre, (porAsesor.get(quien.nombre) ?? 0) + 1);
      else if (gestion.agente) sinAsesor.add(gestion.agente);
      return { id: quien.id, slug: quien.slug, nombre: quien.nombre || gestion.agente, fecha: gestion.fecha, hora: gestion.hora || "", segundos: 0 };
    };
    const existentes = await sql.query<{ id: number; placa: string; telefono: string; nombre: string; empresa: string }>(
      `select id, placa, telefono, nombre, empresa from call_contactos where ciudad_id = $1`,
      [ciudad],
    );
    type UltimaGestion = {
      id: number;
      contacto_id: number;
      fecha: string;
      hora: string;
      clasificacion: string;
      calificacion: string;
      resultado: string;
      proxima: string;
      fecha_proxima: string;
      observacion_final: string;
      segundos: number;
    };
    const ultimasRows = await sql.query<UltimaGestion>(
      `select distinct on (contacto_id) id, contacto_id, fecha, hora, clasificacion, calificacion, resultado, proxima, fecha_proxima, observacion_final, segundos
       from call_gestiones where ciudad_id = $1
       order by contacto_id, fecha desc, hora desc, id desc`,
      [ciudad],
    );
    const ultimas = new Map<number, UltimaGestion>();
    for (const row of ultimasRows) ultimas.set(Number(row.contacto_id), row);
    const porClave = new Map<string, number>();
    const porPlaca = new Map<string, number[]>();
    for (const row of existentes) {
      const id = Number(row.id);
      porClave.set(claveContacto(row.empresa, row.placa, row.telefono, row.nombre), id);
      if (row.placa) {
        const llave = `${normalizar(row.empresa)}|${row.placa}`;
        const lista = porPlaca.get(llave) ?? [];
        lista.push(id);
        porPlaca.set(llave, lista);
      }
    }
    const nuevos: ContactoLimpio[] = [];
    const aplicar: { id: number; gestion: GestionImportada; modo: "nueva" | "actualizar" }[] = [];
    let repetidos = limpio.repetidos;
    let relacionadas = 0;
    let conservadas = 0;
    let iguales = 0;
    const enArchivo = new Map<string, ContactoLimpio>();
    const hermanosDe = (empresa: string, placa: string) => {
      if (!placa) return [] as number[];
      return [...new Set(porPlaca.get(`${normalizar(empresa)}|${placa}`) ?? [])].filter((id) => id > 0);
    };
    for (const item of limpio.limpios) {
      const clave = claveContacto(item.empresa, item.placa, item.telefono, item.nombre);
      const hermanos = hermanosDe(item.empresa, item.placa);
      const conGestion = hermanos.find((id) => ultimas.has(id));
      let previo = porClave.get(clave);
      if (!previo && hermanos.length) {
        previo = conGestion ?? hermanos[0];
        relacionadas += 1;
      }
      const llavePlaca = item.placa ? `${normalizar(item.empresa)}|${item.placa}` : "";
      if (!previo && llavePlaca && enArchivo.has(llavePlaca)) {
        const pendiente = enArchivo.get(llavePlaca)!;
        repetidos += 1;
        if (item.gestion && !pendiente.gestion) pendiente.gestion = item.gestion;
        continue;
      }
      if (previo) {
        repetidos += 1;
        porClave.set(clave, previo);
        if (item.gestion) {
          const destino = (item.gestion && conGestion) || previo;
          const actual = ultimas.get(destino);
          const fechaActual = String(actual?.fecha || "").slice(0, 10);
          const llamadaViva = Boolean(actual && Number(actual.segundos) > 0 && (item.gestion.fecha || "") <= fechaActual);
          if (!actual) {
            const ya = aplicar.find((row) => row.id === destino && row.modo === "nueva");
            if (!ya) aplicar.push({ id: destino, gestion: item.gestion, modo: "nueva" });
            else if (gestionMasNueva(item.gestion, { fecha: ya.gestion.fecha, hora: ya.gestion.hora || "" })) ya.gestion = item.gestion;
          } else if (!gestionMasNueva(item.gestion, actual) || llamadaViva) conservadas += 1;
          else if (gestionIgual(item.gestion, actual)) iguales += 1;
          else aplicar.push({ id: destino, gestion: item.gestion, modo: "actualizar" });
        }
        continue;
      }
      porClave.set(clave, 0);
      nuevos.push(item);
      if (llavePlaca) enArchivo.set(llavePlaca, item);
      if (item.placa) {
        const lista = porPlaca.get(llavePlaca) ?? [];
        lista.push(0);
        porPlaca.set(llavePlaca, lista);
      }
    }
    const creadas = await sql.query<{ id: number }>(
      `insert into call_bases (ciudad_id, nombre, subido_por, filas, separados, repetidos, empresas)
       values ($1, $2, $3, 0, $4, $5, 0) returning id`,
      [ciudad, nombre, profile.name, limpio.separados, repetidos],
    );
    const baseId = Number(creadas[0]?.id);
    let nuevasGestiones = 0;
    let actualizadas = 0;
    let cruzados = 0;
    try {
      const ids = await meterContactos(sql, baseId, ciudad, nuevos);
      for (let i = 0; i < nuevos.length; i++) {
        const item = nuevos[i];
        const id = ids[i];
        if (!id) continue;
        porClave.set(claveContacto(item.empresa, item.placa, item.telefono, item.nombre), id);
        if (item.gestion) {
          await insertarGestion(sql, id, ciudad, item.gestion, credencial(item.gestion));
          nuevasGestiones += 1;
        }
      }
      for (const item of aplicar) {
        const asesor = credencial(item.gestion);
        if (item.modo === "nueva") {
          await insertarGestion(sql, item.id, ciudad, item.gestion, asesor);
          nuevasGestiones += 1;
          continue;
        }
        const actual = ultimas.get(item.id);
        if (!actual) continue;
        await actualizarGestion(sql, Number(actual.id), ciudad, item.gestion, asesor);
        actualizadas += 1;
      }
      const empresas = [...new Set(nuevos.map((item) => item.empresa))];
      for (const empresa of empresas) {
        await sql.query(
          `insert into call_empresas (ciudad_id, empresa, activa) values ($1, $2, 0) on conflict (ciudad_id, empresa) do nothing`,
          [ciudad, empresa],
        );
      }
      const cuentaEmp = await sql.query<{ n: number }>(
        `select count(distinct empresa)::int as n from call_contactos where base_id = $1`,
        [baseId],
      );
      await pegarTipificacionEnBase(sql, ciudad);
      const cruzadosAhora = await cruzarPlacas(sql, ciudad);
      placasRepartidas.delete(ciudad);
      await repartirPlacas(sql, ciudad);
      cruzados = cruzadosAhora;
      placasCruzadas.add(ciudad);
      await sql.query(
        `update call_bases set filas = $2, separados = $3, repetidos = $4, empresas = $5 where id = $1`,
        [baseId, nuevos.length, limpio.separados, repetidos, Number(cuentaEmp[0]?.n) || empresas.length],
      );
    } catch (err) {
      await sql.query(`delete from call_bases where id = $1`, [baseId]);
      throw err instanceof Error ? err : new Error("No pude guardar la base");
    }
    const detalleAsesor = [...porAsesor.entries()].map(([quien, n]) => `${quien} ${n}`).join(", ");
    const avisoAsesor = detalleAsesor ? ` Gestiones: ${detalleAsesor}.` : "";
    const avisoHueco = sinAsesor.size ? ` Sin usuario en la app: ${[...sinAsesor].join(", ")}.` : "";
    const avisoRelacion = relacionadas ? ` ${relacionadas} se ligaron por la misma placa y empresa.` : "";
    const avisoCruce = cruzados ? ` ${cruzados} duplicados de la misma placa se quitaron: la tipificación queda en la placa.` : "";
    const avisoGestion = ` ${nuevasGestiones} gestiones nuevas, ${actualizadas} actualizadas${iguales ? `, ${iguales} ya iguales` : ""}${conservadas ? `, ${conservadas} se dejaron porque la llamada guardada es más reciente` : ""}.`;
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "agrego",
      entidad: "llamadas",
      entidadId: baseId,
      etiqueta: nombre,
      detalle: `Cruzó la base ${nombre}: ${nuevos.length} contactos nuevos, ${repetidos} ya estaban, ${actualizadas} gestiones actualizadas, ${nuevasGestiones} gestiones nuevas.${avisoAsesor}`,
    });
    return {
      ok: true as const,
      listo: true as const,
      filas: nuevos.length,
      aviso: `${nuevos.length} contactos nuevos. ${repetidos} ya estaban.${avisoRelacion}${avisoCruce}${avisoGestion} ${limpio.separados} salieron de celdas con //.${avisoAsesor}${avisoHueco} Las empresas quedan apagadas: actívalas para que salgan en la cola.`,
    };
  });

export const trozoGestiones = createServerFn({ method: "POST" })
  .validator((input: { cargaId: string; orden: number; datos: string; fin: boolean; nombre: string }) => {
    const cargaId = texto(input.cargaId, 80);
    if (!cargaId) throw new Error("La carga no tiene identificador");
    if (!Number.isInteger(input.orden) || input.orden < 0 || input.orden > 80) throw new Error("Pedazo de archivo inválido");
    if (typeof input.datos !== "string" || input.datos.length > 700_000) throw new Error("Ese pedazo del archivo es demasiado grande");
    return { cargaId, orden: input.orden, datos: input.datos, fin: Boolean(input.fin), nombre: texto(input.nombre, 160) || "gestiones.xlsx" };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await perfilDe(context.userId);
    if (!veElEquipo(profile.role)) throw new Error("Solo coordinación carga gestiones");
    const sql = await getSql();
    await sql.query(
      `insert into carga_trozos (carga_id, orden, datos, caso_id, tipo, nombre)
       values ($1, $2, $3, 0, 'call_gestion', $4)
       on conflict (carga_id, orden) do update set datos = excluded.datos, nombre = excluded.nombre`,
      [data.cargaId, data.orden, data.datos, data.nombre],
    );
    if (!data.fin) return { ok: true as const, listo: false as const, filas: 0, aviso: "" };
    const partes = await sql.query<{ orden: number; datos: string; nombre: string }>(
      `select orden, datos, nombre from carga_trozos where carga_id = $1 and tipo = 'call_gestion' order by orden`,
      [data.cargaId],
    );
    await sql.query(`delete from carga_trozos where carga_id = $1 and tipo = 'call_gestion'`, [data.cargaId]);
    for (let i = 0; i < partes.length; i++) {
      if (Number(partes[i].orden) !== i) throw new Error("La carga llegó incompleta. Vuelve a subir el archivo.");
    }
    const archivo = partes.map((parte) => parte.datos).join("");
    const nombre = partes[0]?.nombre || data.nombre;
    const { leerBaseArchivo, leerWhatsappArchivo } = await import("./callcenter.server");
    const crudas = await leerBaseArchivo(archivo, nombre);
    const agenteHoja = crudas.map((fila) => fila.agente.trim()).find(Boolean) || nombre.replace(/\.[^.]+$/, "");
    const whatsapp = await leerWhatsappArchivo(archivo, agenteHoja);
    const limpio = limpiarBase([...crudas, ...whatsapp]);
    const tipificadas = limpio.limpios.filter((item) => item.gestion && item.placa);
    if (!tipificadas.length) throw new Error("No encontré tipificaciones. Sube el Excel de llamadas del asesor, el que tiene la hoja BD.");
    const ciudad = ciudadDe(profile);
    const equipo = await sql.query<{ user_id: string; slug: string; name: string }>(
      `select user_id, slug, name from profiles where role in ('asesor', 'lider') and coalesce(ciudad_id, 1) = $1`,
      [ciudad],
    );
    const contactos = await sql.query<{ id: number; placa: string; empresa: string }>(
      `select id, placa, empresa from call_contactos where ciudad_id = $1 and placa <> ''`,
      [ciudad],
    );
    const porPlaca = new Map<string, { id: number; empresa: string }[]>();
    for (const row of contactos) {
      const lista = porPlaca.get(row.placa) ?? [];
      lista.push({ id: Number(row.id), empresa: row.empresa });
      porPlaca.set(row.placa, lista);
    }
    const hechas = await sql.query<{
      id: number; contacto_id: number; fecha: string; hora: string; clasificacion: string; calificacion: string;
      resultado: string; proxima: string; fecha_proxima: string; observacion_final: string; segundos: number;
    }>(
      `select id, contacto_id, fecha, hora, clasificacion, calificacion, resultado, proxima, fecha_proxima, observacion_final, segundos
       from call_gestiones where ciudad_id = $1`,
      [ciudad],
    );
    const porContacto = new Map<number, typeof hechas>();
    for (const row of hechas) {
      const id = Number(row.contacto_id);
      const lista = porContacto.get(id) ?? [];
      lista.push(row);
      porContacto.set(id, lista);
    }
    const credencial = (gestion: GestionImportada) => {
      const quien = asesorDeNombre(equipo, gestion.agente);
      return { id: quien.id, slug: quien.slug, nombre: quien.nombre || gestion.agente, fecha: gestion.fecha, hora: gestion.hora || "", segundos: 0 };
    };
    let cruzadas = 0;
    let soloPlaca = 0;
    let nuevas = 0;
    let iguales = 0;
    let actualizadas = 0;
    const porAsesor = new Map<string, number>();
    const fuera: ContactoLimpio[] = [];
    const elegir = (placa: string, empresa: string) => {
      const lista = porPlaca.get(placa) ?? [];
      if (!lista.length) return null;
      const n = normalizar(empresa);
      const misma = n ? lista.filter((item) => normalizar(item.empresa) === n) : [];
      const parecida = !misma.length && n
        ? lista.filter((item) => {
            const otra = normalizar(item.empresa);
            return otra.includes(n) || n.includes(otra);
          })
        : [];
      const pool = misma.length ? misma : parecida.length ? parecida : lista;
      return [...pool].sort((a, b) => a.id - b.id)[0];
    };
    for (const item of tipificadas) {
      const gestion = item.gestion!;
      const quien = credencial(gestion);
      if (quien.nombre) porAsesor.set(quien.nombre, (porAsesor.get(quien.nombre) ?? 0) + 1);
      const destino = elegir(item.placa, item.empresa);
      if (!destino) {
        fuera.push(item);
        continue;
      }
      if (item.empresa && normalizar(destino.empresa) !== normalizar(item.empresa)) soloPlaca += 1;
      else cruzadas += 1;
      const previas = porContacto.get(destino.id) ?? [];
      const misma = previas.find((row) =>
        String(row.fecha || "").slice(0, 10) === (gestion.fecha || "") &&
        (row.clasificacion || "") === gestion.clasificacion &&
        (row.calificacion || "") === gestion.calificacion,
      );
      if (misma) {
        if (gestionIgual(gestion, misma)) iguales += 1;
        else {
          await actualizarGestion(sql, Number(misma.id), ciudad, gestion, quien);
          actualizadas += 1;
        }
        continue;
      }
      const id = await insertarGestion(sql, destino.id, ciudad, gestion, quien);
      const lista = porContacto.get(destino.id) ?? [];
      lista.push({
        id, contacto_id: destino.id, fecha: gestion.fecha, hora: ("hora" in gestion ? String(gestion.hora || "") : ""), clasificacion: gestion.clasificacion,
        calificacion: gestion.calificacion, resultado: gestion.resultado, proxima: gestion.proxima,
        fecha_proxima: gestion.fechaProxima, observacion_final: gestion.observacionFinal, segundos: 0,
      });
      porContacto.set(destino.id, lista);
      nuevas += 1;
    }
    if (fuera.length) {
      const ya = await sql.query<{ id: number }>(
        `select id from call_bases where ciudad_id = $1 and nombre = 'Gestiones fuera de la base' limit 1`,
        [ciudad],
      );
      let baseId = Number(ya[0]?.id);
      if (!baseId) {
        const creada = await sql.query<{ id: number }>(
          `insert into call_bases (ciudad_id, nombre, subido_por, filas, separados, repetidos, empresas)
           values ($1, 'Gestiones fuera de la base', $2, 0, 0, 0, 0) returning id`,
          [ciudad, profile.name],
        );
        baseId = Number(creada[0]?.id);
      }
      const ids = await meterContactos(sql, baseId, ciudad, fuera);
      for (let i = 0; i < fuera.length; i++) {
        const item = fuera[i];
        const id = ids[i];
        if (!id || !item.gestion) continue;
        await insertarGestion(sql, id, ciudad, item.gestion, credencial(item.gestion));
        const lista = porPlaca.get(item.placa) ?? [];
        lista.push({ id, empresa: item.empresa });
        porPlaca.set(item.placa, lista);
      }
      await sql.query(
        `update call_bases set filas = (select count(*) from call_contactos where base_id = $1) where id = $1`,
        [baseId],
      );
    }
    await pegarTipificacionEnBase(sql, ciudad);
    await cruzarPlacas(sql, ciudad);
    placasCruzadas.add(ciudad);
    placasRepartidas.delete(ciudad);
    await repartirPlacas(sql, ciudad);
    const detalleAsesor = [...porAsesor.entries()].map(([quien, n]) => `${quien} ${n}`).join(", ");
    const aviso = `${nuevas} tipificaciones quedaron escritas en la base, ${actualizadas} se actualizaron${iguales ? `, ${iguales} ya estaban en esa placa` : ""}. ${cruzadas} placas de la base${soloPlaca ? `, ${soloPlaca} cruzadas solo por placa aunque la empresa no coincidiera` : ""}${fuera.length ? `. ${fuera.length} placas no estaban en la base` : ""}.${whatsapp.length ? ` ${whatsapp.length} venían de la hoja WhatsApp.` : ""} ${detalleAsesor ? `Asesor: ${detalleAsesor}.` : ""} Estadísticas sale de esas placas.`;
    return { ok: true as const, listo: true as const, filas: nuevas + actualizadas + iguales, aviso };
  });

export const borrarBase = createServerFn({ method: "POST" })
  .validator((id: number) => {
    if (!Number.isFinite(id)) throw new Error("Base inválida");
    return id;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const profile = await perfilDe(context.userId);
    if (!veElEquipo(profile.role)) throw new Error("Solo coordinación borra bases");
    const sql = await getSql();
    const rows = await sql.query<{ nombre: string }>(`select nombre from call_bases where id = $1 and ciudad_id = $2`, [id, ciudadDe(profile)]);
    if (!rows[0]) throw new Error("Esa base no está");
    await sql.query(`delete from call_bases where id = $1`, [id]);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "borro",
      entidad: "llamadas",
      entidadId: id,
      etiqueta: rows[0].nombre,
      detalle: `Borró la base ${rows[0].nombre} y sus contactos`,
    });
    return { ok: true };
  });

export const listEmpresas = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ empresas: EmpresaCall[]; asesores: AsesorMini[] }> => {
    const profile = await perfilDe(context.userId);
    if (!veElEquipo(profile.role)) throw new Error("Las empresas las asigna coordinación");
    const sql = await getSql();
    const ciudad = ciudadDe(profile);
    const hoy = hoyBogota();
    await pegarTipificacionEnBase(sql, ciudad);
    await cruzarPlacasUnaVez(sql, ciudad);
    const rows = await sql.query<{ empresa: string; total: number; pendientes: number; llamadas: number; activa: number }>(
      `with marcas as (
         select distinct on (contacto_id)
           contacto_id,
           lower(proxima) as proxima,
           fecha_proxima,
           lower(coalesce(resultado, '')) as resultado
         from call_gestiones
         where ciudad_id = $1
         order by contacto_id, id desc
       ),
       hechas as (
         select distinct c.empresa, c.placa
         from call_contactos c
         join marcas m on m.contacto_id = c.id
         where c.ciudad_id = $1 and c.placa <> ''
       )
       select c.empresa,
              count(*)::int as total,
              count(*) filter (where
                (m.contacto_id is not null
                  and m.proxima in ('llamar', 'whatsapp', 'agendar')
                  and (m.fecha_proxima = '' or m.fecha_proxima <= $2)
                  and m.resultado <> 'afiliado')
                or (m.contacto_id is null and h.placa is null)
              )::int as pendientes,
              count(*) filter (where m.contacto_id is not null)::int as llamadas,
              coalesce(max(e.activa), 0) as activa
       from call_contactos c
       left join marcas m on m.contacto_id = c.id
       left join hechas h on h.empresa = c.empresa and h.placa = c.placa and c.placa <> ''
       left join call_empresas e on e.ciudad_id = c.ciudad_id and e.empresa = c.empresa
       where c.ciudad_id = $1
       group by c.empresa
       order by c.empresa`,
      [ciudad, hoy],
    );
    const asignaciones = await sql.query<{ empresa: string; slug: string }>(
      `select empresa, slug from call_asignaciones where ciudad_id = $1`,
      [ciudad],
    );
    const porEmpresa = new Map<string, string[]>();
    for (const row of asignaciones) {
      const lista = porEmpresa.get(row.empresa) ?? [];
      lista.push(row.slug);
      porEmpresa.set(row.empresa, lista);
    }
    const asesores = await sql.query<AsesorMini>(
      `select slug, name from profiles where role in ('asesor', 'lider') and coalesce(ciudad_id, 1) = $1 order by name`,
      [ciudad],
    );
    return {
      asesores,
      empresas: rows.map((row) => ({
        empresa: row.empresa,
        total: Number(row.total) || 0,
        pendientes: Number(row.pendientes) || 0,
        llamadas: Number(row.llamadas) || 0,
        activa: Number(row.activa) === 1,
        slugs: porEmpresa.get(row.empresa) ?? [],
      })),
    };
  });

export const guardarEmpresa = createServerFn({ method: "POST" })
  .validator((input: { empresa: string; activa: boolean; slugs: string[] }) => {
    const empresa = texto(input.empresa, 120);
    if (!empresa) throw new Error("Falta la empresa");
    const slugs = [...new Set((input.slugs ?? []).map((item) => texto(item, 40)).filter(Boolean))].slice(0, 30);
    return { empresa, activa: Boolean(input.activa), slugs };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await perfilDe(context.userId);
    if (!veElEquipo(profile.role)) throw new Error("Solo coordinación asigna empresas");
    const sql = await getSql();
    const ciudad = ciudadDe(profile);
    await sql.query(
      `insert into call_empresas (ciudad_id, empresa, activa) values ($1, $2, $3)
       on conflict (ciudad_id, empresa) do update set activa = excluded.activa`,
      [ciudad, data.empresa, data.activa ? 1 : 0],
    );
    await sql.query(`delete from call_asignaciones where ciudad_id = $1 and empresa = $2`, [ciudad, data.empresa]);
    for (const slug of data.slugs) {
      const ok = await sql.query<{ slug: string }>(
        `select slug from profiles where slug = $1 and role in ('asesor', 'lider') and coalesce(ciudad_id, 1) = $2`,
        [slug, ciudad],
      );
      if (!ok[0]) continue;
      await sql.query(`insert into call_asignaciones (ciudad_id, empresa, slug) values ($1, $2, $3) on conflict do nothing`, [ciudad, data.empresa, slug]);
    }
    placasRepartidas.delete(ciudad);
    await repartirPlacas(sql, ciudad);
    return { ok: true };
  });

export const colaCall = createServerFn({ method: "POST" })
  .validator((input: { contactoId?: number; slug?: string }) => ({
    contactoId: Number(input?.contactoId) || 0,
    slug: texto(input?.slug, 40),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ contacto: ContactoCall | null; aviso: string }> => {
    const profile = await perfilDe(context.userId);
    const sql = await getSql();
    const ciudad = ciudadDe(profile);
    const hoy = hoyBogota();
    await repartirPlacasUnaVez(sql, ciudad);
    const slug = await slugDeCola(sql, profile, data.slug);
    if (!slug) return { contacto: null, aviso: "Elige el asesor para ver su cola." };
    if (data.contactoId) {
      const fila = await filaPorId(sql, data.contactoId);
      if (!fila) return { contacto: null, aviso: "Ese contacto ya no está." };
      if (!(await puedeVer(sql, ciudad, slug, fila.id, hoy))) {
        const dueno = await duenoDe(sql, fila.id);
        return { contacto: null, aviso: dueno ? `Esa placa la tiene ${dueno}. Cada placa es de un solo asesor.` : "Esa placa no está en esta cola." };
      }
      return { contacto: await armarContacto(sql, ciudad, slug, fila, hoy), aviso: "" };
    }
    const fila = await primerPendiente(sql, ciudad, slug, hoy);
    if (!fila) return { contacto: null, aviso: "No hay pendientes en las empresas activas. Coordinación enciende la empresa o asigna otra." };
    return { contacto: await armarContacto(sql, ciudad, slug, fila, hoy), aviso: "" };
  });

export const buscarCall = createServerFn({ method: "POST" })
  .validator((input: { q: string; slug?: string }) => ({ q: texto(input.q, 40), slug: texto(input.slug, 40) }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await perfilDe(context.userId);
    const q = data.q.trim();
    if (q.length < 2) return [];
    const sql = await getSql();
    const ciudad = ciudadDe(profile);
    const hoy = hoyBogota();
    if (veElEquipo(profile.role)) await cruzarPlacasUnaVez(sql, ciudad);
    await repartirPlacasUnaVez(sql, ciudad);
    const slug = await slugDeCola(sql, profile, data.slug);
    const como = `%${q.replace(/[%_]/g, "")}%`;
    const hecho = `case when exists (
             select 1 from call_contactos o
             join call_gestiones g on g.contacto_id = o.id
             where o.ciudad_id = c.ciudad_id and o.empresa = c.empresa
               and (o.id = c.id or (c.placa <> '' and o.placa = c.placa))
           ) then 1 else 0 end`;
    const rows = await sql.query<{ id: number; placa: string; nombre: string; telefono: string; empresa: string; hecho: number }>(
      `select c.id, c.placa, c.nombre, c.telefono, c.empresa, ${hecho} as hecho
       from call_contactos c
       where ${visible()} and (c.placa ilike $4 or c.nombre ilike $4 or c.telefono ilike $4 or c.propietario ilike $4)
       order by c.empresa, c.orden, c.id limit 30`,
      [ciudad, slug, hoy, como],
    );
    if (rows.length === 0 && q.length >= 5) {
      const ajena = await sql.query<{ id: number; placa: string; nombre: string; telefono: string; empresa: string }>(
        `select c.id, c.placa, c.nombre, c.telefono, c.empresa
         from call_contactos c
         where c.ciudad_id = $1 and c.placa ilike $2
         order by c.id limit 1`,
        [ciudad, como],
      );
      if (ajena[0]) {
        const dueno = await duenoDe(sql, Number(ajena[0].id));
        return [{
          id: Number(ajena[0].id),
          placa: ajena[0].placa,
          nombre: ajena[0].nombre,
          telefono: ajena[0].telefono,
          empresa: ajena[0].empresa,
          hecho: true,
          dueno: dueno || "otro asesor",
        }];
      }
    }
    return rows.map((row) => ({
      id: Number(row.id),
      placa: row.placa,
      nombre: row.nombre,
      telefono: row.telefono,
      empresa: row.empresa,
      hecho: Number(row.hecho) === 1,
      dueno: "",
    }));
  });

function restarDias(iso: string, dias: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return fecha.toISOString().slice(0, 10);
}

export type SeguimientoCall = {
  id: number;
  placa: string;
  nombre: string;
  telefono: string;
  propietario: string;
  telPropietario: string;
  cc: string;
  empresa: string;
  fecha: string;
  clasificacion: string;
  calificacion: string;
  intencion: string;
  proxima: string;
  resultado: string;
  asesor: string;
  atrasada: boolean;
};

export const listSeguimiento = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SeguimientoCall[]> => {
    const profile = await perfilDe(context.userId);
    const sql = await getSql();
    const ciudad = ciudadDe(profile);
    const hoy = hoyBogota();
    const corte = restarDias(hoy, 7);
    const propio = !veElEquipo(profile.role);
    const rows = await sql.query<{
      id: number; placa: string; nombre: string; telefono: string; propietario: string; tel_propietario: string; cc: string;
      empresa: string; fecha: string; clasificacion: string; calificacion: string; intencion: string; proxima: string;
      resultado: string; asesor_nombre: string;
    }>(
      `select c.id, c.placa, c.nombre, c.telefono, c.propietario, c.tel_propietario, c.cc, c.empresa,
              g.fecha, g.clasificacion, g.calificacion, g.intencion, g.proxima, g.resultado, g.asesor_nombre
       from call_contactos c
       join call_gestiones g on g.id = (select max(g2.id) from call_gestiones g2 where g2.contacto_id = c.id)
       where c.ciudad_id = $1
         and ($2::boolean = false or g.asesor_slug = $3)
         and lower(coalesce(g.proxima, '')) <> 'cerrar'
         and lower(coalesce(g.resultado, '')) not in ('afiliado', 'no afiliado', 'no localizado')
         and (
           (lower(g.clasificacion) like '%efectivo%' and lower(g.clasificacion) not like '%no efectivo%')
           or lower(g.proxima) in ('whatsapp', 'llamar', 'agendar')
           or lower(g.resultado) in ('en proceso', 'documentación', 'documentacion', 'compra polizas', 'radicacion to')
         )
       order by g.fecha, c.empresa, c.placa
       limit 200`,
      [ciudad, propio, profile.slug],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      placa: row.placa,
      nombre: row.propietario || row.nombre,
      telefono: row.tel_propietario || row.telefono,
      propietario: row.propietario,
      telPropietario: row.tel_propietario,
      cc: row.cc,
      empresa: row.empresa,
      fecha: String(row.fecha || "").slice(0, 10),
      clasificacion: row.clasificacion,
      calificacion: row.calificacion,
      intencion: row.intencion,
      proxima: row.proxima,
      resultado: row.resultado,
      asesor: row.asesor_nombre,
      atrasada: String(row.fecha || "").slice(0, 10) <= corte,
    }));
  });

export async function refrescarBitacoraDia(sql: Sql, ownerId: string, ciudad: number, slug: string, fecha: string) {
  const rows = await sql.query<{
    placa: string;
    nombre: string;
    clasificacion: string;
    calificacion: string;
    intencion: string;
    proxima: string;
    resultado: string;
  }>(
    `select coalesce(c.placa, '') as placa, coalesce(c.nombre, '') as nombre,
            g.clasificacion, g.calificacion, g.intencion, g.proxima, g.resultado
     from call_gestiones g
     left join call_contactos c on c.id = g.contacto_id
     where g.ciudad_id = $1 and g.asesor_slug = $2 and g.fecha = $3
     order by g.id`,
    [ciudad, slug, fecha],
  );
  const citas = await sql.query<{ tipo: string; titulo: string; hora: string; placa: string; hecho: number; nota: string }>(
    `select tipo, titulo, hora, coalesce(placa, '') as placa, hecho, nota
     from agenda where owner_id = $1 and fecha = $2 order by hora, id`,
    [ownerId, fecha],
  );
  const marcas = await sql.query<{ hora: string; nota: string; contacto: string; nombre_tipo: string }>(
    `select m.hora, m.nota, m.contacto, coalesce(t.nombre, '') as nombre_tipo
     from control_marcas m
     left join control_tipos t on t.id = m.tipo_id
     where m.owner_id = $1 and m.fecha = $2 and m.tipo = 'actividad'
     order by m.hora, m.id`,
    [ownerId, fecha],
  );
  if (!rows.length && !citas.length && !marcas.length) return;
  const efectivo = (t: string) => /efectivo/i.test(t) && !/no efectivo/i.test(t);
  const efectivos = rows.filter((r) => efectivo(r.clasificacion)).length;
  const quiere = rows.filter((r) => /quiere afiliarse/i.test(r.intencion)).length;
  const considera = rows.filter((r) => /considera/i.test(r.intencion)).length;
  const polizas = rows.filter((r) => /compra poliza|afiliado/i.test(r.resultado)).length;
  const visitas = citas.filter((c) => c.tipo === "visita" || c.tipo === "distintivos").length;
  const partes = [];
  if (rows.length) partes.push(`Llamadas: ${rows.length} de 50. ${efectivos} contacto efectivo y ${rows.length - efectivos} no efectivo. ${quiere} quieren afiliarse y ${considera} la consideran.`);
  if (citas.length) partes.push(`Agenda: ${citas.map((c) => `${String(c.hora || "").slice(0, 5)} ${c.tipo} ${c.placa || c.titulo}${c.hecho ? " hecha" : ""}`.trim()).join("; ")}.`);
  if (marcas.length) partes.push(`Control: ${marcas.map((m) => [m.nombre_tipo, m.contacto, m.nota].filter(Boolean).join(" ") || "actividad").slice(0, 8).join("; ")}.`);
  const queHizo = partes.join(" ").slice(0, 2000);
  const lineas = rows.map((r) => {
    const quien = [r.placa, r.nombre].filter(Boolean).join(" ") || "Sin placa";
    const resto = [r.clasificacion, r.calificacion, r.intencion, r.proxima ? `sigue: ${r.proxima}` : ""].filter(Boolean).join(" · ");
    return `${quien}: ${resto}`;
  });
  let detalle = "";
  let usadas = 0;
  for (const linea of lineas) {
    const siguiente = detalle ? `${detalle}\n${linea}` : linea;
    if (siguiente.length > 1800) break;
    detalle = siguiente;
    usadas++;
  }
  if (usadas < lineas.length) detalle = `${detalle}\n… y ${lineas.length - usadas} llamadas más.`.slice(0, 2000);
  const trabasMap = new Map<string, number>();
  for (const r of rows) {
    if (efectivo(r.clasificacion) && /recibe informacion|continua con la vinculacion/i.test(r.calificacion)) continue;
    const motivo = r.calificacion || r.clasificacion || "Sin tipificar";
    trabasMap.set(motivo, (trabasMap.get(motivo) || 0) + 1);
  }
  const trabas = [...trabasMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([motivo, n]) => `${motivo}: ${n}`)
    .join(". ")
    .slice(0, 1000);
  const detalleCalle = citas
    .map((c) => `${String(c.hora || "").slice(0, 5)} ${c.tipo}: ${[c.placa, c.titulo, c.nota].filter(Boolean).join(" · ")}${c.hecho ? " · hecha" : ""}`.trim())
    .join("\n")
    .slice(0, 2000);
  const modo = rows.length && visitas ? "mixto" : visitas ? "calle" : "call";
  await sql.query(
    `insert into bitacoras (
       owner_id, fecha, modo, llamadas, visitas, dijo_si, polizas, que_hizo, detalle_call, detalle_calle, trabas, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     on conflict (owner_id, fecha) do update set
       llamadas = case when bitacoras.enviada = 1 then bitacoras.llamadas else excluded.llamadas end,
       visitas = case when bitacoras.enviada = 1 then bitacoras.visitas else excluded.visitas end,
       dijo_si = case when bitacoras.enviada = 1 then bitacoras.dijo_si else excluded.dijo_si end,
       polizas = case when bitacoras.enviada = 1 then bitacoras.polizas else excluded.polizas end,
       modo = case when bitacoras.modo = '' then excluded.modo else bitacoras.modo end,
       que_hizo = case when bitacoras.enviada = 1 or bitacoras.editada = 1 then bitacoras.que_hizo else excluded.que_hizo end,
       detalle_call = case when bitacoras.enviada = 1 or bitacoras.editada = 1 then bitacoras.detalle_call else excluded.detalle_call end,
       detalle_calle = case when bitacoras.enviada = 1 or bitacoras.editada = 1 then bitacoras.detalle_calle else excluded.detalle_calle end,
       trabas = case when bitacoras.enviada = 1 or bitacoras.editada = 1 or bitacoras.trabas <> '' then bitacoras.trabas else excluded.trabas end,
       updated_at = now()`,
    [ownerId, fecha, modo, rows.length, visitas, quiere, polizas, queHizo, detalle, detalleCalle, trabas],
  );
}

export const guardarLlamada = createServerFn({ method: "POST" })
  .validator((input: LlamadaDraft) => {
    if (!input || !Number.isFinite(Number(input.contactoId))) throw new Error("No hay contacto");
    return input;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ contacto: ContactoCall | null; aviso: string }> => {
    const profile = await perfilDe(context.userId);
    if (!llevaProcesos(profile.role)) throw new Error("La tipificación la hace el asesor");
    const clasificacion = texto(data.clasificacion, 80);
    const calificacion = texto(data.calificacion, 80);
    if (!clasificacion || !calificacion) throw new Error("Faltan la clasificación y la calificación");
    const tipo = tipoPersona(texto(data.tipoPersona, 20));
    const nombre = texto(data.nombre, 120).toUpperCase();
    const tel = telefonoBase(texto(data.tel, 20));
    const cc = texto(data.cc, 20).replace(/\D/g, "");
    if (nombre.length < 2) throw new Error("Falta el nombre del propietario");
    const laxa = /no contestan|fallas|no se encuentra|equivocado|mensaje/i.test(calificacion);
    if (tel.length < 7 && !laxa) throw new Error("Falta el teléfono del propietario");
    const tieneNuevo = flag(data.tieneNuevo);
    const nuevoTel = telefonoBase(texto(data.nuevoTel, 20));
    const nuevoNombre = texto(data.nuevoNombre, 120).toUpperCase();
    if (tieneNuevo && nuevoTel.length < 7) throw new Error("Falta el teléfono del nuevo propietario");
    const sql = await getSql();
    const ciudad = ciudadDe(profile);
    const hoy = hoyBogota();
    const hora = horaBogota();
    const fila = await filaPorId(sql, Number(data.contactoId));
    if (!fila) throw new Error("Ese contacto ya no está");
    if (!(await puedeVer(sql, ciudad, profile.slug, fila.id, hoy))) throw new Error("Esa empresa no está en tu cola");
    const noAplicaProxima = flag(data.noAplicaProxima);
    const noAplicaAfiliacion = flag(data.noAplicaAfiliacion);
    const fechaProxima = noAplicaProxima ? "" : fechaIso(texto(data.fechaProxima, 20));
    const intencion = texto(data.intencion, 120);
    const resultado = texto(data.resultado, 80);
    const esNoLocalizado = normalizar(intencion).includes("no se pudo localizar") && normalizar(resultado).includes("no localizado");
    const fechaAfiliacion = noAplicaAfiliacion || esNoLocalizado ? "" : fechaIso(texto(data.fechaAfiliacion, 20));
    const soloPropietario = flag(data.soloPropietario);
    let conductor = texto(data.conductor, 2000);
    if (soloPropietario && !/no se hizo contacto con el conductor/i.test(conductor)) {
      conductor = conductor ? `${conductor}. No se hizo contacto con el conductor, ya que el propietario contestó` : "No se hizo contacto con el conductor, ya que el propietario contestó";
    }
    const sao = armarSao({ tipoPersona: tipo, nombre, cc, tel, tieneNuevo, nuevoNombre, nuevoTel });
    const segundos = Math.max(0, Math.min(7200, Math.round(Number(data.segundos) || 0)));
    const gestion: GestionImportada = {
      agente: profile.name,
      fecha: hoy,
      clasificacion,
      calificacion,
      sao,
      conductor,
      propietario: texto(data.propietario, 2000),
      intencion,
      proxima: texto(data.proxima, 40),
      fechaProxima,
      noAplicaProxima,
      resultado,
      fechaAfiliacion,
      noAplicaAfiliacion: noAplicaAfiliacion || esNoLocalizado,
      motivo: texto(data.motivo, 80),
      observacionFinal: texto(data.observacionFinal, 2000),
      hora: "",
      tipoPersona: tipo,
      cc,
      tieneNuevo,
      nuevoNombre,
      nuevoTel,
      soloPropietario,
      nombreProp: nombre,
      telProp: tel,
    };
    const gestionId = await insertarGestion(sql, fila.id, ciudad, gestion, {
      id: profile.user_id,
      slug: profile.slug,
      nombre: profile.name,
      fecha: hoy,
      hora,
      segundos,
    });
    try {
      await refrescarBitacoraDia(sql, profile.user_id, ciudad, profile.slug, hoy);
    } catch {
      /* la tipificación ya quedó; la bitácora se rearma al abrirla */
    }
    await sql.query(
      `update call_contactos set propietario = $2, tel_propietario = $3, cc = $4 where id = $1`,
      [fila.id, nombre, tel, cc || fila.cc],
    );
    const avisos: string[] = [`Guardado ${fila.placa || fila.nombre}. ${duracionTexto(segundos)}.`];
    if (esWhatsapp(gestion.proxima) || /whatsapp/i.test(gestion.observacionFinal) || /whatsapp/i.test(gestion.propietario)) {
      const quien = tieneNuevo && nuevoNombre ? nuevoNombre : nombre || fila.nombre;
      const numero = tieneNuevo && nuevoTel ? nuevoTel : tel || fila.telefono;
      try {
        avisos.push(await anotarWhatsapp(sql, profile.user_id, ciudad, quien.slice(0, 80), numero, fila.placa, `Call center ${fila.placa}`.slice(0, 160), hora, hoy));
      } catch {
        avisos.push("La llamada quedó. No pude abrir el WhatsApp en Control.");
      }
    }
    const esDistintivo = /distintivo|entrega to/i.test(`${gestion.proxima} ${resultado}`);
    const quiereAgenda = Boolean(fechaProxima) && (flag(data.agendar) || ["llamar", "whatsapp", "agendar"].includes(normalizar(gestion.proxima)) || esDistintivo);
    if (quiereAgenda && gestionId) {
      const tipoAgenda = esWhatsapp(gestion.proxima) ? "escribir" : esDistintivo ? "distintivos" : normalizar(gestion.proxima) === "agendar" ? "visita" : "llamada";
      const titulo = (esDistintivo ? `Distintivos ${fila.placa}` : `${gestion.proxima || "Seguimiento"} ${fila.placa || fila.nombre}`).slice(0, 120);
      const horaCita = esDistintivo ? "10:00" : "";
      const cita = await sql.query<{ id: number }>(
        `insert into agenda (owner_id, caso_id, tipo, titulo, fecha, hora, nota, placa, conductor, promotor, estado)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
        [
          profile.user_id,
          fila.caso_id,
          tipoAgenda,
          titulo,
          fechaProxima,
          horaCita,
          texto(data.observacionFinal || data.propietario, 300),
          esDistintivo ? fila.placa : "",
          esDistintivo ? (nombre || fila.nombre) : "",
          esDistintivo ? profile.name : "",
          esDistintivo ? "Programados" : "",
        ],
      );
      if (cita[0]) await sql.query(`update call_gestiones set agenda_id = $1 where id = $2`, [cita[0].id, gestionId]);
      avisos.push(`Agendé el ${fechaProxima}.`);
    }
    const siguiente = data.contactoId
      ? await sql.query<FilaContacto>(
          `select c.id, c.empresa, c.nombre, c.estado, c.telefono, c.propietario, c.tel_propietario, c.vehiculo, c.placa, c.anio, c.cc, c.duplicado, c.caso_id, c.orden
           from call_contactos c
           where ${visible()} and ${PENDIENTE.replaceAll("$HOY", "$3")} and (c.empresa, c.orden, c.id) > ($4, $5, $6)
           order by c.empresa, c.orden, c.id limit 1`,
          [ciudad, profile.slug, hoy, fila.empresa, Number(fila.orden), Number(fila.id)],
        )
      : [];
    const proximaFila = siguiente[0] ?? (await primerPendiente(sql, ciudad, profile.slug, hoy));
    if (!proximaFila) {
      const actual = await filaPorId(sql, fila.id);
      return { contacto: actual ? await armarContacto(sql, ciudad, profile.slug, actual, hoy) : null, aviso: `${avisos.join(" ")} No hay más pendientes.` };
    }
    return { contacto: await armarContacto(sql, ciudad, profile.slug, proximaFila, hoy), aviso: avisos.join(" ") };
  });

export const abrirProcesoCall = createServerFn({ method: "POST" })
  .validator((input: { contactoId: number; nombre: string; cc: string; telefono: string }) => ({
    contactoId: Number(input.contactoId),
    nombre: texto(input.nombre, 80),
    cc: texto(input.cc, 20).replace(/\D/g, ""),
    telefono: telefonoBase(texto(input.telefono, 20)),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await perfilDe(context.userId);
    if (!llevaProcesos(profile.role)) throw new Error("El proceso lo abre el asesor");
    const sql = await getSql();
    const fila = await filaPorId(sql, data.contactoId);
    if (!fila) throw new Error("Ese contacto ya no está");
    if (fila.caso_id) return { casoId: Number(fila.caso_id), aviso: "Este contacto ya tiene proceso." };
    if (!fila.placa) throw new Error("Sin placa no se abre el proceso");
    const nombre = (data.nombre || fila.propietario || fila.nombre).trim().toUpperCase().slice(0, 80);
    const telefono = data.telefono || fila.tel_propietario || fila.telefono;
    if (!data.cc || nombre.length < 3 || telefono.length < 7) throw new Error("Para abrir el proceso faltan cédula, nombre y teléfono");
    const abiertas = await sql.query<{ name: string }>(
      `select p.name as name from casos c join profiles p on p.user_id = c.owner_id
       where upper(c.placa) = $1 and c.completado = false and btrim(c.motivo_cierre) = '' limit 1`,
      [fila.placa],
    );
    if (abiertas[0]) throw new Error(`La placa ${fila.placa} ya la tiene ${abiertas[0].name} abierta`);
    const { unificarEmpresa } = await import("./empresas");
    const empresa = fila.empresa === "SIN EMPRESA" ? "" : unificarEmpresa(fila.empresa);
    const partes = fila.vehiculo.split(" ").filter(Boolean);
    const creados = await sql.query<{ id: number }>(
      `insert into casos (owner_id, placa, cc, nombre, telefono, empresa, origen, fecha_inicio, dijo_si, marca, linea, modelo, ciudad_id)
       values ($1, $2, $3, $4, $5, $6, 'Base de datos (Call)', $7, false, $8, $9, $10, $11) returning id`,
      [profile.user_id, fila.placa, data.cc, nombre, telefono, empresa, hoyBogota(), partes[0] ?? "", partes.slice(1).join(" ").slice(0, 40), fila.anio.slice(0, 8), ciudadDe(profile)],
    );
    const casoId = Number(creados[0]?.id) || 0;
    if (!casoId) throw new Error("No pude abrir el proceso");
    await sql.query(`update call_contactos set caso_id = $2, cc = $3, propietario = $4, tel_propietario = $5 where id = $1`, [fila.id, casoId, data.cc, nombre, telefono]);
    await sql.query(
      `update call_gestiones set caso_id = $2 where contacto_id = $1 and id = (select max(id) from call_gestiones where contacto_id = $1)`,
      [fila.id, casoId],
    );
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "creo",
      entidad: "proceso",
      entidadId: casoId,
      etiqueta: fila.placa,
      detalle: `Abrió desde el call center el proceso ${fila.placa} · ${nombre}`,
    });
    return { casoId, aviso: `Abrí el proceso de ${fila.placa}.` };
  });

export const statsCall = createServerFn({ method: "POST" })
  .validator((input: { dia?: string }) => {
    const hoy = hoyBogota();
    return { dia: fechaIso(input?.dia) || hoy };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<StatsCall> => {
    const profile = await perfilDe(context.userId);
    if (!veElEquipo(profile.role)) throw new Error("Las estadísticas son de coordinación");
    const sql = await getSql();
    const ciudad = ciudadDe(profile);
    const efectivo = `lower(g.clasificacion) like '%efectivo%' and lower(g.clasificacion) not like '%no efectivo%'`;
    const noEfectivo = `lower(g.clasificacion) like '%no efectivo%'`;
    // Todas las gestiones de la ciudad. No depende de que la empresa esté activa.
    const base = `from call_gestiones g left join call_contactos c on c.id = g.contacto_id where g.ciudad_id = $1 and left(g.fecha, 4) >= '2000'`;
    const porAsesor = await sql.query<{ mes: string; nombre: string; total: number; efectivos: number; no_efectivos: number; segundos: number }>(
      `select left(g.fecha, 7) as mes, coalesce(nullif(g.asesor_nombre, ''), 'Sin asesor') as nombre, count(*)::int as total,
              count(*) filter (where ${efectivo})::int as efectivos,
              count(*) filter (where ${noEfectivo})::int as no_efectivos,
              coalesce(sum(g.segundos), 0)::int as segundos
       ${base} group by 1, 2 order by 1, 3 desc`,
      [ciudad],
    );
    const porEmpresa = await sql.query<{ mes: string; empresa: string; total: number; efectivos: number }>(
      `select left(g.fecha, 7) as mes, coalesce(nullif(c.empresa, ''), 'Sin empresa') as empresa, count(*)::int as total,
              count(*) filter (where ${efectivo})::int as efectivos
       ${base} group by 1, 2 order by 1, 3 desc`,
      [ciudad],
    );
    const porCalificacion = await sql.query<{ mes: string; calificacion: string; clasificacion: string; total: number }>(
      `select left(g.fecha, 7) as mes, coalesce(nullif(g.calificacion, ''), 'Sin calificación') as calificacion,
              coalesce(nullif(g.clasificacion, ''), '') as clasificacion, count(*)::int as total
       ${base} group by 1, 2, 3 order by 1, 4 desc`,
      [ciudad],
    );
    const porDia = await sql.query<{ mes: string; fecha: string; total: number; efectivos: number }>(
      `select left(g.fecha, 7) as mes, left(g.fecha, 10) as fecha, count(*)::int as total,
              count(*) filter (where ${efectivo})::int as efectivos
       ${base} group by 1, 2 order by 2`,
      [ciudad],
    );
    const minutos = await sql.query<{ hora: string; asesor: string; placa: string; nombre: string; clasificacion: string; segundos: number }>(
      `select g.hora, g.asesor_nombre as asesor, coalesce(c.placa, '') as placa, coalesce(c.nombre, g.nombre_prop) as nombre, g.clasificacion, g.segundos
       from call_gestiones g left join call_contactos c on c.id = g.contacto_id
       where g.ciudad_id = $1 and left(g.fecha, 10) = $2
       order by g.hora, g.id`,
      [ciudad, data.dia],
    );
    const meses = new Map<string, MesCall>();
    const tomar = (mes: string) => {
      const clave = String(mes || "").slice(0, 7);
      let item = meses.get(clave);
      if (!item) {
        item = { mes: clave, total: 0, efectivos: 0, noEfectivos: 0, segundos: 0, porAsesor: [], porEmpresa: [], porCalificacion: [], porDia: [] };
        meses.set(clave, item);
      }
      return item;
    };
    for (const row of porAsesor) {
      const item = tomar(row.mes);
      item.total += Number(row.total) || 0;
      item.efectivos += Number(row.efectivos) || 0;
      item.noEfectivos += Number(row.no_efectivos) || 0;
      item.segundos += Number(row.segundos) || 0;
      item.porAsesor.push({ nombre: row.nombre, total: Number(row.total) || 0, efectivos: Number(row.efectivos) || 0, segundos: Number(row.segundos) || 0 });
    }
    for (const row of porEmpresa) tomar(row.mes).porEmpresa.push({ empresa: row.empresa, total: Number(row.total) || 0, efectivos: Number(row.efectivos) || 0 });
    for (const row of porCalificacion) tomar(row.mes).porCalificacion.push({ calificacion: row.calificacion, clasificacion: row.clasificacion, total: Number(row.total) || 0 });
    for (const row of porDia) tomar(row.mes).porDia.push({ fecha: String(row.fecha).slice(0, 10), total: Number(row.total) || 0, efectivos: Number(row.efectivos) || 0 });
    return {
      dia: data.dia,
      meses: [...meses.values()].filter((item) => item.mes).sort((a, b) => a.mes.localeCompare(b.mes)),
      minutos: minutos.map((row) => ({
        hora: String(row.hora || "").slice(0, 5),
        asesor: row.asesor || "Sin asesor",
        placa: row.placa,
        nombre: row.nombre,
        clasificacion: row.clasificacion,
        segundos: Number(row.segundos) || 0,
      })),
    };
  });

export const exportarCall = createServerFn({ method: "POST" })
  .validator((input: { desde?: string; hasta?: string }) => {
    const hoy = hoyBogota();
    return { desde: fechaIso(input?.desde) || `${hoy.slice(0, 8)}01`, hasta: fechaIso(input?.hasta) || hoy };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await perfilDe(context.userId);
    if (!veElEquipo(profile.role)) throw new Error("La exportación es de coordinación");
    const sql = await getSql();
    const ciudad = ciudadDe(profile);
    const rows = await sql.query<Record<string, string | number>>(
      `select c.empresa as "EMPRESA", c.nombre as "Nombre completo", c.telefono as "Número de teléfono", c.placa as "Placa",
              c.vehiculo as "Vehículo", c.anio as "Año", g.fecha as "FECHA", g.hora as "HORA", g.asesor_nombre as "AGENTE",
              g.segundos as "SEGUNDOS", g.clasificacion as "CLASIFICACION", g.calificacion as "CALIFICACION",
              g.nombre_prop as "PROPIETARIO SAO", g.cc as "CC", g.tel_prop as "TELEFONO", g.obs_sao as "OBSERVACION SAO",
              g.obs_conductor as "OBSERVACION CONDUCTOR", g.obs_propietario as "OBSERVACION PROPIETARIO",
              g.intencion as "INTENCIÓN DE AFILIACION", g.proxima as "PRÓXIMA GESTION", g.fecha_proxima as "FECHA PRÓXIMA GESTION",
              g.resultado as "RESULTADO FINAL", g.fecha_afiliacion as "FECHA DE AFILIACION", g.motivo as "MOTIVO DE NO AFILIACION",
              g.observacion_final as "OBSERVACION FINAL"
       from call_gestiones g join call_contactos c on c.id = g.contacto_id
       where g.ciudad_id = $1 and g.fecha >= $2 and g.fecha <= $3
       order by g.fecha, g.hora, g.id`,
      [ciudad, data.desde, data.hasta],
    );
    const resumen = await sql.query<Record<string, string | number>>(
      `select coalesce(nullif(asesor_nombre, ''), 'Sin asesor') as "Agente", count(*)::int as "Llamadas",
              count(*) filter (where lower(clasificacion) like '%efectivo%' and lower(clasificacion) not like '%no efectivo%')::int as "Contacto efectivo"
       from call_gestiones where ciudad_id = $1 and fecha >= $2 and fecha <= $3
       group by 1 order by 2 desc`,
      [ciudad, data.desde, data.hasta],
    );
    const { excelGestiones } = await import("./callcenter.server");
    const base64 = await excelGestiones(
      rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v == null ? "" : String(v)]))),
      resumen.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v == null ? "" : String(v)]))),
    );
    return { base64, filename: `llamadas-${data.desde}-a-${data.hasta}.xlsx` };
  });

export const listBriefing = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BriefingItem[]> => {
    const profile = await perfilDe(context.userId);
    const sql = await getSql();
    const ciudad = ciudadDe(profile);
    await sembrarBriefing(sql, ciudad);
    const rows = await sql.query<BriefingItem>(
      `select seccion, titulo, cuerpo, orden from call_briefing where ciudad_id = $1 order by orden, titulo`,
      [ciudad],
    );
    return rows.map((row) => ({ seccion: row.seccion, titulo: row.titulo, cuerpo: row.cuerpo, orden: Number(row.orden) || 0 }));
  });

export const guardarBriefing = createServerFn({ method: "POST" })
  .validator((input: { seccion: string; cuerpo: string }) => ({
    seccion: texto(input.seccion, 40),
    cuerpo: texto(input.cuerpo, 20000),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await perfilDe(context.userId);
    if (!veElEquipo(profile.role)) throw new Error("El briefing lo edita coordinación");
    if (!data.seccion) throw new Error("Falta la sección");
    const sql = await getSql();
    await sql.query(`update call_briefing set cuerpo = $3 where ciudad_id = $1 and seccion = $2`, [ciudadDe(profile), data.seccion, data.cuerpo]);
    return { ok: true };
  });

export const listDistintivos = createServerFn({ method: "POST" })
  .validator((mes: string) => {
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error("Mes inválido");
    return mes;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: mes }): Promise<DistintivoItem[]> => {
    const profile = await perfilDe(context.userId);
    const sql = await getSql();
    const rows = await sql.query<{
      id: number; fecha: string; hora: string; placa: string; conductor: string; cedula: string; promotor: string; estado: string; nota: string;
    }>(
      `select id, fecha, hora, placa, conductor, cedula, promotor, estado, nota
       from call_distintivos where ciudad_id = $1 and fecha >= $2 and fecha < $3
       order by fecha, hora, id`,
      [ciudadDe(profile), `${mes}-01`, mesFin(mes)],
    );
    const { FESTIVOS_2026 } = await import("./callcenter");
    return rows.map((row) => ({
      id: Number(row.id),
      fecha: String(row.fecha).slice(0, 10),
      hora: String(row.hora || "").slice(0, 5),
      placa: row.placa,
      conductor: row.conductor,
      cedula: row.cedula,
      promotor: row.promotor,
      estado: row.estado,
      nota: row.nota,
      festivo: FESTIVOS_2026[String(row.fecha).slice(0, 10)] ?? "",
    }));
  });

function mesFin(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const siguiente = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return siguiente;
}

async function dueñoDistintivo(sql: Sql, ciudad: number, promotor: string, fallback: string) {
  if (!promotor) return fallback;
  const rows = await sql.query<{ user_id: string }>(
    `select user_id from profiles
     where coalesce(ciudad_id, 1) = $1 and role in ('asesor', 'lider', 'coordinadora')
       and (lower(name) = lower($2) or lower(name) like lower($3) or lower($2) like '%' || lower(split_part(name, ' ', 1)) || '%')
     order by length(name) desc limit 1`,
    [ciudad, promotor, `%${promotor.split(" ")[0]}%`],
  );
  return rows[0]?.user_id || fallback;
}

export const guardarDistintivo = createServerFn({ method: "POST" })
  .validator((input: { id?: number; fecha: string; hora: string; placa: string; conductor: string; cedula: string; promotor: string; estado: string; nota: string }) => {
    const fecha = fechaIso(input.fecha);
    if (!fecha) throw new Error("Falta la fecha");
    const hora = /^\d{2}:\d{2}$/.test(input.hora) ? input.hora : "";
    return {
      id: Number(input.id) || 0,
      fecha,
      hora,
      placa: texto(input.placa, 8).toUpperCase().replace(/[^A-Z0-9]/g, ""),
      conductor: texto(input.conductor, 120),
      cedula: texto(input.cedula, 20).replace(/\D/g, ""),
      promotor: texto(input.promotor, 120),
      estado: texto(input.estado, 40) || "Programados",
      nota: texto(input.nota, 400),
    };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await perfilDe(context.userId);
    if (!veElEquipo(profile.role) && !llevaProcesos(profile.role)) throw new Error("No autorizado");
    const sql = await getSql();
    const ciudad = ciudadDe(profile);
    const { FESTIVOS_2026 } = await import("./callcenter");
    const festivo = FESTIVOS_2026[data.fecha] ? 1 : 0;
    const hecho = normalizar(data.estado).startsWith("instal");
    let id = data.id;
    let agendaId = 0;
    if (id) {
      const previas = await sql.query<{ agenda_id: number | null }>(`select agenda_id from call_distintivos where id = $1 and ciudad_id = $2`, [id, ciudad]);
      if (!previas[0]) throw new Error("Esa cita no está");
      agendaId = Number(previas[0].agenda_id) || 0;
      await sql.query(
        `update call_distintivos set fecha = $2, hora = $3, placa = $4, conductor = $5, cedula = $6, promotor = $7, estado = $8, nota = $9, festivo = $10 where id = $1`,
        [id, data.fecha, data.hora, data.placa, data.conductor, data.cedula, data.promotor, data.estado, data.nota, festivo],
      );
    } else {
      const owner = await dueñoDistintivo(sql, ciudad, data.promotor, profile.user_id);
      const caso = data.placa
        ? await sql.query<{ id: number }>(
            `select id from casos where upper(placa) = $1 and completado = false and btrim(motivo_cierre) = '' order by id desc limit 1`,
            [data.placa],
          )
        : [];
      const agenda = await sql.query<{ id: number }>(
        `insert into agenda (owner_id, caso_id, tipo, titulo, fecha, hora, nota, hecho)
         values ($1, $2, 'visita', $3, $4, $5, $6, $7) returning id`,
        [owner, caso[0]?.id ?? null, `Distintivos ${data.placa || data.conductor}`.slice(0, 120), data.fecha, data.hora, data.nota, hecho],
      );
      agendaId = Number(agenda[0]?.id) || 0;
      const creadas = await sql.query<{ id: number }>(
        `insert into call_distintivos (ciudad_id, fecha, hora, placa, conductor, cedula, promotor, estado, nota, festivo, agenda_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
        [ciudad, data.fecha, data.hora, data.placa, data.conductor, data.cedula, data.promotor, data.estado, data.nota, festivo, agendaId || null],
      );
      id = Number(creadas[0]?.id) || 0;
    }
    if (agendaId && id && data.id) {
      await sql.query(
        `update agenda set titulo = $2, fecha = $3, hora = $4, nota = $5, hecho = $6, updated_at = now() where id = $1`,
        [agendaId, `Distintivos ${data.placa || data.conductor}`.slice(0, 120), data.fecha, data.hora, data.nota, hecho],
      );
    }
    return { ok: true, id };
  });

export const borrarDistintivo = createServerFn({ method: "POST" })
  .validator((id: number) => {
    if (!Number.isFinite(id)) throw new Error("Cita inválida");
    return id;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const profile = await perfilDe(context.userId);
    if (!veElEquipo(profile.role)) throw new Error("Solo coordinación borra citas");
    const sql = await getSql();
    const rows = await sql.query<{ agenda_id: number | null }>(`select agenda_id from call_distintivos where id = $1 and ciudad_id = $2`, [id, ciudadDe(profile)]);
    if (!rows[0]) throw new Error("Esa cita no está");
    if (rows[0].agenda_id) await sql.query(`delete from agenda where id = $1`, [rows[0].agenda_id]);
    await sql.query(`delete from call_distintivos where id = $1`, [id]);
    return { ok: true };
  });

export const trozoDistintivos = createServerFn({ method: "POST" })
  .validator((input: { cargaId: string; orden: number; datos: string; fin: boolean; nombre: string }) => ({
    cargaId: texto(input.cargaId, 80),
    orden: Number(input.orden) || 0,
    datos: String(input.datos ?? ""),
    fin: Boolean(input.fin),
    nombre: texto(input.nombre, 160),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const profile = await perfilDe(context.userId);
    if (!veElEquipo(profile.role)) throw new Error("Solo coordinación carga la agenda");
    if (!data.cargaId || data.datos.length > 700_000) throw new Error("No pude recibir el archivo");
    const sql = await getSql();
    await sql.query(
      `insert into carga_trozos (carga_id, orden, datos, caso_id, tipo, nombre) values ($1, $2, $3, 0, 'call_dist', $4)
       on conflict (carga_id, orden) do update set datos = excluded.datos`,
      [data.cargaId, data.orden, data.datos, data.nombre],
    );
    if (!data.fin) return { ok: true, citas: 0 };
    const partes = await sql.query<{ orden: number; datos: string }>(
      `select orden, datos from carga_trozos where carga_id = $1 and tipo = 'call_dist' order by orden`,
      [data.cargaId],
    );
    await sql.query(`delete from carga_trozos where carga_id = $1 and tipo = 'call_dist'`, [data.cargaId]);
    const { leerAgendaDistintivos } = await import("./callcenter.server");
    const citas = await leerAgendaDistintivos(partes.map((parte) => parte.datos).join(""));
    const ciudad = ciudadDe(profile);
    let nuevas = 0;
    for (const cita of citas) {
      const ya = await sql.query<{ id: number }>(
        `select id from agenda where tipo = 'distintivos' and fecha = $1 and hora = $2 and placa = $3 and lower(conductor) = lower($4) limit 1`,
        [cita.fecha, cita.hora, cita.placa, cita.conductor],
      );
      const hecho = normalizar(cita.estado).startsWith("instal");
      if (ya[0]) {
        await sql.query(
          `update agenda set estado = $2, nota = $3, cedula = $4, promotor = $5, hecho = $6, updated_at = now() where id = $1`,
          [ya[0].id, cita.estado || "Programados", cita.nota, cita.cedula, cita.promotor, hecho],
        );
        continue;
      }
      const owner = await dueñoDistintivo(sql, ciudad, cita.promotor, profile.user_id);
      const caso = cita.placa
        ? await sql.query<{ id: number }>(
            `select id from casos where upper(placa) = $1 and completado = false and btrim(motivo_cierre) = '' order by id desc limit 1`,
            [cita.placa],
          )
        : [];
      await sql.query(
        `insert into agenda (owner_id, caso_id, tipo, titulo, fecha, hora, nota, hecho, placa, conductor, cedula, promotor, estado)
         values ($1,$2,'distintivos',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          owner,
          caso[0]?.id ?? null,
          `Distintivos ${cita.placa || cita.conductor}`.slice(0, 120),
          cita.fecha,
          cita.hora || "10:00",
          cita.nota,
          hecho,
          cita.placa,
          cita.conductor,
          cita.cedula,
          cita.promotor,
          cita.estado || "Programados",
        ],
      );
      nuevas += 1;
    }
    return { ok: true, citas: nuevas, leidas: citas.length };
  });
