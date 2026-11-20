import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

export type DatosFirma = {
  placa: string;
  nombre: string;
  cc: string;
  telefono: string;
  direccion: string;
  correo: string;
  marca: string;
  linea: string;
  modelo: string;
  clase: string;
  carroceria: string;
  motor: string;
  serie: string;
  cilindraje: string;
  servicio: string;
  capacidad: string;
  copropietario: string;
  cc2?: string;
  propietarios?: { nombre: string; cc: string }[];
  empresa?: string;
  nitAnterior?: string;
  extras?: Record<string, string>;
};

function correoValido(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function recorte(value: string, max: number) {
  return value.trim().slice(0, max);
}

function tokenDe() {
  return randomBytes(24).toString("base64url");
}

async function dejarDocumento(casoId: number, tipo: string, nombre: string, archivo: string, quien: string) {
  if (!archivo || archivo.length < 80) return;
  const sql = await getSql();
  const placas = await sql.query<{ placa: string }>(`select placa from casos where id = $1`, [casoId]);
  const placa = placas[0]?.placa || "SIN-PLACA";
  const { guardarEnDrive } = await import("./drive.server");
  const drive = await guardarEnDrive(`${placa}-${nombre}`, archivo, placa);
  const copia = drive.enLaNube ? "" : archivo;
  const ya = await sql.query<{ id: number }>(
    `select id from documentos where caso_id = $1 and tipo = $2 order by id desc limit 1`,
    [casoId, tipo],
  );
  if (ya[0]) {
    await sql.query(`update documentos set nombre = $1, archivo = $2, subido_por = $3, drive_id = $4 where id = $5`, [nombre, copia, quien, drive.id, ya[0].id]);
    return;
  }
  await sql.query(
    `insert into documentos (caso_id, tipo, nombre, archivo, subido_por, drive_id) values ($1, $2, $3, $4, $5, $6)`,
    [casoId, tipo, nombre, copia, quien, drive.id],
  );
}

function origenDe() {
  const req = getRequest();
  const origin = req.headers.get("origin");
  if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || "";
  return `${proto}://${host}`;
}

function leerMapa(valor: unknown) {
  if (!valor) return {} as Record<string, string>;
  if (typeof valor === "object") return valor as Record<string, string>;
  try {
    return JSON.parse(String(valor)) as Record<string, string>;
  } catch {
    return {};
  }
}

async function textosDe(casoId: number, userId: string) {
  const sql = await getSql();
  const rows = await sql.query<{ textos: string }>(
    `select cc.textos
     from casos c
     left join profiles dueno on dueno.user_id = c.owner_id
     left join profiles yo on yo.user_id = $2
     join ciudad_config cc on cc.ciudad_id = coalesce(nullif(c.ciudad_id, 0), nullif(dueno.ciudad_id, 0), nullif(yo.ciudad_id, 0), nullif(yo.ciudad_vista, 0))
     where c.id = $1
     limit 1`,
    [casoId, userId],
  );
  return leerMapa(rows[0]?.textos);
}

async function mandar(correo: string, nombre: string, placa: string, enlace: string, asunto = "", cuerpo = "") {
  const { enviarCorreo, htmlCorreo } = await import("./correo.server");
  const subject = (asunto.trim() || `Contrato para firmar · {placa}`).replaceAll("{nombre}", nombre).replaceAll("{placa}", placa);
  const base =
    cuerpo.trim() ||
    "Hola {nombre},\n\nTe enviamos el contrato de vinculación de la placa {placa} para que lo leas y lo firmes. Vas a tomarte una foto de frente con tu cédula y después firmas en la pantalla.";
  const texto = base.replaceAll("{nombre}", nombre).replaceAll("{placa}", placa);
  const plano = texto.includes(enlace) ? texto : `${texto}\n\nEntra aquí y firma:\n${enlace}\n`;
  const lineas = texto
    .split(/\n+/)
    .map((linea) => linea.trim())
    .filter(Boolean);
  const saludo = lineas.find((linea) => /^hola\b/i.test(linea)) || (nombre.trim() ? `Hola ${nombre.trim()}.` : "Hola.");
  const parrafos = lineas.filter((linea) => linea !== saludo);
  const origen = origenDe();
  try {
    await enviarCorreo({
      to: correo,
      subject,
      text: plano,
      html: htmlCorreo({
        titulo: "Firma del contrato",
        placa: placa || "",
        logo: `${origen}/taxis-libres-blanco.png`,
        saludo,
        parrafos: parrafos.length ? parrafos : [texto],
        pasos: ["Lee el contrato y la carta.", "Tómate una foto de frente, con la cédula al lado de la cara.", "Firma en la pantalla y confirma."],
        boton: "Leer y firmar",
        enlace,
        pie: "Vinculaciones · Radio Taxi Aeropuerto. Este enlace es solo para ti.",
      }),
    });
    return "";
  } catch (err) {
    return err instanceof Error ? err.message : "No pude enviar el correo";
  }
}

export const enviarPortal = createServerFn({ method: "POST" })
  .validator((input: {
    casoId: number;
    correo: string;
    nombre?: string;
    cc?: string;
    telefono?: string;
    direccion?: string;
    marca?: string;
    linea?: string;
    modelo?: string;
    clase?: string;
    carroceria?: string;
    motor?: string;
    serie?: string;
    cilindraje?: string;
    servicio?: string;
    capacidad?: string;
    nitAnterior?: string;
    otros?: { nombre?: string; cc?: string; correo?: string }[];
    soloAbrir?: boolean;
  }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const escrito = data.correo.trim().toLowerCase();
    const correo = correoValido(escrito) ? escrito : "";
    if (!data.soloAbrir && !correo) throw new Error("El correo del propietario no sirve");
    const otros = (data.otros ?? [])
      .map((parte) => ({
        nombre: recorte(parte.nombre ?? "", 80),
        cc: recorte(parte.cc ?? "", 20),
        correo: correoValido((parte.correo ?? "").trim().toLowerCase()) ? (parte.correo ?? "").trim().toLowerCase() : "",
      }))
      .filter((parte) => parte.nombre || parte.cc || parte.correo);
    if (otros.length > 11) throw new Error("Máximo 12 propietarios en un contrato");
    for (const [indice, parte] of otros.entries()) {
      if (parte.nombre.length < 3) throw new Error(`Al propietario ${indice + 2} le falta el nombre`);
      if (!data.soloAbrir && !parte.correo) throw new Error(`Al propietario ${indice + 2} le falta el correo`);
    }
    const sql = await getSql();
    const { veElEquipo } = await import("./team.public");
    const rows = await sql.query<Record<string, string>>(
      veElEquipo(profile.role)
        ? `select * from casos where id = $1`
        : `select * from casos where id = $1 and owner_id = $2`,
      veElEquipo(profile.role) ? [data.casoId] : [data.casoId, context.userId],
    );
    const caso = rows[0];
    if (!caso) throw new Error("No encontré ese proceso");
    const toma = (escrito: string | undefined, guardado: unknown, max: number) => {
      const propio = recorte(escrito ?? "", max);
      return propio || recorte(String(guardado ?? ""), max);
    };
    let extras: Record<string, string> = {};
    try {
      const crudo = JSON.parse(String(caso.datos_extra || "{}")) as Record<string, string>;
      if (crudo && typeof crudo === "object") extras = crudo;
    } catch {
      extras = {};
    }
    const datos: DatosFirma = {
      placa: String(caso.placa ?? ""),
      nombre: toma(data.nombre, caso.nombre, 80),
      cc: toma(data.cc, caso.cc, 20),
      telefono: toma(data.telefono, caso.telefono, 20),
      direccion: toma(data.direccion, caso.direccion, 120),
      correo: correo || String(caso.correo ?? ""),
      marca: toma(data.marca, caso.marca, 40),
      linea: toma(data.linea, caso.linea, 40),
      modelo: toma(data.modelo, caso.modelo, 10),
      clase: recorte(data.clase || "AUTOMÓVIL", 40),
      carroceria: recorte(data.carroceria ?? "", 40),
      motor: recorte(data.motor ?? "", 40),
      serie: recorte(data.serie ?? "", 40),
      cilindraje: recorte(data.cilindraje ?? "", 20),
      servicio: recorte(data.servicio || "PÚBLICO", 40),
      capacidad: recorte(data.capacidad || String(caso.capacidad ?? ""), 8),
      copropietario: otros[0]?.nombre ?? "",
      cc2: otros[0]?.cc ?? "",
      propietarios: otros.map((parte) => ({ nombre: parte.nombre, cc: parte.cc })),
      empresa: recorte(String(caso.empresa ?? ""), 80),
      nitAnterior: recorte(data.nitAnterior || extras.nitAnterior || "", 20),
      extras,
    };
    if (!datos.placa || !datos.nombre) throw new Error("Primero guarda placa y propietario");
    await sql.query(
      `update casos set nombre = $1, cc = $2, telefono = $3, direccion = $4, correo = $5, marca = $6, linea = $7, modelo = $8, copropietarios = $9, capacidad = $10, clase = $11, carroceria = $12, motor = $13, serie = $14, cilindraje = $15, servicio = $16, updated_at = now() where id = $17`,
      [datos.nombre, datos.cc, datos.telefono, datos.direccion, datos.correo, datos.marca, datos.linea, datos.modelo, JSON.stringify(otros), datos.capacidad, datos.clase, datos.carroceria, datos.motor, datos.serie, datos.cilindraje, datos.servicio, data.casoId],
    );
    const sobre = await sql.query<{ id: number }>(
      `insert into sobres (caso_id, datos, creado_por) values ($1, $2, $3) returning id`,
      [data.casoId, JSON.stringify(datos), profile.user_id],
    );
    const sobreId = Number(sobre[0]?.id);
    const partes = [
      { orden: 1, nombre: datos.nombre, cc: datos.cc, correo: correo || "presencial" },
      ...otros.map((parte, indice) => ({ orden: indice + 2, nombre: parte.nombre, cc: parte.cc, correo: parte.correo || "presencial" })),
    ];
    const origen = origenDe();
    const { montarCarta } = await import("./carta-pdf.server");
    const carta = await montarCarta(datos, []);
    await dejarDocumento(data.casoId, "carta", `carta-${datos.placa}.pdf`, carta, profile.name);
    const mapa = await textosDe(data.casoId, context.userId);
    const enviados: { correo: string; enlace: string; ok: boolean; error: string }[] = [];
    for (const parte of partes) {
      const token = tokenDe();
      await sql.query(
        `insert into firmantes (sobre_id, token, orden, nombre, cc, correo) values ($1, $2, $3, $4, $5, $6)`,
        [sobreId, token, parte.orden, parte.nombre, parte.cc, parte.correo],
      );
      const enlace = `${origen}/firmar/${token}`;
      if (!parte.correo.includes("@")) {
        if (data.soloAbrir) enviados.push({ correo: parte.correo, enlace, ok: true, error: "" });
        else if (parte.orden === 1) enviados.push({ correo: parte.correo, enlace, ok: false, error: "Falta el correo del propietario" });
        continue;
      }
      const error = data.soloAbrir ? "" : await mandar(parte.correo, parte.nombre, datos.placa, enlace, mapa.correo_firma_asunto, mapa.correo_firma_cuerpo);
      enviados.push({ correo: parte.correo, enlace, ok: !error, error });
    }
    await sql.query(`update casos set docuseal_estado = $1, updated_at = now() where id = $2`, [
      data.soloAbrir ? "pendiente" : "enviado",
      data.casoId,
    ]);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "envio",
      entidad: "contrato",
      entidadId: data.casoId,
      etiqueta: datos.placa,
      detalle: data.soloAbrir
        ? `Abrió el portal de firma de ${datos.placa} en la tablet`
        : `Envió el portal de firma de ${datos.placa} a ${enviados.map((e) => e.correo).join(", ")}`,
    });
    return { enviados, docusealId: String(sobreId) };
  });

