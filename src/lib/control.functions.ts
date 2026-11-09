import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { hoyBogota } from "@/lib/casos";
import { horaBogota } from "@/lib/bitacora";
import { configura, llevaProcesos, veElEquipo, accesoJson, rolDeAcceso, accesoDe, type Acceso, type Role } from "@/lib/team.public";
import { trabajaElDia, type MarcaControl, type MarcaTipo, type PersonaEquipo } from "@/lib/control";

const META_EMPIEZA = "2026-10-07";

function plano(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function horaValida(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function telefonoLimpio(value: string) {
  const digitos = value.replace(/\D/g, "");
  if (digitos.length === 12 && digitos.startsWith("57")) return digitos.slice(2);
  return digitos;
}

function ciudadDe(profile: { role: string; ciudad_id: number | null; ciudad_vista: number | null }) {
  if (profile.role === "gerencia") return profile.ciudad_vista || profile.ciudad_id || 1;
  return profile.ciudad_id || 1;
}

async function asegurarTipos(ciudadId: number) {
  const sql = await getSql();
  const ya = await sql.query<{ id: number }>(`select id from control_tipos where ciudad_id = $1 and activo = 1 limit 1`, [ciudadId]);
  if (ya[0]) return;
  await sql.query(
    `insert into control_tipos (ciudad_id, nombre, predeterminada, todos) values ($1, 'Llamando', 1, 1)`,
    [ciudadId],
  );
  await sql.query(
    `insert into control_tipos (ciudad_id, nombre, pide_contacto, paralela, todos) values ($1, 'Atención por WhatsApp', 1, 1, 1)`,
    [ciudadId],
  );
  await sql.query(
    `insert into control_tipos (ciudad_id, nombre, pide_proceso, todos) values ($1, 'Pegar distintivos', 1, 1)`,
    [ciudadId],
  );
  await sql.query(
    `insert into control_tipos (ciudad_id, nombre, pide_proceso, todos) values ($1, 'Compra de pólizas', 1, 1)`,
    [ciudadId],
  );
}

async function tipoPermitido(id: number, slug: string) {
  if (!Number.isFinite(id) || id <= 0) throw new Error("Elige la tipificación");
  const sql = await getSql();
  const rows = await sql.query<{
    id: number;
    nombre: string;
    pide_contacto: number;
    pide_proceso: number;
    una_vez: number;
    predeterminada: number;
    paralela: number;
    todos: number;
    activo: number;
  }>(`select id, nombre, pide_contacto, pide_proceso, una_vez, predeterminada, paralela, todos, activo from control_tipos where id = $1`, [id]);
  const tipo = rows[0];
  if (!tipo || Number(tipo.activo) !== 1) throw new Error("Esa tipificación ya no está");
  if (Number(tipo.todos) !== 1) {
    const asignado = await sql.query<{ slug: string }>(
      `select slug from control_tipo_gente where tipo_id = $1 and slug = $2`,
      [id, slug],
    );
    if (!asignado[0]) throw new Error("Esa tipificación no es para esta persona");
  }
  return {
    id: Number(tipo.id),
    nombre: tipo.nombre,
    pideContacto: Number(tipo.pide_contacto) === 1,
    pideProceso: Number(tipo.pide_proceso) === 1,
    unaVez: Number(tipo.una_vez) === 1,
    predeterminada: Number(tipo.predeterminada) === 1,
    paralela: Number(tipo.paralela) === 1,
  };
}

async function personasDe(hoy: string, soloId?: string, ciudadId?: number) {
  const sql = await getSql();
  await sql.query(`alter table profiles add column if not exists acceso text not null default ''`);
  const gente = await sql.query<{
    user_id: string;
    slug: string;
    name: string;
    role: Role;
    activo: number;
    empieza: string;
    entrada: string;
    salida: string;
    acceso: string;
  }>(
    soloId
      ? `select p.user_id, p.slug, p.name, p.role,
            coalesce(e.activo, 1) as activo,
            coalesce(e.empieza, $2) as empieza,
            coalesce(e.entrada, '08:00') as entrada,
            coalesce(e.salida, '17:00') as salida,
            coalesce(p.acceso, '') as acceso
         from profiles p
         left join equipo_extra e on e.owner_id = p.user_id
         where p.user_id = $1
         order by p.name`
      : `select p.user_id, p.slug, p.name, p.role,
            coalesce(e.activo, 1) as activo,
            coalesce(e.empieza, $1) as empieza,
            coalesce(e.entrada, '08:00') as entrada,
            coalesce(e.salida, '17:00') as salida,
            coalesce(p.acceso, '') as acceso
         from profiles p
         left join equipo_extra e on e.owner_id = p.user_id
         where p.role in ('asesor', 'lider', 'coordinadora', 'via_seguros', 'operativa', 'servicio')
           and coalesce(p.ciudad_id, 1) = $2
         order by p.name`,
    soloId ? [soloId, META_EMPIEZA] : [META_EMPIEZA, ciudadId ?? 1],
  );
  const dias = await sql.query<{ slug: string; cuenta: number }>(
    `select p.slug, d.cuenta
     from dias_meta d join profiles p on p.user_id = d.owner_id
     where d.fecha = $1`,
    [hoy],
  );
  const cuenta = new Map(dias.map((row) => [row.slug, Number(row.cuenta) === 1]));
  return gente.map((row) => ({
    userId: row.user_id,
    persona: {
      slug: row.slug,
      name: row.name,
      role: row.role,
      activo: Number(row.activo) === 1,
      empieza: String(row.empieza).slice(0, 10),
      entrada: String(row.entrada).slice(0, 5),
      salida: String(row.salida).slice(0, 5),
      acceso: row.acceso ?? "",
      trabajaHoy: row.role === "coordinadora"
        ? false
        : trabajaElDia({
            hoy,
            empieza: String(row.empieza).slice(0, 10),
            activo: Number(row.activo) === 1,
            cuenta: cuenta.has(row.slug) ? cuenta.get(row.slug)! : null,
          }),
    } satisfies PersonaEquipo,
  }));
}

async function guardarClaveVisible(userId: string, clave: string) {
  const sql = await getSql();
  await sql.query(
    `insert into claves_equipo (user_id, clave, updated_at) values ($1, $2, now())
     on conflict (user_id) do update set clave = excluded.clave, updated_at = now()`,
    [userId, clave],
  );
}

async function anotarControl(actor: { user_id: string; slug: string; name: string }, slug: string | undefined, detalle: string) {
  const { anotar } = await import("./auditoria.server");
  const deQuien = slug && slug !== actor.slug ? `${slug}: ` : "";
  await anotar(actor, { accion: "marco", entidad: "control", etiqueta: slug || actor.slug, detalle: `${deQuien}${detalle}` });
}

function aMarca(row: {
  id: number;
  slug: string;
  tipo: string;
  fecha: string;
  hora: string;
  hora_fin: string;
  caso_id: number | null;
  placa: string;
  cliente: string;
  nota: string;
  tipo_id?: number | null;
  nombre_tipo?: string;
  contacto?: string;
  telefono?: string;
  placa_libre?: string;
  sin_proceso?: number | null;
  minutos?: number | null;
  paralela?: number | null;
}): MarcaControl {
  return {
    id: Number(row.id),
    slug: row.slug,
    tipo: row.tipo as MarcaTipo,
    fecha: String(row.fecha).slice(0, 10),
    hora: String(row.hora).slice(0, 5),
    horaFin: row.hora_fin ? String(row.hora_fin).slice(0, 5) : "",
    casoId: row.caso_id == null ? null : Number(row.caso_id),
    placa: row.placa ?? "",
    cliente: row.cliente ?? "",
    nota: row.nota ?? "",
    tipoId: row.tipo_id == null ? null : Number(row.tipo_id),
    nombreTipo: row.nombre_tipo ?? "",
    contacto: row.contacto ?? "",
    telefono: row.telefono ?? "",
    placaLibre: row.placa_libre ?? "",
    sinProceso: Number(row.sin_proceso) === 1,
    cupo: Number(row.minutos) || 0,
    paralela: Number(row.paralela) === 1,
    atenciones: [],
  };
}

async function guardarAtencion(marcaId: number, contacto: string, telefono: string, placa: string, nota: string, hora: string) {
  const sql = await getSql();
  await sql.query(
    `insert into control_atenciones (marca_id, contacto, telefono, placa_libre, nota, hora) values ($1, $2, $3, $4, $5, $6)`,
    [marcaId, contacto, telefono, placa, nota, hora],
  );
}

async function conAtenciones(marcas: MarcaControl[]) {
  const ids = [...new Set(marcas.map((marca) => Math.trunc(Number(marca.id))).filter((id) => id > 0))];
  if (ids.length === 0) return marcas;
  const sql = await getSql();
  const filas = await sql.query<{
    id: number;
    marca_id: number;
    contacto: string;
    telefono: string;
    placa_libre: string;
    nota: string;
    hora: string;
  }>(
    `select id, marca_id, contacto, telefono, placa_libre, nota, hora
     from control_atenciones where marca_id in (${ids.join(",")}) order by hora, id`,
  );
  const porMarca = new Map<number, MarcaControl["atenciones"]>();
  for (const fila of filas) {
    const id = Number(fila.marca_id);
    const lista = porMarca.get(id) ?? [];
    lista.push({
      id: Number(fila.id),
      contacto: fila.contacto ?? "",
      telefono: fila.telefono ?? "",
      placaLibre: fila.placa_libre ?? "",
      nota: fila.nota ?? "",
      hora: fila.hora ? String(fila.hora).slice(0, 5) : "",
    });
    porMarca.set(id, lista);
  }
  return marcas.map((marca) => ({ ...marca, atenciones: porMarca.get(marca.id) ?? [] }));
}

const MARCAS_SQL = `select m.id, p.slug, m.tipo, m.fecha, m.hora, m.hora_fin, m.caso_id, m.nota,
    coalesce(c.placa, '') as placa, coalesce(c.nombre, '') as cliente,
    m.tipo_id, coalesce(t.nombre, '') as nombre_tipo, m.contacto, m.telefono, m.placa_libre, m.sin_proceso,
    coalesce(t.minutos, 0) as minutos, coalesce(t.paralela, 0) as paralela
  from control_marcas m
  join profiles p on p.user_id = m.owner_id
  left join casos c on c.id = m.caso_id
  left join control_tipos t on t.id = m.tipo_id`;

export const listEquipo = createServerFn({ method: "GET" })
  .validator((fecha?: string) => {
    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Día inválido");
    return fecha ?? "";
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No autorizado");
    const hoy = data || hoyBogota();
    const ciudad = profile.role === "gerencia" ? (profile.ciudad_vista ?? 0) : (profile.ciudad_id ?? 1);
    const rows = await personasDe(hoy, veElEquipo(profile.role) ? undefined : profile.user_id, ciudad);
    if (!configura(profile.role)) return rows.map((row) => row.persona);
    const sql = await getSql();
    const claves = await sql.query<{ user_id: string; clave: string }>(`select user_id, clave from claves_equipo`);
    const mapa = new Map(claves.map((row) => [row.user_id, row.clave]));
    return rows.map((row) => ({ ...row.persona, clave: mapa.get(row.userId) ?? "" }));
  });

export const listMarcas = createServerFn({ method: "GET" })
  .validator((fecha: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("Día inválido");
    return fecha;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: fecha }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No autorizado");
    const sql = await getSql();
    const equipo = veElEquipo(profile.role);
    const ciudad = ciudadDe(profile);
    const rows = await sql.query(
      equipo
        ? `${MARCAS_SQL} where m.fecha = $1 and coalesce(p.ciudad_id, 1) = $2 order by m.hora, m.id`
        : `${MARCAS_SQL} where m.fecha = $1 and m.owner_id = $2 order by m.hora, m.id`,
      equipo ? [fecha, ciudad] : [fecha, profile.user_id],
    );
    return conAtenciones(rows.map((row) => aMarca(row as Parameters<typeof aMarca>[0])));
  });

export const listTipos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No autorizado");
    const ciudad = ciudadDe(profile);
    await asegurarTipos(ciudad);
    const sql = await getSql();
    const tipos = await sql.query<{
      id: number;
      nombre: string;
      pide_contacto: number;
      pide_proceso: number;
      una_vez: number;
      minutos: number;
      predeterminada: number;
      paralela: number;
      todos: number;
    }>(
      `select id, nombre, pide_contacto, pide_proceso, una_vez, minutos, predeterminada, paralela, todos
       from control_tipos where ciudad_id = $1 and activo = 1 order by predeterminada desc, id`,
      [ciudad],
    );
    const gente = await sql.query<{ tipo_id: number; slug: string }>(
      `select g.tipo_id, g.slug from control_tipo_gente g
       join control_tipos t on t.id = g.tipo_id
       where t.ciudad_id = $1`,
      [ciudad],
    );
    return tipos.map((tipo) => ({
      id: Number(tipo.id),
      nombre: tipo.nombre,
      pideContacto: Number(tipo.pide_contacto) === 1,
      pideProceso: Number(tipo.pide_proceso) === 1,
      unaVez: Number(tipo.una_vez) === 1,
      minutos: Number(tipo.minutos) || 0,
      predeterminada: Number(tipo.predeterminada) === 1,
      paralela: Number(tipo.paralela) === 1,
      todos: Number(tipo.todos) === 1,
      slugs: gente.filter((fila) => Number(fila.tipo_id) === Number(tipo.id)).map((fila) => fila.slug),
    }));
  });

