import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { cambiosDe, siNo, textoPlano } from "@/lib/auditoria";
import { casosDeArea, entregaDe, faseDe, hoyBogota, STEPS, toCaso, type Caso, type CasoDraft, type CasoRow, type StepKey } from "@/lib/casos";
import { configura, esBandeja, llevaProcesos, veElEquipo, type Role } from "@/lib/team.public";
import { unificarEmpresa } from "@/lib/empresas";

export type Me = { id: string; name: string; slug: string; role: Role };

export const CASO_COLS = `
  c.id, c.owner_id, p.name as owner_name, c.placa, c.cc, c.nombre, c.telefono, c.empresa,
  c.direccion, c.correo, c.marca, c.linea, c.modelo, c.fecha_firma, c.contrato_nombre,
  c.docuseal_id, c.docuseal_estado, c.auditoria_nombre,
  c.fecha_inicio, c.dijo_si, c.cedula, c.tarjeta_propiedad, c.tarjeta_operacion, c.soat,
  c.tecnomecanica, c.formulario, c.documentos, c.firma_carta, c.firma_contrato, c.plata_poliza,
  c.via_seguros, c.polizas_subidas, c.operativa, c.estado_tarjeta, c.tarjeta_entregada,
  c.completado, c.observacion, c.proxima, c.fecha_proxima, c.fecha_poliza, c.fecha_compra,
  c.poliza_fase, c.poliza_entrega, c.origen,
  c.motivo_cierre, c.fecha_cierre, c.updated_at,
  c.mano, c.via_estado, c.via_enlace, c.via_atencion, c.via_nota, c.via_pide_carta, c.via_pide_contrato,
  c.op_polizas, c.op_impreso, c.op_pedido, c.op_tarjeta, c.docs_ocultos,
  c.servicio_nota, c.bonos, c.beneficios, c.area_marcas, c.mano_asignado, c.devolucion
`;

export const prepareTeam = createServerFn({ method: "POST" }).handler(async () => {
  const { ensureTeamAccounts } = await import("./team.server");
  await ensureTeamAccounts();
  return { ok: true };
});

export const getMe = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Me | null> => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) return null;
    return { id: profile.user_id, name: profile.name, slug: profile.slug, role: profile.role };
  });

export const listCasos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Caso[]> => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) return [];
    const sql = await getSql();
    const hoy = hoyBogota();
    await sql.query(
      `update casos set fecha_poliza = case
         when fecha_firma ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and fecha_firma >= '2026-10-07' and fecha_firma <= $1 then fecha_firma
         when fecha_inicio ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and fecha_inicio >= '2026-10-07' and fecha_inicio <= $1 then fecha_inicio
         else $1
       end
       where polizas_subidas = true and fecha_poliza = ''`,
      [hoy],
    );
    const rows = veElEquipo(profile.role) || esBandeja(profile.role)
      ? await sql.query<CasoRow>(
          `select ${CASO_COLS} from casos c join profiles p on p.user_id = c.owner_id order by c.created_at desc`,
        )
      : await sql.query<CasoRow>(
          `select ${CASO_COLS} from casos c join profiles p on p.user_id = c.owner_id where c.owner_id = $1 order by c.created_at desc`,
          [context.userId],
        );
    const lista = (esBandeja(profile.role) ? casosDeArea(rows.map(toCaso), profile.role) : rows.map(toCaso));
    const ultimos = await sql.query<{ entidad_id: string; actor_name: string; created_at: string }>(
      `select distinct on (entidad_id) entidad_id, actor_name, created_at
       from auditoria
       where entidad in ('proceso', 'poliza')
       order by entidad_id, id desc`,
    );
    const quien = new Map(ultimos.map((row) => [String(row.entidad_id), row]));
    return lista.map((caso) => {
      const ultimo = quien.get(String(caso.id));
      if (!ultimo) return caso;
      return { ...caso, actualizadoEn: String(ultimo.created_at), actualizadoPor: ultimo.actor_name };
    });
  });

function clean(value: string, max = 120) {
  return value.trim().slice(0, max);
}

