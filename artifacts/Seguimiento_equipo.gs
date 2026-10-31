var CLAVES = {
  David: 'David2026',
  Alison: 'Alison2026',
  Patricia: 'Patricia2026',
  Laura: 'Laura2026',
  Jose: 'Jose2026',
  Viviana: 'Viviana2026'
};
var HOJAS = ['David', 'Alison', 'Patricia', 'Laura', 'Jose'];
var HEADERS = [
  'Placa', 'CC propietario', 'Nombre del propietario', 'Número de contacto',
  'Empresa actual', 'Fecha inicio', 'Dijo sí', 'Cédula', 'Tarjeta propiedad',
  'Tarjeta operación', 'SOAT', 'Tecnomecánica', 'Formulario', 'Documentos subidos',
  'Firma carta', 'Firma contrato', 'Tiene plata póliza', 'Pasado a Vía Seguros',
  'Pólizas subidas', 'Pasado a Operativa', 'Estado tarjeta', 'Tarjeta entregada',
  'Completado', '% avance', 'Estado del proceso', 'Observación', 'Próxima gestión',
  'Fecha próxima'
];

function onOpen() {
  ocultarTodo();
  SpreadsheetApp.getUi()
    .createMenu('Seguimiento')
    .addItem('Entrar', 'entrar')
    .addItem('Nuevo seguimiento', 'nuevoSeguimiento')
    .addItem('Actualizar fila', 'actualizarFila')
    .addItem('Salir y ocultar', 'ocultarTodo')
    .addToUi();
  entrar();
}

function ocultarTodo() {
  var ss = SpreadsheetApp.getActive();
  HOJAS.concat(['Viviana']).forEach(function(nombre) {
    var hoja = ss.getSheetByName(nombre);
    if (hoja) hoja.hideSheet();
  });
  var inicio = ss.getSheetByName('Instrucciones');
  if (inicio) inicio.showSheet();
}

function entrar() {
  var html = HtmlService.createHtmlOutput(
    '<form id="f" style="font:14px Arial;margin:16px">' +
    '<label>Asesor</label><br>' +
    '<select name="asesor" style="width:100%;padding:8px;margin:6px 0">' +
    HOJAS.concat(['Viviana']).map(function(n){return '<option>'+n+'</option>';}).join('') +
    '</select><br><label>Clave</label><br>' +
    '<input name="clave" type="password" style="width:100%;padding:8px;margin:6px 0" required><br>' +
    '<button style="background:#1B3A4B;color:#fff;border:0;padding:10px 16px">Entrar</button></form>' +
    '<script>document.getElementById("f").onsubmit=function(e){e.preventDefault();' +
    'google.script.run.withSuccessHandler(function(ok){if(ok)google.script.host.close();' +
    'else alert("Clave incorrecta");}).validar(Object.fromEntries(new FormData(this)));};</script>'
  ).setWidth(320).setHeight(220);
  SpreadsheetApp.getUi().showModalDialog(html, 'Acceso al seguimiento');
}

function validar(d) {
  if (CLAVES[d.asesor] !== d.clave) return false;
  var ss = SpreadsheetApp.getActive();
  if (d.asesor === 'Viviana') {
    HOJAS.concat(['Viviana']).forEach(function(nombre) {
      var hoja = ss.getSheetByName(nombre);
      if (hoja) hoja.showSheet();
    });
    ss.setActiveSheet(ss.getSheetByName('Viviana'));
  } else {
    HOJAS.concat(['Viviana']).forEach(function(nombre) {
      var hoja = ss.getSheetByName(nombre);
      if (hoja && nombre !== d.asesor) hoja.hideSheet();
    });
    ss.getSheetByName(d.asesor).showSheet();
    ss.setActiveSheet(ss.getSheetByName(d.asesor));
  }
  PropertiesService.getUserProperties().setProperty('asesor', d.asesor);
  return true;
}

