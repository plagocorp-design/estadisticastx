const { Document, Packer, Paragraph, TextRun, Header, Footer,
        AlignmentType, BorderStyle, PageNumber, HeadingLevel } = require('docx');
const fs = require('fs');

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
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 0 },
        run: { font: "Arial", size: 26, bold: true, color: "1B3A4B" }
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
      }
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "1B3A4B", space: 6 } },
            spacing: { after: 160 },
            children: [
              new TextRun({ text: "Radio Taxi Aeropuerto  ·  Vincula Libre — Américas", font: "Arial", size: 18, color: "666666" })
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
        spacing: { after: 40 },
        children: [new TextRun({ text: "INFORME DE GESTIÓN", font: "Arial", size: 32, bold: true, color: "1B3A4B" })]
      }),
      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({ text: "Barrido de vinculación — Unicentro", font: "Arial", size: 24, color: "555555" })]
      }),

      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: "Fecha: ", font: "Arial", size: 22, bold: true }),
          new TextRun({ text: "lunes 26 de octubre de 2026", font: "Arial", size: 22 })
        ]
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: "Asesor: ", font: "Arial", size: 22, bold: true }),
          new TextRun({ text: "David Jaimes", font: "Arial", size: 22 })
        ]
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: "Equipo: ", font: "Arial", size: 22, bold: true }),
          new TextRun({ text: "Vincula Libre — Américas / Radio Taxi Aeropuerto", font: "Arial", size: 22 })
        ]
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: "Lugar: ", font: "Arial", size: 22, bold: true }),
          new TextRun({ text: "Centro Comercial Unicentro, bahía de taxis (zona Taxis Libres)", font: "Arial", size: 22 })
        ]
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({ text: "Horario: ", font: "Arial", size: 22, bold: true }),
          new TextRun({ text: "desde la mañana, recorrido y barrido de turnos", font: "Arial", size: 22 })
        ]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Resumen")] }),
      new Paragraph({
        spacing: { after: 140 },
        children: [new TextRun({ text: "El día de ayer se realizó un barrido en la bahía de taxis del centro comercial Unicentro. Desde la mañana se recorrieron los vehículos que esperaban turno y se evidenció un alto interés por pasarse a Taxis Libres / Radio Taxi Aeropuerto.", font: "Arial", size: 22 })]
      }),
      new Paragraph({
        spacing: { after: 140 },
        children: [new TextRun({ text: "A las personas interesadas se les informó un plazo aproximado hasta enero para formalizar el cambio. En total se registraron diecisiete contactos en cuaderno y alrededor de cinco referidos adicionales por WhatsApp, para un aproximado de veintidós interesados.", font: "Arial", size: 22 })]
      }),
      new Paragraph({
        spacing: { after: 140 },
        children: [new TextRun({ text: "La gestión se considera muy positiva por el volumen de contactos logrados y por la apertura al cambio que mostraron conductores y propietarios.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Placas registradas")] }),
      new Paragraph({
        spacing: { after: 140 },
        children: [new TextRun({ text: "Las placas con las que se logró contacto fueron: WRO651, WLT482, WLU743, ESL206, WGK335, KTR621, GUW745, QWW651, VDQ220, NWL575, WMN946, STA251, OTA259, ESN095, WPO844, UZ612, KYS161 y FVM099.", font: "Arial", size: 22 })]
      }),
      new Paragraph({
        spacing: { after: 140 },
        children: [new TextRun({ text: "De estas, WRO651, WLT482 y WLU743 quedaron marcadas con documentos. Quedan además alrededor de cinco referidos en WhatsApp pendientes de tipificar y pasar a lista formal.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Objeciones y soluciones")] }),
      new Paragraph({
        spacing: { after: 140 },
        children: [new TextRun({ text: "Las objeciones principales fueron el pago reciente de pólizas en la empresa actual, el rodamiento pagado por un año anticipado en la otra empresa y la percepción de que el cambio resulta brusco cuando no hay una fecha cercana de vencimiento de pólizas.", font: "Arial", size: 22 })]
      }),
      new Paragraph({
        spacing: { after: 140 },
        children: [new TextRun({ text: "Como solución se ofreció el pago de pólizas hasta el 25 de agosto del año entrante y, sobre todo, la posibilidad de pagar las pólizas mes a mes. Este último argumento fue el mayor gancho de la jornada: muchos dijeron no tener cómo pagar de contado y el mes a mes permitió no perder el contacto ni el interés.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Observaciones de campo")] }),
      new Paragraph({
        spacing: { after: 140 },
        children: [new TextRun({ text: "Al hacer un censo rápido, la gran mayoría de los vehículos en esas bahías pertenecen a Taxi Express, M&M y Taxis a la Mano. Conductores y propietarios de Radio Taxi Aeropuerto comentaron que la iniciativa es excelente, porque la competencia por esos puntos es alta y en ocasiones hay más vehículos de otras empresas que de RTA.", font: "Arial", size: 22 })]
      }),
      new Paragraph({
        spacing: { after: 140 },
        children: [new TextRun({ text: "Varios conductores pidieron la información por WhatsApp. También comentaron que les gustaría más flexibilidad según la empresa en la que estén y que sería útil alinear las campañas de vinculación con fechas cercanas al vencimiento de pólizas, para que el cambio resulte más fácil.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Próximos pasos")] }),
      new Paragraph({
        spacing: { after: 140 },
        children: [new TextRun({ text: "Corresponde tipificar y organizar los referidos que quedaron en WhatsApp, hacer seguimiento a los contactos registrados para validar el interés real y estar atentos a la definición oficial del pago de pólizas mes a mes, de modo que se puedan iniciar los procesos de traslado. Se priorizarán las placas que ya marcaron documentos. Se mantendrá el plazo comunicado hasta enero y el hilo con quienes solo tienen objeción de liquidez de la póliza.", font: "Arial", size: 22 })]
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Conclusión")] }),
      new Paragraph({
        spacing: { after: 140 },
        children: [new TextRun({ text: "La gestión de campo fue exitosa. Se logró un volumen alto de contactos en un solo punto, se identificaron las objeciones claras del sector y se usó el pago mes a mes de pólizas como principal argumento para no perder interesados. Queda pendiente el seguimiento y la confirmación de esa modalidad de pago para pasar del interés a los procesos de vinculación.", font: "Arial", size: 22 })]
      }),

      new Paragraph({
        spacing: { before: 320 },
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
