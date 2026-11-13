import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { cambiosDe, siNo, textoPlano } from "@/lib/auditoria";
import { casosDeArea, entregaDe, entregaLista, faseDe, hoyBogota, otrosPropietarios, STEPS, toCaso, type Caso, type CasoDraft, type CasoRow, type StepKey } from "@/lib/casos";
import { configura, esBandeja, esGerencia, llevaProcesos, veElEquipo, type Role } from "@/lib/team.public";
import { unificarEmpresa } from "@/lib/empresas";

export type Me = { id: string; name: string; slug: string; role: Role; ciudadVista: number | null; acceso: string };

export const CASO_COLS = `
  c.id, c.owner_id, p.name as owner_name, c.placa, c.cc, c.nombre, c.telefono, c.empresa,
  c.direccion, c.correo, c.marca, c.linea, c.modelo, c.capacidad, c.clase, c.carroceria, c.motor, c.serie, c.cilindraje, c.servicio, c.fecha_firma, c.contrato_nombre,
  c.docuseal_id, c.docuseal_estado, c.auditoria_nombre,
  c.fecha_inicio, c.dijo_si, c.cedula, c.tarjeta_propiedad, c.tarjeta_operacion, c.soat,
  c.tecnomecanica, c.formulario, c.documentos, c.firma_carta, c.firma_contrato, c.plata_poliza,
  c.via_seguros, c.polizas_subidas, c.operativa, c.estado_tarjeta, c.tarjeta_entregada,
  c.completado, c.observacion, c.proxima, c.fecha_proxima, c.fecha_poliza, c.fecha_compra,
  c.poliza_fase, c.poliza_entrega, c.origen,
  c.motivo_cierre, c.fecha_cierre, c.updated_at,
  c.mano, c.via_estado, c.via_enlace, c.via_atencion, c.via_nota, c.via_pide_carta, c.via_pide_contrato,
  c.op_polizas, c.op_impreso, c.op_pedido, c.op_tarjeta, c.docs_ocultos,
  c.servicio_nota, c.bonos, c.beneficios, c.area_marcas, c.mano_asignado, c.devolucion,
  c.cita_fecha, c.cita_hora, c.entrega, c.copropietarios
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
    return { id: profile.user_id, name: profile.name, slug: profile.slug, role: profile.role, ciudadVista: profile.ciudad_vista, acceso: profile.acceso ?? "" };
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
    const ciudad = esGerencia(profile.role) ? (profile.ciudad_vista ?? 0) : (profile.ciudad_id ?? 1);
    await sql.query(`alter table mensajes add column if not exists para_id text not null default ''`);
    const filtroCiudad = ` and coalesce(c.ciudad_id, 1) = ${ciudad} `;
    const rows = veElEquipo(profile.role) || esBandeja(profile.role)
      ? await sql.query<CasoRow>(
          `select ${CASO_COLS} from casos c join profiles p on p.user_id = c.owner_id where coalesce(c.ciudad_id, 1) = $1 order by c.created_at desc`,
          [ciudad],
        )
      : await sql.query<CasoRow>(
          `select ${CASO_COLS} from casos c join profiles p on p.user_id = c.owner_id
           where coalesce(c.ciudad_id, 1) = $2
             and (
               c.owner_id = $1
               or exists (select 1 from mensajes m where m.caso_id = c.id and m.para_id = $1)
             )
           order by c.created_at desc`,
          [context.userId, ciudad],
        );
    const listaBase = esBandeja(profile.role) ? casosDeArea(rows.map(toCaso), profile.role) : rows.map(toCaso);
    const llamados = esBandeja(profile.role)
      ? await sql.query<{ caso_id: number }>(`select distinct caso_id from mensajes where para_id = $1`, [context.userId])
      : [];
    const ya = new Set(listaBase.map((caso) => caso.id));
    const extra = rows.map(toCaso).filter((caso) => !ya.has(caso.id) && llamados.some((fila) => Number(fila.caso_id) === caso.id));
    const lista = [...extra, ...listaBase];
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

export const pasarProceso = createServerFn({ method: "POST" })
  .validator((input: { id: number; slug: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile) throw new Error("No encontré tu usuario");
    const destinoId = await asesorId(data.slug);
    const sql = await getSql();
    const rows = await sql.query<{ id: number; owner_id: string; placa: string; ciudad_id: number | null }>(
      `select id, owner_id, placa, ciudad_id from casos where id = $1`,
      [data.id],
    );
    const caso = rows[0];
    if (!caso) throw new Error("No encontré ese proceso");
    const soyDueno = caso.owner_id === context.userId;
    if (!soyDueno && !veElEquipo(profile.role)) throw new Error("Solo quien lo tiene puede pasarlo");
    if (destinoId === caso.owner_id) throw new Error("Ese proceso ya es de ese asesor");
    const personas = await sql.query<{ name: string; ciudad_id: number | null }>(
      `select name, ciudad_id from profiles where user_id = $1`,
      [destinoId],
    );
    const persona = personas[0];
    if (!persona) throw new Error("No encontré a ese asesor");
    const ciudadCaso = Number(caso.ciudad_id || 0);
    const ciudadPersona = Number(persona.ciudad_id || 0);
    if (!veElEquipo(profile.role) && ciudadCaso && ciudadPersona && ciudadCaso !== ciudadPersona) {
      throw new Error("Ese asesor no está en tu ciudad");
    }
    await sql.query(`update casos set owner_id = $1, updated_at = now() where id = $2`, [destinoId, caso.id]);
    await sql.query(`insert into mensajes (caso_id, author_id, body) values ($1, $2, $3)`, [
      caso.id,
      context.userId,
      `${profile.name} pasó ${caso.placa} a ${persona.name}.`,
    ]);
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "movio",
      entidad: "proceso",
      entidadId: caso.id,
      etiqueta: caso.placa,
      detalle: `Pasó ${caso.placa} a ${persona.name}`,
    });
    return { ownerId: destinoId, ownerName: persona.name };
  });

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
    const extras = JSON.stringify(otrosPropietarios(data.copropietarios));
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      insert into casos (
        owner_id, placa, cc, nombre, telefono, empresa, origen, fecha_inicio, dijo_si, firma_contrato,
        direccion, correo, marca, linea, modelo, capacidad, clase, carroceria, motor, serie, cilindraje, servicio, fecha_firma, contrato_nombre, contrato_pdf, copropietarios
      )
      values (
        ${ownerId}, ${placa}, ${cc}, ${nombre}, ${telefono}, ${empresa}, ${dato(data.origen, 80)}, ${hoy}, ${Boolean(pdf)}, ${Boolean(data.firmaContrato)},
        ${dato(data.direccion, 120)}, ${dato(data.correo, 80)}, ${dato(data.marca, 40)},
        ${dato(data.linea, 40)}, ${dato(data.modelo, 8)}, ${dato(data.capacidad, 8)},
        ${dato(data.clase, 24)}, ${dato(data.carroceria, 24)}, ${dato(data.motor, 24)}, ${dato(data.serie, 24)}, ${dato(data.cilindraje, 12)}, ${dato(data.servicio, 20)},
        ${firma},
        ${pdf ? dato(data.contratoNombre, 120) : ""}, ${pdf}, ${extras}
      )
      returning id
    `;
    const id = rows[0]?.id ?? 0;
    if (id) {
      await sql.query(
        `update casos set ciudad_id = coalesce((select ciudad_id from profiles where user_id = $1), (select ciudad_vista from profiles where user_id = $2), 1) where id = $3`,
        [ownerId, context.userId, id],
      );
    }
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
  capacidad?: string;
  clase?: string;
  carroceria?: string;
  motor?: string;
  serie?: string;
  cilindraje?: string;
  servicio?: string;
  fechaFirma: string;
  fechaCompra?: string;
  origen: string;
  motivoCierre: string;
  contratoNombre?: string;
  contratoPdf?: string;
  ownerSlug?: string;
  citaFecha?: string;
  citaHora?: string;
  entrega?: string;
  copropietarios?: string;
  datosExtra?: string;
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
    await sql.query(`alter table casos add column if not exists datos_extra text not null default ''`);
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
      /^\d{4}-\d{2}-\d{2}$/.test(data.citaFecha ?? "") ? data.citaFecha : "",
      /^\d{2}:\d{2}$/.test(data.citaHora ?? "") ? data.citaHora : "",
      entregaLista(data.entrega),
      JSON.stringify(otrosPropietarios(data.copropietarios)),
      dato(data.capacidad, 8),
      dato(data.clase, 24),
      dato(data.carroceria, 24),
      dato(data.motor, 24),
      dato(data.serie, 24),
      dato(data.cilindraje, 12),
      dato(data.servicio, 20),
      dato(data.datosExtra, 4000),
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
      cita_fecha = $37, cita_hora = $38, entrega = $39, copropietarios = $40, capacidad = $41,
      clase = $42, carroceria = $43, motor = $44, serie = $45, cilindraje = $46, servicio = $47, datos_extra = $48,
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
    const citaFecha = /^\d{4}-\d{2}-\d{2}$/.test(data.citaFecha ?? "") ? String(data.citaFecha) : "";
    const citaHora = /^\d{2}:\d{2}$/.test(data.citaHora ?? "") ? String(data.citaHora) : "";
    if (citaFecha) {
      const dueno = String(previa?.owner_id ?? context.userId);
      const ya = await sql.query<{ id: number }>(
        `select id from agenda where caso_id = $1 and titulo = 'Cita de entrega' order by id desc limit 1`,
        [data.id],
      );
      if (ya[0]) {
        await sql.query(`update agenda set fecha = $1, hora = $2, owner_id = $3, nota = $4 where id = $5`, [
          citaFecha,
          citaHora,
          dueno,
          `Entrega de ${placa}`,
          ya[0].id,
        ]);
      } else {
        await sql.query(
          `insert into agenda (owner_id, caso_id, tipo, titulo, fecha, hora, nota) values ($1, $2, 'visita', 'Cita de entrega', $3, $4, $5)`,
          [dueno, data.id, citaFecha, citaHora, `Entrega de ${placa}`],
        );
      }
    }
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
        const { avisarEstado } = await import("./avisos.server");
        void avisarEstado({
          antesTarjeta: textoPlano(previa.estado_tarjeta),
          ahoraTarjeta: tarjeta,
          antesEntregada: Boolean(previa.tarjeta_entregada),
          ahoraEntregada: Boolean(data.tarjetaEntregada),
          correo: dato(data.correo, 80),
          nombre,
          placa,
          asesor: profile.name,
        }).catch(() => undefined);
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

