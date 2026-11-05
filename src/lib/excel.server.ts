import ExcelJS from "exceljs";
import { hoyBogota, type Caso, type StepKey } from "@/lib/casos";

const NAVY = "FF1B3A4B";
const LIME = "FFC6E84A";
const PAPER = "FFF3F5F2";
const INK = "FF102033";
const WHITE = "FFFFFFFF";
const LINE = "FFD7DFD6";
const SOFT = "FF3D5166";

const HOJAS = [
  { hoja: "David", nombre: "David Jaimes" },
  { hoja: "Alison", nombre: "Alison Moreno" },
  { hoja: "Patricia", nombre: "Patricia" },
  { hoja: "Laura", nombre: "Laura" },
  { hoja: "Jose", nombre: "José" },
] as const;

const HEADERS = [
  "Placa",
  "CC propietario",
  "Nombre del propietario",
  "Número de contacto",
  "Empresa actual",
  "Fecha inicio",
  "Dijo sí",
  "Cédula",
  "Tarjeta propiedad",
  "Tarjeta operación",
  "SOAT",
  "Tecnomecánica",
  "Formulario",
  "Documentos subidos",
  "Firma carta",
  "Firma contrato",
  "Tiene plata póliza",
  "Pasado a Vía Seguros",
  "Pólizas pagadas",
  "Pasado a Operativa",
  "Estado tarjeta",
  "Tarjeta entregada",
  "Completado",
  "% avance",
  "Estado del proceso",
  "Observación",
  "Próxima gestión",
  "Fecha próxima",
  "De dónde salió",
  "Por qué se cerró",
  "Fecha de cierre",
  "Fecha compra póliza",
  "Entrega de póliza",
] as const;

const WIDTHS = [14, 18, 32, 20, 22, 14, 12, 12, 16, 16, 12, 16, 14, 16, 14, 16, 16, 18, 16, 16, 16, 16, 14, 12, 22, 36, 28, 16, 22, 36, 16, 18, 28];

const STEP_KEYS: StepKey[] = [
  "dijoSi",
  "cedula",
  "tarjetaPropiedad",
  "tarjetaOperacion",
  "soat",
  "tecnomecanica",
  "formulario",
  "documentos",
  "firmaCarta",
  "firmaContrato",
  "plataPoliza",
  "viaSeguros",
  "polizasSubidas",
  "operativa",
];

const solid = (argb: string): ExcelJS.Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});

const border: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: LINE } },
  left: { style: "thin", color: { argb: LINE } },
  bottom: { style: "thin", color: { argb: LINE } },
  right: { style: "thin", color: { argb: LINE } },
};

const listaSiNo: ExcelJS.DataValidation = {
  type: "list",
  allowBlank: true,
  formulae: ['"Sí,No"'],
  showErrorMessage: true,
  errorStyle: "warning",
  errorTitle: "Sí o No",
  error: "En los pasos solo va Sí o No.",
};

const listaTarjeta: ExcelJS.DataValidation = {
  type: "list",
  allowBlank: true,
  formulae: ['"Pendiente,Radicada,Expedida"'],
  showErrorMessage: true,
  errorStyle: "warning",
  errorTitle: "Estado de la tarjeta",
  error: "Pendiente, Radicada o Expedida.",
};

function textoEntrega(caso: Caso) {
  if (caso.polizaEntrega === "pide_foto") return "Por aceptar, para la foto";
  if (caso.polizaEntrega === "pide_final") return "Por aceptar, definitiva";
  if (caso.polizaEntrega === "foto") return "Aceptada para la foto";
  if (caso.polizaEntrega === "final") return "Entrega definitiva aceptada";
  if (caso.polizaFase === "espera") return "En espera de impresión";
  if (caso.polizaFase === "recibida") return "David las recibió";
  if (caso.polizaFase === "avisada") return "David avisó, falta entregar";
  return "";
}

function si(value: boolean) {
  return value ? "Sí" : "No";
}

function formulaEstado(row: number) {
  return `IF(A${row}="","",IF(AD${row}<>"","No se concretó",IF(W${row}="Sí","Completado",IF(V${row}="Sí","Entregada",IF(U${row}="Expedida","Tarjeta expedida",IF(U${row}="Radicada","Tarjeta radicada",IF(T${row}="Sí","En operativa",IF(S${row}="Sí","Póliza lista",IF(R${row}="Sí","En Vía Seguros",IF(OR(O${row}="Sí",P${row}="Sí"),"En firma",IF(N${row}="Sí","Documentos",IF(G${row}="Sí","Dijo sí","Nuevo"))))))))))))`;
}

