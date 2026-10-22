import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { hoyBogota } from "@/lib/casos";
import { horaBogota } from "@/lib/bitacora";
import { configura, llevaProcesos, veElEquipo, type Role } from "@/lib/team.public";
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

async function personasDe(hoy: string, soloId?: string) {
  const sql = await getSql();
  const gente = await sql.query<{
    user_id: string;
    slug: string;
    name: string;
    role: Role;
    activo: number;
    empieza: string;
    entrada: string;
    salida: string;
  }>(
    soloId
      ? `select p.user_id, p.slug, p.name, p.role,
            coalesce(e.activo, 1) as activo,
            coalesce(e.empieza, $2) as empieza,
            coalesce(e.entrada, '08:00') as entrada,
            coalesce(e.salida, '17:00') as salida
         from profiles p
         left join equipo_extra e on e.owner_id = p.user_id
         where p.user_id = $1
         order by p.name`
      : `select p.user_id, p.slug, p.name, p.role,
            coalesce(e.activo, 1) as activo,
            coalesce(e.empieza, $1) as empieza,
            coalesce(e.entrada, '08:00') as entrada,
            coalesce(e.salida, '17:00') as salida
         from profiles p
         left join equipo_extra e on e.owner_id = p.user_id
         where p.role in ('asesor', 'lider', 'coordinadora')
         order by p.name`,
    soloId ? [soloId, META_EMPIEZA] : [META_EMPIEZA],
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
  };
}

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
    const rows = await personasDe(hoy, veElEquipo(profile.role) ? undefined : profile.user_id);
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
    const rows = await sql.query<{
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
    }>(
      equipo
        ? `select m.id, p.slug, m.tipo, m.fecha, m.hora, m.hora_fin, m.caso_id, m.nota,
              coalesce(c.placa, '') as placa, coalesce(c.nombre, '') as cliente
           from control_marcas m
           join profiles p on p.user_id = m.owner_id
           left join casos c on c.id = m.caso_id
           where m.fecha = $1
           order by m.hora, m.id`
        : `select m.id, p.slug, m.tipo, m.fecha, m.hora, m.hora_fin, m.caso_id, m.nota,
              coalesce(c.placa, '') as placa, coalesce(c.nombre, '') as cliente
           from control_marcas m
           join profiles p on p.user_id = m.owner_id
           left join casos c on c.id = m.caso_id
           where m.fecha = $1 and m.owner_id = $2
           order by m.hora, m.id`,
      equipo ? [fecha] : [fecha, profile.user_id],
    );
    return rows.map(aMarca);
  });