function nuevoSeguimiento() {
  var asesor = PropertiesService.getUserProperties().getProperty('asesor');
  if (!asesor || asesor === 'Viviana') {
    SpreadsheetApp.getUi().alert('Entra primero con tu clave de asesor.');
    return;
  }
  var html = HtmlService.createHtmlOutput(
    '<form id="f" style="font:14px Arial;margin:14px">' +
    '<label>Placa</label><input name="placa" required style="width:100%;padding:8px;margin:4px 0 10px">' +
    '<label>CC propietario</label><input name="cc" required style="width:100%;padding:8px;margin:4px 0 10px">' +
    '<label>Nombre del propietario</label><input name="nombre" required style="width:100%;padding:8px;margin:4px 0 10px">' +
    '<label>Número de contacto</label><input name="tel" required style="width:100%;padding:8px;margin:4px 0 10px">' +
    '<label>Empresa actual</label><input name="empresa" style="width:100%;padding:8px;margin:4px 0 10px">' +
    '<button style="background:#1B3A4B;color:#fff;border:0;padding:10px 16px">Abrir seguimiento</button></form>' +
    '<script>document.getElementById("f").onsubmit=function(e){e.preventDefault();' +
    'google.script.run.withSuccessHandler(function(){google.script.host.close();})' +
    '.crearSeguimiento(Object.fromEntries(new FormData(this)));};</script>'
  ).setWidth(380).setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, 'Nuevo seguimiento');
}

function crearSeguimiento(d) {
  var asesor = PropertiesService.getUserProperties().getProperty('asesor');
  var hoja = SpreadsheetApp.getActive().getSheetByName(asesor);
  var fila = Math.max(hoja.getLastRow() + 1, 5);
  hoja.getRange(fila, 1, 1, 7).setValues([[
    String(d.placa || '').toUpperCase(),
    String(d.cc || '').replace(/\D/g, ''),
    String(d.nombre || '').toUpperCase(),
    String(d.tel || '').replace(/\D/g, ''),
    d.empresa || '',
    new Date(),
    true
  ]]);
  hoja.getRange(fila, 6).setNumberFormat('dd/MM/yyyy');
  hoja.setActiveRange(hoja.getRange(fila, 1));
}

function actualizarFila() {
  var hoja = SpreadsheetApp.getActiveSheet();
  if (HOJAS.indexOf(hoja.getName()) === -1) {
    SpreadsheetApp.getUi().alert('Párate en tu hoja, en la fila del proceso.');
    return;
  }
  var fila = hoja.getActiveCell().getRow();
  var v = hoja.getRange(fila, 1, 1, 28).getValues()[0];
  var pasos = HEADERS.slice(6, 20).concat(HEADERS.slice(21, 23));
  var checks = '';
  [6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,22].forEach(function(i, n) {
    checks += '<label><input type="checkbox" name="p'+i+'" '+(v[i]===true?'checked':'')+'> '+HEADERS[i]+'</label><br>';
  });
  var html = HtmlService.createHtmlOutput(
    '<form id="f" style="font:13px Arial;margin:12px">' + checks +
    '<label>Estado tarjeta</label><select name="tarjeta" style="width:100%;padding:6px">' +
    ['','Pendiente','Radicada','Expedida'].map(function(x){
      return '<option'+(v[20]===x?' selected':'')+'>'+x+'</option>';
    }).join('') + '</select>' +
    '<label>Observación</label><textarea name="obs" style="width:100%">'+ (v[25]||'') +'</textarea>' +
    '<label>Próxima gestión</label><input name="proxima" value="'+ (v[26]||'') +'" style="width:100%;padding:6px">' +
    '<button style="background:#1B3A4B;color:#fff;border:0;padding:10px 16px;margin-top:8px">Guardar</button></form>' +
    '<script>document.getElementById("f").onsubmit=function(e){e.preventDefault();' +
    'var data=Object.fromEntries(new FormData(this)); data.fila='+fila+';' +
    'google.script.run.withSuccessHandler(function(){google.script.host.close();}).guardarPasos(data);};</script>'
  ).setWidth(420).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'Fila ' + fila);
}

function guardarPasos(d) {
  var hoja = SpreadsheetApp.getActiveSheet();
  var fila = Number(d.fila);
  [6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,22].forEach(function(i) {
    hoja.getRange(fila, i + 1).setValue(d['p'+i] === 'on');
  });
  hoja.getRange(fila, 21).setValue(d.tarjeta || '');
  hoja.getRange(fila, 26).setValue(d.obs || '');
  hoja.getRange(fila, 27).setValue(d.proxima || '');
}

