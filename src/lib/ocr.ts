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
  const hallada = plano(texto).match(/\b([A-Z]{3}\d{3}|[A-Z]{3}\d{2}[A-Z])\b/);
  return hallada?.[1] ?? "";
}

function ccDe(texto: string) {
  const zona = texto.match(/(?:c\.?\s*c\.?|c[eé]dula|documento|identificaci[oó]n|n[uú]mero)[^\d]{0,20}(\d[\d.\s]{5,14}\d)/i);
  const crudo = (zona?.[1] ?? "").replace(/\D/g, "");
  if (crudo.length >= 6 && crudo.length <= 11 && !crudo.startsWith("3")) return crudo;
  return "";
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

function despuesDe(texto: string, etiqueta: RegExp, max = 60) {
  const m = texto.match(etiqueta);
  if (!m || m.index == null) return "";
  const resto = texto.slice(m.index + m[0].length).replace(/^[\s:.\-]+/, "");
  const linea = resto.split(/\n/)[0] ?? "";
  return limpio(linea).slice(0, max);
}

function nombreDe(texto: string) {
  const directo = despuesDe(texto, /(?:nombre(?:s)?(?:\s+y\s+apellidos)?|propietario|a nombre de)\b/i, 80);
  const limpioNombre = directo.replace(/\b(c\.?c\.?|cedula|placa|marca).*/i, "").trim();
  if (limpioNombre.length >= 5 && /[A-Za-zÁÉÍÓÚÑ]/.test(limpioNombre)) return limpioNombre.toUpperCase();
  return "";
}

function empresaDe(texto: string) {
  const hallada = despuesDe(texto, /empresa(?:\s+de\s+transporte|\s+afiliadora)?\b/i, 80);
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
  const base = limpio(texto);
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
    direccion: usable(contrato?.direccion || despuesDe(base, /direcci[oó]n\b/i, 120), 14),
    correo: contrato?.correo || correoDe(base),
    marca: usable(contrato?.marca || despuesDe(base, /\bmarca\b/i, 40).toUpperCase(), 4),
    linea: usable(contrato?.linea || despuesDe(base, /l[ií]nea\b/i, 40).toUpperCase(), 4),
    modelo: contrato?.modelo || (despuesDe(base, /modelo|a[nñ]o\b/i, 8).match(/\d{4}/)?.[0] ?? ""),
    empresa: usable(empresaDe(base), 8),
  };
  const campos = (Object.keys(ETIQUETAS) as CampoLeido["key"][])
    .filter((key) => leido[key])
    .filter((key) => !igual(actual[key] ?? "", leido[key] ?? ""))
    .map((key) => ({ key, label: ETIQUETAS[key], actual: actual[key] ?? "", leido: leido[key] ?? "" }));
  const vence = venceDe(base, tipo);
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
