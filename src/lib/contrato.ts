export type TextoPdf = { str: string; x: number; y: number };

export type ContratoLeido = {
  placa: string;
  cc: string;
  nombre: string;
  telefono: string;
  direccion: string;
  correo: string;
  marca: string;
  linea: string;
  modelo: string;
  fechaFirma: string;
  firmado: boolean;
};

const VACIO: ContratoLeido = {
  placa: "",
  cc: "",
  nombre: "",
  telefono: "",
  direccion: "",
  correo: "",
  marca: "",
  linea: "",
  modelo: "",
  fechaFirma: "",
  firmado: false,
};

function texto(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function normalizarContrato(raw: Partial<ContratoLeido> | null | undefined): ContratoLeido {
  const placa = texto(raw?.placa, 12).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const cc = texto(raw?.cc, 20).replace(/\D/g, "");
  const telefono = texto(raw?.telefono, 20).replace(/\D/g, "");
  const fecha = texto(raw?.fechaFirma, 10);
  const correo = texto(raw?.correo, 80).toLowerCase();
  return {
    placa: /^[A-Z]{3}\d{3}$/.test(placa) ? placa : "",
    cc: cc.length >= 6 && cc.length <= 12 ? cc : "",
    nombre: texto(raw?.nombre, 80).toUpperCase(),
    telefono: telefono.length >= 10 ? telefono.slice(0, 10) : telefono,
    direccion: texto(raw?.direccion, 120),
    correo: correo.includes("@") ? correo : "",
    marca: texto(raw?.marca, 40).toUpperCase(),
    linea: texto(raw?.linea, 40).toUpperCase(),
    modelo: texto(raw?.modelo, 8).replace(/\D/g, "").slice(0, 4),
    fechaFirma: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : "",
    firmado: Boolean(raw?.firmado),
  };
}

const MESES: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

function plano(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
}

function ancla(page: TextoPdf[], etiqueta: string) {
  const needle = plano(etiqueta);
  return page
    .filter((it) => it.str.trim().length > 0 && it.str.trim().length < 42 && plano(it.str).includes(needle))
    .sort((a, b) => b.y - a.y)[0];
}

function esRotulo(s: string) {
  const p = plano(s.trim());
  return /^(NOMBRES|IDENTIFICACI|DIRECCI|TELEFONO|MARCA|LINEA|CLASE|MODELO|PLACA|N[°º ]|TIPO DE|CARROCER|CILINDRAJE|CORREO)/.test(p);
}

/** Value sitting on the same row, to the right of the label, or just under it. */
function valorJunto(page: TextoPdf[], etiqueta: string) {
  const anchor = ancla(page, etiqueta);
  if (!anchor) return "";
  let best = "";
  let bestScore = Infinity;
  for (const it of page) {
    const s = it.str.replace(/\s+/g, " ").trim();
    if (!s || s.length > 80 || it === anchor || esRotulo(s)) continue;
    const dy = anchor.y - it.y;
    const dx = it.x - anchor.x;
    const misma = Math.abs(dy) <= 8 && dx >= 6 && dx < 240;
    const debajo = dy > 8 && dy < 32 && dx > -20 && dx < 90;
    if (!misma && !debajo) continue;
    const score = Math.abs(dy) * 4 + Math.abs(dx);
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

function correoDe(pages: TextoPdf[][]) {
  const todos = pages.flat();
  const anchor = todos
    .filter((it) => {
      const p = plano(it.str).replace(/\s+/g, " ").trim();
      return p === "CORREO ELECTRONICO:" || p === "CORREO ELECTRONICO";
    })
    .sort((a, b) => a.y - b.y)
    .at(-1);
  const correos = todos.filter((it) => /@/.test(it.str) && !/radiotaxiaeropuerto/i.test(it.str));
  if (!correos.length) return "";
  if (!anchor) return correos[0].str.trim();
  correos.sort(
    (a, b) =>
      Math.abs(a.y - anchor.y) + Math.abs(a.x - anchor.x) - (Math.abs(b.y - anchor.y) + Math.abs(b.x - anchor.x)),
  );
  return correos[0].str.trim();
}

function fechaDe(pages: TextoPdf[][]) {
  for (const page of pages) {
    const anchor = page.find((it) => /Firmado a los/i.test(it.str));
    if (!anchor) continue;
    const tokens = page
      .filter((it) => Math.abs(it.y - anchor.y) <= 8 && it.str.trim() && !/Firmado a los/i.test(it.str))
      .sort((a, b) => a.x - b.x)
      .map((it) => it.str.trim());
    const nums = tokens.filter((t) => /^\d{1,4}$/.test(t));
    const mes = tokens.map((t) => t.toLowerCase()).find((t) => MESES[t]);
    if (!nums[0] || !mes) continue;
    const dia = nums[0].padStart(2, "0");
    const anioTok = nums.length > 1 ? nums[nums.length - 1] : "";
    const anio = anioTok.length === 4 ? anioTok : anioTok.length === 2 ? `20${anioTok}` : "";
    if (!anio) continue;
    const fecha = `${anio}-${MESES[mes]}-${dia}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  }
  return "";
}

/**
 * The Radio Taxi template keeps the blanks empty in the paragraph and paints
 * the answers as separate text next to each label. Read those, not the prose.
 */
export function contratoDesdeItems(pages: TextoPdf[][]): ContratoLeido | null {
  const hoja = pages[0] ?? [];
  if (!hoja.length) return null;
  const fechaFirma = fechaDe(pages);
  const leido = normalizarContrato({
    nombre: valorJunto(hoja, "NOMBRES Y APELLIDOS"),
    cc: valorJunto(hoja, "IDENTIFICACIÓN"),
    direccion: valorJunto(hoja, "DIRECCIÓN"),
    telefono: valorJunto(hoja, "TELÉFONO"),
    marca: valorJunto(hoja, "MARCA"),
    linea: valorJunto(hoja, "LÍNEA"),
    modelo: valorJunto(hoja, "MODELO"),
    placa: valorJunto(hoja, "PLACA"),
    correo: correoDe(pages),
    fechaFirma,
    firmado: Boolean(fechaFirma),
  });
  return leido.placa && leido.nombre && leido.cc ? leido : null;
}

/** When the PDF has a real text layer with values beside the labels, skip the vision call. */
export function contratoDesdeTexto(text: string): ContratoLeido | null {
  const planoTexto = text.replace(/[ \t]+/g, " ");
  const tomar = (re: RegExp) => planoTexto.match(re)?.[1]?.trim() ?? "";
  const nombre = tomar(/NOMBRES Y APELLIDOS:\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{6,}?)\s+IDENTIFICACI[ÓO]N/i);
  const cc = tomar(/IDENTIFICACI[ÓO]N:\s*(?:CC\s*)?(\d{6,12})/i);
  const placa = tomar(/PLACA:\s*([A-Z]{3}\d{3})\b/i);
  if (!nombre || !cc || !placa) return null;
  const fecha = planoTexto.match(/Firmado a los\s+(\d{1,2})\s+d[ií]as del mes de\s+([A-Za-záéíóú]+)\s+de\s+(\d{4})/i);
  const mes = fecha ? MESES[fecha[2].toLowerCase()] : "";
  const fechaFirma = fecha && mes ? `${fecha[3]}-${mes}-${fecha[1].padStart(2, "0")}` : "";
  const leido = normalizarContrato({
    placa,
    cc,
    nombre,
    telefono: tomar(/TEL[ÉE]FONO\s*:?\s*(\d{10})/i),
    direccion: tomar(/DIRECCI[ÓO]N:\s*(.+?)\s+TEL[ÉE]FONO/i),
    correo: tomar(/correo electr[óo]nico:\s*([^\s]+@[^\s]+)/i),
    marca: tomar(/MARCA:\s*([A-Z0-9 ]+?)\s+L[IÍ]NEA/i),
    linea: tomar(/L[IÍ]NEA:\s*([A-Z0-9 ]+?)\s+CLASE/i),
    modelo: tomar(/MODELO:\s*(\d{4})/i),
    fechaFirma,
    firmado: Boolean(fechaFirma),
  });
  return leido.placa && leido.nombre && leido.cc ? leido : null;
}

export function contratoVacio(): ContratoLeido {
  return { ...VACIO };
}