export const guardarTipo = createServerFn({ method: "POST" })
  .validator((input: {
    id?: number | null;
    nombre: string;
    pideContacto: boolean;
    pideProceso: boolean;
    unaVez: boolean;
    minutos: number;
    predeterminada: boolean;
    paralela: boolean;
    todos: boolean;
    slugs: string[];
  }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !veElEquipo(profile.role)) throw new Error("Solo coordinación crea tipificaciones");
    const nombre = data.nombre.trim().slice(0, 40);
    if (nombre.length < 2) throw new Error("Ponle un nombre");
    const minutos = Math.max(0, Math.min(240, Math.trunc(Number(data.minutos) || 0)));
    const predeterminada = Boolean(data.predeterminada);
    const paralela = predeterminada ? false : Boolean(data.paralela);
    const todos = predeterminada ? true : Boolean(data.todos);
    const slugs = [...new Set(data.slugs.map((slug) => slug.trim()).filter(Boolean))];
    if (!todos && slugs.length === 0) throw new Error("Elige al menos una persona, o déjala para todo el equipo");
    const ciudad = ciudadDe(profile);
    const sql = await getSql();
    let id = Number(data.id) || 0;
    if (id) {
      const propias = await sql.query<{ id: number }>(`select id from control_tipos where id = $1 and ciudad_id = $2`, [id, ciudad]);
      if (!propias[0]) throw new Error("Esa tipificación no es de esta ciudad");
      await sql.query(
        `update control_tipos set nombre = $1, pide_contacto = $2, pide_proceso = $3, una_vez = $4, minutos = $5,
           predeterminada = $6, todos = $7, paralela = $8 where id = $9`,
        [nombre, data.pideContacto ? 1 : 0, data.pideProceso ? 1 : 0, data.unaVez ? 1 : 0, minutos, predeterminada ? 1 : 0, todos ? 1 : 0, paralela ? 1 : 0, id],
      );
    } else {
      const creadas = await sql.query<{ id: number }>(
        `insert into control_tipos (ciudad_id, nombre, pide_contacto, pide_proceso, una_vez, minutos, predeterminada, todos, paralela)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
        [ciudad, nombre, data.pideContacto ? 1 : 0, data.pideProceso ? 1 : 0, data.unaVez ? 1 : 0, minutos, predeterminada ? 1 : 0, todos ? 1 : 0, paralela ? 1 : 0],
      );
      id = Number(creadas[0]?.id);
    }
    if (predeterminada) {
      await sql.query(`update control_tipos set predeterminada = 0 where ciudad_id = $1 and id <> $2`, [ciudad, id]);
    }
    await sql.query(`delete from control_tipo_gente where tipo_id = $1`, [id]);
    if (!todos) {
      for (const slug of slugs) {
        await sql.query(`insert into control_tipo_gente (tipo_id, slug) values ($1, $2) on conflict do nothing`, [id, slug]);
      }
    }
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: data.id ? "edito" : "creo",
      entidad: "control",
      etiqueta: nombre,
      detalle: `${data.id ? "Editó" : "Creó"} la tipificación ${nombre}${data.predeterminada ? " como la de base" : ""}`,
    });
    return { ok: true, id };
  });

export const quitarTipo = createServerFn({ method: "POST" })
  .validator((id: number) => {
    if (!Number.isFinite(id)) throw new Error("Tipificación inválida");
    return id;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !veElEquipo(profile.role)) throw new Error("Solo coordinación quita tipificaciones");
    const ciudad = ciudadDe(profile);
    const sql = await getSql();
    const tipos = await sql.query<{ nombre: string }>(`select nombre from control_tipos where id = $1 and ciudad_id = $2`, [id, ciudad]);
    if (!tipos[0]) throw new Error("No encontré esa tipificación");
    const usadas = await sql.query<{ id: number }>(`select id from control_marcas where tipo_id = $1 limit 1`, [id]);
    if (usadas[0]) await sql.query(`update control_tipos set activo = 0 where id = $1`, [id]);
    else await sql.query(`delete from control_tipos where id = $1`, [id]);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "borro",
      entidad: "control",
      etiqueta: tipos[0].nombre,
      detalle: `Quitó la tipificación ${tipos[0].nombre}`,
    });
    return { ok: true };
  });

export const marcarControl = createServerFn({ method: "POST" })
  .validator((input: {
    accion: "ingreso" | "salida" | "break" | "almuerzo" | "visita" | "volver" | "soltar" | "actividad";
    casoId?: number | null;
    slug?: string;
    hora?: string;
    fecha?: string;
    tipoId?: number | null;
    contacto?: string;
    telefono?: string;
    placaLibre?: string;
    sinProceso?: boolean;
    nota?: string;
  }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No autorizado");
    const sql = await getSql();
    const hoy = hoyBogota();
    const fecha = data.fecha && /^\d{4}-\d{2}-\d{2}$/.test(data.fecha) ? data.fecha : hoy;
    if (fecha > hoy) throw new Error("Ese día todavía no llega");
    const hora = data.hora && /^([01]\d|2[0-3]):[0-5]\d$/.test(data.hora) ? data.hora : horaBogota();
    let ownerId = profile.user_id;
    if (data.slug && data.slug !== profile.slug) {
      if (!veElEquipo(profile.role)) throw new Error("Solo coordinación marca a otra persona");
      const dueños = await sql.query<{ user_id: string; role: string }>(`select user_id, role from profiles where slug = $1`, [data.slug]);
      const dueño = dueños[0];
      if (!dueño) throw new Error("No encontré a esa persona");
      if (!llevaProcesos(dueño.role)) throw new Error("Coordinación no tiene horario");
      ownerId = dueño.user_id;
    } else if (!llevaProcesos(profile.role)) {
      throw new Error("Coordinación no marca horario");
    }
    const abiertas = await sql.query<{ id: number; tipo: string; tipo_id: number | null; paralela: number }>(
      `select m.id, m.tipo, m.tipo_id, coalesce(t.paralela, 0) as paralela
       from control_marcas m
       left join control_tipos t on t.id = m.tipo_id
       where m.owner_id = $1 and m.fecha = $2 and m.hora_fin = ''
         and m.tipo in ('break', 'almuerzo', 'visita', 'otro', 'actividad')
       order by m.id`,
      [ownerId, fecha],
    );
    const exclusivas = abiertas.filter((fila) => Number(fila.paralela) !== 1);
    const paralelas = abiertas.filter((fila) => Number(fila.paralela) === 1);
    const puntos = await sql.query<{ tipo: string }>(
      `select tipo from control_marcas where owner_id = $1 and fecha = $2 and tipo in ('ingreso', 'salida') order by id`,
      [ownerId, fecha],
    );
    const ultimo = puntos[puntos.length - 1]?.tipo;
    async function cerrar(ids: number[]) {
      for (const id of ids) {
        await sql.query(`update control_marcas set hora_fin = $1 where id = $2 and hora_fin = ''`, [hora, id]);
      }
    }

    if (data.accion === "volver") {
      if (exclusivas.length === 0) throw new Error("No hay una salida abierta");
      const ciudad = ciudadDe(profile);
      const bases = await sql.query<{ id: number; nombre: string }>(
        `select id, nombre from control_tipos where ciudad_id = $1 and activo = 1 and predeterminada = 1 order by id limit 1`,
        [ciudad],
      );
      const base = bases[0];
      if (!base) throw new Error("En Tipificaciones marca una como la de base. A esa vuelven y esa se anota.");
      await cerrar(exclusivas.map((fila) => Number(fila.id)));
      await sql.query(
        `insert into control_marcas (owner_id, tipo, fecha, hora, hora_fin, tipo_id, nota)
         values ($1, 'actividad', $2, $3, $3, $4, 'Volvió')`,
        [ownerId, fecha, hora, base.id],
      );
      await anotarControl(profile, data.slug, `volvió a ${base.nombre} a las ${hora} (${fecha})`);
      return { ok: true };
    }
    if (data.accion === "soltar") {
      const cuales = paralelas.filter((fila) => !data.tipoId || Number(fila.tipo_id) === Number(data.tipoId));
      if (cuales.length === 0) throw new Error("Esa gestión no está abierta");
      await cerrar(cuales.map((fila) => Number(fila.id)));
      await anotarControl(profile, data.slug, `dejó esa gestión a las ${hora} (${fecha})`);
      return { ok: true };
    }
    if (data.accion === "ingreso") {
      if (abiertas.length > 0) throw new Error("Primero marca que volvió");
      if (ultimo === "ingreso") throw new Error("Ya tiene la entrada marcada");
      await sql.query(
        `insert into control_marcas (owner_id, tipo, fecha, hora, hora_fin) values ($1, 'ingreso', $2, $3, $3)`,
        [ownerId, fecha, hora],
      );
      await anotarControl(profile, data.slug, `marcó entrada a las ${hora} (${fecha})`);
      return { ok: true };
    }
    if (data.accion === "salida") {
      if (ultimo !== "ingreso") throw new Error("Primero marca la entrada");
      await cerrar(abiertas.map((fila) => Number(fila.id)));
      await sql.query(
        `insert into control_marcas (owner_id, tipo, fecha, hora, hora_fin) values ($1, 'salida', $2, $3, $3)`,
        [ownerId, fecha, hora],
      );
      await anotarControl(profile, data.slug, `marcó salida a las ${hora} (${fecha})`);
      return { ok: true };
    }
    if (ultimo !== "ingreso") throw new Error("Primero marca la entrada");
    if (data.accion === "actividad") {
      const dueños = await sql.query<{ slug: string }>(`select slug from profiles where user_id = $1`, [ownerId]);
      const slug = dueños[0]?.slug ?? "";
      const tipo = await tipoPermitido(Number(data.tipoId), slug);
      if (tipo.predeterminada) throw new Error("Esa es la actividad de base. Quedan en ella cuando vuelven, no se marca.");
      const contacto = (data.contacto ?? "").trim().slice(0, 80);
      const telefono = telefonoLimpio(data.telefono ?? "");
      const placaLibre = (data.placaLibre ?? "").trim().toUpperCase().slice(0, 8);
      const nota = (data.nota ?? "").trim().slice(0, 160);
      if (tipo.pideContacto) {
        if (contacto.length < 2) throw new Error("Falta el nombre de la persona");
        if (telefono.length < 7) throw new Error("Falta el número de teléfono");
      }
      const misma = tipo.paralela ? paralelas.find((fila) => Number(fila.tipo_id) === tipo.id) : undefined;
      if (misma && tipo.pideContacto) {
        await guardarAtencion(Number(misma.id), contacto, telefono, placaLibre, nota, hora);
        await anotarControl(profile, data.slug, `anotó en ${tipo.nombre} a ${contacto} (${telefono}) a las ${hora}`);
        return { ok: true };
      }
      if (tipo.unaVez) {
        const ya = await sql.query<{ id: number }>(
          `select id from control_marcas where owner_id = $1 and fecha = $2 and tipo_id = $3 limit 1`,
          [ownerId, fecha, tipo.id],
        );
        if (ya[0]) throw new Error(`Ya marcó ${tipo.nombre} hoy`);
      }
      let casoId: number | null = null;
      let sinProceso = 0;
      if (tipo.pideProceso) {
        if (data.sinProceso || !data.casoId) sinProceso = 1;
        else {
          const propios = await sql.query<{ id: number }>(`select id from casos where id = $1 and owner_id = $2`, [data.casoId, ownerId]);
          if (!propios[0]) throw new Error("Ese proceso no es de esa persona");
          casoId = propios[0].id;
          sinProceso = 0;
        }
      }
      await cerrar((tipo.paralela ? exclusivas : abiertas).map((fila) => Number(fila.id)));
      const creadas = await sql.query<{ id: number }>(
        `insert into control_marcas (owner_id, tipo, fecha, hora, tipo_id, caso_id, nota, contacto, telefono, placa_libre, sin_proceso)
         values ($1, 'actividad', $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
        [ownerId, fecha, hora, tipo.id, casoId, nota, tipo.pideContacto ? contacto : "", tipo.pideContacto ? telefono : "", placaLibre, sinProceso],
      );
      const marcaId = Number(creadas[0]?.id);
      if (tipo.pideContacto && marcaId) await guardarAtencion(marcaId, contacto, telefono, placaLibre, nota, hora);
      await anotarControl(profile, data.slug, `pasó a ${tipo.nombre} a las ${hora} (${fecha})${contacto ? ` con ${contacto}` : ""}${tipo.paralela ? " sin dejar de llamar" : ""}`);
      return { ok: true };
    }
    if (data.accion === "break" || data.accion === "almuerzo") {
      const ya = await sql.query<{ id: number }>(
        `select id from control_marcas where owner_id = $1 and fecha = $2 and tipo = $3 limit 1`,
        [ownerId, fecha, data.accion],
      );
      if (ya[0]) throw new Error(data.accion === "break" ? "Ya tiene el break del día" : "Ya tiene el almuerzo del día");
    }
    let casoId: number | null = null;
    if (data.accion === "visita" && data.casoId) {
      const propios = await sql.query<{ id: number }>(`select id from casos where id = $1 and owner_id = $2`, [data.casoId, ownerId]);
      if (!propios[0]) throw new Error("Ese proceso no es de esa persona");
      casoId = propios[0].id;
    }
    await cerrar(abiertas.map((fila) => Number(fila.id)));
    await sql.query(
      `insert into control_marcas (owner_id, tipo, fecha, hora, caso_id) values ($1, $2, $3, $4, $5)`,
      [ownerId, data.accion, fecha, hora, casoId],
    );
    await anotarControl(profile, data.slug, `marcó ${data.accion} a las ${hora} (${fecha})`);
    return { ok: true };
  });