function crearEstructura() {
  var ss = SpreadsheetApp.getActive();
  var inst = ss.getSheetByName('Instrucciones') || ss.insertSheet('Instrucciones');
  inst.clear();
  inst.getRange('A1').setValue('SEGUIMIENTO DE AFILIACIONES').setFontWeight('bold').setFontSize(16);
  inst.getRange('A3').setValue('1. Viviana corre crearEstructura una sola vez.');
  inst.getRange('A4').setValue('2. Cada asesor entra con su clave. Solo ve su hoja.');
  inst.getRange('A5').setValue('3. Seguimiento > Nuevo seguimiento abre el proceso.');
  inst.getRange('A6').setValue('4. Completado solo cuando la tarjeta está entregada.');
  HOJAS.forEach(function(nombre) {
    var hoja = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
    hoja.clear();
    hoja.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
      .setFontWeight('bold').setBackground('#1B3A4B').setFontColor('#FFFFFF');
    hoja.setFrozenRows(1);
    hoja.getRange('G2:T200').insertCheckboxes();
    hoja.getRange('V2:W200').insertCheckboxes();
    var regla = SpreadsheetApp.newDataValidation().requireValueInList(['Pendiente','Radicada','Expedida'], true).build();
    hoja.getRange('U2:U200').setDataValidation(regla);
    hoja.getRange('F2:F200').setNumberFormat('dd/MM/yyyy');
    hoja.getRange('AB2:AB200').setNumberFormat('dd/MM/yyyy');
    hoja.getRange('X2').setFormula('=IF(A2="","",COUNTIF(G2:T2,TRUE)+COUNTIF(V2,TRUE)+COUNTIF(W2,TRUE))/16');
    hoja.getRange('Y2').setFormula('=IF(A2="","",IF(W2=TRUE,"Completado",IF(V2=TRUE,"Entregada",IF(U2="Expedida","Tarjeta expedida",IF(U2="Radicada","Tarjeta radicada",IF(T2=TRUE,"En operativa",IF(S2=TRUE,"Póliza lista",IF(R2=TRUE,"En Vía Seguros",IF(OR(O2=TRUE,P2=TRUE),"En firma",IF(N2=TRUE,"Documentos",IF(G2=TRUE,"Dijo sí","Nuevo")))))))))))');
    hoja.getRange('X2:Y2').copyTo(hoja.getRange('X3:Y200'));
    hoja.setColumnWidths(1, 28, 120);
    hoja.autoResizeColumns(1, 6);
  });
  var viv = ss.getSheetByName('Viviana') || ss.insertSheet('Viviana');
  viv.clear();
  viv.getRange('A1').setValue('TABLERO').setFontWeight('bold').setFontSize(16);
  viv.getRange('A3:G3').setValues([['Asesor','Procesos','Dijo sí','En documentos','En firma','En póliza u operativa','Completados']])
    .setFontWeight('bold').setBackground('#1B3A4B').setFontColor('#FFFFFF');
  HOJAS.forEach(function(nombre, i) {
    var r = 4 + i;
    viv.getRange(r, 1).setValue(nombre);
    viv.getRange(r, 2).setFormula("=COUNTA('"+nombre+"'!A2:A200)");
    viv.getRange(r, 3).setFormula("=COUNTIF('"+nombre+"'!G2:G200,TRUE)");
    viv.getRange(r, 4).setFormula("=COUNTIF('"+nombre+"'!Y2:Y200,\"Documentos\")");
    viv.getRange(r, 5).setFormula("=COUNTIF('"+nombre+"'!Y2:Y200,\"En firma\")");
    viv.getRange(r, 6).setFormula("=COUNTIF('"+nombre+"'!Y2:Y200,\"En Vía Seguros\")+COUNTIF('"+nombre+"'!Y2:Y200,\"Póliza lista\")+COUNTIF('"+nombre+"'!Y2:Y200,\"En operativa\")+COUNTIF('"+nombre+"'!Y2:Y200,\"Tarjeta radicada\")+COUNTIF('"+nombre+"'!Y2:Y200,\"Tarjeta expedida\")");
    viv.getRange(r, 7).setFormula("=COUNTIF('"+nombre+"'!Y2:Y200,\"Completado\")");
  });
  ocultarTodo();
  SpreadsheetApp.getUi().alert('Listo. Comparte el archivo. Cada asesor entra por el menú Seguimiento.');
}
