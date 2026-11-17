// @ts-nocheck
export const CLASIFICACIONES = [
	"Contacto Efectivo",
	"Contacto No Efectivo",
	"Volver a llamar con Comunicacion",
	"Volver a llamar sin comunicacion"
];
export const CALIFICACIONES = [
	"Recibe Informacion",
	"Cliente Solicita que se le llame después",
	"Fallas de enlace",
	"Falleció",
	"No Acepta Oferta",
	"No Contestan",
	"No se encuentra",
	"Se dejó Mensaje",
	"Teléfono Equivocado",
	"Continua con la Vinculacion"
];
export const INTENCIONES = [
	"No interesado",
	"Considera opción",
	"Quiere afiliarse",
	"No se pudo localizar despues de varios intentos"
];
export const PROXIMAS = [
	"Llamar",
	"WhatsApp",
	"Agendar",
	"Cerrar"
];
export const RESULTADOS = [
	"Afiliado",
	"No afiliado",
	"En proceso",
	"No localizado",
	"Documentación",
	"Compra Polizas",
	"Radicacion TO",
	"Entrega TO - Promotor"
];
export const MOTIVOS = [
	"Precio",
	"Prefiere otra empresa",
	"Vendió vehículo",
	"No interesado",
	"Otro"
];
export const CHIPS: Record<"conductor" | "propietario" | "observacionFinal", [string, string][]> = {
	conductor: [
		["Solo propietario", "No se hizo contacto con el conductor, se priorizo al propietario"],
		["No contestó", "No contestó"],
		["Apagado", "Teléfono apagado / no disponible"],
		["Número inválido", "Número equivocado o no activado"],
		["Pasó contacto", "Me pasó el contacto del propietario"]
	],
	propietario: [
		["No contestó", "No contestó"],
		["Interesado - WhatsApp", "Está interesado, pide información por WhatsApp"],
		["Vendió - sin número", "Ya vendió el vehículo y no tiene el número del nuevo propietario"],
		["Vendió - con número", "Ya vendió el vehículo y tiene el número del nuevo propietario"],
		["No interesado", "No está interesado"],
		["Prefiere otra empresa", "Prefiere quedarse en su empresa actual"],
		["Número inválido", "Número inválido o no existe"],
		["Fuera del país", "Está fuera del país"]
	],
	observacionFinal: [
		["Pidió WhatsApp", "Pidió que se contactara por WhatsApp"],
		["No contacté a nadie", "No pude contactarme con ninguna de las personas"],
		["Info desactualizada", "Información del propietario desactualizada (vendió el vehículo)"],
		["Número inválido", "Número inválido o no existe"],
		["En proceso docs", "En proceso de envío de documentación"]
	]
};
export const BRIEFING_BASE = [
	{
		seccion: "comercial",
		titulo: "Briefing comercial",
		orden: 1
	},
	{
		seccion: "guion",
		titulo: "Guion de la llamada",
		orden: 2
	},
	{
		seccion: "objeciones",
		titulo: "Objeciones",
		orden: 3
	},
	{
		seccion: "preguntas",
		titulo: "Preguntas y respuestas",
		orden: 4
	},
	{
		seccion: "apoyo",
		titulo: "Páginas de apoyo",
		orden: 5
	},
	{
		seccion: "promotores",
		titulo: "Promotores de vinculación",
		orden: 6
	},
	{
		seccion: "polizas",
		titulo: "Pólizas: prórroga, extra y contra",
		orden: 7
	},
	{
		seccion: "piezas",
		titulo: "Piezas y WhatsApp",
		orden: 8
	}
];
export const FESTIVOS_2026: Record<string, string> = {
	"2026-01-01": "Año Nuevo",
	"2026-01-12": "Reyes Magos",
	"2026-03-23": "San José",
	"2026-04-02": "Jueves Santo",
	"2026-04-03": "Viernes Santo",
	"2026-05-01": "Día del trabajo",
	"2026-05-18": "Ascensión",
	"2026-06-08": "Corpus Christi",
	"2026-06-15": "Sagrado Corazón",
	"2026-06-29": "San Pedro y San Pablo",
	"2026-07-20": "Independencia",
	"2026-08-07": "Boyacá",
	"2026-08-17": "Asunción",
	"2026-10-12": "Día de la raza",
	"2026-11-02": "Todos los Santos",
	"2026-11-16": "Independencia de Cartagena",
	"2026-12-08": "Inmaculada",
	"2026-12-25": "Navidad"
};
export function normalizar(texto) {
	return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}