function identidad(data: { placa: string; cc: string; nombre: string; telefono: string; empresa?: string }) {
  const placa = clean(data.placa, 12).replace(/\s/g, "").toUpperCase();
  const cc = clean(data.cc, 20).replace(/\D/g, "");
  const nombre = clean(data.nombre, 80).toUpperCase();
  const telefono = clean(data.telefono, 20).replace(/\D/g, "");
  const empresa = unificarEmpresa(clean(data.empresa ?? "", 80));
  if (!placa || !cc || !nombre || !telefono) throw new Error("Faltan placa, cédula, nombre o teléfono");
  return { placa, cc, nombre, telefono, empresa };
}

async function placaAbierta(placa: string, exceptId = 0) {
  const sql = await getSql();
  const rows = await sql.query<{ name: string }>(
    `select p.name as name from casos c
     join profiles p on p.user_id = c.owner_id
     where upper(c.placa) = $1 and c.completado = false and btrim(c.motivo_cierre) = '' and c.id <> $2
     limit 1`,
    [placa, exceptId],
  );
  if (rows[0]) throw new Error(`La placa ${placa} ya la tiene ${rows[0].name} abierta`);
}

async function asesorId(slug: string) {
  const sql = await getSql();
  const rows = await sql.query<{ user_id: string }>(
    `select user_id from profiles where slug = $1 and role in ('asesor', 'lider') limit 1`,
    [slug],
  );
  if (!rows[0]) throw new Error("Elige el asesor del proceso");
  return rows[0].user_id;
}

function dato(value: string | undefined, max: number) {
  return clean(value ?? "", max);
}

export const leerContrato = createServerFn({ method: "POST" })
  .validator((input: { pdf: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data }) => {
    const { leerPdfContrato } = await import("./contrato.server");
    return leerPdfContrato(data.pdf);
  });

export const verContrato = createServerFn({ method: "POST" })
  .validator((id: number) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    if (esBandeja(profile.role)) throw new Error("Tu área no abre procesos ni cambia los pasos del asesor");
    const sql = await getSql();
    const rows = await sql.query<{ contrato_pdf: string; contrato_nombre: string; placa: string }>(
      veElEquipo(profile.role)
        ? `select contrato_pdf, contrato_nombre, placa from casos where id = $1`
        : `select contrato_pdf, contrato_nombre, placa from casos where id = $1 and owner_id = $2`,
      veElEquipo(profile.role) ? [id] : [id, context.userId],
    );
    const row = rows[0];
    if (!row?.contrato_pdf) throw new Error("Este proceso no tiene el PDF del contrato");
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "consulto",
      entidad: "contrato",
      entidadId: id,
      etiqueta: row.placa,
      detalle: `Abrió el PDF del contrato de ${row.placa}`,
    });
    return {
      filename: row.contrato_nombre || `contrato-${row.placa}.pdf`,
      base64: row.contrato_pdf,
    };
  });