function formulaAvance(row: number) {
  return `IF(A${row}="","",(COUNTIF(G${row}:T${row},"Sí")+COUNTIF(V${row},"Sí")+COUNTIF(W${row},"Sí"))/16)`;
}

function estiloTitulo(cell: ExcelJS.Cell, size = 16) {
  cell.font = { name: "Calibri", size, bold: true, color: { argb: WHITE } };
  cell.fill = solid(NAVY);
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function pintarEncabezado(sheet: ExcelJS.Worksheet, rowNumber: number, from: number, to: number) {
  const row = sheet.getRow(rowNumber);
  row.height = 32;
  for (let col = from; col <= to; col++) {
    const cell = row.getCell(col);
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = solid(NAVY);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = border;
  }
}

function prepararHoja(sheet: ExcelJS.Worksheet, columnas: number) {
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };
  sheet.pageSetup.horizontalCentered = true;
  sheet.headerFooter.oddFooter = "&LVincula Libre&RPágina &P";
  sheet.properties.defaultRowHeight = 18;
  for (let i = 1; i <= columnas; i++) sheet.getColumn(i).width = WIDTHS[i - 1] ?? 14;
}

function filasLibres(cantidad: number) {
  return Math.max(cantidad + 12, 20);
}

function escribirAsesor(sheet: ExcelJS.Worksheet, nombre: string, casos: Caso[]) {
  const last = 4 + filasLibres(casos.length);
  prepararHoja(sheet, HEADERS.length);
  sheet.properties.tabColor = { argb: NAVY };
  sheet.mergeCells(1, 1, 1, HEADERS.length);
  sheet.mergeCells(2, 1, 2, HEADERS.length);
  sheet.mergeCells(3, 1, 3, HEADERS.length);
  const titulo = sheet.getCell(1, 1);
  titulo.value = "SEGUIMIENTO DE AFILIACIONES  ·  TAXIS LIBRES";
  estiloTitulo(titulo);
  sheet.getRow(1).height = 26;
  const sub = sheet.getCell(2, 1);
  sub.value = `Asesor: ${nombre}    ·    Escribe Sí o No. El porcentaje y el estado se calculan solos: no borres esas dos columnas.`;
  sub.font = { name: "Calibri", size: 11, color: { argb: INK } };
  sub.fill = solid(LIME);
  sub.alignment = { vertical: "middle" };
  sheet.getRow(2).height = 20;
  const orden = sheet.getCell(3, 1);
  orden.value =
    "Orden: dijo sí, documentos, formulario y subida, firma de carta y contrato, plata de la póliza, Vía Seguros, pólizas subidas, Operativa, tarjeta pendiente radicada o expedida, entregada, completado.";
  orden.font = { name: "Calibri", size: 10, color: { argb: SOFT }, italic: true };
  orden.alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(3).height = 28;
  HEADERS.forEach((label, index) => {
    sheet.getCell(4, index + 1).value = label;
  });
  pintarEncabezado(sheet, 4, 1, HEADERS.length);

  for (let index = 0; index < last - 4; index++) {
    const row = 5 + index;
    const caso = casos[index];
    const zebra = index % 2 === 1;
    const values: Array<string | number> = caso
      ? [
          caso.placa,
          caso.cc,
          caso.nombre,
          caso.telefono,
          caso.empresa,
          caso.fechaInicio,
          ...STEP_KEYS.map((key) => si(caso[key])),
          caso.estadoTarjeta,
          si(caso.tarjetaEntregada),
          si(caso.completado),
          "",
          "",
          caso.observacion,
          caso.proxima,
          caso.fechaProxima,
          caso.origen,
          caso.motivoCierre,
          caso.fechaCierre,
          caso.fechaCompra,
          textoEntrega(caso),
        ]
      : [];
    for (let col = 1; col <= HEADERS.length; col++) {
      const cell = sheet.getCell(row, col);
      cell.border = border;
      cell.font = { name: "Calibri", size: 11, color: { argb: INK } };
      cell.alignment = { vertical: "middle", horizontal: col >= 7 && col <= 25 ? "center" : "left" };
      if (zebra && col !== 24 && col !== 25) cell.fill = solid(PAPER);
      if (col === 24 || col === 25) {
        cell.fill = solid("FFF7F8F4");
        cell.font = { name: "Calibri", size: 11, italic: true, color: { argb: NAVY } };
      }
      if ((col >= 7 && col <= 20) || col === 22 || col === 23) cell.dataValidation = listaSiNo;
      if (col === 21) cell.dataValidation = listaTarjeta;
      if (caso && col !== 24 && col !== 25) cell.value = values[col - 1] ?? "";
      if (col === 2 || col === 4) cell.numFmt = "@";
    }
    const avance = sheet.getCell(row, 24);
    const estado = sheet.getCell(row, 25);
    avance.value = caso
      ? { formula: formulaAvance(row), result: caso.avance / 100 }
      : { formula: formulaAvance(row) };
    avance.numFmt = "0%";
    estado.value = caso ? { formula: formulaEstado(row), result: caso.estado } : { formula: formulaEstado(row) };
    sheet.getRow(row).height = 20;
  }

  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: last, column: HEADERS.length } };
  sheet.views = [{ state: "frozen", ySplit: 4, activeCell: "A5" }];
  return last;
}

