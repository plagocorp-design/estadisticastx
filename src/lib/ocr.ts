import { hoyBogota } from "@/lib/casos";
import { contratoDesdeTexto } from "@/lib/contrato";

export type CampoLeido = {
  key: "placa" | "cc" | "nombre" | "telefono" | "direccion" | "correo" | "marca" | "linea" | "modelo" | "empresa";
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

function fechasDe(texto: string) {
  const halladas: { iso: string; index: number }[] = [];
  const re = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
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

function nombreDe(texto: string) {
  const apellidos = valorDe(texto, /\bapellidos?\b/i, 40).replace(/\b(c\.?c\.?|cedula|placa|marca).*/i, "").trim();
  const nombres = valorDe(texto, /\bnombres?\b/i, 40).replace(/\b(c\.?c\.?|cedula|placa|marca).*/i, "").trim();
  const junto = [apellidos, nombres].filter((parte) => parte.length >= 3 && !/republica|colombia|ciudadania|transito/i.test(parte)).join(" ");
  if (junto.length >= 5) return junto.toUpperCase();
  const directo = valorDe(texto, /(?:propietario|a nombre de)\b/i, 80);
  if (directo.length >= 5 && /[A-Za-zÁÉÍÓÚÑ]/.test(directo)) return directo.toUpperCase();
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
    return {
      vigencia: "sin_fecha",
      vence: "",
      aviso: "Lo subí, pero no alcancé a leerlo. Si es un PDF escaneado, súbelo también en foto.",
      campos: [],
    };
  }
  const contrato = tipo === "contrato" || tipo === "unificado" ? contratoDesdeTexto(base) : null;
  const leido: Partial<Record<CampoLeido["key"], string>> = {
    placa: contrato?.placa || placaDe(base),
    cc: contrato?.cc || ccDe(base),
    nombre: usable(contrato?.nombre || nombreDe(base), 8),
    telefono: contrato?.telefono || telefonoDe(base),
    direccion: usable(contrato?.direccion || valorDe(base, /direcci[oó]n\b/i, 120), 14),
    correo: contrato?.correo || correoDe(base),
    marca: usable((contrato?.marca || valorDe(base, /\bmarca\b/i, 40)).toUpperCase(), 4),
    linea: usable((contrato?.linea || valorDe(base, /\bl[ií]nea\b/i, 40)).toUpperCase(), 4),
    modelo: contrato?.modelo || (valorDe(base, /\b(?:modelo|a[nñ]o)\b/i, 12).match(/\d{4}/)?.[0] ?? ""),
    empresa: usable(empresaDe(base), 8),
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
