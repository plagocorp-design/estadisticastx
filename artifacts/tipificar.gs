function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Tipificar')
    .addItem('Tipificar llamada', 'llenarLlamada')
    .addToUi();
  try { mostrarBarra(); } catch (e) {}
}

function mostrarBarra() {
  const html = HtmlService.createHtmlOutput(
    '<style>' +
      'body{font-family:Segoe UI,Arial,sans-serif;margin:0;padding:16px;color:#1f2937}' +
      'button{width:100%;background:#1B3A4B;color:#fff;border:none;border-radius:10px;padding:14px 12px;font-size:15px;font-weight:700;cursor:pointer}' +
      'p{font-size:12px;color:#6b7280;line-height:1.4}' +
    '</style>' +
    '<button onclick="google.script.run.llenarLlamada()">Tipificar esta fila</button>' +
    '<p>No se cierra. Guardas y pasas a la siguiente. Arriba quedan los dos teléfonos.</p>' +
    '<p>Atajo, después de importar la macro una vez: Ctrl + Alt + Mayús + 1.</p>'
  ).setTitle('Tipificar');
  SpreadsheetApp.getUi().showSidebar(html);
}

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function columnas() {
  const hoja = SpreadsheetApp.getActiveSheet();
  const ultima = hoja.getLastColumn();
  const headers = hoja.getRange(1, 1, 1, ultima).getValues()[0];
  const mapa = {};
  headers.forEach(function(h, i) { mapa[normalizar(h)] = i + 1; });

  function col(nombres, fallback) {
    for (var i = 0; i < nombres.length; i++) {
      var n = normalizar(nombres[i]);
      if (mapa[n]) return mapa[n];
    }
    return fallback;
  }

  return {
    me: col(['ME'], 0),
    nombre: col(['Nombre completo'], 2),
    estado: col(['Estado'], 3),
    telBase: col(['Número de teléfono', 'Numero de telefono'], 4),
    prop: col(['PROPIETARIO SAO'], 5),
    telProp: col(['TELEFONO'], 6),
    vehiculo: col(['Vehículo', 'Vehiculo'], 7),
    placa: col(['Placa'], 8),
    empresa: col(['EMPRESA'], 10),
    fecha: col(['FECHA'], 11),
    agente: col(['AGENTE'], 12),
    clasificacion: col(['CLASIFICACION'], 13),
    calificacion: col(['CALIFICACION'], 14),
    sao: col(['OBSERVACION SAO'], 15),
    conductor: col(['OBSERVACION CONDUCTOR'], 16),
    propietario: col(['OBSERVACION PROPIETARIO'], 17),
    intencion: col(['INTENCIÓN DE AFILIACION', 'INTENCION DE AFILIACION'], 18),
    proxima: col(['PRÓXIMA GESTION', 'PROXIMA GESTION'], 19),
    fechaProxima: col(['FECHA PRÓXIMA GESTION', 'FECHA PROXIMA GESTION'], 20),
    resultado: col(['RESULTADO FINAL'], 21),
    fechaAfiliacion: col(['FECHA DE AFILIACION'], 22),
    motivo: col(['MOTIVO DE NO AFILIACION', 'MOTVO DE NO AFILIACION'], 23),
    observacionFinal: col(['OBSERVACION FINAL'], 24)
  };
}

function opciones(col) {
  if (!col) return [];
  const hoja = SpreadsheetApp.getActiveSheet();
  const regla = hoja.getRange(2, col).getDataValidation();
  if (!regla) return [];
  const valores = regla.getCriteriaValues()[0];
  if (!valores) return [];
  if (Array.isArray(valores)) return valores.map(String);
  return valores.getValues().flat().filter(String);
}

function telefonoBase(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (digitos.length === 12 && digitos.slice(0, 2) === '57') return digitos.slice(2);
  return digitos;
}