export const estadoFirma = createServerFn({ method: "POST" })
  .validator((casoId: number) => casoId)
  .middleware([authMiddleware])
  .handler(async ({ context, data: casoId }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const { veElEquipo } = await import("./team.public");
    const sql = await getSql();
    await sql.query(`alter table firmantes add column if not exists foto text not null default ''`);
    await sql.query(`alter table firmantes add column if not exists evidencia text not null default ''`);
    const caso = await sql.query<{ id: number }>(
      veElEquipo(profile.role) ? `select id from casos where id = $1` : `select id from casos where id = $1 and owner_id = $2`,
      veElEquipo(profile.role) ? [casoId] : [casoId, context.userId],
    );
    if (!caso[0]) throw new Error("No encontré ese proceso");
    const filas = await sql.query<{
      id: number;
      nombre: string;
      correo: string;
      orden: number;
      firmado_at: string | null;
      evidencia: string;
      tiene_foto: boolean;
    }>(
      `select f.id, f.nombre, f.correo, f.orden, f.firmado_at::text as firmado_at, f.evidencia, coalesce(f.foto, '') <> '' as tiene_foto
       from firmantes f
       join sobres s on s.id = f.sobre_id
       where s.caso_id = $1 and s.id = (select max(id) from sobres where caso_id = $1)
       order by f.orden`,
      [casoId],
    );
    const partes = filas.map((fila) => {
      let ip = "";
      let agente = "";
      let huella = "";
      try {
        const dato = JSON.parse(fila.evidencia || "{}") as { ip?: string; agente?: string; huella?: string; en?: string };
        ip = dato.ip || "";
        agente = dato.agente || "";
        huella = dato.huella || "";
      } catch {
        ip = "";
      }
      return {
        id: Number(fila.id),
        nombre: fila.nombre,
        correo: fila.correo,
        orden: fila.orden,
        firmado: Boolean(fila.firmado_at),
        en: fila.firmado_at || "",
        ip,
        agente,
        huella: huella.slice(0, 16),
        tieneFoto: Boolean(fila.tiene_foto),
      };
    });
    const firmados = partes.filter((parte) => parte.firmado).length;
    const estado = !partes.length ? "sin_enviar" : firmados === partes.length ? "firmado" : firmados > 0 ? "pendiente" : "enviado";
    return { estado, firmados, total: partes.length, partes };
  });

