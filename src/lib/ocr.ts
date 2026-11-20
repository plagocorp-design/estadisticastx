import { hoyBogota } from "@/lib/casos";
import { contratoDesdeTexto } from "@/lib/contrato";
import { acercar, CARROCERIAS, CLASES, COMBUSTIBLES, LINEAS, MARCAS, SERVICIOS } from "@/lib/vehiculos";
import { EMPRESAS, acercarEmpresa, unificarEmpresa } from "@/lib/empresas";

export type CampoLeido = {
  key:
    | "placa"
    | "cc"
    | "nombre"
    | "telefono"
    | "direccion"
    | "correo"
    | "marca"
    | "linea"
    | "modelo"
    | "empresa"
    | "capacidad"
    | "clase"
    | "carroceria"
    | "motor"
    | "serie"
    | "cilindraje"
    | "servicio";
  label: string;
  actual: string;
  leido: string;
};

export type LecturaDoc = {
  vigencia: "vigente" | "vencido" | "sin_fecha";
  vence: string;
  aviso: string;
  campos: CampoLeido[];
  datos?: Partial<Record<CampoLeido["key"], string>>;
  extra?: Record<string, string>;
};

const ETIQUETAS: Record<CampoLeido["key"], string> = {
  placa: "Placa",
  cc: "Cédula",
  nombre: "Nombre",
  telefono: "Celular",
  direccion: "Dirección",
  correo: "Correo",
  marca: "Marca",
  linea: "Línea",
  modelo: "Modelo",
  empresa: "Empresa",
  capacidad: "Pasajeros",
  clase: "Clase",
  carroceria: "Carrocería",
  motor: "Motor",
  serie: "Serie",
  cilindraje: "Cilindraje",
  servicio: "Servicio",
};

const CADUCA = new Set(["soat", "tecnomecanica", "tarjeta_operacion", "poliza"]);

function limpio(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
}

function plano(value: string) {
  return limpio(value).toUpperCase();
}