export const createCaso = createServerFn({ method: "POST" })
  .validator((input: CasoDraft) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    if (esBandeja(profile.role)) throw new Error("Tu área no abre procesos ni cambia los pasos del asesor");
    const { placa, cc, nombre, telefono, empresa } = identidad(data);
    await placaAbierta(placa);
    const ownerId = veElEquipo(profile.role) && data.ownerSlug ? await asesorId(data.ownerSlug) : context.userId;
    const firma = /^\d{4}-\d{2}-\d{2}$/.test(data.fechaFirma ?? "") ? data.fechaFirma! : "";
    const hoy = firma || hoyBogota();
    const pdf = data.contratoPdf && data.contratoPdf.length > 80 ? data.contratoPdf : "";
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      insert into casos (
        owner_id, placa, cc, nombre, telefono, empresa, origen, fecha_inicio, dijo_si, firma_contrato,
        direccion, correo, marca, linea, modelo, fecha_firma, contrato_nombre, contrato_pdf
      )
      values (
        ${ownerId}, ${placa}, ${cc}, ${nombre}, ${telefono}, ${empresa}, ${dato(data.origen, 80)}, ${hoy}, ${Boolean(pdf)}, ${Boolean(data.firmaContrato)},
        ${dato(data.direccion, 120)}, ${dato(data.correo, 80)}, ${dato(data.marca, 40)},
        ${dato(data.linea, 40)}, ${dato(data.modelo, 8)}, ${firma},
        ${pdf ? dato(data.contratoNombre, 120) : ""}, ${pdf}
      )
      returning id
    `;
    const id = rows[0]?.id ?? 0;
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "creo",
      entidad: "proceso",
      entidadId: id,
      etiqueta: placa,
      detalle: `Abrió el proceso ${placa} · ${nombre}${pdf ? ". Subió el contrato" : ""}`,
    });
    const { notificarSheets } = await import("./sheets.server");
    void notificarSheets();
    return { id: rows[0]?.id ?? 0 };
  });

export type CasoPatch = {
  id: number;
  placa: string;
  cc: string;
  nombre: string;
  telefono: string;
  empresa: string;
  estadoTarjeta: Caso["estadoTarjeta"];
  observacion: string;
  proxima: string;
  fechaProxima: string;
  direccion: string;
  correo: string;
  marca: string;
  linea: string;
  modelo: string;
  fechaFirma: string;
  fechaCompra?: string;
  origen: string;
  motivoCierre: string;
  contratoNombre?: string;
  contratoPdf?: string;
  ownerSlug?: string;
} & Record<StepKey, boolean>;

export const updateCaso = createServerFn({ method: "POST" })
  .validator((input: CasoPatch) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    if (esBandeja(profile.role)) throw new Error("Tu área no abre procesos ni cambia los pasos del asesor");
    const entregada = Boolean(data.tarjetaEntregada);
    const motivo = clean(data.motivoCierre ?? "", 300);
    const completado = !motivo && entregada && Boolean(data.completado);
    const tarjeta = ["Pendiente", "Radicada", "Expedida"].includes(data.estadoTarjeta)
      ? data.estadoTarjeta
      : "";
    const { placa, cc, nombre, telefono, empresa } = identidad(data);
    await placaAbierta(placa, data.id);
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(clean(data.fechaProxima ?? "", 10))
      ? clean(data.fechaProxima, 10)
      : "";
    const sql = await getSql();
    const previas = await sql.query<Record<string, unknown> & { polizas_subidas: boolean; fecha_poliza: string; fecha_cierre: string; owner_slug: string }>(
      `select c.*, p.slug as owner_slug
       from casos c join profiles p on p.user_id = c.owner_id
       where c.id = $1`,
      [data.id],
    );
    const previa = previas[0];
    let fechaPoliza = "";
    if (data.polizasSubidas) {
      fechaPoliza = previa?.fecha_poliza || hoyBogota();
    }
    const fechaCierre = motivo ? previa?.fecha_cierre || hoyBogota() : "";
    const params: unknown[] = [
      placa,
      cc,
      nombre,
      telefono,
      empresa,
      Boolean(data.dijoSi),
      Boolean(data.cedula),
      Boolean(data.tarjetaPropiedad),
      Boolean(data.tarjetaOperacion),
      Boolean(data.soat),
      Boolean(data.tecnomecanica),
      Boolean(data.formulario),
      Boolean(data.documentos),
      Boolean(data.firmaCarta),
      Boolean(data.firmaContrato),
      Boolean(data.plataPoliza),
      Boolean(data.viaSeguros),
      Boolean(data.polizasSubidas),
      Boolean(data.operativa),
      tarjeta,
      entregada,
      completado,
      clean(data.observacion ?? "", 500),
      clean(data.proxima ?? "", 200),
      motivo ? "" : fecha,
      dato(data.direccion, 120),
      dato(data.correo, 80),
      dato(data.marca, 40),
      dato(data.linea, 40),
      dato(data.modelo, 8),
      /^\d{4}-\d{2}-\d{2}$/.test(data.fechaFirma ?? "") ? data.fechaFirma : "",
      fechaPoliza,
      dato(data.origen, 80),
      motivo,
      fechaCierre,
      /^\d{4}-\d{2}-\d{2}$/.test(data.fechaCompra ?? "") ? data.fechaCompra : "",
    ];
    let text = `update casos set
      placa = $1, cc = $2, nombre = $3, telefono = $4, empresa = $5,
      dijo_si = $6, cedula = $7, tarjeta_propiedad = $8, tarjeta_operacion = $9,
      soat = $10, tecnomecanica = $11, formulario = $12, documentos = $13,
      firma_carta = $14, firma_contrato = $15, plata_poliza = $16,
      via_seguros = $17, polizas_subidas = $18, operativa = $19,
      estado_tarjeta = $20, tarjeta_entregada = $21, completado = $22,
      observacion = $23, proxima = $24, fecha_proxima = $25,
      direccion = $26, correo = $27, marca = $28, linea = $29, modelo = $30, fecha_firma = $31,
      fecha_poliza = $32, origen = $33, motivo_cierre = $34, fecha_cierre = $35, fecha_compra = $36,
      poliza_fase = case when $18 then poliza_fase else '' end,
      poliza_entrega = case when $18 then poliza_entrega else '' end,
      updated_at = now()`;
    if (data.contratoPdf && data.contratoPdf.length > 80) {
      params.push(dato(data.contratoNombre, 120), data.contratoPdf);
      text += `, contrato_nombre = $${params.length - 1}, contrato_pdf = $${params.length}`;
    }
    if (veElEquipo(profile.role) && data.ownerSlug) {
      params.push(await asesorId(data.ownerSlug));
      text += `, owner_id = $${params.length}`;
    }
    params.push(data.id);
    text += ` where id = $${params.length}`;
    if (!veElEquipo(profile.role)) {
      params.push(context.userId);
      text += ` and owner_id = $${params.length}`;
    }
    text += " returning id";
    const updated = await sql.query<{ id: number }>(text, params);
    if (!updated.length) throw new Error("No encontré ese proceso");
    if (previa) {
      const pares = [
        { label: "Placa", antes: textoPlano(previa.placa), despues: placa },
        { label: "Cédula", antes: textoPlano(previa.cc), despues: cc },
        { label: "Propietario", antes: textoPlano(previa.nombre), despues: nombre },
        { label: "Celular", antes: textoPlano(previa.telefono), despues: telefono },
        { label: "Empresa", antes: textoPlano(previa.empresa), despues: empresa },
        { label: "Origen", antes: textoPlano(previa.origen), despues: dato(data.origen, 80) },
        { label: "Dirección", antes: textoPlano(previa.direccion), despues: dato(data.direccion, 120) },
        { label: "Correo", antes: textoPlano(previa.correo), despues: dato(data.correo, 80) },
        { label: "Marca", antes: textoPlano(previa.marca), despues: dato(data.marca, 40) },
        { label: "Línea", antes: textoPlano(previa.linea), despues: dato(data.linea, 40) },
        { label: "Modelo", antes: textoPlano(previa.modelo), despues: dato(data.modelo, 8) },
        { label: "Fecha de firma", antes: textoPlano(previa.fecha_firma), despues: /^\d{4}-\d{2}-\d{2}$/.test(data.fechaFirma ?? "") ? data.fechaFirma! : "" },
        { label: "Fecha de compra", antes: textoPlano(previa.fecha_compra), despues: /^\d{4}-\d{2}-\d{2}$/.test(data.fechaCompra ?? "") ? data.fechaCompra! : "" },
        { label: "Estado de la tarjeta", antes: textoPlano(previa.estado_tarjeta), despues: tarjeta },
        { label: "Observación", antes: textoPlano(previa.observacion), despues: clean(data.observacion ?? "", 500) },
        { label: "Próximo paso", antes: textoPlano(previa.proxima), despues: clean(data.proxima ?? "", 200) },
        { label: "Fecha próxima", antes: textoPlano(previa.fecha_proxima), despues: motivo ? "" : fecha },
        { label: "Motivo de cierre", antes: textoPlano(previa.motivo_cierre), despues: motivo },
        ...STEPS.map((step) => ({
          label: step.label,
          antes: siNo(previa[step.key === "dijoSi" ? "dijo_si" : step.key === "tarjetaPropiedad" ? "tarjeta_propiedad" : step.key === "tarjetaOperacion" ? "tarjeta_operacion" : step.key === "firmaCarta" ? "firma_carta" : step.key === "firmaContrato" ? "firma_contrato" : step.key === "plataPoliza" ? "plata_poliza" : step.key === "viaSeguros" ? "via_seguros" : step.key === "polizasSubidas" ? "polizas_subidas" : step.key === "tarjetaEntregada" ? "tarjeta_entregada" : step.key]),
          despues: siNo(data[step.key]),
        })),
      ];
      if (veElEquipo(profile.role) && data.ownerSlug && data.ownerSlug !== textoPlano(previa.owner_slug)) {
        pares.push({ label: "Asesor", antes: textoPlano(previa.owner_slug), despues: data.ownerSlug });
      }
      if (data.contratoPdf && data.contratoPdf.length > 80) {
        pares.push({ label: "Contrato", antes: textoPlano(previa.contrato_nombre), despues: `archivo nuevo: ${dato(data.contratoNombre, 120)}` });
      }
      const cambio = cambiosDe(pares);
      if (cambio.hubo) {
        const { anotar } = await import("./auditoria.server");
        await anotar(profile, {
          accion: "edito",
          entidad: "proceso",
          entidadId: data.id,
          etiqueta: placa,
          detalle: cambio.detalle,
          antes: cambio.antes,
          despues: cambio.despues,
        });
      }
    }
    const { notificarSheets } = await import("./sheets.server");
    void notificarSheets();
    return { ok: true };
  });

export const moverPoliza = createServerFn({ method: "POST" })
  .validator((input: {
    id: number;
    accion: "espera" | "recibida" | "avisar" | "pedir_foto" | "pedir_final" | "cancelar" | "aceptar";
  }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    if (esBandeja(profile.role)) throw new Error("Tu área no abre procesos ni cambia los pasos del asesor");
    const sql = await getSql();
    const rows = await sql.query<{
      owner_id: string;
      placa: string;
      polizas_subidas: boolean;
      poliza_fase: string;
      poliza_entrega: string;
    }>(
      `select owner_id, placa, polizas_subidas, poliza_fase, poliza_entrega from casos where id = $1`,
      [data.id],
    );
    const caso = rows[0];
    if (!caso) throw new Error("No encontré ese proceso");
    if (!caso.polizas_subidas) throw new Error("Primero tienen que quedar pagadas");
    const lider = configura(profile.role);
    const dueno = caso.owner_id === context.userId;
    let fase = caso.poliza_fase;
    let entrega = caso.poliza_entrega;
    let aviso = "";
    if (data.accion === "aceptar") {
      if (!dueno) throw new Error("Las acepta el asesor del proceso");
      if (entrega !== "pide_foto" && entrega !== "pide_final") throw new Error("David todavía no dijo que las va a entregar");
      entrega = entrega === "pide_foto" ? "foto" : "final";
      aviso = `Acepté las pólizas de ${caso.placa}. Ya las tengo.`;
    } else {
      if (!lider) throw new Error("Eso lo marca David");
      if (data.accion === "espera") {
        if (fase) throw new Error("Esa póliza ya pasó de la espera");
        fase = "espera";
      } else if (data.accion === "recibida") {
        if (fase !== "espera") throw new Error("Primero déjalas en espera de impresión");
        fase = "recibida";
      } else if (data.accion === "avisar") {
        if (fase !== "recibida") throw new Error("Primero márcalas como recibidas");
        fase = "avisada";
        aviso = `Recibí las pólizas impresas de ${caso.placa}. Ya las tengo.`;
      } else if (data.accion === "cancelar") {
        if (entrega !== "pide_foto" && entrega !== "pide_final") throw new Error("No hay una entrega por aceptar");
        entrega = "";
      } else {
        if (fase !== "avisada") throw new Error("Primero avisa que ya las recibiste");
        if (entrega === "foto" || entrega === "final") throw new Error("El asesor ya las aceptó");
        entrega = data.accion === "pedir_foto" ? "pide_foto" : "pide_final";
        aviso =
          entrega === "pide_foto"
            ? `Te voy a entregar las pólizas de ${caso.placa} para la foto. Acéptalas cuando las tengas.`
            : `Te voy a entregar las pólizas de ${caso.placa}, entrega definitiva. Acéptalas cuando las tengas.`;
      }
    }
    await sql.query(`update casos set poliza_fase = $1, poliza_entrega = $2, updated_at = now() where id = $3`, [fase, entrega, data.id]);
    const { anotar } = await import("./auditoria.server");
    const que =
      data.accion === "espera"
        ? "las dejó en espera de impresión"
        : data.accion === "recibida"
          ? "marcó las pólizas impresas como recibidas"
          : data.accion === "avisar"
            ? "avisó que ya recibió las pólizas impresas"
            : data.accion === "pedir_foto"
              ? "dijo que las va a entregar para la foto"
              : data.accion === "pedir_final"
                ? "dijo que las va a entregar definitivas"
                : data.accion === "cancelar"
                  ? "canceló la entrega"
                  : "aceptó la entrega de las pólizas";
    await anotar(profile, {
      accion: "movio",
      entidad: "poliza",
      entidadId: data.id,
      etiqueta: caso.placa,
      detalle: `${caso.placa}: ${que}`,
      antes: `fase ${caso.poliza_fase || "—"} · entrega ${caso.poliza_entrega || "—"}`,
      despues: `fase ${fase || "—"} · entrega ${entrega || "—"}`,
    });
    if (aviso) {
      await sql.query(`insert into mensajes (caso_id, author_id, body) values ($1, $2, $3)`, [data.id, context.userId, aviso]);
    }
    return { fase: faseDe(fase), entrega: entregaDe(entrega) };
  });

export const removeCaso = createServerFn({ method: "POST" })
  .validator((id: number) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    if (esBandeja(profile.role)) throw new Error("Tu área no abre procesos ni cambia los pasos del asesor");
    const sql = await getSql();
    const previos = await sql.query<{ placa: string; nombre: string }>(`select placa, nombre from casos where id = $1`, [id]);
    const rows =
      veElEquipo(profile.role)
        ? await sql<{ id: number }>`delete from casos where id = ${id} returning id`
        : await sql<{ id: number }>`delete from casos where id = ${id} and owner_id = ${context.userId} returning id`;
    if (!rows.length) throw new Error("No encontré ese proceso");
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "borro",
      entidad: "proceso",
      entidadId: id,
      etiqueta: previos[0]?.placa ?? String(id),
      detalle: `Borró el proceso ${previos[0]?.placa ?? id}${previos[0]?.nombre ? ` · ${previos[0].nombre}` : ""}`,
    });
    const { notificarSheets } = await import("./sheets.server");
    void notificarSheets();
    return { ok: true };
  });

export const exportarExcel = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !veElEquipo(profile.role)) throw new Error("Solo coordinación exporta el equipo");
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, { accion: "exporto", entidad: "proceso", detalle: "Descargó el Excel del equipo", etiqueta: "Excel" });
    const sql = await getSql();
    const rows = await sql.query<CasoRow>(
      `select ${CASO_COLS} from casos c join profiles p on p.user_id = c.owner_id order by p.name, c.placa`,
    );
    const { armarExcel } = await import("./excel.server");
    return armarExcel(rows.map(toCaso));
  });

export const listMetas = createServerFn({ method: "GET" })
  .validator((mes: string) => {
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error("Mes inválido");
    return mes;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: mes }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !veElEquipo(profile.role)) throw new Error("Solo coordinación asigna metas");
    const sql = await getSql();
    const rows = await sql.query<{ slug: string; meta: number }>(
      `select p.slug, m.meta from metas_mes m join profiles p on p.user_id = m.owner_id where m.mes = $1`,
      [mes],
    );
    return rows.map((row) => ({ slug: row.slug, meta: Number(row.meta) }));
  });

export const miCuota = createServerFn({ method: "GET" })
  .validator((mes: string) => {
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error("Mes inválido");
    return mes;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: mes }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !llevaProcesos(profile.role)) return { meta: null as number | null };
    const sql = await getSql();
    const rows = await sql.query<{ meta: number }>(
      `select meta from metas_mes where mes = $1 and owner_id = $2`,
      [mes, profile.user_id],
    );
    return { meta: rows[0] ? Number(rows[0].meta) : null };
  });

export const guardarMetas = createServerFn({ method: "POST" })
  .validator((input: { mes: string; items: { slug: string; meta: number }[] }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !configura(profile.role)) throw new Error("Solo David asigna las metas");
    if (!/^\d{4}-\d{2}$/.test(data.mes)) throw new Error("Mes inválido");
    const sql = await getSql();
    for (const item of data.items) {
      const meta = Math.max(0, Math.min(999, Math.round(Number(item.meta) || 0)));
      const dueños = await sql.query<{ user_id: string }>(
        `select user_id from profiles where slug = $1 and role in ('asesor', 'lider') limit 1`,
        [item.slug],
      );
      const ownerId = dueños[0]?.user_id;
      if (!ownerId) continue;
      await sql.query(
        `insert into metas_mes (mes, owner_id, meta) values ($1, $2, $3)
         on conflict (mes, owner_id) do update set meta = excluded.meta`,
        [data.mes, ownerId, meta],
      );
    }
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "edito",
      entidad: "meta",
      etiqueta: data.mes,
      detalle: `Cambió las metas de ${data.mes}: ${data.items.map((item) => `${item.slug} ${Math.max(0, Math.min(999, Math.round(Number(item.meta) || 0)))}`).join(", ")}`,
    });
    const { notificarSheets } = await import("./sheets.server");
    void notificarSheets();
    return { ok: true };
  });

export const listDiasMeta = createServerFn({ method: "GET" })
  .validator((mes: string) => {
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error("Mes inválido");
    return mes;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: mes }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No autorizado");
    const sql = await getSql();
    const equipo = veElEquipo(profile.role);
    const rows = await sql.query<{ slug: string; fecha: string; cuenta: number | null }>(
      equipo
        ? `select p.slug, d.fecha, d.cuenta
           from dias_meta d join profiles p on p.user_id = d.owner_id
           where d.fecha >= $1 and d.fecha <= $2
           order by d.fecha, p.name`
        : `select $3 as slug, d.fecha, m.cuenta
           from (select distinct fecha from dias_meta where fecha >= $1 and fecha <= $2) d
           left join dias_meta m on m.fecha = d.fecha and m.owner_id = $4`,
      equipo ? [`${mes}-01`, `${mes}-31`] : [`${mes}-01`, `${mes}-31`, profile.slug, profile.user_id],
    );
    return rows.map((row) => ({
      slug: row.slug,
      fecha: String(row.fecha).slice(0, 10),
      cuenta: row.cuenta == null ? null : Number(row.cuenta) === 1,
    }));
  });

export const guardarDiasMeta = createServerFn({ method: "POST" })
  .validator((input: { fecha: string; accion: "uno" | "todos" | "nadie" | "normal"; slug?: string; cuenta?: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !veElEquipo(profile.role)) throw new Error("Solo coordinación cambia los días");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.fecha)) throw new Error("Día inválido");
    const sql = await getSql();
    const gente = await sql.query<{ user_id: string; slug: string }>(
      `select user_id, slug from profiles where role in ('asesor', 'lider')`,
    );
    if (data.accion === "normal") {
      await sql.query(`delete from dias_meta where fecha = $1`, [data.fecha]);
    } else if (data.accion === "uno") {
      const persona = gente.find((p) => p.slug === data.slug);
      if (!persona) throw new Error("No encontré a ese asesor");
      await sql.query(
        `insert into dias_meta (fecha, owner_id, cuenta) values ($1, $2, $3)
         on conflict (fecha, owner_id) do update set cuenta = excluded.cuenta`,
        [data.fecha, persona.user_id, data.cuenta ? 1 : 0],
      );
    } else {
      const cuenta = data.accion === "todos" ? 1 : 0;
      for (const persona of gente) {
        await sql.query(
          `insert into dias_meta (fecha, owner_id, cuenta) values ($1, $2, $3)
           on conflict (fecha, owner_id) do update set cuenta = excluded.cuenta`,
          [data.fecha, persona.user_id, cuenta],
        );
      }
    }
    const que =
      data.accion === "normal"
        ? `dejó el ${data.fecha} como día normal`
        : data.accion === "uno"
          ? `${data.cuenta ? "asignó" : "quitó"} a ${data.slug} el ${data.fecha}`
          : data.accion === "todos"
            ? `asignó a todo el equipo el ${data.fecha}`
            : `dejó libre a todo el equipo el ${data.fecha}`;
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, { accion: "edito", entidad: "meta", etiqueta: data.fecha, detalle: que });
    const { notificarSheets } = await import("./sheets.server");
    void notificarSheets();
    const mes = data.fecha.slice(0, 7);
    const rows = await sql.query<{ slug: string; fecha: string; cuenta: number }>(
      `select p.slug, d.fecha, d.cuenta
       from dias_meta d join profiles p on p.user_id = d.owner_id
       where d.fecha >= $1 and d.fecha <= $2
       order by d.fecha, p.name`,
      [`${mes}-01`, `${mes}-31`],
    );
    return rows.map((row) => ({ slug: row.slug, fecha: String(row.fecha).slice(0, 10), cuenta: Number(row.cuenta) === 1 }));
  });