function limpiarColumnaBase() {
  const hoja = SpreadsheetApp.getActiveSheet();
  const c = columnas();
  const ultima = hoja.getLastRow();
  if (ultima < 2) return;
  const rango = hoja.getRange(2, c.telBase, ultima - 1, 1);
  const valores = rango.getValues();
  let cambios = 0;
  for (let i = 0; i < valores.length; i++) {
    const limpio = telefonoBase(valores[i][0]);
    if (limpio && limpio !== String(valores[i][0] || '').trim()) {
      valores[i][0] = limpio;
      cambios++;
    }
  }
  if (cambios) rango.setValues(valores);
  SpreadsheetApp.getActive().toast('Listos ' + cambios + ' teléfonos. Ya no llevan 57.');
}

function fechaInput(valor) {
  if (!valor || String(valor).toLowerCase() === 'no aplica') return '';
  const f = new Date(valor);
  if (isNaN(f.getTime())) return '';
  return Utilities.formatDate(f, 'America/Bogota', 'yyyy-MM-dd');
}

function tipoDesdeSao(sao) {
  const s = String(sao || '');
  if (/^El propietario del vehículo es/i.test(s)) return 'propietario';
  if (/No se pudo confirmar/i.test(s)) return 'desconocido';
  if (/no es el propietario/i.test(s)) return 'conductor';
  return '';
}

function mesDe(fecha) {
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const f = fecha instanceof Date && !isNaN(fecha.getTime()) ? fecha : new Date();
  return meses[Number(Utilities.formatDate(f, 'America/Bogota', 'M')) - 1];
}

