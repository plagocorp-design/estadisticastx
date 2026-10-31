const { Document, Packer, Paragraph, TextRun, Header, Footer,
        AlignmentType, BorderStyle, PageNumber, HeadingLevel } = require('docx');
const fs = require('fs');

const p = (text, opts = {}) => new Paragraph({
  spacing: { after: opts.after ?? 140, before: opts.before ?? 0 },
  alignment: opts.align,
  children: [new TextRun({ text, font: "Arial", size: opts.size ?? 22, bold: opts.bold, color: opts.color ?? "1A1A1A", italics: opts.italics })]
});

const runs = (parts, spacing = 140) => new Paragraph({
  spacing: { after: spacing },
  children: parts.map(x => new TextRun({ font: "Arial", size: 22, color: "1A1A1A", ...x }))
});

const h1 = (t) => new Paragraph({
  spacing: { before: 280, after: 120 },
  children: [new TextRun({ text: t, font: "Arial", size: 26, bold: true, color: "1B3A4B" })]
});

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } }
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1008, right: 1008, bottom: 1008, left: 1008 }
      }
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "1B3A4B", space: 6 } },
            spacing: { after: 140 },
            children: [
              new TextRun({ text: "Vincula Libre — Américas  ·  Radio Taxi Aeropuerto", font: "Arial", size: 18, color: "666666" })
            ]
          })
        ]
      })
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 6 } },
            spacing: { before: 80 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Informe de meta del equipo  ·  Página ", font: "Arial", size: 16, color: "888888" }),
              new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "888888" })
            ]
          })
        ]
      })
    },
    children: [
      p("INFORME DE GESTIÓN DEL EQUIPO", { size: 32, bold: true, color: "1B3A4B", after: 40 }),
      p("Meta e informes — periodo del 7 al 31 de octubre de 2026", { size: 24, color: "555555", after: 200 }),

      runs([
        { text: "Elaborado por: ", bold: true },
        { text: "David Jaimes, asesor líder" }
      ], 80),
      runs([
        { text: "Corte: ", bold: true },
        { text: "31 de octubre de 2026" }
      ], 80),
      runs([
        { text: "Alcance: ", bold: true },
        { text: "procesos del equipo desde el 7 de octubre. La foto de etapas, demorados y citas es al día de hoy." }
      ], 200),

      h1("1. Cómo van los procesos"),
      p("Hay 61 procesos en total en el embudo actual. La distribución por etapa es la siguiente:"),
      p("Nuevo: 0. Dijo sí: 0. Documentos: 3. En firma: 16. En Vía Seguros: 0. Póliza lista: 3. Con David: 2. En operativa: 10. Tarjeta: 10. Completado: 12."),
      p("Además, 5 procesos no se concretaron en el periodo."),
      p("Lectura: la mayor carga abierta está en firma (16) y en el tramo operativa–tarjeta (20). Ya hay 12 completados. El cuello visible es sacar de firma y cuadrar compra de pólizas en los que ya tienen tarjeta radicada."),

      h1("2. Meta de octubre (póliza pagada)"),
      p("Corte al día de hoy frente a la meta asignada:"),
      p("David: 12 de 40 (30%). Alison: 4 de 40 (10%). Patricia: 10 de 40 (25%). Laura: 5 de 40 (13%). José: 5 de 42 (12%)."),
      p("El equipo suma 36 pólizas marcadas en el mes. David lidera en absolutos; Patricia es la segunda. Alison, Laura y José están más atrás respecto a su meta individual."),

      h1("3. El equipo en el periodo"),
      p("David: 16 abiertos, 12 pólizas, 3 completados, 3 no concretados, 42 llamadas, 0 visitas, 9 dijeron sí."),
      p("Alison: 4 abiertos, 4 pólizas, 3 completados, 2 no concretados, 126 llamadas, 0 visitas, 7 dijeron sí."),
      p("Patricia: 10 abiertos, 10 pólizas, 5 completados, 0 no concretados, 351 llamadas, 0 visitas, 28 dijeron sí."),
      p("Laura: 5 abiertos, 5 pólizas, 0 completados, 0 no concretados, 312 llamadas, 0 visitas, 10 dijeron sí."),
      p("José: 9 abiertos, 5 pólizas, 1 completado, 0 no concretados, 429 llamadas, 1 visita, 52 dijeron sí."),
      p("Patricia y José concentran el volumen de llamadas y de “dijeron sí”. David concentra más procesos abiertos propios y más pólizas en número. Laura tiene buen volumen de llamadas pero aún sin completados en el corte."),

      h1("4. De qué empresa salieron"),
      p("60 vehículos empezaron en este periodo. Destaca Autolagos S.A. con 21 vehículos, 16 con póliza y 10 completados. Tax Express S.A. aportó 16 vehículos y 6 con póliza, pero 0 completados. Radio Taxi Autolagos S.A.S: 7 vehículos, 5 con póliza, 1 completado. Taxis a la Mano SAS: 4 vehículos, 2 con póliza. El resto son volúmenes menores (Alo Taxis, Coomfetrans, Digitax, Proturismo, Taxatelite, Taxi Cupos, Taxi Estrella, Taxis Ya). Sin empresa o vehículo nuevo: 3, de los cuales 3 con póliza y 1 completado."),
      p("Autolagos es la fuente más fuerte en conversión a póliza y a completado. Tax Express genera entradas, pero aún no cierra completados en este corte."),

      h1("5. Por dónde llegaron"),
      p("Trabajo de campo: 15 entraron y 9 con póliza. Base de datos (call): 22 entraron y 14 con póliza. Referido: 14 entraron y 9 con póliza. Sin origen: 9 entraron y 4 con póliza."),
      p("El call aporta el mayor número de entradas y de pólizas. Campo y referidos convierten bien en proporción. Conviene no descuidar el origen referido y campo, que ya muestran buenos resultados."),

      h1("6. Los más demorados"),
      p("Criterio: verde hasta 7 días, ámbar de 8 a 15, rojo de 16 en adelante, según días desde que empezó el proceso."),
      p("En rojo (16 días o más): LTK189 Edgar Leonardo Duarte Ardila (30 días, David, en firma, firmar la carta). TGX105 Luis Quiroga (18 días, José, en firma, confirmar plata de póliza). VER846 Rafael Alba (18 días, José, entregada, cuadrar fecha de pólizas). VEU656 Sandra Yaneth Gómez Páez (18 días, Patricia, en firma, pedir documentos, 15 días quieta). VEW298 Gloria Emilse Báez Sora (18 días, Laura, tarjeta radicada, cuadrar pólizas). JTP961 Carlos Arturo Avellaneda Porras (17 días, David, tarjeta radicada). SXO739 Ana Cecilia González Ríos, VDZ212 Pedro Nel Martínez Rodríguez (17 días, Laura, tarjeta radicada). FVK322 Rafael Hernando Vilarraga Vanegas, TEQ204 Sandra Johana Penagos Gómez, VDJ469 Víctor Alfonso Abril Pinilla, VDX410 Jairo Mora Cuesta, VEH069 Sandra Patricia Rojas Pimiento, VEV848 y VFD737 Jairo Mora Cuesta (16 días, varios asesores, firma o tarjeta)."),
      p("Prioridad de desatraso: procesos en firma quietos más de una semana (VEU656, VDX410, VEV848, VFD737) y los de tarjeta radicada que llevan días sin cuadrar compra de pólizas (VEW298, JTP961, SXO739, VDZ212, FVK322, VDJ469, VEH069, WGL139)."),

      h1("7. Por qué se cayeron"),
      p("En el periodo se registraron estos motivos de no concretar: dos casos en los que no tenían claro si seguir y querían hablar primero con la esposa; uno por miedo a la limitación en la tarjeta de operación al estar con otra empresa y pagar pólizas allá; uno por no contestar llamadas ni WhatsApp (se asumió desistimiento); y uno porque en última medida decidió quedarse en su empresa actual."),

      h1("8. Citas vencidas"),
      p("No hay citas vencidas al corte de este informe."),

      h1("9. Conclusiones y focos"),
      p("El embudo tiene masa en firma y en operativa–tarjeta. Hay 12 completados y 36 pólizas del mes, con David y Patricia al frente en pólizas. El call alimenta bien; Autolagos convierte mejor que Tax Express hacia completado."),
      p("Focos recomendados: (1) destrabar firmas quietas y pedir documentos pendientes; (2) agendar de una vez la compra de pólizas en todos los de tarjeta radicada; (3) empujar meta de Alison, Laura y José con seguimiento diario a “dijeron sí” y a procesos en firma; (4) cuidar los casos de Jairo Mora Cuesta (varios procesos) y los de 16–30 días para que no se enfrien."),

      p("_______________________________", { before: 280, after: 40, color: "888888" }),
      p("David Jaimes", { bold: true, after: 40 }),
      p("Asesor líder — Vincula Libre / Radio Taxi Aeropuerto", { size: 18, color: "555555", after: 40 }),
      p("31 de octubre de 2026", { size: 18, color: "555555" }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/home/workdir/artifacts/Informe_Meta_Equipo_Octubre_2026.docx", buffer);
  console.log("OK");
});