export const exportarControl = createServerFn({ method: "POST" })
  .validator((mes: string) => {
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error("Mes inválido");
    return mes;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: mes }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !veElEquipo(profile.role)) throw new Error("La exportación es de coordinación");
    const sql = await getSql();
    const ciudad = ciudadDe(profile);
    const desde = `${mes}-01`;
    const [anio, numero] = mes.split("-").map(Number);
    const hasta = new Date(Date.UTC(anio, numero, 0)).toISOString().slice(0, 10);
    const marcas = await sql.query<Record<string, string | number | null>>(
      `select p.name as "Persona", m.fecha as "Fecha", m.tipo as "Tipo", coalesce(t.nombre, '') as "Tipificación",
              m.hora as "Hora", m.hora_fin as "Hora fin", m.nota as "Nota", m.contacto as "Contacto",
              m.telefono as "Teléfono", m.placa_libre as "Placa", coalesce(c.placa, '') as "Placa proceso",
              coalesce(c.nombre, '') as "Cliente"
       from control_marcas m
       join profiles p on p.user_id = m.owner_id
       left join control_tipos t on t.id = m.tipo_id
       left join casos c on c.id = m.caso_id
       where m.fecha >= $1 and m.fecha <= $2 and coalesce(p.ciudad_id, 1) = $3
       order by m.fecha, p.name, m.hora, m.id`,
      [desde, hasta, ciudad],
    );
    const atenciones = await sql.query<Record<string, string | number | null>>(
      `select p.name as "Persona", m.fecha as "Fecha", coalesce(t.nombre, '') as "Tipificación",
              a.hora as "Hora", a.contacto as "Contacto", a.telefono as "Teléfono", a.placa_libre as "Placa", a.nota as "Nota"
       from control_atenciones a
       join control_marcas m on m.id = a.marca_id
       join profiles p on p.user_id = m.owner_id
       left join control_tipos t on t.id = m.tipo_id
       where m.fecha >= $1 and m.fecha <= $2 and coalesce(p.ciudad_id, 1) = $3
       order by m.fecha, a.hora, a.id`,
      [desde, hasta, ciudad],
    );
    const llamadas = await sql.query<Record<string, string | number | null>>(
      `select g.fecha as "Fecha", g.hora as "Hora", g.asesor_nombre as "Asesor", c.placa as "Placa", c.nombre as "Nombre",
              c.empresa as "Empresa", g.segundos as "Segundos", g.clasificacion as "Clasificación", g.calificacion as "Calificación",
              g.proxima as "Próxima", g.resultado as "Resultado", g.observacion_final as "Observación"
       from call_gestiones g
       join call_contactos c on c.id = g.contacto_id
       where g.ciudad_id = $1 and g.fecha >= $2 and g.fecha <= $3
       order by g.fecha, g.hora, g.id`,
      [ciudad, desde, hasta],
    );
    const base64 = await excelHojas([
      { nombre: "Control", filas: marcas },
      { nombre: "Atenciones", filas: atenciones },
      { nombre: "Llamadas", filas: llamadas },
    ]);
    return { base64, filename: `gestion-${mes}.xlsx` };
  });

