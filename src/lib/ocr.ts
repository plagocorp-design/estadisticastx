import { hoyBogota } from "@/lib/casos";
import { contratoDesdeTexto } from "@/lib/contrato";

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
  if (n.length < 6 || n.length > 11 || n.startsWith("3")) return "";
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
  if (/PROPIETARIO|APELLIDO|IDENTIFIC/.test(t)) return "";
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
  const valor = valorDe(texto, etiqueta, max).replace(/\s+/g, " ").trim();
  if (valor.length < 2) return "";
  if (/^(de|del|la|el|no|nro|numero)$/i.test(valor)) return "";
  return valor.toUpperCase().slice(0, max);
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
    };
  }
  const contrato = tipo === "contrato" || tipo === "unificado" ? contratoDesdeTexto(base) : null;
  const mrz = mrzCedula(base);
  const carro = filaVehiculo(base);
  const leido: Partial<Record<CampoLeido["key"], string>> = {
    placa: contrato?.placa || carro.placa || placaDe(base),
    cc: contrato?.cc || mrz.cc || ccDe(base),
    nombre: usable(contrato?.nombre || mrz.nombre || propietarioDe(base) || nombreDe(base), 8),
    telefono: contrato?.telefono || telefonoDe(base),
    direccion: usable(contrato?.direccion || valorDe(base, /direcci[oó]n\b/i, 120), 14),
    correo: contrato?.correo || correoDe(base),
    marca: usable((contrato?.marca || carro.marca || valorDe(base, /\bmarca\b/i, 40)).toUpperCase(), 4),
    linea: usable((contrato?.linea || carro.linea || valorDe(base, /\bl[ií]nea\b/i, 40)).toUpperCase(), 6),
    modelo: contrato?.modelo || carro.modelo || (valorDe(base, /\bmodelo\b/i, 20).match(/\b(19|20)\d{2}\b/)?.[0] ?? ""),
    empresa: usable(empresaDe(base), 8),
    capacidad: capacidadDe(base),
    clase: pieza(base, /\bclase\b/i, 20),
    carroceria: pieza(base, /carrocer[ií]a/i, 24),
    motor: pieza(base, /\bmotor\b/i, 24),
    serie: pieza(base, /\b(?:serie|chasis|vin)\b/i, 24),
    cilindraje: (pieza(base, /cilindraje/i, 12).match(/\d{3,5}/)?.[0] ?? ""),
    servicio: pieza(base, /\bservicio\b/i, 16),
  };
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
  return { vigencia, vence: mostrar(vence), aviso, campos };
}