export const reenviarFirma = createServerFn({ method: "POST" })
  .validator((input: { casoId: number; firmanteId: number; correo: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const correo = data.correo.trim().toLowerCase();
    if (!correoValido(correo)) throw new Error("Ese correo no sirve");
    const { veElEquipo } = await import("./team.public");
    const sql = await getSql();
    const filas = await sql.query<{ id: number; token: string; nombre: string; orden: number; firmado_at: string | null; placa: string; caso_id: number; owner_id: string }>(
      `select f.id, f.token, f.nombre, f.orden, f.firmado_at::text as firmado_at, c.placa, c.id as caso_id, c.owner_id
       from firmantes f
       join sobres s on s.id = f.sobre_id
       join casos c on c.id = s.caso_id
       where f.id = $1 and s.caso_id = $2 and s.id = (select max(id) from sobres where caso_id = $2)`,
      [data.firmanteId, data.casoId],
    );
    const yo = filas[0];
    if (!yo || (!veElEquipo(profile.role) && yo.owner_id !== context.userId)) throw new Error("No encontré esa firma");
    if (yo.firmado_at) throw new Error("Esa persona ya firmó. No se reenvía.");
    await sql.query(`update firmantes set correo = $1 where id = $2`, [correo, yo.id]);
    if (yo.orden === 1) await sql.query(`update casos set correo = $1, docuseal_estado = 'enviado', updated_at = now() where id = $2`, [correo, yo.caso_id]);
    else await sql.query(`update casos set docuseal_estado = 'enviado', updated_at = now() where id = $1`, [yo.caso_id]);
    const mapa = await textosDe(yo.caso_id, context.userId);
    const error = await mandar(correo, yo.nombre, yo.placa, `${origenDe()}/firmar/${yo.token}`, mapa.correo_firma_asunto, mapa.correo_firma_cuerpo);
    if (error) throw new Error(error);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "envio",
      entidad: "contrato",
      entidadId: yo.caso_id,
      etiqueta: yo.placa,
      detalle: `Reenvió la firma de ${yo.placa} a ${correo}`,
    });
    return { ok: true, correo };
  });