export const marcarControl = createServerFn({ method: "POST" })
  .validator((input: {
    accion: "ingreso" | "salida" | "break" | "almuerzo" | "visita" | "volver";
    casoId?: number | null;
    slug?: string;
    hora?: string;
    fecha?: string;
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
    const abiertas = await sql.query<{ id: number; tipo: string }>(
      `select id, tipo from control_marcas
       where owner_id = $1 and fecha = $2 and hora_fin = '' and tipo in ('break', 'almuerzo', 'visita')
       order by id`,
      [ownerId, fecha],
    );
    const abierta = abiertas[abiertas.length - 1];
    const puntos = await sql.query<{ tipo: string }>(
      `select tipo from control_marcas where owner_id = $1 and fecha = $2 and tipo in ('ingreso', 'salida') order by id`,
      [ownerId, fecha],
    );
    const ultimo = puntos[puntos.length - 1]?.tipo;
    const adentro = !abierta && ultimo === "ingreso";

    if (data.accion === "volver") {
      if (!abierta) throw new Error("No hay una salida abierta");
      await sql.query(`update control_marcas set hora_fin = $1 where id = $2`, [hora, abierta.id]);
      await anotarControl(profile, data.slug, `volvió de ${abierta.tipo} a las ${hora} (${fecha})`);
      return { ok: true };
    }
    if (data.accion === "ingreso") {
      if (abierta) throw new Error("Primero marca que volvió");
      if (ultimo === "ingreso") throw new Error("Ya tiene la entrada marcada");
      await sql.query(
        `insert into control_marcas (owner_id, tipo, fecha, hora, hora_fin) values ($1, 'ingreso', $2, $3, $3)`,
        [ownerId, fecha, hora],
      );
      await anotarControl(profile, data.slug, `marcó entrada a las ${hora} (${fecha})`);
      return { ok: true };
    }
    if (data.accion === "salida") {
      if (abierta) await sql.query(`update control_marcas set hora_fin = $1 where id = $2`, [hora, abierta.id]);
      if (!adentro && !abierta) throw new Error("Primero marca la entrada");
      await sql.query(
        `insert into control_marcas (owner_id, tipo, fecha, hora, hora_fin) values ($1, 'salida', $2, $3, $3)`,
        [ownerId, fecha, hora],
      );
      await anotarControl(profile, data.slug, `marcó salida a las ${hora} (${fecha})`);
      return { ok: true };
    }
    if (!adentro) throw new Error(abierta ? "Primero marca que volvió" : "Primero marca la entrada");
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
    await sql.query(
      `insert into control_marcas (owner_id, tipo, fecha, hora, caso_id) values ($1, $2, $3, $4, $5)`,
      [ownerId, data.accion, fecha, hora, casoId],
    );
    await anotarControl(profile, data.slug, `marcó ${data.accion} a las ${hora} (${fecha})`);
    return { ok: true };
  });

export const agregarMarca = createServerFn({ method: "POST" })
  .validator((input: {
    slug: string;
    fecha: string;
    tipo: "ingreso" | "salida" | "break" | "almuerzo" | "visita" | "otro";
    hora: string;
    horaFin?: string;
    nota?: string;
    casoId?: number | null;
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
    const nota = (data.nota ?? "").trim().slice(0, 80);
    if (data.tipo === "otro" && nota.length < 2) throw new Error("Escribe a dónde salió");
    const sql = await getSql();
    const dueños = await sql.query<{ user_id: string; role: string }>(`select user_id, role from profiles where slug = $1`, [data.slug]);
    const dueño = dueños[0];
    if (!dueño) throw new Error("No encontré a esa persona");
    if (!llevaProcesos(dueño.role)) throw new Error("Coordinación no tiene horario");
    if (data.tipo === "break" || data.tipo === "almuerzo") {
      const ya = await sql.query<{ id: number }>(
        `select id from control_marcas where owner_id = $1 and fecha = $2 and tipo = $3 limit 1`,
        [dueño.user_id, data.fecha, data.tipo],
      );
      if (ya[0]) throw new Error(data.tipo === "break" ? "Ya tiene el break del día. Solo es uno." : "Ya tiene el almuerzo del día. Solo es uno.");
    }
    const abierta = fin === "" && (data.tipo === "break" || data.tipo === "almuerzo" || data.tipo === "visita" || data.tipo === "otro");
    if (abierta) {
      const otra = await sql.query<{ id: number }>(
        `select id from control_marcas
         where owner_id = $1 and fecha = $2 and hora_fin = '' and tipo in ('break', 'almuerzo', 'visita', 'otro')
         limit 1`,
        [dueño.user_id, data.fecha],
      );
      if (otra[0]) throw new Error("Ya hay una salida abierta. Pon la hora en que volvió.");
    }
    let casoId: number | null = null;
    if (data.tipo === "visita" && data.casoId) {
      const propios = await sql.query<{ id: number }>(`select id from casos where id = $1 and owner_id = $2`, [data.casoId, dueño.user_id]);
      if (!propios[0]) throw new Error("Ese proceso no es de esa persona");
      casoId = propios[0].id;
    }
    const horaFin = data.tipo === "ingreso" || data.tipo === "salida" ? data.hora : fin;
    await sql.query(
      `insert into control_marcas (owner_id, tipo, fecha, hora, hora_fin, caso_id, nota) values ($1, $2, $3, $4, $5, $6, $7)`,
      [dueño.user_id, data.tipo, data.fecha, data.hora, horaFin, casoId, data.tipo === "otro" ? nota : ""],
    );
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
  .validator((input: { nombre: string; usuario: string; clave: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !configura(profile.role)) throw new Error("Solo David agrega asesores");
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
      `insert into profiles (user_id, slug, name, role) values ($1, $2, $3, 'asesor')
       on conflict (user_id) do update set slug = excluded.slug, name = excluded.name, role = 'asesor'`,
      [userId, slug, nombre],
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
      detalle: `Creó el usuario ${nombre} (${slug})`,
    });
    return { ok: true, slug };
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

export const resolverUsuario = createServerFn({ method: "POST" })
  .validator((usuario: string) => usuario.trim())
  .handler(async ({ data }) => {
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
