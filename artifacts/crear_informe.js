const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, BorderStyle, WidthType, ShadingType,
        VerticalAlign, PageNumber, HeadingLevel } = require('docx');
const fs = require('fs');

const thin = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
const borders = { top: thin, bottom: thin, left: thin, right: thin };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function cell(text, opts = {}) {
  const { bold = false, width = 2340, fill = null, align = AlignmentType.LEFT, color = "1A1A1A", size = 20 } = opts;
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: align,
      spacing: { before: 60, after: 60 },
      children: [new TextRun({ text, bold, font: "Arial", size, color })]
    })]
  });
}

const placas = [
  ["1", "WRO651", "Documentos"],
  ["2", "WLT482", "Documentos"],
  ["3", "WLU743", "Documentos"],
  ["4", "ESL206", "—"],
  ["5", "WGK335", "—"],
  ["6", "KTR621", "—"],
  ["7", "GUW745", "—"],
  ["8", "QWW651", "—"],
  ["9", "VDQ220", "—"],
  ["10", "NWL575", "—"],
  ["11", "WMN946", "—"],
  ["12", "STA251", "—"],
  ["13", "OTA259", "—"],
  ["14", "ESN095", "—"],
  ["15", "WPO844", "—"],
  ["16", "UZ612", "—"],
  ["17", "KYS161", "—"],
  ["18", "FVM099", "—"],
];