async function guardarFirmaDocutax(caso: { id: number; placa: string; docuseal_id: string; docuseal_estado: string }) {
  const { leerSobreDocutax, certificadoDocutax } = await import("./docutax.server");
  const leido = await leerSobreDocutax(caso.docuseal_id);
  const certificado = leido.listo ? await certificadoDocutax(caso.docuseal_id) : "";
  const auditoriaNombre = certificado ? `constancia-docutax-${caso.placa}.pdf` : "";
  const { hoyBogota } = await import("./casos");
  const sql = await getSql();
  await sql.query(
    `update casos set
       docuseal_estado = $1,
       firma_contrato = case when $2 then true else firma_contrato end,
       auditoria_pdf = case when $3 <> '' then $3 else auditoria_pdf end,
       auditoria_nombre = case when $3 <> '' then $4 else auditoria_nombre end,
       fecha_firma = case when fecha_firma = '' and $2 then $5 else fecha_firma end,
       updated_at = now()
     where id = $6`,
    [leido.listo ? "completed" : leido.estado, leido.listo, certificado, auditoriaNombre, hoyBogota(), caso.id],
  );
  if (certificado) await dejarDocumento(caso.id, "constancia", auditoriaNombre, certificado, "DocuTax");
  if (leido.listo) {
    const { anotar } = await import("./auditoria.server");
    await anotar(
      { user_id: "docutax", slug: "docutax", name: "DocuTax" },
      {
        accion: "firmo",
        entidad: "contrato",
        entidadId: caso.id,
        etiqueta: caso.placa,
        detalle: `DocuTax selló la firma de ${caso.placa}. ${leido.firmados} de ${leido.total}.`,
      },
    );
  }
  return {
    cambio: leido.listo,
    estado: leido.listo ? "completed" : leido.estado,
    auditoriaNombre,
    contratoNombre: "",
    firmaContrato: leido.listo,
    resumen: leido.listo ? "DocuTax ya selló la firma." : `Firmas: ${leido.firmados} de ${leido.total}.`,
  };
}

