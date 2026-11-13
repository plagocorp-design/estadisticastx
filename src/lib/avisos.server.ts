import { enviarCorreo, htmlCorreo } from "@/lib/correo.server";

export async function avisarEstado(input: {
  antesTarjeta: string;
  ahoraTarjeta: string;
  antesEntregada: boolean;
  ahoraEntregada: boolean;
  correo: string;
  nombre: string;
  placa: string;
  asesor: string;
}) {
  if (!input.correo.includes("@")) return;
  let titulo = "";
  let texto = "";
  if (!input.antesEntregada && input.ahoraEntregada) {
    titulo = "Tu tarjeta ya está entregada";
    texto = "la tarjeta de operación ya está entregada. Gracias por la confianza. Cualquier cosa, me escribes.";
  } else if (input.antesTarjeta !== input.ahoraTarjeta && input.ahoraTarjeta === "Expedida") {
    titulo = "Tu tarjeta ya está en la empresa";
    texto = "la tarjeta de operación ya está en la empresa. En cuanto quede lista para entregártela, te confirmo.";
  } else if (input.antesTarjeta !== input.ahoraTarjeta && input.ahoraTarjeta === "Radicada") {
    titulo = "Tu tarjeta ya fue radicada";
    texto = "la tarjeta de operación ya fue radicada. El trámite quedó presentado y seguimos atentos para contarte el siguiente avance.";
  } else if (input.antesTarjeta !== input.ahoraTarjeta && input.ahoraTarjeta === "Pendiente") {
    titulo = "Tu tarjeta quedó en operativa";
    texto = "los papeles de la tarjeta de operación ya están en operativa. Apenas radiquen, te cuento.";
  }
  if (!titulo) return;
  const saludo = input.nombre.trim() ? `Hola ${input.nombre.trim()}.` : "Hola.";
  const dePlaca = input.placa ? ` de la placa ${input.placa}` : "";
  const cuerpo = `Te cuento cómo vamos${dePlaca}: ${texto}`;
  const pie = input.asesor.trim() ? `${input.asesor.trim()}\nTu asesor, Radio Taxi Aeropuerto` : "Tu asesor, Radio Taxi Aeropuerto";
  await enviarCorreo({
    to: input.correo,
    subject: `${titulo} · ${input.placa || "Vinculaciones"}`,
    asesor: input.asesor,
    text: `${saludo}\n\n${cuerpo}\n\n${pie}`,
    html: htmlCorreo({ titulo, placa: input.placa, saludo, parrafos: [cuerpo], pie: pie.replace("\n", " · ") }),
  });
}