export const exportarTodo = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !veElEquipo(profile.role)) throw new Error("Solo coordinación descarga todo");
    const { anotar } = await import("./auditoria.server");
    await anotar(profile, { accion: "exporto", entidad: "proceso", detalle: "Descargó el respaldo completo", etiqueta: "Respaldo" });
    const sql = await getSql();
    async function leer(nombre: string, text: string) {
      try {
        const filas = await sql.query<Record<string, unknown>>(text);
        return { nombre, filas };
      } catch {
        return { nombre, filas: [] as Record<string, unknown>[] };
      }
    }
    const hojas = [
      await leer(
        "Procesos",
        `select c.id, c.owner_id, c.placa, c.cc, c.nombre, c.telefono, c.empresa, c.fecha_inicio,
                c.dijo_si, c.cedula, c.tarjeta_propiedad, c.tarjeta_operacion, c.soat, c.tecnomecanica,
                c.formulario, c.documentos, c.firma_carta, c.firma_contrato, c.plata_poliza, c.via_seguros,
                c.polizas_subidas, c.operativa, c.estado_tarjeta, c.tarjeta_entregada, c.completado,
                c.observacion, c.proxima, c.fecha_proxima, c.created_at, c.direccion, c.correo, c.marca,
                c.linea, c.modelo, c.fecha_firma, c.contrato_nombre,
                case when coalesce(c.contrato_pdf, '') <> '' then 'Sí' else 'No' end as tiene_contrato_pdf,
                c.fecha_poliza, c.origen, c.updated_at, c.motivo_cierre, c.fecha_cierre, c.fecha_compra,
                c.poliza_fase, c.poliza_entrega, c.docuseal_id, c.docuseal_estado, c.auditoria_nombre,
                case when coalesce(c.auditoria_pdf, '') <> '' then 'Sí' else 'No' end as tiene_auditoria_pdf,
                c.mano, c.via_estado, c.via_enlace, c.via_nota, c.via_pide_carta, c.via_pide_contrato,
                c.op_polizas, c.op_impreso, c.op_pedido, c.op_tarjeta, c.docs_ocultos, c.servicio_nota,
                c.bonos, c.beneficios, c.mano_asignado, c.devolucion, c.area_marcas, c.via_atencion,
                c.copropietarios, c.cita_fecha, c.cita_hora, c.entrega, p.name as asesor, p.slug as usuario
         from casos c left join profiles p on p.user_id = c.owner_id
         order by c.id`,
      ),
      await leer(
        "Personas",
        `select p.user_id, p.slug, p.name, p.role, k.clave
         from profiles p left join claves_equipo k on k.user_id = p.user_id
         order by p.name`,
      ),
      await leer("Bitacoras", `select b.*, p.name as asesor from bitacoras b left join profiles p on p.user_id = b.owner_id order by b.fecha, p.name`),
      await leer(
        "Control",
        `select m.*, p.name as asesor, c.placa
         from control_marcas m
         left join profiles p on p.user_id = m.owner_id
         left join casos c on c.id = m.caso_id
         order by m.fecha, m.hora`,
      ),
      await leer("Horarios", `select e.*, p.name as asesor from equipo_extra e left join profiles p on p.user_id = e.owner_id`),
      await leer("Dias meta", `select d.*, p.name as asesor from dias_meta d left join profiles p on p.user_id = d.owner_id order by d.fecha`),
      await leer("Metas", `select m.*, p.name as asesor from metas_mes m left join profiles p on p.user_id = m.owner_id order by m.mes`),
      await leer(
        "Agenda",
        `select a.*, p.name as asesor, c.placa from agenda a
         left join profiles p on p.user_id = a.owner_id
         left join casos c on c.id = a.caso_id
         order by a.fecha, a.hora`,
      ),
      await leer(
        "Chat",
        `select m.id, m.caso_id, c.placa, m.author_id, p.name as autor, m.body, m.created_at
         from mensajes m
         left join casos c on c.id = m.caso_id
         left join profiles p on p.user_id = m.author_id
         order by m.id`,
      ),
      await leer("Auditoria", `select * from auditoria order by id`),
      await leer(
        "Documentos",
        `select d.id, d.caso_id, c.placa, d.tipo, d.nombre, d.subido_por, d.drive_id, d.lectura, d.created_at,
                case when coalesce(d.archivo, '') <> '' then 'Sí' else 'No' end as tiene_archivo
         from documentos d left join casos c on c.id = d.caso_id
         order by d.id`,
      ),
      await leer("Sobres", `select s.*, c.placa from sobres s left join casos c on c.id = s.caso_id order by s.id`),
      await leer(
        "Firmantes",
        `select f.id, f.sobre_id, f.orden, f.nombre, f.cc, f.correo, f.token, f.firmado_at,
                case when coalesce(f.firma, '') <> '' then 'Sí' else 'No' end as firmo
         from firmantes f order by f.sobre_id, f.orden`,
      ),
      await leer("Piloto", `select * from piloto`),
    ];
    const { armarRespaldo } = await import("./excel.server");
    return armarRespaldo(hojas);
  });