export async function guardarFirmaDocuseal(casoId: number) {
  const sql = await getSql();
  const rows = await sql.query<{ id: number; placa: string; docuseal_id: string; docuseal_estado: string }>(
    `select id, placa, docuseal_id, docuseal_estado from casos where id = $1`,
    [casoId],
  );
  const caso = rows[0];
  if (!caso?.docuseal_id) return { cambio: false, estado: "", auditoriaNombre: "", contratoNombre: "", firmaContrato: false, resumen: "" };
  if (caso.docuseal_estado === "completed") {
    return { cambio: false, estado: "completed", auditoriaNombre: `certificado-firma-${caso.placa}.pdf`, contratoNombre: `contrato-firmado-${caso.placa}.pdf`, firmaContrato: true, resumen: "" };
  }
  if (caso.docuseal_id.startsWith("env_")) return guardarFirmaDocutax(caso);
  if (!caso.docuseal_id.includes("-")) {
    return { cambio: false, estado: caso.docuseal_estado, auditoriaNombre: "", contratoNombre: "", firmaContrato: false, resumen: "Ese envío ya no se consulta." };
  }
  const { leerDocusign } = await import("./docusign.server");
  const leido = await leerDocusign(caso.docuseal_id);
  const guardado = leido.listo && Boolean(leido.contrato || leido.auditoria);
  const auditoriaNombre = leido.auditoria ? `certificado-firma-${caso.placa}.pdf` : "";
  const contratoNombre = leido.contrato ? `contrato-firmado-${caso.placa}.pdf` : "";
  const { hoyBogota } = await import("./casos");
  await sql.query(
    `update casos set
       docuseal_estado = $1,
       firma_contrato = case when $2 then true else firma_contrato end,
       firma_carta = case when $9 <> '' then true else firma_carta end,
       contrato_pdf = case when $3 <> '' then $3 else contrato_pdf end,
       contrato_nombre = case when $3 <> '' then $4 else contrato_nombre end,
       auditoria_pdf = case when $5 <> '' then $5 else auditoria_pdf end,
       auditoria_nombre = case when $5 <> '' then $6 else auditoria_nombre end,
       fecha_firma = case when fecha_firma = '' and $2 then $7 else fecha_firma end,
       updated_at = now()
     where id = $8`,
    [guardado ? "completed" : leido.estado, guardado, leido.contrato, contratoNombre, leido.auditoria, auditoriaNombre, hoyBogota(), caso.id, leido.carta || ""],
  );
  if (leido.carta) await dejarDocumento(caso.id, "carta", `carta-firmada-${caso.placa}.pdf`, leido.carta, "DocuSign");
  if (leido.contrato) await dejarDocumento(caso.id, "contrato", contratoNombre, leido.contrato, "DocuSign");
  if (guardado) {
    const { anotar } = await import("./auditoria.server");
    await anotar(
      { user_id: "docusign", slug: "docusign", name: "DocuSign" },
      {
        accion: "firmo",
        entidad: "contrato",
        entidadId: caso.id,
        etiqueta: caso.placa,
        detalle: `DocuSign guardó el contrato firmado y el certificado de ${caso.placa}. ${leido.resumen}`,
      },
    );
  }
  return {
    cambio: guardado,
    estado: guardado ? "completed" : leido.estado,
    auditoriaNombre,
    contratoNombre,
    firmaContrato: guardado,
    resumen: leido.resumen,
  };
}

export const sincronizarDocuseal = createServerFn({ method: "POST" })
  .validator((id: number) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const { veElEquipo } = await import("./team.public");
    const sql = await getSql();
    const rows = await sql.query<{ id: number }>(
      veElEquipo(profile.role) ? `select id from casos where id = $1` : `select id from casos where id = $1 and owner_id = $2`,
      veElEquipo(profile.role) ? [id] : [id, context.userId],
    );
    if (!rows[0]) throw new Error("No encontré ese proceso");
    return guardarFirmaDocuseal(id);
  });