const plateRows = [
  new TableRow({
    children: [
      cell("#", { bold: true, width: 800, fill: "1B3A4B", color: "FFFFFF", align: AlignmentType.CENTER }),
      cell("Placa", { bold: true, width: 2200, fill: "1B3A4B", color: "FFFFFF", align: AlignmentType.CENTER }),
      cell("Observación", { bold: true, width: 6360, fill: "1B3A4B", color: "FFFFFF" }),
    ]
  }),
  ...placas.map((p, i) => new TableRow({
    children: [
      cell(p[0], { width: 800, fill: i % 2 ? "F5F7FA" : "FFFFFF", align: AlignmentType.CENTER }),
      cell(p[1], { width: 2200, fill: i % 2 ? "F5F7FA" : "FFFFFF", align: AlignmentType.CENTER, bold: true }),
      cell(p[2], { width: 6360, fill: i % 2 ? "F5F7FA" : "FFFFFF" }),
    ]
  }))
];

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickStyle: true,
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 },
        run: { font: "Arial", size: 28, bold: true, color: "1B3A4B" }
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickStyle: true,
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 1 },
        run: { font: "Arial", size: 24, bold: true, color: "1B3A4B" }
      }
    ]
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
            spacing: { after: 60 },
            children: [
              new TextRun({ text: "Radio Taxi Aeropuerto  ·  Vincula Libre — Américas", font: "Arial", size: 18, color: "666666" })
            ]
          }),
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "1B3A4B", space: 4 } },
            spacing: { after: 120 },
            children: [
              new TextRun({ text: "Informe de gestión de campo", font: "Arial", size: 18, bold: true, color: "1B3A4B" })
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
              new TextRun({ text: "David Jaimes  ·  Asesor de afiliaciones  ·  Página ", font: "Arial", size: 16, color: "888888" }),
              new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "888888" })
            ]
          })
        ]
      })
    },
    children: [
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: "INFORME DE GESTIÓN", font: "Arial", size: 32, bold: true, color: "1B3A4B" })]
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: "Barrido de vinculación — Unicentro", font: "Arial", size: 24, color: "555555" })]
      }),

      // Meta table
      new Table({
        width: { size: 10224, type: WidthType.DXA },
        columnWidths: [3408, 6816],
        rows: [
          new TableRow({ children: [
            cell("Fecha", { bold: true, width: 3408, fill: "F0F3F6" }),
            cell("Lunes 26 de octubre de 2026", { width: 6816 })
          ]}),
          new TableRow({ children: [
            cell("Asesor", { bold: true, width: 3408, fill: "F0F3F6" }),
            cell("David Jaimes", { width: 6816 })
          ]}),
          new TableRow({ children: [
            cell("Equipo", { bold: true, width: 3408, fill: "F0F3F6" }),
            cell("Vincula Libre — Américas / Radio Taxi Aeropuerto", { width: 6816 })
          ]}),
          new TableRow({ children: [
            cell("Lugar", { bold: true, width: 3408, fill: "F0F3F6" }),
            cell("Centro Comercial Unicentro — bahía de taxis (zona Taxis Libres)", { width: 6816 })
          ]}),
          new TableRow({ children: [
            cell("Horario", { bold: true, width: 3408, fill: "F0F3F6" }),
            cell("Desde la mañana (recorrido / barrido de turnos)", { width: 6816 })
          ]}),
        ]
      }),

      new Paragraph({ spacing: { before: 280 }, heading: HeadingLevel.HEADING_1, children: [new TextRun("1. Resumen ejecutivo")] }),
      new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: "Se realizó barrido en la bahía de Unicentro. Se evidenció alto interés de conductores y propietarios por pasarse a Taxis Libres / Radio Taxi Aeropuerto.", font: "Arial", size: 22 })]
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({ text: "Contactos interesados registrados: ", font: "Arial", size: 22 }),
          new TextRun({ text: "17 en cuaderno + aproximadamente 5 referidos por WhatsApp ≈ 22 contactos.", font: "Arial", size: 22, bold: true })
        ]
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: "Se dejó plazo orientativo hasta enero para formalizar el cambio (notificación de aproximadamente un mes).", font: "Arial", size: 22 })]
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: "Calificación de la gestión: ", font: "Arial", size: 22 }),
          new TextRun({ text: "muy positiva", font: "Arial", size: 22, bold: true, color: "166534" }),
          new TextRun({ text: " — buen volumen de contactos y apertura al cambio.", font: "Arial", size: 22 })
        ]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("2. Placas registradas (interesados)")] }),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [800, 2200, 6360],
        rows: plateRows
      }),
      new Paragraph({
        spacing: { before: 120, after: 120 },
        children: [new TextRun({ text: "Referidos adicionales: ≈5 contactos en WhatsApp (pendiente de tipificar y pasar a lista formal).", font: "Arial", size: 20, italics: true, color: "555555" })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("3. Objeciones principales")] }),
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: "1. Pólizas recién pagadas en la empresa actual.", font: "Arial", size: 22 })]
      }),
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: "2. Rodamiento pagado por un año anticipado en la otra empresa.", font: "Arial", size: 22 })]
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: "3. Percepción de que el cambio es “brusco” si no hay fecha cercana de vencimiento de pólizas.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Solución ofrecida (gancho principal)")] }),
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: "• Pago de pólizas hasta el 25 de agosto del año entrante.", font: "Arial", size: 22 })]
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({ text: "• Alternativa de ", font: "Arial", size: 22 }),
          new TextRun({ text: "pago de pólizas mes a mes", font: "Arial", size: 22, bold: true }),
          new TextRun({ text: " (la que más generó interés y permitió no perder el contacto).", font: "Arial", size: 22 })
        ]
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: "Muchos dijeron no tener cómo pagar de contado; el mes a mes fue el argumento que más abrió la conversación.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("4. Observaciones de campo")] }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: "Empresas predominantes en la bahía: ", font: "Arial", size: 22 }),
          new TextRun({ text: "Taxi Express, M&M y Taxis a la Mano.", font: "Arial", size: 22, bold: true })
        ]
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: "Conductores y propietarios de Radio Taxi Aeropuerto comentaron que la iniciativa es excelente porque la competencia en esos puntos es alta y a veces hay más vehículos de otras empresas que de RTA.", font: "Arial", size: 22 })]
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: "Varios conductores pidieron información por WhatsApp (autogestión).", font: "Arial", size: 22 })]
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: "Comentario recurrente: sería útil alinear las campañas de vinculación con fechas cercanas al vencimiento de pólizas de cada empresa, para que el cambio sea más fácil.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("5. Próximos pasos")] }),
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "1. Tipificar y organizar los ≈5 referidos que quedaron en WhatsApp.", font: "Arial", size: 22 })] }),
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "2. Seguimiento a los 18+ contactos: llamar / escribir y validar interés real.", font: "Arial", size: 22 })] }),
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "3. Estar atentos a la definición oficial del pago de pólizas mes a mes para poder iniciar traslados.", font: "Arial", size: 22 })] }),
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "4. Priorizar los que ya marcaron “Documentos” (WRO651, WLT482, WLU743).", font: "Arial", size: 22 })] }),
      new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "5. Mantener el plazo comunicado (enero) y no perder el hilo con quienes solo tienen objeción de liquidez de la póliza.", font: "Arial", size: 22 })] }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("6. Conclusión")] }),
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: "Gestión de campo exitosa. Se logró un volumen alto de contactos en un solo punto (Unicentro), se identificaron objeciones claras y se usó el pago mes a mes de pólizas como principal gancho para no perder interesados.", font: "Arial", size: 22 })]
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: "Queda pendiente el seguimiento y la confirmación de la modalidad de pago de pólizas para pasar de interés a procesos de vinculación.", font: "Arial", size: 22 })]
      }),

      new Paragraph({
        spacing: { before: 200 },
        children: [new TextRun({ text: "_______________________________", font: "Arial", size: 22, color: "888888" })]
      }),
      new Paragraph({
        spacing: { before: 40 },
        children: [new TextRun({ text: "David Jaimes", font: "Arial", size: 22, bold: true })]
      }),
      new Paragraph({
        children: [new TextRun({ text: "Asesor de afiliaciones — Vincula Libre / Radio Taxi Aeropuerto", font: "Arial", size: 18, color: "555555" })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/home/workdir/artifacts/Informe_Gestion_Unicentro_26Oct2026.docx", buffer);
  console.log("OK");
});
