import { readFile } from "node:fs/promises";
import tls from "node:tls";

const DESDE = "vinculaciones@taxislibres.com.co";

async function credenciales() {
  const deArchivo: Record<string, string> = {};
  try {
    const crudo = await readFile("/workspace/.env", "utf8");
    for (const linea of crudo.split("\n")) {
      const corte = linea.indexOf("=");
      if (corte < 1 || linea.startsWith("#")) continue;
      deArchivo[linea.slice(0, corte)] = linea.slice(corte + 1).replace(/^"|"$/g, "");
    }
  } catch {
    /* en el servidor publicado las claves vienen del entorno */
  }
  const leer = (clave: string) => (process.env[clave] || deArchivo[clave] || "").trim();
  const user = leer("SMTP_USER") || DESDE;
  const pass = leer("SMTP_PASS") || 'maqskuabruxhftoj';
  if (!pass) throw new Error("Falta la clave del correo de vinculaciones");
  return { host: leer("SMTP_HOST") || "smtp.gmail.com", user, pass };
}

function encoded(valor: string) {
  return /^[\x00-\x7F]*$/.test(valor) ? valor : `=?UTF-8?B?${Buffer.from(valor, "utf8").toString("base64")}?=`;
}

export async function enviarCorreo(input: { to: string; subject: string; text: string; html?: string; asesor?: string }) {
  const para = input.to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) throw new Error("Ese correo no es válido");
  const dato = await credenciales();
  const borde = `vl${Date.now().toString(36)}`;
  const desdeNombre = input.asesor?.trim() ? `${input.asesor.trim()} · Vinculaciones` : "Vinculaciones Taxis Libres";
  const cabeceras = [
    `From: ${encoded(desdeNombre)} <${dato.user}>`,
    `To: ${para}`,
    `Subject: ${encoded(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Language: es",
    `Reply-To: ${dato.user}`,
  ];
  const cuerpo = input.html
    ? [
        ...cabeceras,
        `Content-Type: multipart/alternative; boundary="${borde}"`,
        "",
        `--${borde}`,
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        input.text,
        `--${borde}`,
        "Content-Type: text/html; charset=utf-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        input.html,
        `--${borde}--`,
        "",
      ].join("\r\n")
    : [...cabeceras, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", input.text].join("\r\n");
  const data = cuerpo
    .split("\r\n")
    .map((linea) => (linea.startsWith(".") ? `.${linea}` : linea))
    .join("\r\n");
  await smtp(dato, para, data);
}

function smtp(dato: { host: string; user: string; pass: string }, para: string, data: string) {
  return new Promise<void>((resolve, reject) => {
    let buf = "";
    let espera: ((texto: string) => void) | null = null;
    const socket = tls.connect({ port: 465, host: dato.host, servername: dato.host });
    const fallo = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(20000, () => fallo(new Error("El correo de vinculaciones no contestó")));
    socket.on("error", fallo);
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      const lineas = buf.split(/\r?\n/);
      const hechas = lineas.slice(0, -1);
      const ultima = hechas.at(-1) ?? "";
      if (!hechas.length || !/^\d{3} /.test(ultima) || !espera) return;
      buf = lineas.at(-1) ?? "";
      const listo = espera;
      espera = null;
      listo(hechas.join("\n"));
    });
    const leer = () =>
      new Promise<string>((ok, no) => {
        const timer = setTimeout(() => no(new Error("El correo de vinculaciones no contestó")), 20000);
        const entregar = (texto: string) => {
          clearTimeout(timer);
          ok(texto);
        };
        const lineas = buf.split(/\r?\n/);
        const hechas = lineas.slice(0, -1);
        const ultima = hechas.at(-1) ?? "";
        if (hechas.length && /^\d{3} /.test(ultima)) {
          buf = lineas.at(-1) ?? "";
          entregar(hechas.join("\n"));
          return;
        }
        espera = entregar;
      });
    const mando = async (linea: string, bien: number[]) => {
      socket.write(`${linea}\r\n`);
      const respuesta = await leer();
      const codigo = Number(respuesta.slice(0, 3));
      if (!bien.includes(codigo)) throw new Error(respuesta.replace(/\s+/g, " ").slice(0, 180));
    };
    socket.once("secureConnect", () => {
      void (async () => {
        try {
          const saludo = await leer();
          if (!saludo.startsWith("220")) throw new Error("No entré al correo de vinculaciones");
          await mando("EHLO vinculalibre", [250]);
          await mando("AUTH LOGIN", [334]);
          await mando(Buffer.from(dato.user).toString("base64"), [334]);
          await mando(Buffer.from(dato.pass).toString("base64"), [235]);
          await mando(`MAIL FROM:<${dato.user}>`, [250]);
          await mando(`RCPT TO:<${para}>`, [250, 251]);
          await mando("DATA", [354]);
          socket.write(`${data}\r\n.\r\n`);
          const puesto = await leer();
          if (!puesto.startsWith("250")) throw new Error(puesto.replace(/\s+/g, " ").slice(0, 180));
          socket.write("QUIT\r\n");
          socket.end();
          resolve();
        } catch (err) {
          fallo(err instanceof Error ? err : new Error("No pude enviar el correo"));
        }
      })();
    });
  });
}

export function htmlCorreo(input: {
  titulo: string;
  saludo: string;
  parrafos: string[];
  pasos?: string[];
  boton?: string;
  enlace?: string;
  pie: string;
  placa?: string;
  logo?: string;
}) {
  const bloques = input.parrafos
    .filter((texto) => texto.trim() && !/^hola\b/i.test(texto.trim()))
    .map((texto) => `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#243246">${escapar(texto)}</p>`)
    .join("");
  const pasos = (input.pasos ?? [])
    .map(
      (texto, i) => `<tr>
        <td width="36" valign="top" style="padding:0 0 12px">
          <div style="width:28px;height:28px;border-radius:14px;background:#1b3a4b;color:#c6e84a;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:28px;text-align:center">${i + 1}</div>
        </td>
        <td valign="middle" style="padding:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4;color:#102033">${escapar(texto)}</td>
      </tr>`,
    )
    .join("");
  const boton =
    input.boton && input.enlace
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td bgcolor="#c6e84a" style="border-radius:14px">
          <a href="${escapar(input.enlace)}" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#102033;text-decoration:none">${escapar(input.boton)}</a>
        </td></tr></table>
        <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#5c6b7a">Si el botón no abre, copia este enlace:<br><a href="${escapar(input.enlace)}" style="color:#1b3a4b">${escapar(input.enlace)}</a></p>`
      : "";
  const placa = input.placa
    ? `<div style="display:inline-block;margin-top:12px;background:#c6e84a;color:#102033;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;letter-spacing:.08em;border-radius:999px;padding:6px 12px">${escapar(input.placa)}</div>`
    : "";
  const logo = input.logo
    ? `<img src="${escapar(input.logo)}" alt="Taxis Libres" width="168" height="48" style="display:block;border:0;outline:none;height:48px;width:auto;margin:0 0 16px">`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Language" content="es"></head>
  <body style="margin:0;background:#eef2ef">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef2ef" style="background:#eef2ef;padding:28px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden">
      <tr><td bgcolor="#1b3a4b" style="background:#1b3a4b;padding:28px 28px 24px;font-family:Arial,Helvetica,sans-serif">
        ${logo}
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#c6e84a">Vinculaciones</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.15;font-weight:700;color:#f4f7f2;margin-top:8px">${escapar(input.titulo)}</div>
        ${placa}
      </td></tr>
      <tr><td style="height:6px;background:#c6e84a;font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:26px 28px 28px">
        <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#243246">${escapar(input.saludo)}</p>
        ${bloques}
        ${pasos ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 8px">${pasos}</table>` : ""}
        ${boton}
        <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#5c6b7a">${escapar(input.pie)}</p>
      </td></tr>
    </table>
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7b8b86;margin:14px 0 0">Radio Taxi Aeropuerto · Este mensaje está en español</p>
  </td></tr></table>
  </body></html>`;
}

function escapar(valor: string) {
  const amp = "&" + "amp;";
  const lt = "&" + "lt;";
  const gt = "&" + "gt;";
  const quot = "&" + "quot;";
  return valor.replace(/&/g, amp).replace(/</g, lt).replace(/>/g, gt).replace(/"/g, quot);
}