export const verAuditoriaFirma = createServerFn({ method: "POST" })
  .validator((id: number) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const { veElEquipo } = await import("./team.public");
    const sql = await getSql();
    const rows = await sql.query<{ auditoria_pdf: string; auditoria_nombre: string; placa: string }>(
      veElEquipo(profile.role)
        ? `select auditoria_pdf, auditoria_nombre, placa from casos where id = $1`
        : `select auditoria_pdf, auditoria_nombre, placa from casos where id = $1 and owner_id = $2`,
      veElEquipo(profile.role) ? [id] : [id, context.userId],
    );
    const row = rows[0];
    if (!row?.auditoria_pdf) throw new Error("Todavía no está el certificado de la firma");
    return { filename: row.auditoria_nombre || `certificado-firma-${row.placa}.pdf`, base64: row.auditoria_pdf };
  });

export async function constanciaPorToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const sql = await getSql();
  await sql.query(`alter table firmantes add column if not exists evidencia text not null default ''`);
  const rows = await sql.query<{
    nombre: string;
    cc: string;
    correo: string;
    firmado_at: string | null;
    evidencia: string;
    placa: string;
  }>(
    `select f.nombre, f.cc, f.correo, f.firmado_at::text as firmado_at, coalesce(f.evidencia, '') as evidencia, c.placa
     from firmantes f
     join sobres s on s.id = f.sobre_id
     join casos c on c.id = s.caso_id
     where f.token = $1`,
    [token],
  );
  const yo = rows[0];
  if (!yo?.firmado_at) return null;
  let ip = "";
  let agente = "";
  let huella = "";
  try {
    const dato = JSON.parse(yo.evidencia || "{}") as { ip?: string; agente?: string; huella?: string };
    ip = dato.ip || "";
    agente = dato.agente || "";
    huella = dato.huella || "";
  } catch {
    ip = "";
  }
  const cuando = new Date(yo.firmado_at).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "full",
    timeStyle: "short",
  });
  const { pdfConstancia } = await import("./constancia.server");
  const base64 = await pdfConstancia({
    nombre: yo.nombre,
    cc: yo.cc,
    placa: yo.placa,
    correo: yo.correo,
    cuando,
    ip,
    agente,
    huella,
  });
  return { base64, nombre: `constancia-${yo.placa}.pdf`.replace(/[^\w.\-]+/g, "_") };
}

export const verPortal = createServerFn({ method: "GET" })
  .validator((token: string) => token.trim())
  .handler(async ({ data: token }) => {
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) throw new Error("Ese enlace no sirve");
    const sql = await getSql();
    const rows = await sql.query<{
      nombre: string;
      cc: string;
      correo: string;
      firma: string;
      firmado_at: string | null;
      datos: string;
      orden: number;
      sobre_id: number;
      asesor: string;
    }>(
      `select f.nombre, f.cc, f.correo, f.firma, f.firmado_at, f.orden, f.sobre_id, s.datos, coalesce(p.name, '') as asesor
       from firmantes f
       join sobres s on s.id = f.sobre_id
       join casos c on c.id = s.caso_id
       join profiles p on p.user_id = c.owner_id
       where f.token = $1`,
      [token],
    );
    const yo = rows[0];
    if (!yo) throw new Error("Ese enlace ya no está");
    const otros = await sql.query<{ nombre: string; firmado_at: string | null }>(
      `select nombre, firmado_at from firmantes where sobre_id = $1 and orden <> $2 order by orden`,
      [yo.sobre_id, yo.orden],
    );
    const datos = JSON.parse(yo.datos) as DatosFirma;
    const firmas = await sql.query<{ nombre: string; firma: string }>(
      `select nombre, firma from firmantes where sobre_id = $1 and firma <> '' order by orden`,
      [yo.sobre_id],
    );
    const { montarContrato } = await import("./contrato-pdf.server");
    const { montarCarta, juntarPdfs } = await import("./carta-pdf.server");
    const { plantillaDeCaso } = await import("./gerencia.functions");
    const hechas = firmas.map((firma) => ({ nombre: firma.nombre, png: firma.firma }));
    const casoSobre = await sql.query<{ caso_id: number }>(`select caso_id from sobres where id = $1`, [yo.sobre_id]);
    const plantilla = casoSobre[0] ? await plantillaDeCaso(casoSobre[0].caso_id) : undefined;
    const pdf = await juntarPdfs([await montarContrato(datos, hechas, undefined, plantilla), await montarCarta(datos, hechas)]);
    return {
      datos,
      nombre: yo.nombre,
      cc: yo.cc,
      asesor: yo.asesor,
      yaFirmo: Boolean(yo.firmado_at),
      otro: otros.map((parte) => `${parte.nombre} ${parte.firmado_at ? "ya firmó" : "todavía no firma"}`).join(". "),
      pdf,
    };
  });