const CASO_TEXTO = [
  "placa", "cc", "nombre", "telefono", "empresa", "fecha_inicio", "estado_tarjeta", "observacion", "proxima", "fecha_proxima",
  "direccion", "correo", "marca", "linea", "modelo", "fecha_firma", "contrato_nombre", "fecha_poliza", "origen", "motivo_cierre",
  "fecha_cierre", "fecha_compra", "poliza_fase", "poliza_entrega", "docuseal_id", "docuseal_estado", "auditoria_nombre", "mano",
  "via_estado", "via_enlace", "via_nota", "op_pedido", "op_tarjeta", "docs_ocultos", "servicio_nota", "bonos", "beneficios",
  "mano_asignado", "devolucion", "area_marcas", "via_atencion", "copropietarios", "cita_fecha", "cita_hora", "entrega",
];
const CASO_SI = [
  "dijo_si", "cedula", "tarjeta_propiedad", "tarjeta_operacion", "soat", "tecnomecanica", "formulario", "documentos",
  "firma_carta", "firma_contrato", "plata_poliza", "via_seguros", "polizas_subidas", "operativa", "tarjeta_entregada",
  "completado", "via_pide_carta", "via_pide_contrato", "op_polizas", "op_impreso",
];

function esSi(valor: string) {
  const s = valor.trim().toLowerCase();
  return s === "sí" || s === "si" || s === "true" || s === "1" || s === "t";
}

