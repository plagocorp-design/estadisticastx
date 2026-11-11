const panel = document.createElement("section");
panel.id = "vincula-wa";
panel.innerHTML = `
  <h2>Subir esta gestión</h2>
  <p id="vincula-resumen">Abre un chat. Cuento desde el primer mensaje de hoy.</p>
  <label>Nombre<input id="vincula-nombre" /></label>
  <label>Número o @<input id="vincula-contacto" /></label>
  <label>Placa, si ya la tienes<input id="vincula-placa" /></label>
  <div class="botones">
    <button class="verde" type="button" id="vincula-verde">Atendido</button>
    <button class="rojo" type="button" id="vincula-rojo">No se pudo</button>
  </div>
  <p class="estado" id="vincula-estado"></p>
`;
document.documentElement.appendChild(panel);

let ultimo = "";
let leyendo = { desde: "", mensajes: 0, nombre: "", telefono: "", arroba: "" };

function hoyBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

function fechaTexto(iso) {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
}

function a24(hora, texto) {
  const [h, min] = hora.split(":").map(Number);
  const tarde = /p\.?\s*m/i.test(texto);
  const manana = /a\.?\s*m/i.test(texto);
  let hora24 = h;
  if (tarde && h < 12) hora24 += 12;
  if (manana && h === 12) hora24 = 0;
  return `${String(hora24).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function leerChat() {
  const main = document.querySelector("#main");
  if (!main) return null;
  const titulo = main.querySelector("header span[title]")?.getAttribute("title") || main.querySelector("header span[dir='auto']")?.textContent || "";
  const nombre = titulo.trim();
  const fila = document.querySelector('#pane-side [aria-selected="true"]');
  const crudo = `${fila?.getAttribute("data-id") || ""} ${main.getAttribute("data-id") || ""}`;
  const jid = crudo.match(/(\d{8,15})@c\.us/)?.[1] || "";
  const telefono = jid.startsWith("57") && jid.length === 12 ? jid.slice(2) : jid;
  const arroba = nombre.startsWith("@") ? nombre : "";
  const hoy = fechaTexto(hoyBogota());
  let desde = "";
  let mensajes = 0;
  for (const nodo of main.querySelectorAll("[data-pre-plain-text]")) {
    const texto = nodo.getAttribute("data-pre-plain-text") || "";
    const hallado = texto.match(/\[(\d{1,2}:\d{2})[^\]]*?,\s*(\d{1,2}\/\d{1,2}\/\d{4})\]/);
    if (!hallado || hallado[2] !== hoy) continue;
    mensajes += 1;
    const hora = a24(hallado[1], texto);
    if (!desde || hora < desde) desde = hora;
  }
  return { nombre: arroba ? "" : nombre, telefono, arroba, desde, mensajes };
}

function pintar(chat) {
  const resumen = document.querySelector("#vincula-resumen");
  const nombre = document.querySelector("#vincula-nombre");
  const contacto = document.querySelector("#vincula-contacto");
  if (!chat) {
    resumen.textContent = "Abre un chat. Si no tiene placa ni nombre, igual se puede subir y completar después.";
    return;
  }
  const firma = `${chat.nombre}|${chat.telefono}|${chat.arroba}|${chat.desde}|${chat.mensajes}`;
  if (firma !== ultimo) {
    ultimo = firma;
    leyendo = chat;
    if (document.activeElement !== nombre) nombre.value = chat.nombre;
    if (document.activeElement !== contacto) contacto.value = chat.arroba || chat.telefono;
  }
  resumen.textContent = chat.desde
    ? `Hoy empezó a las ${chat.desde}. ${chat.mensajes} mensaje${chat.mensajes === 1 ? "" : "s"}. No importa si el chat es viejo: cuenta porque se atendió hoy.`
    : "En lo que está cargado no veo mensajes de hoy. Sube igual si ya lo atendiste y corrige el dato.";
}

function subir(color) {
  const estado = document.querySelector("#vincula-estado");
  const contacto = document.querySelector("#vincula-contacto").value.trim();
  const nombre = document.querySelector("#vincula-nombre").value.trim();
  const placa = document.querySelector("#vincula-placa").value.trim();
  const arroba = contacto.startsWith("@") ? contacto : leyendo.arroba;
  const telefono = contacto.startsWith("@") ? leyendo.telefono : contacto || leyendo.telefono;
  estado.textContent = "Subiendo…";
  chrome.runtime.sendMessage(
    {
      tipo: "vincula",
      cuerpo: {
        accion: "subir",
        color,
        nombre,
        telefono,
        arroba,
        placa,
        desde: leyendo.desde,
        mensajes: leyendo.mensajes,
      },
    },
    (respuesta) => {
      estado.textContent = respuesta?.aviso || respuesta?.error || respuesta?.message || (chrome.runtime.lastError ? chrome.runtime.lastError.message : "") || "No contestó el programa.";
    },
  );
}

document.querySelector("#vincula-verde").addEventListener("click", () => subir("verde"));
document.querySelector("#vincula-rojo").addEventListener("click", () => subir("rojo"));

chrome.runtime.sendMessage({ tipo: "vincula", cuerpo: { accion: "entrar" } }, (respuesta) => {
  const estado = document.querySelector("#vincula-estado");
  if (respuesta?.aviso) estado.textContent = respuesta.aviso;
  else if (respuesta?.error) estado.textContent = respuesta.error;
});

setInterval(() => pintar(leerChat()), 2000);
pintar(leerChat());