async function excelHojas(hojas: { nombre: string; filas: Record<string, string | number | null>[] }[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  for (const hoja of hojas) {
    const sheet = wb.addWorksheet(hoja.nombre.slice(0, 31));
    const headers = hoja.filas[0] ? Object.keys(hoja.filas[0]) : ["Sin datos"];
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    for (const fila of hoja.filas) sheet.addRow(headers.map((clave) => fila[clave] ?? ""));
  }
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer).toString("base64");
}

export const agregarMarca = createServerFn({ method: "POST" })
  .validator((input: {
    slug: string;
    fecha: string;
    tipo: "ingreso" | "salida" | "break" | "almuerzo" | "visita" | "otro" | "actividad";
    hora: string;
    horaFin?: string;
    nota?: string;
    casoId?: number | null;
    tipoId?: number | null;
    contacto?: string;
    telefono?: string;
    placaLibre?: string;
    sinProceso?: boolean;
  }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !veElEquipo(profile.role)) throw new Error("Solo coordinación agrega marcas");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.fecha)) throw new Error("Día inválido");
    if (data.fecha > hoyBogota()) throw new Error("Ese día todavía no llega");
    if (!horaValida(data.hora)) throw new Error("La hora de salida no sirve");
    const fin = (data.horaFin ?? "").trim();
    if (fin && !horaValida(fin)) throw new Error("La hora de regreso no sirve");
    if (fin && fin < data.hora) throw new Error("La vuelta no puede ser antes de la salida");
    const nota = (data.nota ?? "").trim().slice(0, 160);
    if (data.tipo === "otro" && nota.length < 2) throw new Error("Escribe a dónde salió");
    const sql = await getSql();
    const dueños = await sql.query<{ user_id: string; role: string; slug: string }>(`select user_id, role, slug from profiles where slug = $1`, [data.slug]);
    const dueño = dueños[0];
    if (!dueño) throw new Error("No encontré a esa persona");
    if (!llevaProcesos(dueño.role)) throw new Error("Coordinación no tiene horario");
    let tipoId: number | null = null;
    let contacto = "";
    let telefono = "";
    let placaLibre = "";
    let sinProceso = 0;
    let paralela = false;
    if (data.tipo === "actividad") {
      const tipo = await tipoPermitido(Number(data.tipoId), dueño.slug);
      if (tipo.predeterminada) throw new Error("Esa es la actividad de base. No se marca.");
      tipoId = tipo.id;
      paralela = tipo.paralela;
      contacto = (data.contacto ?? "").trim().slice(0, 80);
      telefono = telefonoLimpio(data.telefono ?? "");
      placaLibre = (data.placaLibre ?? "").trim().toUpperCase().slice(0, 8);
      if (tipo.pideContacto) {
        if (contacto.length < 2) throw new Error("Falta el nombre de la persona");
        if (telefono.length < 7) throw new Error("Falta el número de teléfono");
      }
      if (tipo.pideProceso) sinProceso = data.sinProceso || !data.casoId ? 1 : 0;
    }
    if (data.tipo === "break" || data.tipo === "almuerzo") {
      const ya = await sql.query<{ id: number }>(
        `select id from control_marcas where owner_id = $1 and fecha = $2 and tipo = $3 limit 1`,
        [dueño.user_id, data.fecha, data.tipo],
      );
      if (ya[0]) throw new Error(data.tipo === "break" ? "Ya tiene el break del día. Solo es uno." : "Ya tiene el almuerzo del día. Solo es uno.");
    }
    const abierta = fin === "" && (data.tipo === "break" || data.tipo === "almuerzo" || data.tipo === "visita" || data.tipo === "otro" || data.tipo === "actividad");
    if (abierta && paralela && tipoId && contacto) {
      const misma = await sql.query<{ id: number }>(
        `select m.id from control_marcas m
         where m.owner_id = $1 and m.fecha = $2 and m.tipo_id = $3 and m.hora_fin = ''
         limit 1`,
        [dueño.user_id, data.fecha, tipoId],
      );
      if (misma[0]) {
        await guardarAtencion(Number(misma[0].id), contacto, telefono, placaLibre, nota, data.hora);
        const { anotar } = await import("./auditoria.server");
        await anotar(profile, {
          accion: "agrego",
          entidad: "control",
          etiqueta: data.slug,
          detalle: `Anotó en ${data.slug} a ${contacto} (${telefono}) a las ${data.hora}`,
        });
        return { ok: true };
      }
    }
    if (abierta) {
      const otra = await sql.query<{ id: number }>(
        paralela
          ? `select m.id from control_marcas m
             left join control_tipos t on t.id = m.tipo_id
             where m.owner_id = $1 and m.fecha = $2 and m.hora_fin = ''
               and m.tipo in ('break', 'almuerzo', 'visita', 'otro', 'actividad')
               and coalesce(t.paralela, 0) = 0
             limit 1`
          : `select id from control_marcas
             where owner_id = $1 and fecha = $2 and hora_fin = '' and tipo in ('break', 'almuerzo', 'visita', 'otro', 'actividad')
             limit 1`,
        [dueño.user_id, data.fecha],
      );
      if (otra[0]) throw new Error("Ya hay una salida abierta. Pon la hora en que volvió.");
    }
    let casoId: number | null = null;
    if ((data.tipo === "visita" || (data.tipo === "actividad" && sinProceso === 0)) && data.casoId) {
      const propios = await sql.query<{ id: number }>(`select id from casos where id = $1 and owner_id = $2`, [data.casoId, dueño.user_id]);
      if (!propios[0]) throw new Error("Ese proceso no es de esa persona");
      casoId = propios[0].id;
    }
    const horaFin = data.tipo === "ingreso" || data.tipo === "salida" ? data.hora : fin;
    const creadas = await sql.query<{ id: number }>(
      `insert into control_marcas (owner_id, tipo, fecha, hora, hora_fin, caso_id, nota, tipo_id, contacto, telefono, placa_libre, sin_proceso)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [dueño.user_id, data.tipo, data.fecha, data.hora, horaFin, casoId, data.tipo === "otro" || data.tipo === "actividad" ? nota : "", tipoId, contacto, telefono, placaLibre, sinProceso],
    );
    if (data.tipo === "actividad" && contacto && creadas[0]) {
      await guardarAtencion(Number(creadas[0].id), contacto, telefono, placaLibre, nota, data.hora);
    }
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "agrego",
      entidad: "control",
      etiqueta: data.slug,
      detalle: `Registró en ${data.slug} un ${data.tipo} del ${data.fecha} de ${data.hora}${horaFin ? ` a ${horaFin}` : ""}${nota ? `: ${nota}` : ""}`,
    });
    return { ok: true };
  });

export const borrarMarca = createServerFn({ method: "POST" })
  .validator((id: number) => {
    if (!Number.isFinite(id)) throw new Error("Marca inválida");
    return id;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !veElEquipo(profile.role)) throw new Error("Solo coordinación quita marcas");
    const sql = await getSql();
    const previas = await sql.query<{ slug: string; tipo: string; fecha: string; hora: string; nota: string }>(
      `select p.slug, m.tipo, m.fecha, m.hora, m.nota
       from control_marcas m join profiles p on p.user_id = m.owner_id
       where m.id = $1`,
      [id],
    );
    await sql.query(`delete from control_marcas where id = $1`, [id]);
    const previa = previas[0];
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "borro",
      entidad: "control",
      entidadId: id,
      etiqueta: previa?.slug ?? "",
      detalle: previa
        ? `Quitó la marca ${previa.tipo} de ${previa.slug} del ${String(previa.fecha).slice(0, 10)} a las ${String(previa.hora).slice(0, 5)}${previa.nota ? ` (${previa.nota})` : ""}`
        : `Quitó la marca ${id}`,
    });
    return { ok: true };
  });

export const cambiarRol = createServerFn({ method: "POST" })
  .validator((input: { slug: string; role: "asesor" | "lider" | "coordinadora" }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !configura(profile.role)) throw new Error("Solo el asesor líder cambia roles");
    if (data.slug === "david" && data.role !== "lider") throw new Error("David sigue como asesor líder");
    const sql = await getSql();
    const anteriores = await sql.query<{ role: string; name: string }>(`select role, name from profiles where slug = $1`, [data.slug]);
    const changed = await sql.query<{ slug: string }>(`update profiles set role = $1 where slug = $2 returning slug`, [
      data.role,
      data.slug,
    ]);
    if (!changed[0]) throw new Error("No encontré a esa persona");
    if (anteriores[0] && anteriores[0].role !== data.role) {
      const { anotar } = await import("./auditoria.server");
      await anotar(profile, {
        accion: "edito",
        entidad: "equipo",
        etiqueta: data.slug,
        detalle: `Cambió el rol de ${anteriores[0].name}: ${anteriores[0].role} → ${data.role}`,
        antes: anteriores[0].role,
        despues: data.role,
      });
    }
    return { ok: true };
  });

export const guardarPersona = createServerFn({ method: "POST" })
  .validator((input: { slug: string; empieza: string; entrada: string; salida: string; activo: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !veElEquipo(profile.role)) throw new Error("Solo coordinación edita el equipo");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.empieza)) throw new Error("La fecha de inicio no sirve");
    if (!horaValida(data.entrada) || !horaValida(data.salida)) throw new Error("El horario tiene que ser como 08:00");
    const sql = await getSql();
    const dueños = await sql.query<{ user_id: string; slug: string }>(
      `select user_id, slug from profiles where slug = $1`,
      [data.slug],
    );
    const persona = dueños[0];
    if (!persona) throw new Error("No encontré a esa persona");
    if (persona.slug === "david" && !data.activo) throw new Error("David no se puede desactivar");
    const actuales = await sql.query<{ activo: number; empieza: string; entrada: string; salida: string }>(
      `select activo, empieza, entrada, salida from equipo_extra where owner_id = $1`,
      [persona.user_id],
    );
    const activo = configura(profile.role) ? (data.activo ? 1 : 0) : (actuales[0] ? Number(actuales[0].activo) : 1);
    await sql.query(
      `insert into equipo_extra (owner_id, activo, empieza, entrada, salida)
       values ($1, $2, $3, $4, $5)
       on conflict (owner_id) do update set activo = excluded.activo, empieza = excluded.empieza,
         entrada = excluded.entrada, salida = excluded.salida`,
      [persona.user_id, activo, data.empieza, data.entrada, data.salida],
    );
    const antes = actuales[0];
    const { cambiosDe } = await import("./auditoria");
    const cambio = cambiosDe([
      { label: "Activo", antes: antes ? (Number(antes.activo) === 1 ? "Sí" : "No") : "Sí", despues: activo === 1 ? "Sí" : "No" },
      { label: "Empezó", antes: antes ? String(antes.empieza).slice(0, 10) : "", despues: data.empieza },
      { label: "Entra", antes: antes ? String(antes.entrada).slice(0, 5) : "", despues: data.entrada },
      { label: "Sale", antes: antes ? String(antes.salida).slice(0, 5) : "", despues: data.salida },
    ]);
    if (cambio.hubo) {
      const { anotar } = await import("./auditoria.server");
      await anotar(profile, {
        accion: "edito",
        entidad: "equipo",
        etiqueta: persona.slug,
        detalle: `${persona.slug}: ${cambio.detalle}`,
        antes: cambio.antes,
        despues: cambio.despues,
      });
    }
    return { ok: true };
  });

export const agregarAsesor = createServerFn({ method: "POST" })
  .validator((input: { nombre: string; usuario: string; clave: string; acceso?: Acceso }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !configura(profile.role)) throw new Error("Solo quien configura agrega perfiles");
    const nombre = data.nombre.trim();
    const slug = plano(data.usuario);
    if (nombre.length < 3) throw new Error("Falta el nombre");
    if (slug.length < 3) throw new Error("El usuario necesita al menos 3 letras, sin espacios");
    if (data.clave.trim().length < 8) throw new Error("La clave necesita al menos 8 caracteres");
    const acceso = accesoDe("asesor", data.acceso ? JSON.stringify(data.acceso) : "");
    if (acceso.secciones.length === 0) throw new Error("Elige al menos una sección");
    const rol = rolDeAcceso(acceso);
    const email = `${slug}@vinculalibre.app`;
    const sql = await getSql();
    await sql.query(`alter table profiles add column if not exists acceso text not null default ''`);
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
      `insert into profiles (user_id, slug, name, role, ciudad_id, acceso)
       values ($1, $2, $3, $4, coalesce((select ciudad_id from profiles where user_id = $5), 1), $6)
       on conflict (user_id) do update set slug = excluded.slug, name = excluded.name, role = excluded.role, ciudad_id = excluded.ciudad_id, acceso = excluded.acceso`,
      [userId, slug, nombre, rol, context.userId, accesoJson(acceso)],
    );
    await sql.query(
      `insert into equipo_extra (owner_id, activo, empieza, entrada, salida) values ($1, 1, $2, '08:00', '17:00')
       on conflict (owner_id) do nothing`,
      [userId, hoyBogota()],
    );
    await guardarClaveVisible(userId, data.clave.trim());
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "creo",
      entidad: "equipo",
      etiqueta: slug,
      detalle: `Creó el perfil ${nombre} (${slug}) como ${rol}. Secciones: ${acceso.secciones.join(", ")}`,
    });
    return { ok: true, slug };
  });

export const guardarAcceso = createServerFn({ method: "POST" })
  .validator((input: { slug: string; acceso: Acceso }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !configura(profile.role)) throw new Error("Solo quien configura cambia el acceso");
    const acceso = accesoDe("asesor", JSON.stringify(data.acceso));
    if (acceso.secciones.length === 0) throw new Error("Elige al menos una sección");
    let rol = rolDeAcceso(acceso);
    if (data.slug === "david") {
      rol = "lider";
      acceso.poderes = ["propios", "ver_equipo", "configurar"];
      acceso.area = "";
    }
    const sql = await getSql();
    await sql.query(`alter table profiles add column if not exists acceso text not null default ''`);
    const changed = await sql.query<{ slug: string }>(
      `update profiles set role = $1, acceso = $2 where slug = $3 returning slug`,
      [rol, accesoJson(acceso), data.slug],
    );
    if (!changed[0]) throw new Error("No encontré a esa persona");
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "edito",
      entidad: "equipo",
      etiqueta: data.slug,
      detalle: `Cambió el acceso de ${data.slug}: ${rol}. Secciones: ${acceso.secciones.join(", ")}`,
      despues: accesoJson(acceso),
    });
    return { ok: true };
  });

export const cambiarClave = createServerFn({ method: "POST" })
  .validator((input: { slug: string; clave: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !configura(profile.role)) throw new Error("Solo David cambia claves");
    const clave = data.clave.trim();
    if (clave.length < 8) throw new Error("La clave necesita al menos 8 caracteres");
    const sql = await getSql();
    const dueños = await sql.query<{ user_id: string }>(`select user_id from profiles where slug = $1`, [data.slug]);
    const persona = dueños[0];
    if (!persona) throw new Error("No encontré a esa persona");
    const { hashPassword } = await import("better-auth/crypto");
    const hash = await hashPassword(clave);
    const cuentas = await sql.query<{ id: string }>(
      `update "account" set password = $1, "updatedAt" = now()
       where "userId" = $2 and "providerId" = 'credential'
       returning id`,
      [hash, persona.user_id],
    );
    if (!cuentas[0]) throw new Error("Esa persona no entra con clave");
    await guardarClaveVisible(persona.user_id, clave);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "edito",
      entidad: "clave",
      etiqueta: data.slug,
      detalle: `Cambió la clave de ${data.slug}. La anterior dejó de servir.`,
    });
    if (persona.user_id !== context.userId) {
      await sql.query(`delete from "session" where "userId" = $1`, [persona.user_id]);
    }
    return { ok: true };
  });

export const cambiarMiClave = createServerFn({ method: "POST" })
  .validator((input: { actual: string; nueva: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const actual = data.actual.trim();
    const nueva = data.nueva.trim();
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    if (nueva.length < 8) throw new Error("La clave nueva necesita al menos 8 caracteres");
    if (nueva === actual) throw new Error("La clave nueva tiene que ser distinta");
    const sql = await getSql();
    const cuentas = await sql.query<{ id: string; password: string | null }>(
      `select id, password from "account" where "userId" = $1 and "providerId" = 'credential'`,
      [context.userId],
    );
    const cuenta = cuentas[0];
    if (!cuenta?.password) throw new Error("No encontré tu clave");
    const { hashPassword, verifyPassword } = await import("better-auth/crypto");
    const coincide = await verifyPassword({ hash: cuenta.password, password: actual });
    if (!coincide) throw new Error("La clave actual no coincide");
    const hash = await hashPassword(nueva);
    await sql.query(`update "account" set password = $1, "updatedAt" = now() where id = $2`, [hash, cuenta.id]);
    await guardarClaveVisible(context.userId, nueva);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "edito",
      entidad: "clave",
      etiqueta: profile.slug,
      detalle: `${profile.name} cambió su propia clave`,
    });
    return { ok: true };
  });

export const entradaPermitida = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) return { ok: false, motivo: "No encontré tu usuario" };
    const sql = await getSql();
    const estado = await sql.query<{ activo: boolean; ciudad_activa: boolean | null }>(
      `select p.activo, c.activa as ciudad_activa
       from profiles p
       left join ciudades c on c.id = p.ciudad_id
       where p.user_id = $1`,
      [context.userId],
    );
    const fila = estado[0];
    if (fila && fila.activo === false) return { ok: false, motivo: "Tu usuario está desactivado" };
    if (fila && fila.ciudad_activa === false) return { ok: false, motivo: "Tu ciudad está en pausa" };
    return { ok: true, motivo: "" };
  });

export const resolverUsuario = createServerFn({ method: "POST" })
  .validator((usuario: string) => usuario.trim())
  .handler(async ({ data }) => {
    const { ensureTeamAccounts } = await import("./team.server");
    await ensureTeamAccounts();
    const limpio = data
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (!limpio) return "";
    if (limpio.includes("@")) return limpio;
    const { TEAM_PUBLIC } = await import("./team.public");
    const fijo = TEAM_PUBLIC.find((p) => p.slug === limpio || p.name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === limpio);
    if (fijo) return fijo.email;
    const sql = await getSql();
    const rows = await sql.query<{ email: string }>(
      `select u.email from profiles p join "user" u on u.id = p.user_id
       where lower(p.slug) = $1 limit 1`,
      [plano(data)],
    );
    return rows[0]?.email ?? "";
  });
