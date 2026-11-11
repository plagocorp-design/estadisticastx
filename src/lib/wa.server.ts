import { getSql } from "@/lib/db";
import { hoyBogota } from "@/lib/casos";
import { horaBogota } from "@/lib/bitacora";

type Cuerpo = {
  token?: string;
  accion?: string;
  nombre?: string;
  telefono?: string;
  arroba?: string;
  placa?: string;
  desde?: string;
  mensajes?: number;
  color?: string;
};

function digitos(value: string) {
  const n = value.replace(/\D/g, "");
  if (n.length === 12 && n.startsWith("57")) return n.slice(2);
  return n;
}

function horaDe(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : horaBogota();
}

export async function recibirWhatsapp(cuerpo: Cuerpo | null) {
  const token = (cuerpo?.token ?? "").trim();
  if (token.length < 16) return { ok: false, error: "Falta la clave de la extensión" };
  const sql = await getSql();
  const gente = await sql.query<{ user_id: string; ciudad_id: number | null }>(
    `select user_id, ciudad_id from profiles where wa_token = $1`,
    [token],
  );
  const persona = gente[0];
  if (!persona) return { ok: false, error: "Esa clave no corresponde a nadie. Cópiala de nuevo en Control." };
  const hoy = hoyBogota();
  const puntos = await sql.query<{ tipo: string }>(
    `select tipo from control_marcas where owner_id = $1 and fecha = $2 and tipo in ('ingreso', 'salida') order by id`,
    [persona.user_id, hoy],
  );
  if (puntos[puntos.length - 1]?.tipo !== "ingreso") {
    return { ok: false, error: "Primero marca la entrada en Control. Sin entrada no abro el WhatsApp." };
  }
  const ciudad = persona.ciudad_id || 1;
  const tipos = await sql.query<{ id: number }>(
    `select id from control_tipos
     where ciudad_id = $1 and activo = 1 and (lower(nombre) like '%whatsapp%' or lower(nombre) like '%wasap%')
     order by id limit 1`,
    [ciudad],
  );
  let tipoId = Number(tipos[0]?.id ?? 0);
  if (!tipoId) {
    const creados = await sql.query<{ id: number }>(
      `insert into control_tipos (ciudad_id, nombre, pide_contacto, paralela, todos)
       values ($1, 'Atención por WhatsApp', 1, 1, 1) returning id`,
      [ciudad],
    );
    tipoId = Number(creados[0]?.id ?? 0);
  }
  const abiertas = await sql.query<{ id: number }>(
    `select id from control_marcas
     where owner_id = $1 and fecha = $2 and hora_fin = '' and tipo = 'actividad' and tipo_id = $3
     order by id desc limit 1`,
    [persona.user_id, hoy, tipoId],
  );
  let marcaId = Number(abiertas[0]?.id ?? 0);
  if (!marcaId) {
    const hora = horaBogota();
    const nuevas = await sql.query<{ id: number }>(
      `insert into control_marcas (owner_id, tipo, fecha, hora, tipo_id, nota, sin_proceso)
       values ($1, 'actividad', $2, $3, $4, 'Abierta desde WhatsApp Web', 1) returning id`,
      [persona.user_id, hoy, hora, tipoId],
    );
    marcaId = Number(nuevas[0]?.id ?? 0);
  }
  if (cuerpo?.accion !== "subir") {
    return { ok: true, aviso: "WhatsApp quedó abierto en Control. Puedes seguir con otra gestión." };
  }
  const telefono = digitos(cuerpo.telefono ?? "").slice(0, 15);
  const arroba = (cuerpo.arroba ?? "").trim().replace(/\s+/g, "").slice(0, 40);
  const nombre = (cuerpo.nombre ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const contacto = (nombre || arroba || (telefono ? `WhatsApp ${telefono}` : "Sin nombre")).slice(0, 80);
  const placa = (cuerpo.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const color = cuerpo.color === "rojo" ? "rojo" : "verde";
  const desde = horaDe(cuerpo.desde ?? "");
  const mensajes = Math.max(0, Math.min(999, Math.trunc(Number(cuerpo.mensajes ?? 0))));
  const nota = `${color === "verde" ? "Atendido" : "No se pudo"} · desde ${desde}${mensajes ? ` · ${mensajes} mensajes de hoy` : ""}${arroba ? ` · ${arroba}` : ""}`.slice(0, 160);
  const ya = await sql.query<{ id: number }>(
    telefono.length >= 7
      ? `select id from control_atenciones where marca_id = $1 and telefono = $2 order by id desc limit 1`
      : `select id from control_atenciones where marca_id = $1 and contacto = $2 order by id desc limit 1`,
    [marcaId, telefono.length >= 7 ? telefono : contacto],
  );
  if (ya[0]) {
    await sql.query(
      `update control_atenciones set contacto = $1, telefono = $2, placa_libre = $3, nota = $4, hora = $5 where id = $6`,
      [contacto, telefono, placa, nota, desde, ya[0].id],
    );
  } else {
    await sql.query(
      `insert into control_atenciones (marca_id, contacto, telefono, placa_libre, nota, hora) values ($1, $2, $3, $4, $5, $6)`,
      [marcaId, contacto, telefono, placa, nota, desde],
    );
  }
  return { ok: true, aviso: `${contacto} quedó en Control, desde las ${desde}. La placa puede completarse después.` };
}