function iso(dia: number, mes: number, ano: number) {
  const y = ano < 100 ? 2000 + ano : ano;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || y < 1990 || y > 2040) return "";
  return `${y}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function mostrar(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
}

const MESES: Record<string, number> = {
  ENERO: 1, ENE: 1, FEBRERO: 2, FEB: 2, MARZO: 3, MAR: 3, ABRIL: 4, ABR: 4, MAYO: 5, MAY: 5,
  JUNIO: 6, JUN: 6, JULIO: 7, JUL: 7, AGOSTO: 8, AGO: 8, SEPTIEMBRE: 9, SEPT: 9, SEP: 9,
  OCTUBRE: 10, OCT: 10, NOVIEMBRE: 11, NOV: 11, DICIEMBRE: 12, DIC: 12,
};

function fechasDe(texto: string) {
  const halladas: { iso: string; index: number }[] = [];
  const re = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const fecha = iso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (fecha) halladas.push({ iso: fecha, index: m.index });
  }
  const reMes = /(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóúÑñ]{3,12})\s+(\d{4})/g;
  while ((m = reMes.exec(texto))) {
    const mes = MESES[m[2].normalize("NFD").replace(/\p{M}/gu, "").toUpperCase()];
    const fecha = mes ? iso(Number(m[1]), mes, Number(m[3])) : "";
    if (fecha) halladas.push({ iso: fecha, index: m.index });
  }
  const reSuelta = /(?:venc|expir)[^\d]{0,40}(\d{1,2})\s+(\d{1,2})\s+(\d{4})/gi;
  while ((m = reSuelta.exec(texto))) {
    const fecha = iso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (fecha) halladas.push({ iso: fecha, index: m.index });
  }
  return halladas;
}

function venceDe(texto: string, tipo: string) {
  const fechas = fechasDe(texto);
  const marca = /venc|vigenc|v[aá]lid|hasta el|fin de|expira/i;
  const cercana = fechas.find((fecha) => marca.test(texto.slice(Math.max(0, fecha.index - 40), fecha.index)));
  if (cercana) return cercana.iso;
  if (!CADUCA.has(tipo) || fechas.length === 0) return "";
  const hoy = hoyBogota();
  const futuras = fechas.map((f) => f.iso).filter((f) => f >= hoy).sort();
  if (futuras[0]) return futuras[0];
  return fechas.map((f) => f.iso).sort().at(-1) ?? "";
}

function placaDe(texto: string) {
  const compacto = plano(texto).replace(/[^A-Z0-9]/g, "");
  const junto = compacto.match(/PLACA([A-Z]{3}\d{2}[A-Z0-9])/);
  if (junto?.[1] && /^[A-Z]{3}\d{3}$|^[A-Z]{3}\d{2}[A-Z]$/.test(junto[1])) return junto[1];
  const suelta = plano(texto).match(/(?:^|[^A-Z0-9])([A-Z]{3}\d{3}|[A-Z]{3}\d{2}[A-Z])(?![A-Z0-9])/);
  return suelta?.[1] ?? "";
}

function numeroCc(crudo: string) {
  const n = crudo.replace(/\D/g, "");
  if (n.length < 6 || n.length > 10 || n.startsWith("3")) return "";
  return n;
}

function ccDe(texto: string) {
  const nuip = texto.match(/\bNUIP\b[^\d]{0,12}(\d{1,3}(?:\.\d{3}){1,3}|\d{6,11})/i);
  const deNuip = numeroCc(nuip?.[1] ?? "");
  if (deNuip) return deNuip;
  const punteado = texto.match(/\b(\d{1,3}(?:\.\d{3}){1,3})\b/);
  const dePuntos = numeroCc(punteado?.[1] ?? "");
  if (dePuntos) return dePuntos;
  const zona = texto.match(/(?:c\.?\s*c\.?|c[eé]dula|identificaci[oó]n|n[uú]mero|no\.?)[^\d]{0,80}(\d[\d.\s]{5,16}\d)/i);
  return numeroCc(zona?.[1] ?? "");
}

function telefonoDe(texto: string) {
  const zona = texto.match(/(?:celular|tel[eé]fono|m[oó]vil|whatsapp)[^\d]{0,16}(3\d{9})/i);
  if (zona?.[1]) return zona[1];
  const suelto = texto.match(/\b(3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})\b/);
  const n = (suelto?.[1] ?? "").replace(/\D/g, "");
  return n.length === 10 ? n : "";
}

function correoDe(texto: string) {
  const hallado = texto.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return hallado?.[0].toLowerCase() ?? "";
}

function valorDe(texto: string, etiqueta: RegExp, max = 60) {
  const m = texto.match(etiqueta);
  if (!m || m.index == null) return "";
  const resto = texto.slice(m.index + m[0].length);
  const misma = limpio((resto.split(/\n/)[0] ?? "").replace(/^[\s:.\-]+/, ""));
  const esEtiqueta = /^(apellidos?|nombres?|n[uú]mero|firma|sexo|fecha|c\.?c\.?)$/i.test(misma);
  if (misma.length >= 2 && !esEtiqueta) return misma.slice(0, max);
  const siguientes = resto
    .split(/\n/)
    .slice(1)
    .map((linea) => limpio(linea))
    .filter(Boolean);
  for (const linea of siguientes.slice(0, 3)) {
    if (/^(apellidos?|nombres?|n[uú]mero|firma|sexo|fecha|c\.?c\.?)$/i.test(linea)) continue;
    return linea.slice(0, max);
  }
  return "";
}

function lineaNombre(linea: string) {
  const t = linea.toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ\s]/g, " ").replace(/\s+/g, " ").trim();
  if (t.length < 3) return "";
  if (/^(APELLIDOS?|NOMBRES?|NACIONALIDAD|ESTATURA|SEXO|FECHA|LUGAR|NUIP|FIRMA|NUMERO|SEDE)\b/.test(t)) return "";
  if (/PROPIETARIO|APELLIDO|IDENTIFIC|LICENCIA|TRANSITO|TARJETA|PROPIEDAD|REPUBLICA|COLOMBIA|MINISTERIO|VEHICULO|COMBUSTIBLE|CAPACIDAD|CHASIS|CILINDRAJE/.test(t)) return "";
  if (/REPUBLICA|COLOMBIA|CIUDADANIA|TRANSITO|REGISTRADOR/.test(t)) return "";
  return t;
}

function trasEtiqueta(texto: string, etiqueta: RegExp) {
  const m = texto.match(etiqueta);
  if (!m || m.index == null) return "";
  const lineas = texto.slice(m.index + m[0].length).split(/\n/);
  const misma = lineaNombre(lineas[0] ?? "");
  if (misma) return misma;
  for (const linea of lineas.slice(1, 5)) {
    const util = lineaNombre(linea);
    if (util) return util;
  }
  return "";
}

function mrzCedula(texto: string) {
  const lineas = texto
    .toUpperCase()
    .split(/\n/)
    .map((linea) => linea.replace(/[^A-Z0-9<]/g, ""))
    .filter((linea) => linea.length >= 15);
  const datos = lineas.find((linea) => /COL\d{6,10}/.test(linea));
  const cc = datos?.match(/COL(\d{6,10})/)?.[1] ?? "";
  const nombreLinea = lineas.find((linea) => /^[A-Z]{2,}</.test(linea) && linea.includes("<<") && !linea.startsWith("IC") && !/COL\d{6}/.test(linea));
  let nombre = "";
  if (nombreLinea) {
    const [apellidos, nombres] = nombreLinea.replace(/<+$/, "").split("<<");
    nombre = [apellidos, nombres]
      .filter(Boolean)
      .map((parte) => parte.replace(/</g, " ").replace(/\s+/g, " ").trim())
      .filter((parte) => parte.length > 1)
      .join(" ");
  }
  return { cc, nombre };
}

function filaVehiculo(texto: string) {
  const vacio = { placa: "", marca: "", linea: "", modelo: "" };
  const candidatos: { placa: string; marca: string; linea: string; modelo: string; peso: number }[] = [];
  for (const cruda of texto.toUpperCase().split(/\n/)) {
    const linea = cruda.replace(/[^A-Z0-9ÁÉÍÓÚÑ\s]/g, " ").replace(/\s+/g, " ").trim();
    const m = linea.match(/\b([A-Z]{3}\d{3}|[A-Z]{3}\d{2}[A-Z])\b\s+([A-Z]{2,12})(?:\s+(.+))?/);
    if (!m) continue;
    const cola = (m[3] ?? "").trim();
    if (/^(TAXI|PUBLICO|PÚBLICO)\b/.test(m[2]) || /^(TAXI|PUBLICO|PÚBLICO)\b/.test(cola)) {
      candidatos.push({ placa: m[1], marca: "", linea: "", modelo: "", peso: 1 });
      continue;
    }
    const modelo = cola.match(/\b(19|20)\d{2}\b/)?.[0] ?? "";
    const resto = cola.replace(modelo, "").replace(/\s+/g, " ").trim();
    const marcaRuido = /^(TAXI|PUBLICO|CLASE|PLACA|MARCA|LINEA|MODELO)$/.test(m[2]);
    const marca = marcaRuido ? "" : m[2];
    const peso = (modelo ? 2 : 0) + (marca ? 2 : 0) + (resto ? 1 : 0);
    candidatos.push({ placa: m[1], marca, linea: resto, modelo, peso });
  }
  candidatos.sort((a, b) => b.peso - a.peso);
  return candidatos[0] ?? vacio;
}

function propietarioDe(texto: string) {
  const marca = texto.match(/propietario/i);
  if (!marca || marca.index == null) return "";
  for (const linea of texto.slice(marca.index).split(/\n/).slice(0, 5)) {
    if (/PROPIETARIO|APELLIDO/i.test(linea)) continue;
    let t = linea.toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ\s]/g, " ").replace(/\s+/g, " ").trim();
    if (/LICENCIA|TRANSITO|TARJETA|PROPIEDAD|REPUBLICA|COLOMBIA|MINISTERIO|VEHICULO|COMBUSTIBLE|CAPACIDAD|CHASIS|CILINDRAJE|PLACA|MARCA|MODELO/.test(t)) continue;
    t = t.replace(/\b(CC|IDENTIFICACION)\b.*$/, "").replace(/\s+Y\s*$/, "").trim();
    const palabras = t.split(" ").filter((parte) => parte.length > 1 && parte !== "CC");
    if (palabras.length >= 2) return palabras.join(" ");
  }
  return "";
}

function nombreDe(texto: string) {
  const apellidos = trasEtiqueta(texto, /\bapellidos?\b/i);
  const nombres = trasEtiqueta(texto, /\bnombres?\b/i);
  const junto = [apellidos, nombres].filter((parte) => parte.length >= 3).join(" ");
  if (junto.length >= 5) return junto;
  return "";
}

function pieza(texto: string, etiqueta: RegExp, max = 28) {
  const lineas = texto.split(/\n/).map((linea) => linea.trim()).filter(Boolean);
  const ruido = /^(de|del|la|el|no|nro|numero|n[uú]mero|placa|marca|l[ií]nea|modelo|clase|servicio|color|tipo)$/i;
  for (let i = 0; i < lineas.length; i += 1) {
    const marca = lineas[i].match(etiqueta);
    if (!marca || marca.index == null) continue;
    const resto = lineas[i].slice(marca.index + marca[0].length).replace(/^[\s:.\-#]+/, "").trim();
    if (resto.length >= 2 && !ruido.test(resto)) return resto.toUpperCase().slice(0, max);
    for (const siguiente of lineas.slice(i + 1, i + 3)) {
      if (ruido.test(siguiente) || etiqueta.test(siguiente)) continue;
      if (siguiente.length >= 2) return siguiente.toUpperCase().slice(0, max);
    }
  }
  return "";
}

function codigoDe(texto: string, etiqueta: RegExp) {
  const zona = pieza(texto, etiqueta, 28);
  const codigo = zona.toUpperCase().match(/[A-Z0-9][A-Z0-9\-]{5,22}/)?.[0] ?? "";
  if (codigo && !/^(19|20)\d{2}$/.test(codigo)) return codigo;
  return "";
}

function capacidadDe(texto: string) {
  const base = texto.toUpperCase();
  const patrones = [/\bPAS\b[^\d]{0,6}(\d{1,2})(?!\d)/, /CAPACIDAD[^\d]{0,30}(\d{1,2})(?!\d)/, /PSJ[^\d]{0,12}(\d{1,2})(?!\d)/];
  for (const patron of patrones) {
    const n = Number(base.match(patron)?.[1] ?? 0);
    if (n >= 1 && n <= 15) return String(n);
  }
  return "";
}

function empresaDe(texto: string) {
  const hallada = valorDe(texto, /(?:raz[oó]n social|empresa(?:\s+de\s+transporte|\s+afiliadora)?)\b/i, 80);
  if (hallada.length < 3) return "";
  return hallada.replace(/\b(nit|placa|n[uú]mero).*/i, "").trim().toUpperCase();
}

function saltarEtiqueta(linea: string) {
  const t = linea.replace(/^[\s:.\-#/°º]+/, "").trim();
  if (t.length < 2) return true;
  return /^(de|del|la|el|no|nro|n[uú]mero|numero|n[°º]\.?|tipo|de vehiculo|del vehiculo)$/i.test(t);
}

function lineaSiguiente(lineas: string[], etiqueta: RegExp) {
  for (let i = 0; i < lineas.length; i += 1) {
    const marca = lineas[i].match(etiqueta);
    if (!marca || marca.index == null) continue;
    const resto = lineas[i].slice(marca.index + marca[0].length).replace(/^[\s:.\-#/°º]+/, "").trim();
    if (resto.length >= 1 && !saltarEtiqueta(resto)) return resto;
    for (let j = i + 1; j < Math.min(lineas.length, i + 5); j += 1) {
      const siguiente = lineas[j].trim();
      if (saltarEtiqueta(siguiente)) continue;
      if (etiqueta.test(siguiente) && siguiente.length < 32) continue;
      return siguiente;
    }
  }
  return "";
}

function codigo(crudo: string) {
  const compacto = crudo.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compacto.length >= 5 && compacto.length <= 22 && !/^(19|20)\d{2}$/.test(compacto) && !/^(MOTOR|CHASIS|SERIE|VIN|NUMERO)$/.test(compacto)) return compacto;
  return "";
}

function placaLeida(crudo: string, texto: string) {
  const compacto = crudo.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const directa = compacto.match(/[A-Z]{3}\d{3}|[A-Z]{3}\d{2}[A-Z]/)?.[0] ?? "";
  return directa || placaDe(texto);
}

function marcaEn(crudo: string, texto: string) {
  const zona = acercar(crudo, MARCAS);
  if (zona && MARCAS.includes(zona)) return zona;
  const base = texto.toUpperCase();
  return MARCAS.find((marca) => marca.length >= 3 && new RegExp(`\\b${marca}\\b`).test(base)) ?? (zona.length >= 3 ? zona : "");
}

function lineaEn(crudo: string, marca: string) {
  const lista = marca && LINEAS[marca]?.length ? LINEAS[marca] : [...new Set(Object.values(LINEAS).flat())];
  const limpia = crudo.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!limpia || /MARCA|MODELO|CLASE|COMBUSTIBLE|CAPACIDAD|VEHICULO|CARROCER|CILINDR/.test(limpia)) return "";
  const hit = [...lista]
    .sort((a, b) => b.length - a.length)
    .find((item) => {
      const a = limpia.replace(/\s+/g, "");
      const b = item.replace(/\s+/g, "");
      return a.includes(b) || (a.length >= 4 && b.includes(a));
    });
  if (hit && limpia.replace(/\s+/g, "").startsWith(hit.replace(/\s+/g, "")) && limpia.length > hit.length + 1) return limpia.slice(0, 28);
  return (hit || (/^[A-Z0-9][A-Z0-9 ]{1,26}$/.test(limpia) ? limpia : "")).slice(0, 28);
}

function claseEn(crudo: string) {
  const t = crudo.toUpperCase();
  if (/CAMIONETA/.test(t)) return "CAMIONETA";
  if (/CAMPERO/.test(t)) return "CAMPERO";
  if (/\bAUTO/.test(t)) return "AUTOMOVIL";
  return "";
}

function carroceriaEn(crudo: string) {
  const t = crudo.toUpperCase().replace(/\s+/g, "");
  if (/HATCH/.test(t)) return "HATCHBACK";
  if (/STATION|VAGON|WAGON/.test(t)) return "STATION WAGON";
  if (/COUPE|CUP[EÉ]/.test(t)) return "COUPE";
  if (/SEDAN|SEDÁN/.test(t)) return "SEDAN";
  if (/\bVAN\b/.test(crudo.toUpperCase())) return "VAN";
  if (/CAMIONETA/.test(t)) return "CAMIONETA";
  return "";
}

function combustibleEn(crudo: string) {
  const pegado = crudo.toUpperCase().replace(/[^A-Z]/g, "");
  if (/GASGASOL|GASYGAS/.test(pegado)) return "GASOLINA Y GAS";
  const t = crudo.toUpperCase();
  if (/EL[EÉ]CTR/.test(t)) return "ELECTRICO";
  if (/H[IÍ]BRID/.test(t)) return "HIBRIDO";
  if (/GASOLINA/.test(t) && /\bGAS\b/.test(t.replace("GASOLINA", ""))) return "GASOLINA Y GAS";
  if (/DIESEL|ACPM/.test(t)) return "DIESEL";
  if (/GAS NATURAL|\bGNV\b/.test(t)) return "GAS NATURAL";
  if (/GASOLINA/.test(t)) return "GASOLINA";
  return "";
}

function cilindrajeDe(crudo: string) {
  const compacto = crudo.replace(/\s/g, "");
  const miles = compacto.match(/(\d)\.(\d{3})(?!\d)/);
  if (miles) {
    const n = Number(`${miles[1]}${miles[2]}`);
    if (n >= 50 && n <= 8000) return String(n);
  }
  const n = compacto.replace(/\./g, "").match(/\d{3,4}/)?.[0] ?? "";
  return n && Number(n) >= 50 && Number(n) <= 8000 ? n : "";
}

function servicioEn(crudo: string) {
  const t = crudo.toUpperCase();
  if (/P[UÚ]BLIC|TAXI/.test(t)) return "PUBLICO";
  if (/PARTICULAR/.test(t)) return "PARTICULAR";
  if (/OFICIAL/.test(t)) return "OFICIAL";
  if (/DIPLOM/.test(t)) return "DIPLOMATICO";
  return "";
}

function motorValido(crudo: string) {
  const c = crudo.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z][A-Z0-9]{5,17}$/.test(c)) return "";
  if (!/\d/.test(c)) return "";
  if (/GASOLINA|DIESEL|PUBLICO|MARCA|MOTOR|CHASIS|SERIE|HATCH|AUTOMOVIL/.test(c)) return "";
  return c;
}

function vinEn(texto: string) {
  return texto.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/)?.[0] ?? "";
}

function nitEn(texto: string) {
  const marca = texto.match(/\bN\.?\s*I\.?\s*T\.?\b[^\d]{0,20}(\d{1,3}(?:[.\s]\d{3}){2}|\d{9,10})(?:\s*-\s*\d)?/i);
  const n = (marca?.[1] ?? "").replace(/\D/g, "");
  if (n.length === 9 || n.length === 10) return n;
  return "";
}

const FILA_CAMPO: [string, RegExp][] = [
  ["cilindraje", /cilindrad/i],
  ["carroceria", /carrocer/i],
  ["combustible", /combustible/i],
  ["capacidad", /capacidad|pasajeros/i],
  ["empresa", /raz[oó]n social/i],
  ["propietario", /propietario/i],
  ["cc", /identificaci[oó]n/i],
  ["motor", /\bmotor\b/i],
  ["chasis", /\bchasis\b/i],
  ["serie", /\bserie\b/i],
  ["servicio", /\bservicio\b/i],
  ["modelo", /\bmodelo\b/i],
  ["marca", /\bmarca\b/i],
  ["linea", /\bl[ií]nea\b/i],
  ["placa", /\bplaca\b/i],
  ["clase", /\bclase\b/i],
  ["color", /\bcolor\b/i],
  ["vin", /\bvin\b/i],
];

function etiquetasDe(linea: string) {
  return FILA_CAMPO.map(([key, regla]) => {
    const m = linea.match(regla);
    return m && m.index != null ? { key, index: m.index } : null;
  })
    .filter((item): item is { key: string; index: number } => Boolean(item))
    .sort((a, b) => a.index - b.index)
    .filter((item, i, lista) => lista.findIndex((otro) => otro.key === item.key) === i);
}

function esFilaDeTitulos(linea: string) {
  const tags = etiquetasDe(linea);
  if (!tags.length) return false;
  const sobra = linea
    .replace(/n[uú]mero de (motor|serie|chasis|vin)/gi, " ")
    .replace(/clase de veh[ií]culo/gi, " ")
    .replace(/tipo de carrocer[ií]a/gi, " ")
    .replace(/capacidad\s*kg\s*\/?\s*psj/gi, " ")
    .replace(/cilindrada(?:\s*cc)?/gi, " ")
    .replace(/raz[oó]n social/gi, " ")
    .replace(/apellido\(?s?\)?\s*y\s*nombre\(?s?\)?/gi, " ")
    .replace(/\b(placa|marca|l[ií]nea|modelo|color|servicio|clase|carrocer[ií]a|combustible|capacidad|vin|serie|chasis|motor|reg|propietario|identificaci[oó]n|única|unico)\b/gi, " ")
    .replace(/[^A-Za-z0-9]/g, "");
  return sobra.length <= 10;
}

function cortar(tag: string, resto: string) {
  const t = resto.replace(/\s+/g, " ").trim();
  if (tag === "placa") {
    const m = t.match(/^([A-Z]{3}\d{3}|[A-Z]{3}\d{2}[A-Z])\b\s*/i);
    if (m) return { valor: m[1].toUpperCase(), resto: t.slice(m[0].length) };
  }
  if (tag === "marca") {
    const hit = MARCAS.find((marca) => new RegExp(`^${marca}\\b`, "i").test(t));
    if (hit) return { valor: hit, resto: t.slice(hit.length).trimStart() };
  }
  if (tag === "linea") {
    const corte = t.search(/\s+(?:19|20)\d{2}\b/);
    if (corte > 0) return { valor: t.slice(0, corte).trim(), resto: t.slice(corte).trim() };
    return { valor: t, resto: "" };
  }
  if (tag === "modelo") {
    const m = t.match(/^(19|20)\d{2}\b\s*/);
    if (m) return { valor: m[0].trim(), resto: t.slice(m[0].length) };
  }
  if (tag === "cilindraje") {
    const m = t.match(/^(\d{3,5})\b\s*/);
    if (m && Number(m[1]) >= 50 && Number(m[1]) <= 8000) return { valor: m[1], resto: t.slice(m[0].length) };
  }
  if (tag === "color") {
    const m = t.match(/^([A-ZÁÉÍÓÚÑ]{3,14})\b\s*/i);
    if (m) return { valor: m[1].toUpperCase(), resto: t.slice(m[0].length) };
  }
  if (tag === "servicio") {
    const m = t.match(/^(P[UÚ]BLICO|PARTICULAR|OFICIAL|DIPLOM[AÁ]TICO|TAXI(?:\s+P[UÚ]BLICO)?)\b\s*/i);
    if (m) return { valor: m[1], resto: t.slice(m[0].length) };
  }
  if (tag === "clase") {
    const m = t.match(/^(AUTOM[OÓ]VIL|CAMIONETA|CAMPERO)\b\s*/i);
    if (m) return { valor: m[1], resto: t.slice(m[0].length) };
  }
  if (tag === "carroceria") {
    const m = t.match(/^(HATCH\s*BACK|HATCHBACK|SED[AÁ]N|STATION\s*WAGON|COUPE|CAMIONETA|VAN)\b\s*/i);
    if (m) return { valor: m[1], resto: t.slice(m[0].length) };
  }
  if (tag === "combustible") {
    const m = t.match(/^(GASOLINA(?:\s+Y\s+GAS)?|DIESEL|ACPM|GAS\s+NATURAL|GNV|EL[EÉ]CTRICO|H[IÍ]BRIDO)\b\s*/i);
    if (m) return { valor: m[1], resto: t.slice(m[0].length) };
  }
  if (tag === "capacidad") {
    const m = t.match(/^(\d{1,2})\b\s*/);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 15) return { valor: m[1], resto: t.slice(m[0].length) };
  }
  if (tag === "motor") {
    const m = t.match(/^([A-Z0-9]{6,18})\b\s*/i);
    if (m) return { valor: m[1].toUpperCase(), resto: t.slice(m[0].length) };
  }
  if (tag === "vin" || tag === "chasis") {
    const m = t.match(/^(?:[A-Z]\s+)?([A-HJ-NPR-Z0-9]{17})\b\s*/i);
    if (m) return { valor: m[1].toUpperCase(), resto: t.slice(m[0].length) };
  }
  if (tag === "serie") {
    if (/^\*|^per\b/i.test(t)) return { valor: "", resto: t.replace(/^\S+\s*/, "") };
    const m = t.match(/^([A-Z0-9]{6,20})\b\s*/i);
    if (m) return { valor: m[1].toUpperCase(), resto: t.slice(m[0].length) };
    return { valor: "", resto: t };
  }
  if (tag === "propietario") {
    const corte = t.split(/\bC\.?\s*C\.?\b|IDENTIFICACI/i)[0] ?? t;
    return { valor: corte.replace(/\s+\bo$/i, "").trim(), resto: t.slice(corte.length) };
  }
  if (tag === "cc") {
    const m = t.match(/(\d{1,3}(?:\.\d{3}){1,3}|\d{6,11})/);
    return { valor: m?.[1] ?? "", resto: "" };
  }
  if (tag === "empresa") return { valor: t.replace(/[—\-_|]+/g, " ").replace(/\s+/g, " ").trim(), resto: "" };
  return { valor: "", resto: t };
}

function camposLicencia(texto: string) {
  const lineas = texto.split(/\n/).map((linea) => linea.trim()).filter(Boolean);
  const tomados: Record<string, string> = {};
  for (let i = 0; i < lineas.length; i += 1) {
    if (!esFilaDeTitulos(lineas[i])) continue;
    const tags = etiquetasDe(lineas[i]).map((item) => item.key);
    let j = i + 1;
    while (j < lineas.length && /^[\s—\-_|.*]+$/.test(lineas[j])) j += 1;
    const valores = (lineas[j] ?? "").trim();
    if (!valores || esFilaDeTitulos(valores)) continue;
    let resto = valores;
    for (let n = 0; n < tags.length; n += 1) {
      const tag = tags[n];
      const ultimo = n === tags.length - 1;
      const corte = ultimo && tag !== "vin" && tag !== "chasis" && tag !== "cc" ? { valor: resto, resto: "" } : cortar(tag, resto);
      if (corte.valor && !tomados[tag]) tomados[tag] = corte.valor;
      resto = corte.resto.trim();
      if (!resto) break;
    }
  }
  const placa = placaLeida(tomados.placa ?? "", texto);
  const marca = marcaEn(tomados.marca ?? "", texto);
  const linea = lineaEn(tomados.linea ?? "", marca);
  const modeloDirecto = (tomados.modelo || "").match(/\b(19|20)\d{2}\b/)?.[0] ?? "";
  const modelo = modeloDirecto || texto.match(/\bmodelo\b[^\d]{0,24}((?:19|20)\d{2})/i)?.[1] || "";
  const motor = motorValido(tomados.motor ?? "") || motorValido(codigo(lineaSiguiente(lineas, /motor\b/i)));
  const vin = vinEn(tomados.vin || tomados.chasis || texto);
  const serie = vin || motorValido(tomados.serie ?? "");
  const cilindraje = cilindrajeDe(tomados.cilindraje ?? "") || cilindrajeDe(texto.match(/cilindrad[ao][^\d]{0,16}(\d(?:\.\d{3})|\d{3,4})/i)?.[1] ?? "");
  const clase = claseEn(tomados.clase ?? "");
  const carroceria = carroceriaEn(tomados.carroceria ?? "");
  const combustible = combustibleEn(tomados.combustible ?? "") || combustibleEn(texto);
  const servicio = servicioEn(tomados.servicio ?? "");
  const capacidad = (tomados.capacidad ?? "").match(/\d{1,2}/)?.[0] ?? "";
  const cc = numeroCc(tomados.cc ?? "") || ccDe(texto);
  const nombre = usable(tomados.propietario || propietarioDe(texto) || nombreDe(texto), 8);
  const empresa = acercarEmpresa(tomados.empresa || empresaDe(texto));
  return {
    placa,
    marca: (MARCAS as readonly string[]).includes(marca) ? marca : "",
    linea,
    modelo,
    motor,
    serie,
    chasis: vin,
    cilindraje: cilindraje && Number(cilindraje) >= 50 && Number(cilindraje) <= 8000 ? cilindraje : "",
    clase,
    carroceria,
    combustible,
    servicio,
    capacidad: capacidad && Number(capacidad) >= 1 && Number(capacidad) <= 15 ? capacidad : "",
    cc,
    nombre,
    nit: nitEn(texto),
    empresa,
  };
}

export function ladoSugerido(claves: string[], usados: Set<string>, preferido = "") {
  const tiene = (...nombres: string[]) => nombres.some((nombre) => claves.includes(nombre));
  const propiedad = tiene("marca", "serie", "cilindraje", "carroceria", "clase") || (tiene("placa") && tiene("linea"));
  const libre = (lado: string) => !usados.has(lado);
  if (propiedad) {
    if (libre("tarjeta_propiedad_frente")) return "tarjeta_propiedad_frente";
    if (libre("tarjeta_propiedad_reverso")) return "tarjeta_propiedad_reverso";
  }
  if (tiene("cc", "nombre") && !propiedad) {
    if (libre("cedula_frente")) return "cedula_frente";
    if (libre("cedula_reverso")) return "cedula_reverso";
  }
  if (tiene("empresa") && !propiedad && libre("tarjeta_operacion")) return "tarjeta_operacion";
  if (preferido && libre(preferido)) return preferido;
  return "";
}

const DE_LA_TARJETA = ["marca", "linea", "modelo", "clase", "carroceria", "motor", "serie", "cilindraje", "capacidad", "servicio"];
const NO_DE_OPERACION = ["motor", "serie", "marca", "linea", "modelo", "cilindraje", "clase", "carroceria", "nombre"];

export function mezclarLectura(
  actual: Partial<Record<CampoLeido["key"], string>>,
  lectura: Pick<LecturaDoc, "campos" | "extra"> & { datos?: LecturaDoc["datos"] },
  tipo: string,
) {
  const datos: Partial<Record<CampoLeido["key"], string>> = { ...(lectura.datos ?? {}) };
  if (!Object.values(datos).some((valor) => String(valor ?? "").trim())) {
    for (const campo of lectura.campos) datos[campo.key] = campo.leido;
  }
  const deTarjeta = tipo.startsWith("tarjeta_propiedad");
  const deOperacion = tipo === "tarjeta_operacion" || tipo.startsWith("tarjeta_operacion");
  const valores: Partial<Record<CampoLeido["key"], string>> = { ...actual };
  const etiquetas: string[] = [];
  const choques: CampoLeido[] = [];
  for (const key of Object.keys(ETIQUETAS) as CampoLeido["key"][]) {
    if (key === "telefono") continue;
    const nuevo = String(datos[key] ?? "").trim();
    if (!nuevo) continue;
    if (deOperacion && NO_DE_OPERACION.includes(key)) continue;
    const previo = String(valores[key] ?? "").trim();
    const ccMejor = key === "cc" && nuevo.replace(/\D/g, "").length > previo.replace(/\D/g, "").length;
    const nombreMejor = key === "nombre" && nuevo.length > previo.length;
    const tarjetaMejor = deTarjeta && DE_LA_TARJETA.includes(key);
    const empresaMejor = key === "empresa" && deOperacion;
    if (!previo || ccMejor || nombreMejor || tarjetaMejor || empresaMejor) {
      if (previo !== nuevo) etiquetas.push(ETIQUETAS[key]);
      valores[key] = nuevo;
    } else if (previo !== nuevo) choques.push({ key, label: ETIQUETAS[key], actual: previo, leido: nuevo });
  }
  return { valores, etiquetas, choques, extra: { ...(lectura.extra ?? {}) } };
}

function usable(value: string, palabras: number) {
  const limpioValor = value.replace(/\s+/g, " ").trim();
  if (!limpioValor || limpioValor.split(" ").length > palabras) return "";
  return limpioValor;
}

function igual(a: string, b: string) {
  return plano(a).replace(/[^A-Z0-9@]/g, "") === plano(b).replace(/[^A-Z0-9@]/g, "");
}

export function analizarTexto(
  tipo: string,
  texto: string,
  actual: Partial<Record<CampoLeido["key"], string>>,
): LecturaDoc {
  const base = texto.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  const clase = tipo.startsWith("cedula") ? "cedula" : tipo.startsWith("tarjeta_propiedad") ? "tarjeta_propiedad" : tipo;
  if (base.length < 12) {
    const esFoto = /cedula|tarjeta|foto|soat|tecno|poliza|comprobante/.test(tipo);
    return {
      vigencia: "sin_fecha",
      vence: "",
      aviso: esFoto
        ? "Lo subí, pero no alcancé a leer la foto. Tómala derecha, con luz, y que se vea todo el documento."
        : "Lo subí, pero no alcancé a leerlo. Si el PDF es un escaneo, súbelo en foto.",
      campos: [],
      datos: {},
      extra: {},
    };
  }
  const contrato = tipo === "contrato" || tipo === "unificado" ? contratoDesdeTexto(base) : null;
  const mrz = mrzCedula(base);
  const carro = filaVehiculo(base);
  const licencia = camposLicencia(base);
  const primero = (...valores: string[]) => valores.find((valor) => valor.trim()) ?? "";
  const leido: Partial<Record<CampoLeido["key"], string>> = {
    placa: primero(contrato?.placa || "", licencia.placa, carro.placa, placaDe(base)),
    cc: primero(contrato?.cc || "", licencia.cc, mrz.cc, ccDe(base)),
    nombre: usable(primero(contrato?.nombre || "", licencia.nombre, mrz.nombre, propietarioDe(base), nombreDe(base)), 8),
    telefono: contrato?.telefono || telefonoDe(base),
    direccion: usable(contrato?.direccion || valorDe(base, /direcci[oó]n\b/i, 120), 14),
    correo: contrato?.correo || correoDe(base),
    marca: (MARCAS as readonly string[]).includes(primero(contrato?.marca || "", licencia.marca)) ? primero(contrato?.marca || "", licencia.marca) : "",
    linea: lineaEn(primero(contrato?.linea || "", licencia.linea), primero(contrato?.marca || "", licencia.marca)),
    modelo: primero(contrato?.modelo || "", licencia.modelo),
    empresa: licencia.empresa || acercarEmpresa(empresaDe(base)),
    capacidad: primero(licencia.capacidad, capacidadDe(base)),
    clase: claseEn(licencia.clase),
    carroceria: carroceriaEn(licencia.carroceria),
    motor: motorValido(primero(licencia.motor, "")),
    serie: vinEn(primero(licencia.serie, licencia.chasis, base)) || motorValido(licencia.serie),
    cilindraje: licencia.cilindraje,
    servicio: servicioEn(licencia.servicio),
  };
  const combustible = licencia.combustible;
  const datos: Partial<Record<CampoLeido["key"], string>> = {};
  for (const key of Object.keys(ETIQUETAS) as CampoLeido["key"][]) {
    if (leido[key]) datos[key] = leido[key];
  }
  const campos = (Object.keys(ETIQUETAS) as CampoLeido["key"][])
    .filter((key) => leido[key])
    .filter((key) => !igual(actual[key] ?? "", leido[key] ?? ""))
    .map((key) => ({ key, label: ETIQUETAS[key], actual: actual[key] ?? "", leido: leido[key] ?? "" }));
  const vence = venceDe(base, clase);
  const hoy = hoyBogota();
  const vigencia = !vence ? "sin_fecha" : vence >= hoy ? "vigente" : "vencido";
  const aviso =
    vigencia === "vencido"
      ? `Está vencido desde el ${mostrar(vence)}. No lo uses para el trámite hasta renovarlo.`
      : vigencia === "vigente"
        ? `Está vigente hasta el ${mostrar(vence)}.`
        : campos.length
          ? "Leí datos que no coinciden con el proceso. Confirma cada uno."
          : "Lo leí. No encontré una fecha de vencimiento ni datos distintos a los del proceso.";
  const extra: Record<string, string> = {};
  if (combustible) extra.combustible = combustible;
  if (licencia.chasis) extra.chasis = licencia.chasis;
  if (licencia.nit) extra.nitAnterior = licencia.nit;
  Object.assign(extra, polizaEn(base));
  return { vigencia, vence: mostrar(vence), aviso, campos, datos, extra };
}

const ASEGURADORAS: [RegExp, string][] = [
  [/MUNDIAL/, "COMPAÑIA MUNDIAL DE SEGUROS S.A."],
  [/SURA/, "SEGUROS SURA"],
  [/BOL[IÍ]VAR/, "SEGUROS BOLIVAR"],
  [/ALLIANZ/, "ALLIANZ"],
  [/AXA/, "AXA COLPATRIA"],
  [/MAPFRE/, "MAPFRE"],
  [/PREVISORA/, "PREVISORA"],
  [/EQUIDAD/, "LA EQUIDAD"],
  [/SOLIDARIA/, "SOLIDARIA"],
  [/\bHDI\b/, "HDI SEGUROS"],
  [/\bSBS\b/, "SBS SEGUROS"],
  [/CHUBB/, "CHUBB"],
  [/ESTADO/, "SEGUROS DEL ESTADO"],
  [/LIBERTY/, "LIBERTY"],
];

function isoFecha(valor: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (!m) return "";
  const fecha = iso(Number(m[3]), Number(m[2]), Number(m[1]));
  return fecha;
}

export function polizaEn(texto: string) {
  const extra: Record<string, string> = {};
  if (!/p[oó]liza|prima|RCC|RCE|asegurador/i.test(texto)) return extra;
  const planoTexto = texto.toUpperCase();
  for (const [regla, nombre] of ASEGURADORAS) {
    if (regla.test(planoTexto)) {
      extra.aseguradora = nombre;
      break;
    }
  }
  const numero = texto.match(/p[oó]liza(?:\s+n[oº°.]?(?:\s*ro)?)?[^\d]{0,16}(\d{5,12})/i);
  if (numero) extra.numeroPoliza = numero[1];
  const fechas = fechasDe(texto).map((fecha) => fecha.iso).sort();
  if (fechas.length >= 2) {
    extra.inicioPoliza = fechas[0];
    extra.vencePoliza = fechas[fechas.length - 1];
  }
  const valor = texto.match(/(?:prima|valor|total)[^\d]{0,24}(\d{1,3}(?:\.\d{3})+|\d{5,9})/i);
  if (valor) {
    const n = valor[1].replace(/\./g, "");
    if (Number(n) >= 10000 && Number(n) <= 20000000) extra.valorPoliza = n;
  }
  return extra;
}

function nitNueve(crudo: string) {
  const n = crudo.replace(/\D/g, "");
  if (n.length === 9) return n;
  if (n.length === 10) return n.slice(0, 9);
  return "";
}

export function fundirIA(base: LecturaDoc, crudo: Record<string, string>): LecturaDoc {
  const texto = (valor: unknown) => String(valor ?? "").replace(/\s+/g, " ").trim();
  const datos: Partial<Record<CampoLeido["key"], string>> = { ...(base.datos ?? {}) };
  const extra: Record<string, string> = { ...(base.extra ?? {}) };
  const puestos: string[] = [];
  function poner(key: CampoLeido["key"], valor: string) {
    if (!valor || datos[key]) return;
    datos[key] = valor;
    puestos.push(ETIQUETAS[key]);
  }
  const placa = texto(crudo.placa).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z]{3}\d{3}$|^[A-Z]{3}\d{2}[A-Z]$/.test(placa)) poner("placa", placa);
  const cc = numeroCc(texto(crudo.cc));
  if (cc) poner("cc", cc);
  const nombre = usable(texto(crudo.nombre).toUpperCase(), 8);
  if (nombre) poner("nombre", nombre);
  const telefono = texto(crudo.telefono).replace(/\D/g, "");
  if (/^3\d{9}$/.test(telefono)) poner("telefono", telefono);
  const direccion = usable(texto(crudo.direccion), 14);
  if (direccion) poner("direccion", direccion);
  const correo = texto(crudo.correo).toLowerCase();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) poner("correo", correo);
  const marca = marcaEn(texto(crudo.marca), texto(crudo.marca));
  if ((MARCAS as readonly string[]).includes(marca)) poner("marca", marca);
  const linea = lineaEn(texto(crudo.linea), marca || datos.marca || "");
  if (linea) poner("linea", linea);
  const modelo = texto(crudo.modelo).match(/\b(19|20)\d{2}\b/)?.[0] ?? "";
  if (modelo) poner("modelo", modelo);
  const empresa = acercarEmpresa(texto(crudo.empresa));
  if (empresa) poner("empresa", empresa);
  const capacidad = texto(crudo.capacidad).match(/\d{1,2}/)?.[0] ?? "";
  if (capacidad && Number(capacidad) >= 1 && Number(capacidad) <= 15) poner("capacidad", capacidad);
  const clase = claseEn(texto(crudo.clase));
  if (clase) poner("clase", clase);
  const carroceria = carroceriaEn(texto(crudo.carroceria));
  if (carroceria) poner("carroceria", carroceria);
  const motor = motorValido(texto(crudo.motor));
  if (motor) poner("motor", motor);
  const serie = vinEn(texto(crudo.serie) || texto(crudo.chasis)) || motorValido(texto(crudo.serie));
  if (serie) poner("serie", serie);
  const cilindraje = cilindrajeDe(texto(crudo.cilindraje));
  if (cilindraje) poner("cilindraje", cilindraje);
  const servicio = servicioEn(texto(crudo.servicio));
  if (servicio) poner("servicio", servicio);
  const combustible = combustibleEn(texto(crudo.combustible));
  if (combustible && !extra.combustible) extra.combustible = combustible;
  const chasis = vinEn(texto(crudo.chasis) || texto(crudo.serie));
  if (chasis && !extra.chasis) extra.chasis = chasis;
  const nit = nitNueve(texto(crudo.nit));
  if (nit && !extra.nitAnterior) extra.nitAnterior = nit;
  const aseguradora = texto(crudo.aseguradora).toUpperCase();
  if (aseguradora.length >= 3 && aseguradora.length <= 80 && !extra.aseguradora) extra.aseguradora = aseguradora;
  const numeroPoliza = texto(crudo.poliza || crudo.numeroPoliza).replace(/\D/g, "");
  if (numeroPoliza.length >= 5 && numeroPoliza.length <= 12 && !extra.numeroPoliza) extra.numeroPoliza = numeroPoliza;
  const inicioPoliza = isoFecha(texto(crudo.inicioPoliza));
  if (inicioPoliza && !extra.inicioPoliza) extra.inicioPoliza = inicioPoliza;
  const vencePoliza = isoFecha(texto(crudo.vencePoliza));
  if (vencePoliza && !extra.vencePoliza) extra.vencePoliza = vencePoliza;
  const valorPoliza = texto(crudo.valorPoliza).replace(/\D/g, "");
  if (valorPoliza && Number(valorPoliza) >= 10000 && Number(valorPoliza) <= 20000000 && !extra.valorPoliza) extra.valorPoliza = valorPoliza;
  const alerta = texto(crudo.alerta);
  let aviso = base.aviso;
  if (alerta && !/^(ninguna|no|ok|sin alerta|n\/a)$/i.test(alerta)) aviso = `${alerta} ${aviso}`.trim();
  if (puestos.length && /no alcanc[eé] a leer|no encontr[eé]|Lo le[ií]/i.test(base.aviso)) {
    aviso = `Leí ${puestos.join(", ")}.${alerta && !/^(ninguna|no|ok|sin alerta|n\/a)$/i.test(alerta) ? ` ${alerta}` : ""}`.trim();
  }
  const campos = (Object.keys(ETIQUETAS) as CampoLeido["key"][])
    .filter((key) => datos[key])
    .map((key) => ({ key, label: ETIQUETAS[key], actual: "", leido: datos[key] ?? "" }));
  return { ...base, aviso, datos, extra, campos };
}

export const LADOS = [
  "cedula_frente",
  "cedula_reverso",
  "tarjeta_propiedad_frente",
  "tarjeta_propiedad_reverso",
  "tarjeta_operacion",
] as const;

export type Lado = (typeof LADOS)[number];

const PESOS: Record<Lado, [RegExp, number][]> = {
  cedula_frente: [
    [/CEDULA DE CIUDADAN/, 6],
    [/NUIP/, 4],
    [/REPUBLICA DE COLOMBIA/, 2],
    [/APELLIDOS/, 2],
    [/NACIONALIDAD/, 2],
  ],
  cedula_reverso: [
    [/FECHA DE NACIMIENTO/, 5],
    [/ESTATURA/, 4],
    [/GRUPO SANGUINEO|G\.S\./, 4],
    [/INDICE DERECHO/, 5],
    [/LUGAR DE NACIMIENTO/, 3],
    [/FECHA Y LUGAR DE EXPEDICI/, 4],
    [/SEXO/, 2],
  ],
  tarjeta_propiedad_frente: [
    [/LICENCIA DE TRANSITO/, 6],
    [/TARJETA DE PROPIEDAD/, 3],
    [/CLASE DE VEHICULO/, 3],
    [/CILINDRAJE/, 2],
  ],
  tarjeta_propiedad_reverso: [
    [/DATOS DEL PROPIETARIO/, 5],
    [/GRAVAMEN/, 4],
    [/CAPACIDAD/, 3],
    [/CHASIS/, 3],
    [/MOTOR/, 2],
    [/PROPIETARIO/, 2],
  ],
  tarjeta_operacion: [
    [/TARJETA DE OPERACI/, 6],
    [/EMPRESA DE TRANSPORTE/, 3],
    [/RADICADO/, 2],
  ],
};

function puntajeLado(texto: string) {
  const base = plano(texto);
  const salida = {} as Record<Lado, number>;
  for (const lado of LADOS) {
    salida[lado] = PESOS[lado].reduce((suma, [regla, peso]) => suma + (regla.test(base) ? peso : 0), 0);
  }
  return salida;
}

function familiaDe(puntaje: Record<Lado, number>) {
  const cedula = puntaje.cedula_frente + puntaje.cedula_reverso;
  const propiedad = puntaje.tarjeta_propiedad_frente + puntaje.tarjeta_propiedad_reverso;
  const operacion = puntaje.tarjeta_operacion;
  const mayor = Math.max(cedula, propiedad, operacion);
  if (mayor < 3) return "";
  if (mayor === operacion && operacion >= propiedad && operacion >= cedula) return "operacion";
  if (propiedad >= cedula && propiedad === mayor) return "propiedad";
  return "cedula";
}

export function asignarLados(textos: string[], preferido = "") {
  const puntajes = textos.map(puntajeLado);
  const usados = new Set<Lado>();
  const asignados: (Lado | "")[] = textos.map(() => "");
  const orden = textos
    .map((_, indice) => indice)
    .sort((a, b) => Math.max(...LADOS.map((lado) => puntajes[b][lado])) - Math.max(...LADOS.map((lado) => puntajes[a][lado])));
  for (const indice of orden) {
    const mejor = LADOS.map((lado) => [lado, puntajes[indice][lado]] as const)
      .filter((item) => item[1] >= 3 && !usados.has(item[0]))
      .sort((a, b) => b[1] - a[1])[0];
    if (!mejor) continue;
    asignados[indice] = mejor[0];
    usados.add(mejor[0]);
  }
  for (let indice = 0; indice < textos.length; indice++) {
    if (asignados[indice]) continue;
    const familia = familiaDe(puntajes[indice]);
    const lado =
      familia === "cedula"
        ? usados.has("cedula_frente")
          ? "cedula_reverso"
          : "cedula_frente"
        : familia === "propiedad"
          ? usados.has("tarjeta_propiedad_frente")
            ? "tarjeta_propiedad_reverso"
            : "tarjeta_propiedad_frente"
          : familia === "operacion"
            ? "tarjeta_operacion"
            : "";
    if (lado && !usados.has(lado)) {
      asignados[indice] = lado;
      usados.add(lado);
    }
  }
  if (textos.length === 1 && !asignados[0] && (LADOS as readonly string[]).includes(preferido)) asignados[0] = preferido as Lado;
  return asignados;
}