export function telefonoBase(valor) {
	const digitos = String(valor || "").replace(/\D/g, "");
	if (digitos.length === 12 && digitos.startsWith("57")) return digitos.slice(2);
	return digitos;
}
export function placaLimpia(valor) {
	return String(valor || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}
export function empresaLimpia(valor) {
	return String(valor || "").replace(/\s+/g, " ").trim().slice(0, 120);
}
export function fechaIso(valor) {
	if (valor instanceof Date && !Number.isNaN(valor.getTime())) return `${valor.getUTCFullYear()}-${String(valor.getUTCMonth() + 1).padStart(2, "0")}-${String(valor.getUTCDate()).padStart(2, "0")}`;
	const t = String(valor ?? "").trim();
	if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
	const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
	if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
	return "";
}
export function fechaCampo(valor) {
	const t = String(valor || "").trim();
	if (!t) return {
		fecha: "",
		noAplica: false
	};
	if (t.toLowerCase() === "no aplica") return {
		fecha: "",
		noAplica: true
	};
	return {
		fecha: fechaIso(t),
		noAplica: false
	};
}
export function esWhatsapp(proxima) {
	const n = normalizar(proxima);
	return n.includes("whatsapp") || n.includes("wasap") || n === "wpp";
}
export function duracionTexto(segundos) {
	const s = Math.max(0, Math.round(segundos));
	const h = Math.floor(s / 3600);
	const m = Math.floor(s % 3600 / 60);
	const r = s % 60;
	if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
	return `${m}:${String(r).padStart(2, "0")}`;
}
export function tipoDesdeSao(sao) {
	const s = String(sao || "");
	if (/^El propietario del vehículo es/i.test(s)) return "propietario";
	if (/No se pudo confirmar/i.test(s)) return "desconocido";
	if (/no es el propietario/i.test(s)) return "conductor";
	return "";
}
export function armarSao(d) {
	const nombre = d.nombre.trim().toUpperCase();
	const cc = d.cc.replace(/\D/g, "");
	const tel = telefonoBase(d.tel);
	const nuevoNombre = d.nuevoNombre.trim().toUpperCase();
	const nuevoTel = telefonoBase(d.nuevoTel);
	if (d.tieneNuevo && nuevoTel) {
		let sao = `El propietario registrado (${nombre}`;
		if (cc) sao += ` CC ${cc}`;
		sao += ") ya no es el propietario del vehículo. ";
		if (nuevoNombre) sao += `Me dieron el contacto del nuevo propietario: ${nuevoNombre}. `;
		sao += `Número del nuevo propietario: ${nuevoTel}.`;
		return sao;
	}
	if (d.tipoPersona === "propietario") {
		let sao = `El propietario del vehículo es ${nombre}`;
		if (cc) sao += ` CC ${cc}`;
		sao += `. Su número de teléfono es ${tel}.`;
		return sao;
	}
	if (d.tipoPersona === "desconocido") {
		let sao = `No se pudo confirmar el propietario. Contacto: ${nombre}`;
		if (cc) sao += ` CC ${cc}`;
		if (tel) sao += `. Teléfono: ${tel}`;
		return sao;
	}
	let sao = `El señor no es el propietario del vehículo. El propietario es ${nombre}`;
	if (cc) sao += ` CC ${cc}`;
	sao += `. Su número de teléfono es ${tel}.`;
	return sao;
}
function partir(valor) {
	const texto = String(valor || "").trim();
	if (!texto) return [];
	return texto.split(/\s*(?:\/\/|\r?\n|;)\s*/).map((parte) => parte.trim()).filter(Boolean);
}
function leerGestion(fila, nombreProp, telProp) {
	const clasificacion = fila.clasificacion.trim();
	const resultado = fila.resultado.trim();
	const final = fila.observacionFinal.trim();
	if (!clasificacion && !resultado && !final && !fila.sao.trim()) return null;
	const sao = fila.sao.trim();
	const leido = (() => {
		const cc = (sao.match(/CC\s*(\d+)/i) || ["", ""])[1];
		const nuevoTel = (sao.match(/nuevo propietario:\s*(\d+)/i) || sao.match(/Número del nuevo propietario:\s*(\d+)/i) || ["", ""])[1];
		const nuevoNombre = (sao.match(/contacto del nuevo propietario:\s*([^.]+)/i) || ["", ""])[1].trim();
		return {
			cc,
			nuevoTel: telefonoBase(nuevoTel),
			nuevoNombre,
			tieneNuevo: /ya no es el propietario/i.test(sao),
			soloPropietario: /No se hizo contacto con el conductor/i.test(fila.conductor),
			tipoPersona: tipoDesdeSao(sao)
		};
	})();
	const proxima = fechaCampo(fila.fechaProxima);
	const afiliacion = fechaCampo(fila.fechaAfiliacion);
	return {
		agente: fila.agente.trim().slice(0, 120),
		fecha: fechaIso(fila.fecha),
		clasificacion: clasificacion.slice(0, 80),
		calificacion: fila.calificacion.trim().slice(0, 80),
		sao: sao.slice(0, 2e3),
		conductor: fila.conductor.trim().slice(0, 2e3),
		propietario: fila.propietarioObs.trim().slice(0, 2e3),
		intencion: fila.intencion.trim().slice(0, 120),
		proxima: fila.proxima.trim().slice(0, 40),
		fechaProxima: proxima.fecha,
		noAplicaProxima: proxima.noAplica,
		resultado: resultado.slice(0, 80),
		fechaAfiliacion: afiliacion.fecha,
		noAplicaAfiliacion: afiliacion.noAplica,
		motivo: fila.motivo.trim().slice(0, 80),
		observacionFinal: final.slice(0, 2e3),
		canal: fila.canal === "whatsapp" ? "whatsapp" : "llamada",
		tipoPersona: leido.tipoPersona,
		cc: leido.cc || fila.cc.replace(/\D/g, ""),
		tieneNuevo: leido.tieneNuevo,
		nuevoNombre: leido.nuevoNombre.slice(0, 120),
		nuevoTel: leido.nuevoTel,
		soloPropietario: leido.soloPropietario,
		nombreProp: nombreProp.slice(0, 120),
		telProp
	};
}
export function expandirFila(fila) {
	const nombres = partir(fila.nombre);
	const tels = partir(fila.telefono).map(telefonoBase);
	const placas = partir(fila.placa).map(placaLimpia).filter(Boolean);
	const n = Math.max(nombres.length, tels.length, placas.length, 1);
	const empresa = empresaLimpia(fila.empresa) || "SIN EMPRESA";
	const propietario = fila.propietario.replace(/\s+/g, " ").trim().slice(0, 120);
	const telPropietario = telefonoBase(fila.telPropietario);
	const vehiculo = fila.vehiculo.replace(/\s+/g, " ").trim().slice(0, 80);
	const anio = String(fila.anio || "").replace(/[^\d]/g, "").slice(0, 4);
	const estado = fila.estado.replace(/\s+/g, " ").trim().slice(0, 40);
	const ccFila = fila.cc.replace(/\D/g, "").slice(0, 20);
	const salida = [];
	for (let i = 0; i < n; i++) {
		const nombre = (nombres[i] || (nombres.length === 1 ? nombres[0] : "") || "").replace(/\s+/g, " ").trim().slice(0, 120);
		const telefono = tels[i] || (nombres.length <= 1 && placas.length <= 1 ? tels[0] || "" : "");
		const placa = placas[i] || placas[0] || "";
		if (!nombre && !telefono && !placa) continue;
		const gestion = i === 0 ? leerGestion(fila, propietario, telPropietario) : null;
		salida.push({
			empresa,
			nombre,
			estado,
			telefono,
			propietario,
			telPropietario,
			vehiculo,
			placa,
			anio,
			cc: i === 0 ? ccFila : "",
			agente: String(fila.agente || "").replace(/\s+/g, " ").trim().slice(0, 120),
			turnoSlug: "",
			enCola: 0,
			gestion
		});
	}
	return salida;
}
export function limpiarBase(filas) {
	const planos = [];
	let separados = 0;
	let orden = 0;
	for (const fila of filas) {
		const trozos = expandirFila(fila);
		if (trozos.length > 1) separados += trozos.length - 1;
		for (const trozo of trozos) {
			orden += 1;
			planos.push({
				...trozo,
				orden,
				duplicado: false
			});
		}
	}
	const vistos = /* @__PURE__ */ new Set();
	const porPlaca = /* @__PURE__ */ new Map();
	const limpios = [];
	let repetidos = 0;
	for (const contacto of planos) {
		const clave = `${contacto.placa}|${contacto.telefono}|${normalizar(contacto.nombre)}|${normalizar(contacto.empresa)}`;
		if (vistos.has(clave)) {
			repetidos += 1;
			continue;
		}
		vistos.add(clave);
		limpios.push(contacto);
		if (contacto.placa) porPlaca.set(contacto.placa, (porPlaca.get(contacto.placa) ?? 0) + 1);
	}
	for (const contacto of limpios) if (contacto.placa && (porPlaca.get(contacto.placa) ?? 0) > 1) contacto.duplicado = true;
	return {
		limpios,
		separados,
		repetidos
	};
}
function partirCsv(linea, sep) {
	const out = [];
	let actual = "";
	let comillas = false;
	for (let i = 0; i < linea.length; i++) {
		const c = linea[i];
		if (c === "\"") {
			if (comillas && linea[i + 1] === "\"") {
				actual += "\"";
				i += 1;
			} else comillas = !comillas;
		} else if (c === sep && !comillas) {
			out.push(actual);
			actual = "";
		} else actual += c;
	}
	out.push(actual);
	return out;
}
var ALIAS = {
	nombre: [
		"nombre completo",
		"nombre del propietario",
		"nombre"
	],
	estado: ["estado"],
	telefono: [
		"numero de telefono",
		"número de teléfono",
		"numero de contacto",
		"celular"
	],
	propietario: ["propietario sao", "propietario"],
	telPropietario: [
		"telefono",
		"telefono propietario",
		"tel propietario"
	],
	vehiculo: ["vehiculo", "vehículo"],
	placa: ["placa"],
	anio: [
		"ano",
		"año",
		"anio",
		"modelo"
	],
	empresa: ["empresa"],
	cc: [
		"cc propietario",
		"cedula",
		"cc",
		"documento"
	],
	fecha: ["fecha"],
	agente: ["agente"],
	clasificacion: ["clasificacion"],
	calificacion: ["calificacion"],
	sao: ["observacion sao"],
	conductor: ["observacion conductor"],
	propietarioObs: ["observacion propietario", "observacion"],
	intencion: ["intencion de afiliacion", "intención de afiliacion"],
	proxima: ["proxima gestion", "próxima gestion"],
	fechaProxima: ["fecha proxima gestion", "fecha próxima gestion"],
	resultado: ["resultado final"],
	fechaAfiliacion: ["fecha de afiliacion"],
	motivo: ["motivo de no afiliacion", "motvo de no afiliacion"],
	observacionFinal: ["observacion final"]
};
export function filasDesdeTabla(headers, rows) {
	const mapa = /* @__PURE__ */ new Map();
	headers.forEach((header, i) => {
		const clave = normalizar(header);
		if (clave && !mapa.has(clave)) mapa.set(clave, i);
	});
	function col(nombres) {
		for (const nombre of nombres) {
			const idx = mapa.get(normalizar(nombre));
			if (idx !== void 0) return idx;
		}
		return -1;
	}
	const idx = Object.fromEntries(Object.entries(ALIAS).map(([k, nombres]) => [k, col(nombres)]));
	if (idx.telefono < 0 && idx.telPropietario >= 0) idx.telefono = idx.telPropietario;
	if (idx.placa < 0 && idx.nombre < 0 && idx.telefono < 0) return [];
	const telProp = idx.telPropietario === idx.telefono ? -1 : idx.telPropietario;
	return rows.map((row) => {
		const tomar = (i) => i >= 0 ? String(row[i] ?? "").trim() : "";
		return {
			nombre: tomar(idx.nombre),
			estado: tomar(idx.estado),
			telefono: tomar(idx.telefono),
			propietario: tomar(idx.propietario),
			telPropietario: tomar(telProp),
			vehiculo: tomar(idx.vehiculo),
			placa: tomar(idx.placa),
			anio: tomar(idx.anio),
			empresa: tomar(idx.empresa),
			cc: tomar(idx.cc),
			fecha: tomar(idx.fecha),
			agente: tomar(idx.agente),
			clasificacion: tomar(idx.clasificacion),
			calificacion: tomar(idx.calificacion),
			sao: tomar(idx.sao),
			conductor: tomar(idx.conductor),
			propietarioObs: tomar(idx.propietarioObs),
			intencion: tomar(idx.intencion),
			proxima: tomar(idx.proxima),
			fechaProxima: tomar(idx.fechaProxima),
			resultado: tomar(idx.resultado),
			fechaAfiliacion: tomar(idx.fechaAfiliacion),
			motivo: tomar(idx.motivo),
			observacionFinal: tomar(idx.observacionFinal),
			canal: ""
		};
	}).filter((fila) => fila.nombre || fila.telefono || fila.placa);
}
export function filasDesdeCsv(texto) {
	const lineas = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((linea) => linea.trim());
	if (lineas.length < 2) return [];
	const sep = (lineas[0].match(/;/g) || []).length > (lineas[0].match(/,/g) || []).length ? ";" : ",";
	const tabla = lineas.map((linea) => partirCsv(linea, sep));
	return filasDesdeTabla(tabla[0], tabla.slice(1));
}
export function horaCita(valor) {
	if (valor instanceof Date && !Number.isNaN(valor.getTime())) return `${String(valor.getUTCHours()).padStart(2, "0")}:${String(valor.getUTCMinutes()).padStart(2, "0")}`;
	if (typeof valor === "number" && valor >= 0 && valor < 1) {
		const mins = Math.round(valor * 24 * 60);
		const h = Math.floor(mins / 60) % 24;
		const m = mins % 60;
		return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
	}
	const t = String(valor ?? "").trim().toLowerCase();
	const ampm = t.match(/(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)/);
	if (ampm) {
		let h = Number(ampm[1]);
		const pm = ampm[3].includes("p");
		if (pm && h < 12) h += 12;
		if (!pm && h === 12) h = 0;
		return `${String(h).padStart(2, "0")}:${ampm[2]}`;
	}
	const suelto = t.match(/(\d{1,2}):(\d{2})/);
	if (suelto) return `${suelto[1].padStart(2, "0")}:${suelto[2]}`;
	return "";
}
export const ESTADOS_DISTINTIVO = [
	"Programados",
	"Instalado",
	"No asistió",
	"Reprogramar",
	"Pendiente"
] as const;
export function estadoDistintivo(valor) {
	const n = normalizar(valor);
	if (n.startsWith("instal")) return "Instalado";
	if (n.includes("no asist")) return "No asistió";
	if (n.startsWith("reprog")) return "Reprogramar";
	if (n.startsWith("pend")) return "Pendiente";
	if (n.startsWith("prog")) return "Programados";
	return "";
}
export const BRIEFING_SEMILLA: Record<string, string> = {
	comercial: `Radio Taxi Aeropuerto acompaña a propietarios y conductores con respaldo, tecnología, seguridad y herramientas para la operación del taxi. La campaña no es solo una afiliación: es una alternativa para quien hoy está en otra empresa.

Objetivo: captar propietarios de vehículos de servicio público, dar a conocer los beneficios, resolver objeciones, pedir la documentación y dejar el seguimiento listo.

A quién llamamos: propietarios vinculados a otras empresas, quienes buscan otra alternativa, y conductores que puedan pasar el contacto del propietario.

Beneficios que se pueden mencionar:
- Rodamiento gratis el primer año.
- 3 meses de App Taxis Libres.
- Afiliación, cambio de tarjeta de operación y cambio de distintivos sin costo.
- Planillas de viaje digitales, sin sobrecostos.
- Asesoría jurídica, certificaciones, inducción y capacitación.
- Trámites en línea, archivo digital y recordación de vencimientos.
- App Taxis Libres, SPIA GPS y pagos con tarjeta.
- Líneas 211 11 11 y 311 11 11. Zonas Taxis Libres.
- Contact center con Policía 24 horas.

Presencia: Centro Comercial Carrera, Av. de las Américas #50-15. Ciudad Jardín Sur, Av. Caracas #15-10 sur. Lunes a viernes 8:30 a. m. a 5:00 p. m. Sábados 8:30 a. m. a 1:00 p. m.

Meta de la campaña: en promedio 4 cambios de empresa al día por asesor, 100 al mes.

Documentos para avanzar: tarjeta de propiedad, SOAT, tarjeta de operación, cédula del titular y revisión técnico-mecánica.`,
	guion: `Saludo
Hola, buenos días/tardes. ¿Hablo con el señor/la señora ____? Mi nombre es ____ y me comunico de Radio Taxi Aeropuerto. Estamos en una campaña de vinculación y queremos presentarle una alternativa con beneficios para propietarios y conductores. ¿Tiene un momento?
Le informo que, para control y calidad, esta llamada podrá ser grabada o monitoreada.

Si acepta
Muchas gracias. Le cuento breve los beneficios y, si le interesan, cómo es el proceso.

Beneficios
En Radio Taxi Aeropuerto buscamos ofrecerle más que una afiliación: rodamiento gratis el primer año, 3 meses de App Taxis Libres, afiliación, cambio de tarjeta de operación y cambio de distintivos. También hay asesoría jurídica, trámites, capacitación y seguimiento del vehículo. La idea es que compare y decida con la información completa.

Cierre si hay interés
El siguiente paso es validar la documentación: tarjeta de propiedad, SOAT, tarjeta de operación, cédula del titular y revisión técnico-mecánica. ¿Los tiene a la mano?

WhatsApp
Hola, ____. Soy ____ de Radio Taxi Aeropuerto. Como hablamos, le comparto la vinculación y los beneficios. Para validar necesitamos tarjeta de propiedad, SOAT, tarjeta de operación, cédula del titular y revisión técnico-mecánica. Quedo atento para seguir el proceso.`,
	objeciones: `1. Ya estoy vinculado a otra empresa.
Nuestra campaña es justamente para propietarios que hoy están en otra empresa. No es para decidir de afán: es para que conozca la propuesta y compare.

2. Estoy contento donde estoy.
Qué bueno. Le cuento breve qué ofrecemos, para que tenga otra alternativa. La decisión es suya.

3. No me interesa.
Entiendo. Antes de colgar, ¿me permite una pregunta? ¿Qué es lo que hoy le funciona de su empresa? Escuche y responda con el beneficio que toque ese punto.

4. ¿Y qué me ofrecen?
Rodamiento del primer año, distintivos, tarjeta de operación, 3 meses de app y el respaldo de Radio Taxi Aeropuerto. Si me permite, le explico las condiciones.

5. ¿Cuánto tengo que pagar?
Explique los costos reales, sin adornos. La persona debe tener la información antes de decidir.

6. No quiero sacar el vehículo.
Podemos revisar primero condiciones y requisitos. Así conoce la alternativa y decide después si el cambio vale la pena.

7. Mándeme la información por WhatsApp.
Claro. ¿Este número tiene WhatsApp? Le envío la información y luego resolvemos las dudas.

8. No tengo tiempo.
No le quito más. Le envío la información por WhatsApp y coordinamos una llamada en un horario que le quede.`,
	preguntas: `¿Qué es un cupo?
Es el derecho de reposición del vehículo, asignado por la capacidad transportadora de la empresa. Es el permiso para que un vehículo homologado opere como taxi. Va con la propiedad: el propietario del vehículo es el del cupo, y se verifica con el certificado de tradición. Sin ese derecho el vehículo no puede operar. Se puede perder, por ejemplo, por no tramitar la tarjeta de operación durante cinco años.

Si hace falta más detalle, la persona puede acercarse a la sede o llamar al 420 26 00 ext. 262.

Coordinación puede pegar aquí el resto de preguntas y respuestas de la campaña.`,
	apoyo: `Centro de conocimiento Zendesk
https://taxislibres-centrodeconocimiento.zendesk.com/hc/es-419

Taxis Libres
https://www.taxislibres.com.co/

Directorio
https://www.taxislibres.com.co/intranetInformativo/directorio

Mi perfil
https://www.taxislibres.com.co/cuenta/

Intranet
https://www.taxislibres.com.co/intranetInformativo/portal-colaborador

SAO: no tiene página pública. La observación SAO se arma sola al guardar la tipificación.`,
	promotores: `Promotores que aparecen en la agenda de distintivos. Coordinación puede corregir esta lista.

- David Santiago Jaimes Peña
- Alison Dayana Moreno Olaya
- Leidi Patricia Ladino Peñaloza
- Jose Antonio Abreu Valero
- Laura Katerine Plazas Saza

La instalación de distintivos se agenda en Agenda, vista Distintivos, de 10:00 a 16:30, hasta el 31 de diciembre de 2026. Los festivos quedan marcados y no se trabajan.`,
	polizas: `Pegue aquí la tabla vigente de prórroga, extra y contra.

No deje valores de memoria en la llamada: si el propietario pregunta cuánto paga, use esta sección o pase la llamada a coordinación.`,
	piezas: `Textos cortos para WhatsApp. Coordinación puede reemplazarlos por las piezas de la campaña.

Vinculación
Hola, ____. Soy ____ de Radio Taxi Aeropuerto. Le comparto la alternativa de vinculación: rodamiento del primer año, 3 meses de App Taxis Libres, afiliación y cambio de distintivos. Si le interesa, seguimos con la documentación del vehículo.

Documentos
Para avanzar necesitamos: tarjeta de propiedad, SOAT vigente, tarjeta de operación, cédula del titular y revisión técnico-mecánica. Me los puede enviar por este chat.`
};

export const META_LLAMADAS = 50;

export type TipoPersona = "conductor" | "propietario" | "desconocido" | "";

export type FilaCruda = {
  nombre: string;
  estado: string;
  telefono: string;
  propietario: string;
  telPropietario: string;
  vehiculo: string;
  placa: string;
  anio: string;
  empresa: string;
  cc: string;
  fecha: string;
  agente: string;
  clasificacion: string;
  calificacion: string;
  sao: string;
  conductor: string;
  propietarioObs: string;
  intencion: string;
  proxima: string;
  fechaProxima: string;
  resultado: string;
  fechaAfiliacion: string;
  motivo: string;
  observacionFinal: string;
  canal: string;
};

export type GestionImportada = {
  agente: string;
  fecha: string;
  clasificacion: string;
  calificacion: string;
  sao: string;
  conductor: string;
  propietario: string;
  intencion: string;
  proxima: string;
  fechaProxima: string;
  noAplicaProxima: boolean;
  resultado: string;
  fechaAfiliacion: string;
  noAplicaAfiliacion: boolean;
  motivo: string;
  observacionFinal: string;
  canal?: string;
  hora?: string;
  tipoPersona: TipoPersona | string;
  cc: string;
  tieneNuevo: boolean;
  nuevoNombre: string;
  nuevoTel: string;
  soloPropietario: boolean;
  nombreProp: string;
  telProp: string;
};

export type ContactoLimpio = {
  empresa: string;
  nombre: string;
  estado: string;
  telefono: string;
  propietario: string;
  telPropietario: string;
  vehiculo: string;
  placa: string;
  anio: string;
  cc: string;
  agente: string;
  turnoSlug: string;
  enCola: number;
  orden: number;
  duplicado: boolean;
  gestion: GestionImportada | null;
};

export type GestionVista = {
  id: number;
  asesor: string;
  fecha: string;
  hora: string;
  segundos: number;
  tipoPersona: string;
  nombre: string;
  cc: string;
  tel: string;
  tieneNuevo: boolean;
  nuevoNombre: string;
  nuevoTel: string;
  soloPropietario: boolean;
  clasificacion: string;
  calificacion: string;
  conductor: string;
  propietario: string;
  intencion: string;
  proxima: string;
  fechaProxima: string;
  noAplicaProxima: boolean;
  resultado: string;
  fechaAfiliacion: string;
  noAplicaAfiliacion: boolean;
  motivo: string;
  observacionFinal: string;
  casoId: number | null;
};

export type ContactoCall = {
  id: number;
  empresa: string;
  nombreLista: string;
  estado: string;
  telefonoLista: string;
  propietario: string;
  telPropietario: string;
  vehiculo: string;
  placa: string;
  anio: string;
  cc: string;
  duplicado: boolean;
  casoId: number | null;
  origen: string;
  posicion: number;
  total: number;
  pendientes: number;
  anteriorId: number | null;
  siguienteId: number | null;
  siguienteLibreId: number | null;
  hoyLlamadas: number;
  hoySegundos: number;
  gestion: GestionVista | null;
};

export type LlamadaDraft = {
  contactoId: number;
  segundos: number;
  tipoPersona: TipoPersona;
  nombre: string;
  cc: string;
  tel: string;
  tieneNuevo: boolean;
  nuevoNombre: string;
  nuevoTel: string;
  soloPropietario: boolean;
  clasificacion: string;
  calificacion: string;
  conductor: string;
  propietario: string;
  intencion: string;
  proxima: string;
  fechaProxima: string;
  noAplicaProxima: boolean;
  resultado: string;
  fechaAfiliacion: string;
  noAplicaAfiliacion: boolean;
  motivo: string;
  observacionFinal: string;
  agendar: boolean;
  quedarse?: boolean;
  sinFicha?: boolean;
};