function escribirTablero(sheet: ExcelJS.Worksheet, limites: Record<string, number>) {
  prepararHoja(sheet, 8);
  sheet.properties.tabColor = { argb: LIME };
  sheet.mergeCells("A1:H1");
  sheet.mergeCells("A2:H2");
  const titulo = sheet.getCell("A1");
  titulo.value = "TABLERO DE COORDINACIÓN";
  estiloTitulo(titulo, 18);
  sheet.getRow(1).height = 28;
  const sub = sheet.getCell("A2");
  sub.value = `Exportado ${hoyBogota()}  ·  Cada proceso cuenta en una sola columna: la del estado de ahora. Dijo sí ya no suma los que pasaron de etapa.`;
  sub.font = { name: "Calibri", size: 11, color: { argb: INK } };
  sub.fill = solid(LIME);
  sub.alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(2).height = 32;
  const headers = ["Asesor", "Procesos", "Dijo sí", "En documentos", "En firma", "Póliza", "Operativa", "Completados"];
  headers.forEach((label, index) => {
    sheet.getCell(4, index + 1).value = label;
  });
  pintarEncabezado(sheet, 4, 1, 8);
  HOJAS.forEach((persona, index) => {
    const row = 5 + index;
    const last = limites[persona.hoja];
    const hoja = persona.hoja;
    const estado = `${hoja}!Y5:Y${last}`;
    sheet.getCell(row, 1).value = persona.nombre;
    sheet.getCell(row, 2).value = { formula: `COUNTA(${hoja}!A5:A${last})` };
    sheet.getCell(row, 3).value = { formula: `COUNTIF(${estado},"Dijo sí")` };
    sheet.getCell(row, 4).value = { formula: `COUNTIF(${estado},"Documentos")` };
    sheet.getCell(row, 5).value = { formula: `COUNTIF(${estado},"En firma")` };
    sheet.getCell(row, 6).value = {
      formula: `COUNTIF(${estado},"En Vía Seguros")+COUNTIF(${estado},"Póliza lista")`,
    };
    sheet.getCell(row, 7).value = {
      formula: `COUNTIF(${estado},"En operativa")+COUNTIF(${estado},"Tarjeta radicada")+COUNTIF(${estado},"Tarjeta expedida")+COUNTIF(${estado},"Entregada")`,
    };
    sheet.getCell(row, 8).value = { formula: `COUNTIF(${estado},"Completado")` };
    for (let col = 1; col <= 8; col++) {
      const cell = sheet.getCell(row, col);
      cell.border = border;
      cell.font = { name: "Calibri", size: 12, bold: col === 1, color: { argb: INK } };
      cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center" };
      if (index % 2 === 1) cell.fill = solid(PAPER);
    }
    sheet.getRow(row).height = 22;
  });
  const totalRow = 5 + HOJAS.length;
  sheet.getCell(totalRow, 1).value = "Total";
  for (let col = 2; col <= 8; col++) {
    const letter = sheet.getColumn(col).letter;
    sheet.getCell(totalRow, col).value = { formula: `SUM(${letter}5:${letter}${totalRow - 1})` };
  }
  for (let col = 1; col <= 8; col++) {
    const cell = sheet.getCell(totalRow, col);
    cell.border = border;
    cell.font = { name: "Calibri", size: 12, bold: true, color: { argb: NAVY } };
    cell.fill = solid(LIME);
    cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center" };
  }
  sheet.getRow(totalRow).height = 24;
  sheet.mergeCells(totalRow + 2, 1, totalRow + 2, 8);
  const nota = sheet.getCell(totalRow + 2, 1);
  nota.value =
    "Para corregir un proceso abre la hoja del asesor. La hoja Todo es la foto de todos al exportar, para filtrar. Abajo de cada asesor hay filas libres: escribe la placa y marca Sí.";
  nota.font = { name: "Calibri", size: 11, color: { argb: SOFT } };
  nota.alignment = { wrapText: true, vertical: "top" };
  sheet.getRow(totalRow + 2).height = 36;
  sheet.views = [{ state: "frozen", ySplit: 4 }];
  for (let col = 1; col <= 8; col++) sheet.getColumn(col).width = col === 1 ? 24 : 22;
}