export const firmarPortal = createServerFn({ method: "POST" })
  .validator((input: { token: string; firma: string; foto: string }) => input)
  .handler(async ({ data }) => {
    const token = data.token.trim();
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) throw new Error("Ese enlace no sirve");
    const firma = data.firma.trim();
    const foto = data.foto.trim();
    if (!firma.startsWith("data:image/png;base64,") || firma.length < 800 || firma.length > 400_000) {
      throw new Error("Falta la firma");
    }
    if (!foto.startsWith("data:image/jpeg;base64,") || foto.length < 4000 || foto.length > 1_800_000) {
      throw new Error("Toma la foto de frente, con la cédula en la mano");
    }
    const sql = await getSql();
    await sql.query(`alter table firmantes add column if not exists foto text not null default ''`);
    await sql.query(`alter table firmantes add column if not exists evidencia text not null default ''`);
    const rows = await sql.query<{ id: number; sobre_id: number; nombre: string; correo: string; caso_id: number; placa: string }>(
      `select f.id, f.sobre_id, f.nombre, f.correo, s.caso_id, c.placa
       from firmantes f
       join sobres s on s.id = f.sobre_id
       join casos c on c.id = s.caso_id
       where f.token = $1 and f.firmado_at is null`,
      [token],
    );
    const yo = rows[0];
    if (!yo) throw new Error("Este enlace ya se firmó o no existe");
    const { createHash } = await import("node:crypto");
    let ip = "";
    let agente = "";
    try {
      const req = getRequest();
      ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
      agente = (req.headers.get("user-agent") || "").slice(0, 180);
    } catch {
      ip = "";
    }
    const huella = createHash("sha256").update(`${yo.placa}|${yo.nombre}|${firma}|${foto}`).digest("hex");
    const evidencia = JSON.stringify({ huella, ip, agente, en: new Date().toISOString() });
    await sql.query(`update firmantes set firma = $1, foto = $2, evidencia = $3, firmado_at = now() where id = $4`, [
      firma,
      foto,
      evidencia,
      yo.id,
    ]);
    const pendientes = await sql.query<{ id: number }>(
      `select id from firmantes where sobre_id = $1 and firmado_at is null`,
      [yo.sobre_id],
    );
    if (pendientes.length === 0) {
      const paquete = await sql.query<{ datos: string }>(`select datos from sobres where id = $1`, [yo.sobre_id]);
      const firmas = await sql.query<{ nombre: string; firma: string }>(
        `select nombre, firma from firmantes where sobre_id = $1 and firma <> '' order by orden`,
        [yo.sobre_id],
      );
      const { montarContrato } = await import("./contrato-pdf.server");
      const { montarCarta } = await import("./carta-pdf.server");
      const { plantillaDeCaso } = await import("./gerencia.functions");
      const datos = JSON.parse(paquete[0]?.datos ?? "{}") as DatosFirma;
      const hechas = firmas.map((item) => ({ nombre: item.nombre, png: item.firma }));
      const pdf = await montarContrato(datos, hechas, undefined, await plantillaDeCaso(yo.caso_id));
      const carta = await montarCarta(datos, hechas);
      await sql.query(
        `update casos set firma_contrato = true, firma_carta = true, docuseal_estado = 'firmado', contrato_pdf = $1, contrato_nombre = $2, updated_at = now() where id = $3`,
        [pdf, `contrato-${yo.placa}.pdf`, yo.caso_id],
      );
      await dejarDocumento(yo.caso_id, "contrato", `contrato-${yo.placa}.pdf`, pdf, yo.nombre);
      await dejarDocumento(yo.caso_id, "carta", `carta-${yo.placa}.pdf`, carta, yo.nombre);
      await dejarDocumento(yo.caso_id, "identidad", `foto-${yo.placa}.jpg`, foto.replace(/^data:image\/jpeg;base64,/, ""), yo.nombre);
    } else {
      await dejarDocumento(yo.caso_id, "identidad", `foto-${yo.placa}-${yo.id}.jpg`, foto.replace(/^data:image\/jpeg;base64,/, ""), yo.nombre);
    }
    if (yo.correo.includes("@")) {
      const { enviarCorreo, htmlCorreo } = await import("./correo.server");
      void enviarCorreo({
        to: yo.correo,
        subject: `Recibimos tu firma · ${yo.placa}`,
        text: `Hola ${yo.nombre}.\n\nQuedó registrada tu firma del contrato de la placa ${yo.placa}, con la foto y la cédula.\n\nVinculaciones · Radio Taxi Aeropuerto`,
        html: htmlCorreo({
          titulo: "Recibimos tu firma",
          placa: yo.placa,
          logo: `${origenDe()}/taxis-libres-blanco.png`,
          saludo: `Hola ${yo.nombre}.`,
          parrafos: [`Quedó registrada tu firma del contrato de la placa ${yo.placa}, junto con la foto de frente y la cédula.`],
          boton: "Descargar certificado",
          enlace: `${origenDe()}/api/constancia/${token}`,
          pie: "Vinculaciones · Radio Taxi Aeropuerto",
        }),
      }).catch(() => undefined);
    }
    const { anotar } = await import("./auditoria.server");
    await anotar(
      { user_id: "firma", slug: "propietario", name: yo.nombre },
      {
        accion: "firmo",
        entidad: "contrato",
        entidadId: yo.caso_id,
        etiqueta: yo.placa,
        detalle: `${yo.nombre} firmó el contrato de ${yo.placa} con foto y cédula. Huella ${huella.slice(0, 12)}${pendientes.length === 0 ? ". Ya firmaron todos." : "."}`,
      },
    );
    return { ok: true, completo: pendientes.length === 0 };
  });

