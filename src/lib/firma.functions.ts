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

async function mandar(correo: string, nombre: string, placa: string, enlace: string) {
  const { callTool, ConnectorType } = await import("./app-data/client.server");
  const result = await callTool(
    "gmail_send_message",
    {
      to: [correo],
      subject: `Contrato para firmar · ${placa}`,
      body: `Hola ${nombre},\n\nTe enviamos el contrato de vinculación de la placa ${placa} para que lo leas y lo firmes.\n\nNo respondas este correo. Entra aquí y firma:\n${enlace}\n\nEl enlace es solo tuyo.\n`,
    },
    { connectorType: ConnectorType.Gmail },
  );
  return result.ok ? "" : result.errorMessage || "No pude enviar el correo";
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
      nitAnterior: recorte(data.nitAnterior ?? "", 20),
    };
    if (!datos.placa || !datos.nombre) throw new Error("Primero guarda placa y propietario");
    await sql.query(
      `update casos set nombre = $1, cc = $2, telefono = $3, direccion = $4, correo = $5, marca = $6, linea = $7, modelo = $8, copropietarios = $9, capacidad = $10, updated_at = now() where id = $11`,
      [datos.nombre, datos.cc, datos.telefono, datos.direccion, datos.correo, datos.marca, datos.linea, datos.modelo, JSON.stringify(otros), datos.capacidad, data.casoId],
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
    if (!data.soloAbrir) {
      try {
        const { montarContrato } = await import("./contrato-pdf.server");
        const { pedirFirmaDocuseal } = await import("./docuseal.server");
        const { plantillaDeCaso } = await import("./gerencia.functions");
        const pdf = await montarContrato(datos, [], undefined, await plantillaDeCaso(data.casoId));
        const roles = partes.map((parte, indice) => ({
          role: indice === 0 ? "Propietario" : `Propietario ${indice + 1}`,
          email: parte.correo,
          name: parte.nombre,
        }));
        const envio = await pedirFirmaDocuseal(pdf, datos.placa, roles, carta);
        await sql.query(
          `update casos set docuseal_id = $1, docuseal_estado = 'pendiente', updated_at = now() where id = $2`,
          [String(envio.id), data.casoId],
        );
        const enviados = partes.map((parte, indice) => {
          const link = envio.partes.find((item) => item.correo.toLowerCase() === parte.correo) ?? envio.partes[indice];
          return {
            correo: parte.correo,
            enlace: link?.enlace || "",
            ok: Boolean(link?.enlace),
            error: link?.enlace ? "" : "DocuSeal no devolvió el enlace",
          };
        });
        const { anotar } = await import("./auditoria.server");
        await anotar(profile, {
          accion: "envio",
          entidad: "contrato",
          entidadId: data.casoId,
          etiqueta: datos.placa,
          detalle: `DocuSeal envió el contrato de ${datos.placa} a ${enviados.map((e) => e.correo).join(", ")}`,
        });
        return { enviados, docusealId: String(envio.id) };
      } catch (err) {
        const aviso = err instanceof Error ? err.message : "DocuSeal no respondió";
        const enviados: { correo: string; enlace: string; ok: boolean; error: string }[] = [];
        for (const parte of partes) {
          const token = tokenDe();
          await sql.query(
            `insert into firmantes (sobre_id, token, orden, nombre, cc, correo) values ($1, $2, $3, $4, $5, $6)`,
            [sobreId, token, parte.orden, parte.nombre, parte.cc, parte.correo],
          );
          enviados.push({
            correo: parte.correo,
            enlace: `${origen}/firmar/${token}`,
            ok: false,
            error: aviso,
          });
        }
        return { enviados, docusealId: "" };
      }
    }
    const enviados: { correo: string; enlace: string; ok: boolean; error: string }[] = [];
    for (const parte of partes) {
      const token = tokenDe();
      await sql.query(
        `insert into firmantes (sobre_id, token, orden, nombre, cc, correo) values ($1, $2, $3, $4, $5, $6)`,
        [sobreId, token, parte.orden, parte.nombre, parte.cc, parte.correo],
      );
      const enlace = `${origen}/firmar/${token}`;
      const error = data.soloAbrir ? "" : await mandar(parte.correo, parte.nombre, datos.placa, enlace);
      enviados.push({ correo: parte.correo, enlace, ok: !error, error });
    }
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
    return { enviados, docusealId: "" };
  });

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
  const { leerDocuseal } = await import("./docuseal.server");
  const leido = await leerDocuseal(caso.docuseal_id);
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
  if (leido.carta) await dejarDocumento(caso.id, "carta", `carta-firmada-${caso.placa}.pdf`, leido.carta, "DocuSeal");
  if (leido.contrato) await dejarDocumento(caso.id, "contrato", contratoNombre, leido.contrato, "DocuSeal");
  if (guardado) {
    const { anotar } = await import("./auditoria.server");
    await anotar(
      { user_id: "docuseal", slug: "docuseal", name: "DocuSeal" },
      {
        accion: "firmo",
        entidad: "contrato",
        entidadId: caso.id,
        etiqueta: caso.placa,
        detalle: `DocuSeal guardó el contrato firmado y el certificado de ${caso.placa}. ${leido.resumen}`,
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
    if (!row?.auditoria_pdf) throw new Error("Todavía no está el certificado de DocuSeal");
    return { filename: row.auditoria_nombre || `certificado-firma-${row.placa}.pdf`, base64: row.auditoria_pdf };
  });

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
    }>(
      `select f.nombre, f.cc, f.correo, f.firma, f.firmado_at, f.orden, f.sobre_id, s.datos
       from firmantes f join sobres s on s.id = f.sobre_id
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
      yaFirmo: Boolean(yo.firmado_at),
      otro: otros.map((parte) => `${parte.nombre} ${parte.firmado_at ? "ya firmó" : "todavía no firma"}`).join(". "),
      pdf,
    };
  });

export const firmarPortal = createServerFn({ method: "POST" })
  .validator((input: { token: string; firma: string }) => input)
  .handler(async ({ data }) => {
    const token = data.token.trim();
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) throw new Error("Ese enlace no sirve");
    const firma = data.firma.trim();
    if (!firma.startsWith("data:image/png;base64,") || firma.length < 800 || firma.length > 400_000) {
      throw new Error("Falta la firma");
    }
    const sql = await getSql();
    const rows = await sql.query<{ id: number; sobre_id: number; nombre: string; caso_id: number; placa: string }>(
      `select f.id, f.sobre_id, f.nombre, s.caso_id, c.placa
       from firmantes f
       join sobres s on s.id = f.sobre_id
       join casos c on c.id = s.caso_id
       where f.token = $1 and f.firmado_at is null`,
      [token],
    );
    const yo = rows[0];
    if (!yo) throw new Error("Este enlace ya se firmó o no existe");
    await sql.query(`update firmantes set firma = $1, firmado_at = now() where id = $2`, [firma, yo.id]);
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
      const hechas = firmas.map((firma) => ({ nombre: firma.nombre, png: firma.firma }));
      const pdf = await montarContrato(datos, hechas, undefined, await plantillaDeCaso(yo.caso_id));
      const carta = await montarCarta(datos, hechas);
      await sql.query(
        `update casos set firma_contrato = true, firma_carta = true, contrato_pdf = $1, contrato_nombre = $2, updated_at = now() where id = $3`,
        [pdf, `contrato-${yo.placa}.pdf`, yo.caso_id],
      );
      await dejarDocumento(yo.caso_id, "contrato", `contrato-${yo.placa}.pdf`, pdf, yo.nombre);
      await dejarDocumento(yo.caso_id, "carta", `carta-${yo.placa}.pdf`, carta, yo.nombre);
    }
    const { anotar } = await import("./auditoria.server");
    await anotar(
      { user_id: "firma", slug: "propietario", name: yo.nombre },
      {
        accion: "firmo",
        entidad: "contrato",
        entidadId: yo.caso_id,
        etiqueta: yo.placa,
        detalle: `${yo.nombre} firmó el contrato de ${yo.placa} en el portal${pendientes.length === 0 ? ". Ya firmaron todos." : "."}`,
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
      data.destino === "aseguradora" ? `aseguradora-${placa}.pdf` : data.destino === "desvinculacion" ? `desvinculacion-${placa}.pdf` : `empresa-${placa}.pdf`;
    return { base64, filename };
  });
