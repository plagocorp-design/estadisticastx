export const APPS_SCRIPT = `var HOJAS = ['Procesos', 'Agenda', 'Metas'];

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function props() {
  return PropertiesService.getScriptProperties();
}

function autorizar() {
  var ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone('America/Bogota');
  props().deleteProperty('secret');
  instalar();
  ss.toast('Listo. Vuelve a la página y pulsa Conectar.');
}

function doGet(e) {
  var p = props();
  if (!e || !e.parameter || e.parameter.secret !== p.getProperty('secret')) return json({ ok: false, error: 'clave' });
  return json({
    ok: true,
    procesos: leer('Procesos'),
    agenda: leer('Agenda'),
    metas: leer('Metas')
  });
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'json' }); }
  var p = props();
  if (body.accion === 'vincular') {
    var actual = p.getProperty('secret');
    if (actual && actual !== String(body.secret || '')) return json({ ok: false, error: 'clave' });
    p.setProperty('secret', String(body.secret || ''));
    p.setProperty('callback', String(body.callback || ''));
    var ss = SpreadsheetApp.getActive();
    ss.setSpreadsheetTimeZone('America/Bogota');
    instalar();
    return json({ ok: true, triggers: ScriptApp.getProjectTriggers().length });
  }
  if (body.secret !== p.getProperty('secret')) return json({ ok: false, error: 'clave' });
  if (body.accion === 'escribir') {
    p.setProperty('escribiendo', '1');
    try {
      escribirHoja('Procesos', body.procesos || []);
      escribirHoja('Agenda', body.agenda || []);
      escribirHoja('Metas', body.metas || []);
      escribirHoja('Equipo', body.equipo || []);
      if (body.calendario) escribirHoja('Calendario', body.calendario);
      armarResumen();
      validarAsesores();
    } finally {
      p.setProperty('escribiendo', '0');
    }
    return json({ ok: true });
  }
  if (body.accion === 'archivo') {
    var nombre = String(body.nombre || 'archivo').replace(/[\\\\/]/g, '-').slice(0, 180);
    var placa = String(body.placa || 'SIN-PLACA').replace(/[^A-Za-z0-9]/g, '').slice(0, 10) || 'SIN-PLACA';
    var bytes = Utilities.base64Decode(String(body.archivo || ''));
    var folder = carpetaDePlaca(placa);
    var file = folder.createFile(Utilities.newBlob(bytes, body.mime || 'application/octet-stream', nombre));
    return json({ ok: true, id: file.getId(), url: file.getUrl() });
  }
  if (body.accion === 'bajar') {
    var guardado = DriveApp.getFileById(String(body.id || ''));
    return json({
      ok: true,
      nombre: guardado.getName(),
      archivo: Utilities.base64Encode(guardado.getBlob().getBytes())
    });
  }
  if (body.accion === 'borrar') {
    DriveApp.getFileById(String(body.id || '')).setTrashed(true);
    return json({ ok: true });
  }
  return json({ ok: false, error: 'accion' });
}

function carpetaVincula() {
  var p = props();
  var id = p.getProperty('carpeta');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) {}
  }
  var halladas = DriveApp.getFoldersByName('Vincula Libre');
  var folder = halladas.hasNext() ? halladas.next() : DriveApp.createFolder('Vincula Libre');
  p.setProperty('carpeta', folder.getId());
  return folder;
}

function carpetaDePlaca(placa) {
  var raiz = carpetaVincula();
  var halladas = raiz.getFoldersByName(placa);
  if (halladas.hasNext()) return halladas.next();
  return raiz.createFolder(placa);
}

function escribirHoja(nombre, filas) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  sh.clearContents();
  if (!filas.length || !filas[0].length) return;
  sh.getRange(1, 1, filas.length, filas[0].length).setValues(filas);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, filas[0].length).setFontWeight('bold');
  var headers = filas[0].map(function(h) { return String(h || ''); });
  var borrar = headers.indexOf('Borrar');
  if (borrar >= 0) sh.getRange(1, borrar + 1).setNote('Escribe Sí para borrar esta fila también en la página. No borres la columna id.');
  var cierre = headers.indexOf('Por qué se cerró');
  if (cierre >= 0) sh.getRange(1, cierre + 1).setNote('Texto libre si no se concretó. Vacío = sigue abierto. No es lo mismo que Completado.');
}

function leer(nombre) {
  var sh = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!sh || sh.getLastRow() < 1) return [];
  return sh.getDataRange().getValues().map(function(row) {
    return row.map(celda);
  });
}

function celda(v) {
  if (v instanceof Date) {
    var horas = Utilities.formatDate(v, 'America/Bogota', 'HH:mm:ss');
    if (horas === '00:00:00') return Utilities.formatDate(v, 'America/Bogota', 'yyyy-MM-dd');
    return Utilities.formatDate(v, 'GMT', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  }
  if (v === true) return 'Sí';
  if (v === false) return 'No';
  return v == null ? '' : String(v);
}

function instalar() {
  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'alEditar') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('alEditar').forSpreadsheet(ss).onEdit().create();
}

function alEditar(e) {
  if (!e || !e.range) return;
  var p = props();
  if (p.getProperty('escribiendo') === '1') return;
  var sh = e.range.getSheet();
  var nombre = sh.getName();
  if (HOJAS.indexOf(nombre) === -1) return;
  var start = e.range.getRow();
  var count = e.range.getNumRows();
  if (start < 2) {
    count = count - (2 - start);
    start = 2;
  }
  if (count < 1) return;
  if (count > 40) count = 40;
  var callback = p.getProperty('callback');
  var secret = p.getProperty('secret');
  if (!callback || !secret) return;
  var ultima = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(1, 1, 1, ultima).getValues()[0].map(function(h) { return String(h || ''); });
  var col = headers.indexOf('Actualizado') + 1;
  var ahora = Utilities.formatDate(new Date(), 'GMT', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  if (col > 0) {
    p.setProperty('escribiendo', '1');
    var stamp = [];
    for (var i = 0; i < count; i++) stamp.push([ahora]);
    sh.getRange(start, col, count, 1).setValues(stamp);
    p.setProperty('escribiendo', '0');
  }
  var filas = [];
  for (var r = 0; r < count; r++) {
    var values = sh.getRange(start + r, 1, 1, headers.length).getValues()[0];
    var fila = {};
    var vacia = false;
    headers.forEach(function(h, idx) {
      if (!h) return;
      fila[h] = celda(values[idx]);
    });
    if (col > 0) fila['Actualizado'] = ahora;
    var placa = String(fila['Placa'] || fila['Título'] || fila['Meta del mes'] || '').trim();
    var quien = String(fila['Asesor'] || '').trim();
    if (placa || quien || String(fila['Borrar'] || '').trim()) filas.push(fila);
    else vacia = true;
    if (vacia) continue;
  }
  if (!filas.length) return;
  UrlFetchApp.fetch(callback, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({ secret: secret, accion: 'filas', hoja: nombre, filas: filas })
  });
}

function validarAsesores() {
  var ss = SpreadsheetApp.getActive();
  var eq = ss.getSheetByName('Equipo');
  if (!eq || eq.getLastRow() < 2) return;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(eq.getRange(2, 1, eq.getLastRow() - 1, 1), true)
    .setAllowInvalid(true)
    .build();
  HOJAS.forEach(function(nombre) {
    var sh = ss.getSheetByName(nombre);
    if (!sh || sh.getLastRow() < 2) return;
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var col = headers.indexOf('Asesor') + 1;
    if (col < 1) return;
    sh.getRange(2, col, sh.getLastRow() - 1, 1).setDataValidation(rule);
  });
}

function armarResumen() {
  var ss = SpreadsheetApp.getActive();
  var p = ss.getSheetByName('Procesos');
  var sh = ss.getSheetByName('Resumen') || ss.insertSheet('Resumen', 0);
  sh.clearContents();
  var headers = ['Asesor', 'Procesos', 'Dijo sí', 'En documentos', 'En firma', 'Póliza', 'Operativa', 'Completados'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (!p || p.getLastRow() < 2) return;
  var head = p.getRange(1, 1, 1, p.getLastColumn()).getValues()[0].map(String);
  var iAsesor = head.indexOf('Asesor');
  var iEstado = head.indexOf('Estado');
  if (iAsesor < 0 || iEstado < 0) return;
  var data = p.getRange(2, iAsesor + 1, p.getLastRow() - 1, 1).getValues();
  var vistos = {};
  var nombres = [];
  data.forEach(function(row) {
    var n = String(row[0] || '').trim();
    if (n && !vistos[n]) { vistos[n] = true; nombres.push(n); }
  });
  nombres.sort();
  var ultima = p.getLastRow();
  var colA = letra(iAsesor + 1);
  var colE = letra(iEstado + 1);
  var formulas = [];
  var nombresCol = [];
  nombres.forEach(function(n, i) {
    var r = i + 2;
    var rangoA = 'Procesos!' + colA + '2:' + colA + ultima;
    var rangoE = 'Procesos!' + colE + '2:' + colE + ultima;
    formulas.push([
      '=COUNTIF(' + rangoA + ',A' + r + ')',
      '=COUNTIFS(' + rangoA + ',A' + r + ',' + rangoE + ',"Dijo sí")',
      '=COUNTIFS(' + rangoA + ',A' + r + ',' + rangoE + ',"Documentos")',
      '=COUNTIFS(' + rangoA + ',A' + r + ',' + rangoE + ',"En firma")',
      '=COUNTIFS(' + rangoA + ',A' + r + ',' + rangoE + ',"En Vía Seguros")+COUNTIFS(' + rangoA + ',A' + r + ',' + rangoE + ',"Póliza lista")',
      '=COUNTIFS(' + rangoA + ',A' + r + ',' + rangoE + ',"En operativa")+COUNTIFS(' + rangoA + ',A' + r + ',' + rangoE + ',"Tarjeta radicada")+COUNTIFS(' + rangoA + ',A' + r + ',' + rangoE + ',"Tarjeta expedida")+COUNTIFS(' + rangoA + ',A' + r + ',' + rangoE + ',"Entregada")',
      '=COUNTIFS(' + rangoA + ',A' + r + ',' + rangoE + ',"Completado")'
    ]);
    nombresCol.push([n]);
  });
  if (nombres.length) {
    sh.getRange(2, 1, nombres.length, 1).setValues(nombresCol);
    sh.getRange(2, 2, nombres.length, 7).setFormulas(formulas);
    var total = nombres.length + 2;
    var suma = [];
    for (var c = 2; c <= 8; c++) suma.push('=SUM(' + letra(c) + '2:' + letra(c) + (total - 1) + ')');
    sh.getRange(total, 1).setValue('Total');
    sh.getRange(total, 2, 1, 7).setFormulas([suma]);
    sh.getRange(total, 1, 1, 8).setFontWeight('bold');
  }
  sh.setColumnWidth(1, 180);
}

function letra(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
`;