export const generarCartaDevolucion = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    destino: "empresa" | "aseguradora" | "desvinculacion";
    ciudad?: string;
    empresa: string;
    nit?: string;
    direccionEmpresa?: string;
    correoEmpresa?: string;
    propietario: string;
    cc?: string;
    telefono?: string;
    correo?: string;
    placa: string;
    marca?: string;
    modelo?: string;
    aseguradora?: string;
    poliza?: string;
    desde: string;
    liquidacion?: string;
    fecha?: string;
  }) => input)
  .handler(async ({ data }) => {
    const empresa = recorte(data.empresa ?? "", 120);
    const propietario = recorte(data.propietario ?? "", 120);
    const placa = recorte(data.placa ?? "", 8).toUpperCase();
    const aseguradora = recorte(data.aseguradora ?? "", 80);
    if (data.destino !== "aseguradora" && empresa.length < 3) throw new Error("Falta la empresa");
    if (data.destino === "aseguradora" && aseguradora.length < 3) throw new Error("Falta la aseguradora");
    if (propietario.length < 3) throw new Error("Falta el nombre del propietario");
    if (placa.length < 5) throw new Error("Falta la placa");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.desde)) throw new Error("Falta el día desde el que se excluye el vehículo");
    const datos = {
      ciudad: recorte(data.ciudad || "Bogotá D.C.", 40),
      empresa,
      nit: recorte(data.nit ?? "", 20),
      direccionEmpresa: recorte(data.direccionEmpresa ?? "", 120),
      correoEmpresa: recorte(data.correoEmpresa ?? "", 80),
      propietario,
      cc: recorte(data.cc ?? "", 20),
      telefono: recorte(data.telefono ?? "", 20),
      correo: recorte(data.correo ?? "", 80),
      placa,
      marca: recorte(data.marca ?? "", 40),
      modelo: recorte(data.modelo ?? "", 10),
      aseguradora,
      poliza: recorte(data.poliza ?? "", 40),
      desde: data.desde,
      liquidacion: recorte(data.liquidacion ?? "", 500),
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(data.fecha ?? "") ? data.fecha! : new Date().toISOString().slice(0, 10),
    };
    const { montarCartaDevolucion, montarCartaAseguradora, montarCartaDesvinculacion } = await import("./carta-pdf.server");
    const base64 =
      data.destino === "aseguradora"
        ? await montarCartaAseguradora(datos)
        : data.destino === "desvinculacion"
          ? await montarCartaDesvinculacion(datos)
          : await montarCartaDevolucion(datos);
    const filename =
      data.destino === "aseguradora" ? `aseguradora-${placa}.pdf` : data.destino === "desvinculacion" ? `desvinculacion-${placa}.pdf` : `devolucion-prima-${placa}.pdf`;
    return { base64, filename };
  });