function entero(valor: string, vacio: number | null = 0) {
  if (!valor.trim()) return vacio;
  const n = Number(valor);
  return Number.isFinite(n) ? Math.trunc(n) : vacio;
}

async function guardarFila(
  sql: Awaited<ReturnType<typeof getSql>>,
  tabla: string,
  conflicto: string[],
  columnas: { nombre: string; valor: unknown }[],
  conservar: string[] = [],
) {
  const nombres = columnas.map((columna) => columna.nombre);
  const valores = columnas.map((columna) => columna.valor);
  const marcas = nombres.map((_, i) => `$${i + 1}`).join(", ");
  const cambia = nombres
    .filter((nombre) => !conflicto.includes(nombre) && !conservar.includes(nombre))
    .map((nombre) => `${nombre} = excluded.${nombre}`);
  const accion = cambia.length ? `do update set ${cambia.join(", ")}` : "do nothing";
  await sql.query(
    `insert into ${tabla} (${nombres.join(", ")}) values (${marcas}) on conflict (${conflicto.join(", ")}) ${accion}`,
    valores,
  );
}

export const cargarRespaldo = createServerFn({ method: "POST" })
  .validator((archivo: string) => {
    if (!archivo || archivo.length < 80) throw new Error("El archivo llegó vacío");
    if (archivo.length > 25_000_000) throw new Error("Ese respaldo pesa más de lo que se puede cargar de una vez");
    return archivo;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data: archivo }) => {
    const { profileFor } = await import("./team.server");
    const profile = await profileFor(context.userId);
    if (!profile || !configura(profile.role)) throw new Error("Solo el líder carga un respaldo");
    const { leerRespaldo } = await import("./excel.server");
    const hojas = await leerRespaldo(archivo);
    if (!hojas.Procesos?.length) throw new Error("Ese archivo no es un respaldo de Vincula Libre");
    const sql = await getSql();
    const usuarios = new Set(
      (await sql.query<{ id: string }>(`select id from "user"`)).map((fila) => fila.id),
    );
    const casos = new Set((await sql.query<{ id: number }>(`select id from casos`)).map((fila) => Number(fila.id)));
    let procesos = 0;
    let saltados = 0;
    for (const fila of hojas.Procesos) {
      const id = entero(fila.id, null);
      const owner = fila.owner_id;
      if (!id || !owner || !usuarios.has(owner)) {
        saltados += 1;
        continue;
      }
      const columnas: { nombre: string; valor: unknown }[] = [
        { nombre: "id", valor: id },
        { nombre: "owner_id", valor: owner },
        ...CASO_TEXTO.map((nombre) => ({ nombre, valor: fila[nombre] ?? "" })),
        ...CASO_SI.map((nombre) => ({ nombre, valor: esSi(fila[nombre] ?? "") })),
      ];
      await guardarFila(sql, "casos", ["id"], columnas);
      casos.add(id);
      procesos += 1;
    }
    await sql.query(`select setval(pg_get_serial_sequence('casos','id'), coalesce((select max(id) from casos), 1))`);

    let personas = 0;
    for (const fila of hojas.Personas ?? []) {
      if (!fila.user_id || !usuarios.has(fila.user_id)) continue;
      if (fila.slug && fila.name && ["asesor", "lider", "coordinadora", "via_seguros", "operativa", "servicio"].includes(fila.role)) {
        await sql.query(`update profiles set slug = $1, name = $2, role = $3 where user_id = $4`, [
          fila.slug, fila.name, fila.role, fila.user_id,
        ]);
      }
      if (fila.clave) {
        await sql.query(
          `insert into claves_equipo (user_id, clave) values ($1, $2) on conflict (user_id) do update set clave = excluded.clave, updated_at = now()`,
          [fila.user_id, fila.clave],
        );
      }
      personas += 1;
    }

    let bitacoras = 0;
    for (const fila of hojas.Bitacoras ?? []) {
      if (!fila.owner_id || !fila.fecha || !usuarios.has(fila.owner_id)) continue;
      await guardarFila(sql, "bitacoras", ["owner_id", "fecha"], [
        { nombre: "owner_id", valor: fila.owner_id },
        { nombre: "fecha", valor: fila.fecha.slice(0, 10) },
        { nombre: "modo", valor: fila.modo ?? "" },
        { nombre: "zonas", valor: fila.zonas ?? "" },
        { nombre: "llamadas", valor: entero(fila.llamadas ?? "") },
        { nombre: "visitas", valor: entero(fila.visitas ?? "") },
        { nombre: "dijo_si", valor: entero(fila.dijo_si ?? "") },
        { nombre: "polizas", valor: entero(fila.polizas ?? "") },
        { nombre: "que_hizo", valor: fila.que_hizo ?? "" },
        { nombre: "detalle_call", valor: fila.detalle_call ?? "" },
        { nombre: "detalle_calle", valor: fila.detalle_calle ?? "" },
        { nombre: "trabas", valor: fila.trabas ?? "" },
        { nombre: "manana", valor: fila.manana ?? "" },
      ]);
      bitacoras += 1;
    }

    let metas = 0;
    for (const fila of hojas.Metas ?? []) {
      if (!fila.owner_id || !fila.mes || !usuarios.has(fila.owner_id)) continue;
      await guardarFila(sql, "metas_mes", ["mes", "owner_id"], [
        { nombre: "mes", valor: fila.mes.slice(0, 7) },
        { nombre: "owner_id", valor: fila.owner_id },
        { nombre: "meta", valor: entero(fila.meta ?? "") },
      ]);
      metas += 1;
    }
    for (const fila of hojas["Dias meta"] ?? []) {
      if (!fila.owner_id || !fila.fecha || !usuarios.has(fila.owner_id)) continue;
      await guardarFila(sql, "dias_meta", ["fecha", "owner_id"], [
        { nombre: "fecha", valor: fila.fecha.slice(0, 10) },
        { nombre: "owner_id", valor: fila.owner_id },
        { nombre: "cuenta", valor: entero(fila.cuenta ?? "", 1) },
      ]);
    }

    let agenda = 0;
    for (const fila of hojas.Agenda ?? []) {
      const id = entero(fila.id, null);
      const casoId = entero(fila.caso_id ?? "", null);
      if (!id || !fila.owner_id || !usuarios.has(fila.owner_id) || !(fila.fecha || "").slice(0, 10)) continue;
      const tipo = ["visita", "llamada", "escribir", "otro", "distintivos"].includes(fila.tipo) ? fila.tipo : "otro";
      await guardarFila(sql, "agenda", ["id"], [
        { nombre: "id", valor: id },
        { nombre: "owner_id", valor: fila.owner_id },
        { nombre: "caso_id", valor: casoId && casos.has(casoId) ? casoId : null },
        { nombre: "tipo", valor: tipo },
        { nombre: "titulo", valor: fila.titulo || "Cita" },
        { nombre: "fecha", valor: (fila.fecha || "").slice(0, 10) },
        { nombre: "hora", valor: fila.hora ?? "" },
        { nombre: "nota", valor: fila.nota ?? "" },
        { nombre: "hecho", valor: esSi(fila.hecho ?? "") },
      ]);
      agenda += 1;
    }

    let control = 0;
    for (const fila of hojas.Control ?? []) {
      const id = entero(fila.id, null);
      const casoId = entero(fila.caso_id ?? "", null);
      if (!id || !fila.owner_id || !usuarios.has(fila.owner_id)) continue;
      const tipos = ["ingreso", "salida", "break", "almuerzo", "visita", "otro"];
      await guardarFila(sql, "control_marcas", ["id"], [
        { nombre: "id", valor: id },
        { nombre: "owner_id", valor: fila.owner_id },
        { nombre: "tipo", valor: tipos.includes(fila.tipo) ? fila.tipo : "otro" },
        { nombre: "fecha", valor: (fila.fecha || "").slice(0, 10) },
        { nombre: "hora", valor: fila.hora || "00:00" },
        { nombre: "hora_fin", valor: fila.hora_fin ?? "" },
        { nombre: "caso_id", valor: casoId && casos.has(casoId) ? casoId : null },
        { nombre: "nota", valor: fila.nota ?? "" },
      ]);
      control += 1;
    }
    for (const fila of hojas.Horarios ?? []) {
      if (!fila.owner_id || !usuarios.has(fila.owner_id)) continue;
      await guardarFila(sql, "equipo_extra", ["owner_id"], [
        { nombre: "owner_id", valor: fila.owner_id },
        { nombre: "activo", valor: entero(fila.activo ?? "", 1) },
        { nombre: "empieza", valor: (fila.empieza || "2026-10-07").slice(0, 10) },
        { nombre: "entrada", valor: fila.entrada || "08:00" },
        { nombre: "salida", valor: fila.salida || "17:00" },
      ]);
    }

    let documentos = 0;
    for (const fila of hojas.Documentos ?? []) {
      const id = entero(fila.id, null);
      const casoId = entero(fila.caso_id ?? "", null);
      if (!id || !casoId || !casos.has(casoId)) continue;
      await guardarFila(sql, "documentos", ["id"], [
        { nombre: "id", valor: id },
        { nombre: "caso_id", valor: casoId },
        { nombre: "tipo", valor: fila.tipo || "unificado" },
        { nombre: "nombre", valor: fila.nombre || "archivo" },
        { nombre: "archivo", valor: "" },
        { nombre: "subido_por", valor: fila.subido_por ?? "" },
        { nombre: "drive_id", valor: fila.drive_id ?? "" },
        { nombre: "lectura", valor: fila.lectura ?? "" },
      ], ["archivo"]);
      documentos += 1;
    }

    let chat = 0;
    for (const fila of hojas.Chat ?? []) {
      const id = entero(fila.id, null);
      const casoId = entero(fila.caso_id ?? "", null);
      if (!id || !casoId || !casos.has(casoId) || !fila.author_id || !usuarios.has(fila.author_id) || !fila.body) continue;
      await guardarFila(sql, "mensajes", ["id"], [
        { nombre: "id", valor: id },
        { nombre: "caso_id", valor: casoId },
        { nombre: "author_id", valor: fila.author_id },
        { nombre: "body", valor: fila.body },
      ]);
      chat += 1;
    }

    for (const tabla of ["agenda", "control_marcas", "documentos", "mensajes"]) {
      try {
        await sql.query(`select setval(pg_get_serial_sequence('${tabla}','id'), coalesce((select max(id) from ${tabla}), 1))`);
      } catch {
        /* la secuencia ya queda usable */
      }
    }

    const { anotar } = await import("./auditoria.server");
    await anotar(profile, {
      accion: "cargo",
      entidad: "respaldo",
      detalle: `Cargó un respaldo: ${procesos} procesos, ${personas} personas, ${bitacoras} bitácoras, ${agenda} citas, ${control} marcas, ${documentos} documentos, ${chat} mensajes`,
      etiqueta: "Respaldo",
    });
    return { procesos, personas, bitacoras, metas, agenda, control, documentos, chat, saltados };
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
