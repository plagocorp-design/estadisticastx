const ExcelJS = require("exceljs");
const path = require("path");

function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function placaDe(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}
function texto(v) {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if (typeof v.text === "string") return v.text;
    if (v.richText) return v.richText.map((p) => p.text).join("");
    if ("result" in v) return texto(v.result);
    return "";
  }
  return String(v);
}

function encabezado(sheet) {
  const tope = Math.min(15, sheet.rowCount || 15);
  let mejor = null;
  for (let r = 1; r <= tope; r++) {
    const headers = (sheet.getRow(r).values || []).slice(1).map((item) => texto(item).trim());
    const claves = headers.map(norm);
    let puntaje = 0;
    if (claves.some((item) => item === "placa")) puntaje += 3;
    if (claves.some((item) => item.includes("nombre completo") || item === "nombre")) puntaje += 2;
    if (claves.some((item) => item.includes("telefono") || item.includes("celular"))) puntaje += 2;
    if (claves.some((item) => item === "empresa")) puntaje += 1;
    if (puntaje >= 3 && (!mejor || puntaje > mejor.puntaje)) mejor = { fila: r, headers, puntaje };
  }
  return mejor;
}

function puntajeHoja(nombre) {
  const n = norm(nombre);
  if (n === "bd") return 100;
  if (n.includes("base original")) return 80;
  if (n === "base") return 60;
  return 0;
}

async function leer(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const hojas = [...wb.worksheets].sort((a, b) => puntajeHoja(b.name) - puntajeHoja(a.name));
  let mejor = [];
  let usada = "";
  for (const hoja of hojas) {
    const cabeza = encabezado(hoja);
    if (!cabeza) continue;
    const idx = {};
    cabeza.headers.forEach((h, i) => {
      const k = norm(h);
      if (k && idx[k] == null) idx[k] = i;
    });
    const col = (...nombres) => {
      for (const n of nombres) if (idx[norm(n)] != null) return idx[norm(n)];
      return -1;
    };
    const cNombre = col("nombre completo", "nombre");
    const cTel = col("numero de telefono", "número de teléfono", "telefono", "celular");
    const cPlaca = col("placa");
    const cEmp = col("empresa");
    const cClas = col("clasificacion");
    const cRes = col("resultado final");
    const cFin = col("observacion final");
    const cFecha = col("fecha");
    const cAgente = col("agente");
    const rows = [];
    hoja.eachRow((row, numero) => {
      if (numero <= cabeza.fila) return;
      const celdas = cabeza.headers.map((_, i) => texto(row.getCell(i + 1).value).trim());
      if (!celdas.some(Boolean)) return;
      const placa = placaDe(cPlaca >= 0 ? celdas[cPlaca] : "");
      const empresa = (cEmp >= 0 ? celdas[cEmp] : "").replace(/\s+/g, " ").trim();
      const clas = cClas >= 0 ? celdas[cClas] : "";
      const res = cRes >= 0 ? celdas[cRes] : "";
      const fin = cFin >= 0 ? celdas[cFin] : "";
      rows.push({
        placa,
        empresa: empresa || "SIN EMPRESA",
        nombre: cNombre >= 0 ? celdas[cNombre] : "",
        tel: cTel >= 0 ? celdas[cTel] : "",
        llamado: Boolean(clas || res || fin),
        fecha: cFecha >= 0 ? celdas[cFecha].slice(0, 10) : "",
        agente: cAgente >= 0 ? celdas[cAgente] : "",
      });
    });
    if (puntajeHoja(hoja.name) >= 80 && rows.length) return { hoja: hoja.name, rows };
    if (rows.length > mejor.length) {
      mejor = rows;
      usada = hoja.name;
    }
  }
  return { hoja: usada, rows: mejor };
}

const ARCHIVOS = [
  ["jose", "/workspace/attachments/Jose Antonio Abreu Valero -llamadas-2.xlsx"],
  ["patricia", "/workspace/attachments/Leidi Patricia Ladino Peñaloza -llamadas-3.xlsx"],
  ["laura", "/workspace/attachments/Laura Katerine Plaza Saza -llamadas-3.xlsx"],
  ["alison", "/workspace/attachments/Alison Dayana Moreno Olaya -llamadas-4.xlsx"],
  ["david4", "/workspace/attachments/David Santiago Jaimes Peña - llamadas (1)-4.xlsx"],
  ["david3", "/workspace/attachments/David Santiago Jaimes Peña - llamadas-3.xlsx"],
  ["original", "/workspace/attachments/_vinculaciones Listado TL ORIGINAL -LLAMADAS (2)-2.xlsx"],
  ["original1", "/workspace/attachments/_vinculaciones Listado TL ORIGINAL -LLAMADAS (1).xlsx"],
];

(async () => {
  const data = {};
  for (const [k, f] of ARCHIVOS) {
    const t = Date.now();
    data[k] = await leer(f);
    const llamados = data[k].rows.filter((r) => r.llamado && r.placa);
    const emp = new Map();
    for (const r of llamados) emp.set(r.empresa, (emp.get(r.empresa) || 0) + 1);
    const top = [...emp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    console.log(
      k,
      data[k].hoja,
      "filas",
      data[k].rows.length,
      "llamados",
      llamados.length,
      "ms",
      Date.now() - t,
      top.map(([e, n]) => `${n} ${e}`).join(" | "),
    );
  }
  const asesores = ["jose", "patricia", "laura", "alison", "david4"];
  const tip = new Map();
  for (const k of asesores) {
    for (const r of data[k].rows) {
      if (!r.llamado || !r.placa) continue;
      const key = r.placa;
      const prev = tip.get(key) || { empresas: new Set(), n: 0 };
      prev.empresas.add(norm(r.empresa));
      prev.n += 1;
      tip.set(key, prev);
    }
  }
  const master = data.original.rows.filter((r) => r.placa);
  const porPlacaMaster = new Map();
  for (const r of master) {
    const lista = porPlacaMaster.get(r.placa) || [];
    lista.push(norm(r.empresa));
    porPlacaMaster.set(r.placa, lista);
  }
  let tax = 0;
  let taxConTip = 0;
  let taxMisma = 0;
  let taxOtra = 0;
  const empresasTipEnTax = new Map();
  const placasTax = new Set(master.filter((r) => norm(r.empresa).includes("tax express")).map((r) => r.placa));
  console.log("placas unicas TAX EXPRESS en original", placasTax.size);
  for (const placa of placasTax) {
    tax += 1;
    const t = tip.get(placa);
    if (!t) continue;
    taxConTip += 1;
    if ([...t.empresas].some((e) => e.includes("tax express"))) taxMisma += 1;
    else {
      taxOtra += 1;
      for (const e of t.empresas) empresasTipEnTax.set(e, (empresasTipEnTax.get(e) || 0) + 1);
    }
  }
  console.log("TAX EXPRESS con tipificacion en algun asesor", taxConTip, "misma empresa", taxMisma, "otra empresa", taxOtra);
  console.log("si la tipificacion esta en otra empresa", [...empresasTipEnTax.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));
  let llamados = 0;
  let llamadosEnMaster = 0;
  let llamadosEmpresaDistinta = 0;
  for (const [placa, t] of tip) {
    llamados += 1;
    const emps = porPlacaMaster.get(placa);
    if (!emps) continue;
    llamadosEnMaster += 1;
    const set = new Set(emps);
    if (![...t.empresas].some((e) => set.has(e))) llamadosEmpresaDistinta += 1;
  }
  console.log("placas tipificadas", llamados, "estan en el original", llamadosEnMaster, "pero con otra empresa", llamadosEmpresaDistinta);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