function escribirTodo(sheet: ExcelJS.Worksheet, casos: Caso[]) {
  const headers = ["Asesor", ...HEADERS];
  prepararHoja(sheet, headers.length);
  sheet.properties.tabColor = { argb: "FF8EAE12" };
  sheet.mergeCells(1, 1, 1, headers.length);
  sheet.mergeCells(2, 1, 2, headers.length);
  const titulo = sheet.getCell(1, 1);
  titulo.value = "TODO EL EQUIPO  ·  FOTO AL EXPORTAR";
  estiloTitulo(titulo);
  sheet.getRow(1).height = 26;
  const sub = sheet.getCell(2, 1);
  sub.value =
    "Sirve para filtrar y revisar. Si vas a corregir y quieres que el tablero se mueva, hazlo en la hoja del asesor, no aquí.";
  sub.font = { name: "Calibri", size: 11, color: { argb: INK } };
  sub.fill = solid(PAPER);
  sub.alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(2).height = 22;
  headers.forEach((label, index) => {
    sheet.getCell(4, index + 1).value = label;
  });
  pintarEncabezado(sheet, 4, 1, headers.length);
  const ordenados = [...casos].sort((a, b) => a.ownerName.localeCompare(b.ownerName, "es") || a.placa.localeCompare(b.placa));
  ordenados.forEach((caso, index) => {
    const row = 5 + index;
    const values = [
      caso.ownerName,
      caso.placa,
      caso.cc,
      caso.nombre,
      caso.telefono,
      caso.empresa,
      caso.fechaInicio,
      ...STEP_KEYS.map((key) => si(caso[key])),
      caso.estadoTarjeta,
      si(caso.tarjetaEntregada),
      si(caso.completado),
      caso.avance / 100,
      caso.estado,
      caso.observacion,
      caso.proxima,
      caso.fechaProxima,
      caso.origen,
      caso.motivoCierre,
      caso.fechaCierre,
      caso.fechaCompra,
      textoEntrega(caso),
    ];
    values.forEach((value, col) => {
      const cell = sheet.getCell(row, col + 1);
      cell.value = value;
      cell.border = border;
      cell.font = { name: "Calibri", size: 11, color: { argb: INK } };
      cell.alignment = { vertical: "middle", horizontal: col >= 7 && col <= 25 ? "center" : "left" };
      if (index % 2 === 1) cell.fill = solid(PAPER);
      if (col === 2 || col === 4) cell.numFmt = "@";
      if (col === 24) cell.numFmt = "0%";
    });
    sheet.getRow(row).height = 20;
  });
  if (ordenados.length === 0) {
    sheet.getCell(5, 1).value = "Todavía no hay procesos.";
    sheet.getCell(5, 1).font = { name: "Calibri", size: 11, italic: true, color: { argb: SOFT } };
  }
  const last = Math.max(5, 4 + ordenados.length);
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: last, column: headers.length } };
  sheet.views = [{ state: "frozen", ySplit: 4, activeCell: "A5" }];
  sheet.getColumn(1).width = 22;
  WIDTHS.forEach((width, index) => {
    sheet.getColumn(index + 2).width = width;
  });
}