function nombreAgente(hoja, c) {
  const actual = hoja.getRange(2, c.agente).getValue();
  if (actual) return String(actual);
  const ultima = Math.min(hoja.getLastRow(), 50);
  const vals = hoja.getRange(2, c.agente, ultima - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (vals[i][0]) return String(vals[i][0]);
  return '';
}

function leerFila(filaForzada) {
  const hoja = SpreadsheetApp.getActiveSheet();
  const c = columnas();
  const fila = Number(filaForzada) || hoja.getActiveCell().getRow();
  if (fila < 2) throw new Error('Párate en la fila del cliente');
  const ultimaCol = hoja.getLastColumn();
  const v = hoja.getRange(fila, 1, 1, ultimaCol).getValues()[0];

  function val(col) { return col ? v[col - 1] : ''; }

  const nombreLista = String(val(c.nombre) || '').trim();
  const telCrudo = String(val(c.telBase) || '');
  const telLista = telefonoBase(telCrudo);
  if (telLista && telLista !== telCrudo.trim()) hoja.getRange(fila, c.telBase).setValue(telLista);
  const obsSao = String(val(c.sao) || '');
  const cc = (obsSao.match(/CC\s*(\d+)/i) || ['', ''])[1];
  const nuevoTel = (obsSao.match(/nuevo propietario:\s*(\d+)/i) || obsSao.match(/Número del nuevo propietario:\s*(\d+)/i) || ['', ''])[1];
  const nuevoNombre = (obsSao.match(/contacto del nuevo propietario:\s*([^.]+)/i) || ['', ''])[1].trim();
  const conductor = String(val(c.conductor) || '');

  return {
    fila: fila,
    ultima: hoja.getLastRow(),
    nombreLista: nombreLista,
    telLista: telLista,
    placa: String(val(c.placa) || '').trim().toUpperCase(),
    nombreProp: String(val(c.prop) || '').trim(),
    telProp: String(val(c.telProp) || '').replace(/\D/g, ''),
    cc: cc,
    tipoPersona: tipoDesdeSao(obsSao),
    tieneNuevo: /ya no es el propietario/i.test(obsSao),
    nuevoNombre: nuevoNombre,
    nuevoTel: nuevoTel,
    soloPropietario: /No se hizo contacto con el conductor/i.test(conductor),
    clasificacion: val(c.clasificacion) || '',
    calificacion: val(c.calificacion) || '',
    conductor: conductor,
    propietario: val(c.propietario) || '',
    intencion: val(c.intencion) || '',
    proxima: val(c.proxima) || '',
    fechaProxima: fechaInput(val(c.fechaProxima)),
    noAplicaProxima: String(val(c.fechaProxima) || '').toLowerCase() === 'no aplica',
    resultado: val(c.resultado) || '',
    fechaAfiliacion: fechaInput(val(c.fechaAfiliacion)),
    noAplicaAfiliacion: String(val(c.fechaAfiliacion) || '').toLowerCase() === 'no aplica',
    motivo: val(c.motivo) || '',
    observacionFinal: val(c.observacionFinal) || '',
    clasificaciones: opciones(c.clasificacion),
    calificaciones: opciones(c.calificacion),
    intenciones: opciones(c.intencion),
    proximas: opciones(c.proxima),
    resultados: opciones(c.resultado),
    motivos: opciones(c.motivo),
    aviso: ''
  };
}

function filaActual() { return leerFila(); }

function guardarLlamada(d) {
  const hoja = SpreadsheetApp.getActiveSheet();
  const c = columnas();
  const fila = Number(d.fila) || hoja.getActiveCell().getRow();
  if (fila < 2) throw new Error('Párate en la fila del cliente');

  const nombre = String(d.nombre || '').trim().toUpperCase();
  const cc = String(d.cc || '').replace(/\D/g, '');
  const tel = String(d.tel || '').replace(/\D/g, '');
  const tipo = d.tipoPersona || 'conductor';

  const nuevoNombre = String(d.nuevoNombre || '').trim().toUpperCase();
  const nuevoTel = String(d.nuevoTel || '').replace(/\D/g, '');
  const tieneNuevo = d.tieneNuevoPropietario === 'on';

  let sao = '';
  if (tieneNuevo && nuevoTel) {
    sao = 'El propietario registrado (' + nombre;
    if (cc) sao += ' CC ' + cc;
    sao += ') ya no es el propietario del vehículo. ';
    if (nuevoNombre) sao += 'Me dieron el contacto del nuevo propietario: ' + nuevoNombre + '. ';
    sao += 'Número del nuevo propietario: ' + nuevoTel + '.';
  } else if (tipo === 'propietario') {
    sao = 'El propietario del vehículo es ' + nombre;
    if (cc) sao += ' CC ' + cc;
    sao += '. Su número de teléfono es ' + tel + '.';
  } else if (tipo === 'conductor') {
    sao = 'El señor no es el propietario del vehículo. El propietario es ' + nombre;
    if (cc) sao += ' CC ' + cc;
    sao += '. Su número de teléfono es ' + tel + '.';
  } else {
    sao = 'No se pudo confirmar el propietario. Contacto: ' + nombre;
    if (cc) sao += ' CC ' + cc;
    if (tel) sao += '. Teléfono: ' + tel;
  }

  const agente = hoja.getRange(fila, c.agente).getValue();
  if (!agente) {
    const nombreAg = nombreAgente(hoja, c);
    if (nombreAg) hoja.getRange(fila, c.agente).setValue(nombreAg);
  }

  const fecha = hoja.getRange(fila, c.fecha).getValue();
  if (!fecha) hoja.getRange(fila, c.fecha).setValue(new Date()).setNumberFormat('dd/MM/yyyy');

  if (c.me) {
    const mesActual = hoja.getRange(fila, c.me).getValue();
    if (!mesActual) hoja.getRange(fila, c.me).setValue(mesDe(fecha || new Date()));
  }

  hoja.getRange(fila, c.prop).setValue(nombre);
  hoja.getRange(fila, c.telProp).setValue(tel);
  hoja.getRange(fila, c.clasificacion).setValue(d.clasificacion || '');
  hoja.getRange(fila, c.calificacion).setValue(d.calificacion || '');
  hoja.getRange(fila, c.sao).setValue(sao);
  hoja.getRange(fila, c.conductor).setValue(String(d.conductor || '').trim());
  hoja.getRange(fila, c.propietario).setValue(String(d.propietario || '').trim());
  hoja.getRange(fila, c.intencion).setValue(d.intencion || '');
  hoja.getRange(fila, c.proxima).setValue(d.proxima || '');

  if (d.noAplicaProxima === 'on') {
    hoja.getRange(fila, c.fechaProxima).setValue('No aplica');
  } else if (d.fechaProxima) {
    hoja.getRange(fila, c.fechaProxima).setValue(new Date(d.fechaProxima + 'T12:00:00')).setNumberFormat('dd/MM/yyyy');
  } else {
    hoja.getRange(fila, c.fechaProxima).clearContent();
  }

  hoja.getRange(fila, c.resultado).setValue(d.resultado || '');

  const intencion = String(d.intencion || '').toLowerCase();
  const resultado = String(d.resultado || '').toLowerCase();
  const esNoLocalizado = intencion.includes('no se pudo localizar') && resultado.includes('no localizado');

  if (d.noAplicaAfiliacion === 'on' || esNoLocalizado) {
    hoja.getRange(fila, c.fechaAfiliacion).setValue('No aplica');
  } else if (d.fechaAfiliacion) {
    hoja.getRange(fila, c.fechaAfiliacion).setValue(new Date(d.fechaAfiliacion + 'T12:00:00')).setNumberFormat('dd/MM/yyyy');
  } else {
    hoja.getRange(fila, c.fechaAfiliacion).clearContent();
  }

  hoja.getRange(fila, c.motivo).setValue(d.motivo || '');
  hoja.getRange(fila, c.observacionFinal).setValue(String(d.observacionFinal || '').trim());
  return fila;
}

function irA(fila) {
  const hoja = SpreadsheetApp.getActiveSheet();
  const destino = Number(fila);
  if (destino < 2) throw new Error('No hay fila anterior');
  if (destino > hoja.getLastRow()) throw new Error('No hay más filas');
  hoja.setActiveRange(hoja.getRange(destino, 2));
  return leerFila(destino);
}

function guardarYSeguir(d) {
  const fila = guardarLlamada(d);
  const hoja = SpreadsheetApp.getActiveSheet();
  let destino = fila + (Number(d.delta) || 1);
  if (destino < 2) destino = 2;
  const ultima = Math.max(hoja.getLastRow(), destino);
  if (destino > ultima) {
    const actual = leerFila(fila);
    actual.aviso = 'No hay más filas';
    return actual;
  }
  hoja.setActiveRange(hoja.getRange(destino, 2));
  const datos = leerFila(destino);
  datos.aviso = 'Guardado. Fila ' + destino;
  return datos;
}

function llenarLlamada() {
  const html = HtmlService.createHtmlOutput(`
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13.5px; margin: 0; padding: 0 0 18px; background: #f8f9fb; color: #1f2937; }
      .fijo { position: sticky; top: 0; z-index: 2; background: #f8f9fb; padding: 12px 16px 8px; border-bottom: 1px solid #e5e7eb; }
      .nav { display: flex; gap: 8px; align-items: center; }
      .nav button { flex: 1; background: #fff; color: #1B3A4B; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px; font-weight: 700; cursor: pointer; }
      .nav strong { min-width: 92px; text-align: center; color: #1B3A4B; }
      #estado { min-height: 18px; font-size: 12px; color: #1B3A4B; margin: 6px 0 0; }
      .llamadas { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
      .card { background: #1B3A4B; color: #fff; border-radius: 10px; padding: 10px; }
      .card span { display: block; font-size: 11px; opacity: .8; }
      .card b { display: block; font-size: 13px; margin: 2px 0 4px; }
      .card a { color: #fff; font-size: 18px; font-weight: 700; text-decoration: none; }
      .card button { margin-top: 6px; margin-left: 6px; background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.4); border-radius: 12px; padding: 2px 8px; cursor: pointer; }
      .una { grid-template-columns: 1fr; }
      .cuerpo { padding: 0 16px; }
      h2 { margin: 14px 0 8px; font-size: 18px; color: #1B3A4B; }
      label { font-weight: 600; display: block; margin-top: 10px; margin-bottom: 3px; color: #374151; font-size: 13px; }
      input[type="text"], input[type="date"], textarea, select { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; font-size: 13.5px; }
      textarea { resize: vertical; min-height: 52px; }
      .section, .nuevo { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; }
      .nuevo { background: #fffbeb; border-color: #fde68a; }
      .radio-group { display: flex; flex-direction: column; gap: 8px; }
      .radio-group label, .check label { font-weight: 500; display: flex; align-items: center; gap: 6px; margin: 0; cursor: pointer; }
      .quick { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
      .quick button { background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; border-radius: 16px; padding: 4px 10px; font-size: 11.5px; cursor: pointer; }
      button.mic { background: #1B3A4B; color: #fff; border: none; border-radius: 16px; padding: 5px 12px; font-size: 12px; cursor: pointer; margin-top: 6px; }
      button.mic.on { background: #9f2d2d; }
      button.save { background: #1B3A4B; color: white; border: none; border-radius: 8px; padding: 12px; margin-top: 8px; font-weight: 700; font-size: 14px; width: 100%; cursor: pointer; }
      .hint { font-size: 11.5px; color: #6b7280; margin-top: 3px; }
    </style>
    <div class="fijo">
      <div class="nav">
        <button type="button" id="atras">Atrás</button>
        <strong id="titulo">Fila</strong>
        <button type="button" id="adelante">Adelante</button>
      </div>
      <div id="estado">Cargando…</div>
      <div class="llamadas" id="llamadas"></div>
    </div>
    <div class="cuerpo">
      <h2>Tipificar llamada</h2>
      <form id="f">
        <input type="hidden" name="fila" id="fila">
        <div class="section">
          <label>¿Quién es la persona de la lista?</label>
          <div class="radio-group">
            <label><input type="radio" name="tipoPersona" value="conductor"> Es solo el conductor. Cargo el propietario aparte</label>
            <label><input type="radio" name="tipoPersona" value="propietario"> Es el propietario. Es la misma persona</label>
            <label><input type="radio" name="tipoPersona" value="desconocido"> No se pudo confirmar</label>
          </div>
        </div>
        <div class="section">
          <label>Nombre del propietario</label>
          <input type="text" name="nombre" required>
          <label>Cédula del propietario</label>
          <input type="text" name="cc" placeholder="Solo números">
          <label>Teléfono del propietario</label>
          <input type="text" name="tel" required>
        </div>
        <div class="nuevo">
          <label style="font-weight:500;margin-top:0"><input type="checkbox" name="tieneNuevoPropietario" id="tieneNuevoPropietario"> Me dieron datos del <strong>nuevo propietario</strong> (vendió el vehículo)</label>
          <div id="camposNuevo" style="display:none;margin-top:10px">
            <label>Nombre del nuevo propietario (opcional)</label>
            <input type="text" name="nuevoNombre">
            <label>Teléfono del nuevo propietario</label>
            <input type="text" name="nuevoTel">
          </div>
        </div>
        <div class="section check">
          <label><input type="checkbox" name="soloPropietario" id="soloPropietario"> Solo se contactó al propietario (no se llamó al conductor)</label>
        </div>
        <div class="section">
          <label>Clasificación</label>
          <select name="clasificacion"></select>
          <label>Calificación</label>
          <select name="calificacion"></select>
        </div>
        <div class="section">
          <label>Observación con el conductor</label>
          <textarea name="conductor" rows="2"></textarea>
          <button type="button" class="mic" id="mic-conductor">Dictar</button>
          <div class="hint">Si no abre el micrófono, haz clic en el cuadro y usa Windows + H.</div>
          <div class="quick" id="q-conductor"></div>
          <label>Observación con el propietario</label>
          <textarea name="propietario" rows="2"></textarea>
          <button type="button" class="mic" id="mic-propietario">Dictar</button>
          <div class="quick" id="q-propietario"></div>
        </div>
        <div class="section">
          <label>Intención de afiliación</label>
          <select name="intencion"></select>
          <label>Próxima gestión</label>
          <select name="proxima"></select>
          <label>Fecha próxima gestión</label>
          <input type="date" name="fechaProxima">
          <div class="check" style="margin-top:6px"><label><input type="checkbox" name="noAplicaProxima"> No aplica</label></div>
          <label>Resultado final</label>
          <select name="resultado"></select>
          <label>Fecha de afiliación</label>
          <input type="date" name="fechaAfiliacion">
          <div class="check" style="margin-top:6px"><label><input type="checkbox" name="noAplicaAfiliacion"> No aplica</label></div>
          <label>Motivo de no afiliación</label>
          <select name="motivo"></select>
        </div>
        <div class="section">
          <label>Observación final</label>
          <textarea name="observacionFinal" rows="2"></textarea>
          <div class="quick" id="q-final"></div>
        </div>
        <button type="submit" class="save" id="guardar">Guardar y pasar al siguiente</button>
      </form>
    </div>
    <script>
      var filaDatos = null;
      var recActual = null;
      var campoVoz = '';

      var rapidas = {
        conductor: [
          ['Solo propietario', 'No se hizo contacto con el conductor, se priorizo al propietario'],
          ['No contestó', 'No contestó'],
          ['Apagado', 'Teléfono apagado / no disponible'],
          ['Número inválido', 'Número equivocado o no activado'],
          ['Pasó contacto', 'Me pasó el contacto del propietario']
        ],
        propietario: [
          ['No contestó', 'No contestó'],
          ['Interesado - WhatsApp', 'Está interesado, pide información por WhatsApp'],
          ['Vendió - sin número', 'Ya vendió el vehículo y no tiene el número del nuevo propietario'],
          ['Vendió - con número', 'Ya vendió el vehículo y tiene el número del nuevo propietario'],
          ['No interesado', 'No está interesado'],
          ['Prefiere otra empresa', 'Prefiere quedarse en su empresa actual'],
          ['Número inválido', 'Número inválido o no existe'],
          ['Fuera del país', 'Está fuera del país']
        ],
        observacionFinal: [
          ['Pidió WhatsApp', 'Pidió que se contactara por WhatsApp'],
          ['No contacté a nadie', 'No pude contactarme con ninguna de las personas'],
          ['Info desactualizada', 'Información del propietario desactualizada (vendió el vehículo)'],
          ['Número inválido', 'Número inválido o no existe'],
          ['En proceso docs', 'En proceso de envío de documentación']
        ]
      };

      function campo(n) { return document.querySelector('[name="' + n + '"]'); }

      function chips(id, nombre) {
        var caja = document.getElementById(id);
        rapidas[nombre].forEach(function(par) {
          var b = document.createElement('button');
          b.type = 'button';
          b.textContent = par[0];
          b.onclick = function() { insertar(nombre === 'observacionFinal' ? 'observacionFinal' : nombre, par[1]); };
          caja.appendChild(b);
        });
      }

      function llenarSelect(nombre, arr, actual) {
        var sel = campo(nombre);
        sel.innerHTML = '';
        var vacio = document.createElement('option');
        vacio.value = '';
        sel.appendChild(vacio);
        (arr || []).forEach(function(x) {
          var op = document.createElement('option');
          op.value = x;
          op.textContent = x;
          if (x === actual) op.selected = true;
          sel.appendChild(op);
        });
      }

      function copiar(texto, boton) {
        var ta = document.createElement('textarea');
        ta.value = texto;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        var antes = boton.textContent;
        boton.textContent = 'Copiado';
        setTimeout(function() { boton.textContent = antes; }, 900);
      }

      function tarjeta(titulo, nombre, tel, placa) {
        var div = document.createElement('div');
        div.className = 'card';
        var etiqueta = document.createElement('span');
        etiqueta.textContent = titulo;
        var persona = document.createElement('b');
        persona.textContent = nombre || 'Sin nombre';
        var link = document.createElement('a');
        link.href = tel ? 'tel:' + tel : '#';
        link.textContent = tel || 'Sin teléfono';
        div.appendChild(etiqueta);
        div.appendChild(persona);
        div.appendChild(link);
        if (tel) {
          var copiarTel = document.createElement('button');
          copiarTel.type = 'button';
          copiarTel.textContent = 'Copiar';
          copiarTel.onclick = function() { copiar(tel, copiarTel); };
          div.appendChild(copiarTel);
        }
        if (placa) {
          var linea = document.createElement('div');
          var textoPlaca = document.createElement('b');
          textoPlaca.textContent = placa;
          var copiarPlaca = document.createElement('button');
          copiarPlaca.type = 'button';
          copiarPlaca.textContent = 'Copiar placa';
          copiarPlaca.onclick = function() { copiar(placa, copiarPlaca); };
          linea.appendChild(textoPlaca);
          linea.appendChild(copiarPlaca);
          div.appendChild(linea);
        }
        return div;
      }

      function pintarLlamadas() {
        var tipo = (document.querySelector('input[name="tipoPersona"]:checked') || {}).value || 'conductor';
        var caja = document.getElementById('llamadas');
        caja.innerHTML = '';
        caja.className = 'llamadas' + (tipo === 'propietario' ? ' una' : '');
        if (!filaDatos) return;
        if (tipo === 'propietario') {
          caja.appendChild(tarjeta('Conductor y propietario · la misma persona', campo('nombre').value || filaDatos.nombreLista, (campo('tel').value || filaDatos.telLista || '').replace(/\\D/g, ''), filaDatos.placa));
          return;
        }
        caja.appendChild(tarjeta('Conductor · base', filaDatos.nombreLista, filaDatos.telLista, filaDatos.placa));
        var telProp = (campo('tel').value || '').replace(/\\D/g, '');
        caja.appendChild(tarjeta('Propietario', campo('nombre').value, telProp));
        var nuevo = (campo('nuevoTel').value || '').replace(/\\D/g, '');
        if (campo('tieneNuevoPropietario').checked && nuevo) {
          caja.className = 'llamadas';
          caja.appendChild(tarjeta('Nuevo propietario', campo('nuevoNombre').value, nuevo));
        }
      }

      function aplicarTipo(desdeUsuario) {
        var tipo = (document.querySelector('input[name="tipoPersona"]:checked') || {}).value;
        if (!filaDatos) return;
        if (desdeUsuario && tipo === 'propietario') {
          campo('nombre').value = filaDatos.nombreLista || filaDatos.nombreProp;
          campo('tel').value = filaDatos.telLista || filaDatos.telProp;
        }
        if (desdeUsuario && tipo === 'conductor') {
          campo('nombre').value = filaDatos.nombreProp;
          campo('tel').value = filaDatos.telProp;
          campo('cc').value = filaDatos.cc || '';
        }
        pintarLlamadas();
      }

      function pintar(d) {
        filaDatos = d;
        document.getElementById('titulo').textContent = 'Fila ' + d.fila;
        document.getElementById('estado').textContent = d.aviso || ('Fila ' + d.fila + ' de ' + d.ultima);
        campo('fila').value = d.fila;
        var tipo = d.tipoPersona || 'conductor';
        document.querySelectorAll('input[name="tipoPersona"]').forEach(function(r) { r.checked = r.value === tipo; });
        if (tipo === 'propietario') {
          campo('nombre').value = d.nombreProp || d.nombreLista;
          campo('tel').value = d.telProp || d.telLista;
        } else {
          campo('nombre').value = d.nombreProp;
          campo('tel').value = d.telProp;
        }
        campo('cc').value = d.cc || '';
        campo('tieneNuevoPropietario').checked = !!d.tieneNuevo;
        document.getElementById('camposNuevo').style.display = d.tieneNuevo ? 'block' : 'none';
        campo('nuevoNombre').value = d.nuevoNombre || '';
        campo('nuevoTel').value = d.nuevoTel || '';
        campo('soloPropietario').checked = !!d.soloPropietario;
        llenarSelect('clasificacion', d.clasificaciones, d.clasificacion);
        llenarSelect('calificacion', d.calificaciones, d.calificacion);
        llenarSelect('intencion', d.intenciones, d.intencion);
        llenarSelect('proxima', d.proximas, d.proxima);
        llenarSelect('resultado', d.resultados, d.resultado);
        llenarSelect('motivo', d.motivos, d.motivo);
        campo('conductor').value = d.conductor || '';
        campo('propietario').value = d.propietario || '';
        campo('fechaProxima').value = d.fechaProxima || '';
        campo('noAplicaProxima').checked = !!d.noAplicaProxima;
        campo('fechaAfiliacion').value = d.fechaAfiliacion || '';
        campo('noAplicaAfiliacion').checked = !!d.noAplicaAfiliacion;
        campo('observacionFinal').value = d.observacionFinal || '';
        aplicarTipo(false);
        document.getElementById('atras').disabled = d.fila <= 2;
      }

      function fallo(err) {
        document.getElementById('estado').textContent = err && err.message ? err.message : 'No pude guardar';
        document.getElementById('guardar').disabled = false;
      }

      function mover(delta, guardar) {
        if (recActual) recActual.stop();
        document.getElementById('guardar').disabled = true;
        document.getElementById('estado').textContent = guardar ? 'Guardando…' : 'Cargando…';
        if (!guardar) {
          var destino = Number(campo('fila').value) + delta;
          google.script.run.withSuccessHandler(function(d) {
            document.getElementById('guardar').disabled = false;
            pintar(d);
          }).withFailureHandler(fallo).irA(destino);
          return;
        }
        var data = Object.fromEntries(new FormData(document.getElementById('f')));
        data.delta = delta;
        google.script.run.withSuccessHandler(function(d) {
          document.getElementById('guardar').disabled = false;
          pintar(d);
        }).withFailureHandler(fallo).guardarYSeguir(data);
      }

      function unir(base, extra) {
        extra = String(extra || '').replace(/\\s+/g, ' ').trim();
        if (!extra) return base;
        if (!base) return extra.charAt(0).toUpperCase() + extra.slice(1);
        return base.replace(/\\s+$/, '') + ' ' + extra;
      }

      function marcarMic(campoNombre, activo) {
        ['conductor', 'propietario'].forEach(function(c) {
          var b = document.getElementById('mic-' + c);
          var on = activo && c === campoNombre;
          b.textContent = on ? 'Detener dictado' : 'Dictar';
          b.className = on ? 'mic on' : 'mic';
        });
      }

      function dictar(campoNombre) {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
          alert('Este navegador no dicta aquí. Haz clic en el comentario y usa la tecla Windows + H.');
          return;
        }
        if (recActual && campoVoz === campoNombre) { recActual.stop(); return; }
        if (recActual) recActual.stop();
        var ta = campo(campoNombre);
        var base = ta.value || '';
        var rec = new SR();
        rec.lang = 'es-CO';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onstart = function() { marcarMic(campoNombre, true); };
        rec.onend = function() {
          if (recActual === rec) { recActual = null; campoVoz = ''; marcarMic('', false); }
        };
        rec.onerror = function(ev) {
          marcarMic('', false);
          if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
            alert('No pude abrir el micrófono. Haz clic en el comentario y dicta con Windows + H.');
          }
        };
        rec.onresult = function(ev) {
          var interim = '';
          for (var i = ev.resultIndex; i < ev.results.length; i++) {
            var texto = ev.results[i][0].transcript;
            if (ev.results[i].isFinal) base = unir(base, texto);
            else interim += texto;
          }
          ta.value = interim ? unir(base, interim) : base;
        };
        recActual = rec;
        campoVoz = campoNombre;
        try { rec.start(); } catch (err) { alert('No pude iniciar el dictado. Usa Windows + H.'); }
      }

      function insertar(nombre, texto) {
        var ta = campo(nombre);
        if (!ta.value) ta.value = texto;
        else if (ta.value.indexOf(texto) === -1) ta.value += '. ' + texto;
      }

      chips('q-conductor', 'conductor');
      chips('q-propietario', 'propietario');
      chips('q-final', 'observacionFinal');
      document.getElementById('mic-conductor').onclick = function() { dictar('conductor'); };
      document.getElementById('mic-propietario').onclick = function() { dictar('propietario'); };
      document.getElementById('atras').onclick = function() { mover(-1, false); };
      document.getElementById('adelante').onclick = function() { mover(1, false); };
      document.getElementById('tieneNuevoPropietario').onchange = function() {
        document.getElementById('camposNuevo').style.display = this.checked ? 'block' : 'none';
        pintarLlamadas();
      };
      document.getElementById('soloPropietario').onchange = function() {
        if (!this.checked) return;
        var texto = 'No se hizo contacto con el conductor, ya que el propietario contestó';
        insertar('conductor', texto);
      };
      document.querySelectorAll('input[name="tipoPersona"]').forEach(function(r) {
        r.onchange = function() { aplicarTipo(true); };
      });
      ['nombre', 'tel', 'nuevoNombre', 'nuevoTel'].forEach(function(n) {
        campo(n).addEventListener('input', pintarLlamadas);
      });
      document.getElementById('f').onsubmit = function(e) {
        e.preventDefault();
        mover(1, true);
      };
      google.script.run.withFailureHandler(fallo).withSuccessHandler(pintar).filaActual();
    </script>
  `).setWidth(560).setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(html, 'Tipificar');
}