function escribirInstrucciones(sheet: ExcelJS.Worksheet) {
  sheet.properties.tabColor = { argb: NAVY };
  sheet.getColumn(1).width = 110;
  sheet.mergeCells("A1:A1");
  const titulo = sheet.getCell("A1");
  titulo.value = "VINCULA LIBRE  ·  CÓMO USAR ESTE ARCHIVO";
  estiloTitulo(titulo, 18);
  sheet.getRow(1).height = 30;
  const lineas = [
    "",
    "Este archivo sale de la app. Cada asesor trabaja en su hoja. Viviana tiene el tablero y puede corregir a cualquiera en la app.",
    "En la hoja del asesor se escribe Sí o No. Hay una lista para no equivocarse. El porcentaje y el estado se calculan solos: no borres esas columnas.",
    "No marques Completado hasta que la tarjeta esté entregada. Si no se concretó, escribe el motivo en Por qué se cerró: eso no es Completado.",
    "La hoja Todo es una foto para filtrar. Si corriges ahí, el tablero no cambia. El tablero lee las hojas David, Alison, Patricia, Laura y Jose.",
    "Abajo de los procesos hay filas libres. Escribe la placa y marca los pasos.",
    "",
    "ORDEN DEL PROCESO",
    "1. El propietario dijo sí.",
    "2. Documentos: cédula, tarjeta de propiedad, tarjeta de operación, SOAT y tecnomecánica.",
    "3. Formulario lleno y documentos subidos.",
    "4. Firma en la carta y en el contrato.",
    "5. Solo se pasa a Vía Seguros con papeles, firma y la plata de la póliza.",
    "6. Se suben las dos pólizas y se pasa a Operativa.",
    "7. Operativa deja la tarjeta en Pendiente, Radicada o Expedida.",
    "8. Se entrega la tarjeta y se marca Completado.",
    "",
    "HOJAS",
    "Instrucciones — esta.",
    "Tablero — procesos, dijo sí, documentos, firma, póliza u operativa y completados.",
    "Todo — todos los procesos juntos, con el nombre del asesor.",
    "David, Alison, Patricia, Laura y Jose — el seguimiento de cada uno.",
  ];
  lineas.forEach((texto, index) => {
    const row = 3 + index;
    const cell = sheet.getCell(row, 1);
    cell.value = texto;
    const tituloSeccion = texto === "ORDEN DEL PROCESO" || texto === "HOJAS";
    cell.font = {
      name: "Calibri",
      size: tituloSeccion ? 13 : 12,
      bold: tituloSeccion,
      color: { argb: tituloSeccion ? NAVY : INK },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
    sheet.getRow(row).height = texto.length > 90 ? 32 : 20;
  });
  sheet.pageSetup.orientation = "portrait";
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 1;
}

export async function armarExcel(casos: Caso[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vincula Libre";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  escribirInstrucciones(wb.addWorksheet("Instrucciones"));
  const tablero = wb.addWorksheet("Tablero");
  const todo = wb.addWorksheet("Todo");
  const limites: Record<string, number> = {};
  for (const persona of HOJAS) {
    const propios = casos.filter((c) => c.ownerName === persona.nombre);
    limites[persona.hoja] = escribirAsesor(wb.addWorksheet(persona.hoja), persona.nombre, propios);
  }
  escribirTodo(todo, casos);
  escribirTablero(tablero, limites);
  const buffer = await wb.xlsx.writeBuffer();
  return {
    filename: `Seguimiento_afiliaciones_${hoyBogota()}.xlsx`,
    base64: Buffer.from(buffer).toString("base64"),
  };
}

function valorCelda(valor: unknown): string | number {
  if (valor == null) return "";
  if (typeof valor === "bigint") return Number(valor);
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "object") return JSON.stringify(valor);
  return valor as string | number;
}

export async function armarRespaldo(hojas: { nombre: string; filas: Record<string, unknown>[] }[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vincula Libre";
  wb.created = new Date();
  for (const hoja of hojas) {
    const sheet = wb.addWorksheet(hoja.nombre.slice(0, 31));
    const columnas = [...new Set(hoja.filas.flatMap((fila) => Object.keys(fila)))];
    sheet.addRow(columnas.length ? columnas : ["sin registros"]);
    pintarEncabezado(sheet, 1, 1, Math.max(columnas.length, 1));
    for (const fila of hoja.filas) {
      sheet.addRow(columnas.map((col) => valorCelda(fila[col])));
    }
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(hoja.filas.length + 1, 1), column: Math.max(columnas.length, 1) } };
    columnas.forEach((_, i) => {
      sheet.getColumn(i + 1).width = 22;
    });
  }
  const buffer = await wb.xlsx.writeBuffer();
  return {
    filename: `Respaldo_Vincula_Libre_${hoyBogota()}.xlsx`,
    base64: Buffer.from(buffer).toString("base64"),
  };
}
