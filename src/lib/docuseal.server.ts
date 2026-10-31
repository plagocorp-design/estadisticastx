import { huecosFirma } from "./contrato-pdf.server";

const TOKEN = process.env.DOCUSEAL_API_TOKEN || "qbHb9RXS6g6ycpgtTgwxWLC4WDMrazyiqdC9g8PHJHy";

type Firmante = { role: string; email: string; name: string };

function zona(x: number, y: number, w: number, h: number, page: number, alto = 1008) {
  return {
    x: Math.round((x / 612) * 1000) / 1000,
    y: Math.round(((alto - y - h) / alto) * 1000) / 1000,
    w: Math.round((w / 612) * 1000) / 1000,
    h: Math.round((h / alto) * 1000) / 1000,
    page,
  };
}

function camposDe(role: string, orden: number, total: number) {
  const firma = huecosFirma(total, 300, 36)[orden] ?? { y: 250, h: 52 };
  const datos = huecosFirma(total, 360, 48)[orden] ?? { y: 340, h: 52 };
  return {
    name: orden === 0 ? "Firma" : `Firma ${orden + 1}`,
    type: "signature",
    role,
    required: true,
    areas: [zona(330, firma.y, 170, firma.h, 2), zona(60, datos.y, 180, datos.h, 3)],
  };
}

export async function pedirFirmaDocuseal(pdf: string, placa: string, firmantes: Firmante[], carta = "") {
  const documentos = [
    {
      name: `contrato-${placa}.pdf`,
      file: pdf,
      fields: firmantes.map((parte, orden) => camposDe(parte.role, orden, firmantes.length)),
    },
  ];
  if (carta) {
    documentos.push({
      name: `carta-${placa}.pdf`,
      file: carta,
      fields: firmantes.map((parte, orden) => {
        const sitio = huecosFirma(firmantes.length, 200, 80, 48)[orden] ?? { y: 150, h: 48 };
        return {
          name: orden === 0 ? "Firma carta" : `Firma carta ${orden + 1}`,
          type: "signature",
          role: parte.role,
          required: true,
          areas: [zona(56, sitio.y, 200, sitio.h, 1, 792)],
        };
      }),
    });
  }
  const response = await fetch("https://api.docuseal.com/submissions/pdf", {
    method: "POST",
    headers: {
      "X-Auth-Token": TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `Contrato ${placa}`,
      send_email: true,
      order: "random",
      documents: documentos,
      submitters: firmantes,
      message: {
        subject: `Contrato para firmar · ${placa}`,
        body: "Hola {{submitter.name}},\n\nTe enviamos el contrato de vinculación para que lo leas y lo firmes. No respondas este correo. Entra aquí:\n{{submitter.link}}\n",
      },
    }),
  });
  const json = (await response.json().catch(() => null)) as {
    id?: number;
    error?: string;
    message?: string;
    submitters?: { email?: string; embed_src?: string }[];
  } | null;
  if (!response.ok || !json?.id) {
    throw new Error(json?.error || json?.message || "DocuSeal no recibió el contrato");
  }
  return {
    id: json.id,
    partes: (json.submitters ?? []).map((parte) => ({
      correo: parte.email ?? "",
      enlace: parte.embed_src ?? "",
    })),
  };
}

function hora(iso?: string | null) {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
  }).format(fecha);
}

async function bajar(url: string) {
  if (!url) return "";
  const response = await fetch(url);
  if (!response.ok) return "";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 80 || bytes.length > 8_000_000) return "";
  return bytes.toString("base64");
}

export async function leerDocuseal(envioId: string) {
  const response = await fetch(`https://api.docuseal.com/submissions/${encodeURIComponent(envioId)}`, {
    headers: { "X-Auth-Token": TOKEN },
  });
  const json = (await response.json().catch(() => null)) as {
    status?: string;
    audit_log_url?: string | null;
    combined_document_url?: string | null;
    documents?: { name?: string; url?: string }[];
    submitters?: {
      name?: string;
      email?: string;
      status?: string;
      ip?: string;
      opened_at?: string | null;
      completed_at?: string | null;
    }[];
  } | null;
  if (!response.ok || !json) throw new Error("DocuSeal no contestó");
  const partes = json.submitters ?? [];
  const resumen = partes
    .map((parte) => {
      const quien = parte.name || parte.email || "Alguien";
      if (parte.completed_at) {
        return `${quien} firmó ${hora(parte.completed_at)}${parte.ip ? ` desde ${parte.ip}` : ""}${parte.opened_at ? `. Abrió el enlace ${hora(parte.opened_at)}` : ""}`;
      }
      if (parte.opened_at) return `${quien} abrió el enlace ${hora(parte.opened_at)}${parte.ip ? ` desde ${parte.ip}` : ""} y todavía no firma`;
      return `${quien} todavía no abre el enlace`;
    })
    .join(". ");
  const listo = json.status === "completed";
  const porNombre = (pista: string) => json.documents?.find((doc) => (doc.name || "").toLowerCase().includes(pista))?.url || "";
  const contratoUrl = porNombre("contrato") || json.documents?.find((doc) => doc.url)?.url || json.combined_document_url || "";
  const cartaUrl = porNombre("carta");
  const [contrato, carta, auditoria] = listo
    ? await Promise.all([bajar(contratoUrl), bajar(cartaUrl), bajar(json.audit_log_url || "")])
    : ["", "", ""];
  return {
    listo,
    estado: listo ? "completed" : partes.some((parte) => parte.opened_at) ? "abierto" : "pendiente",
    contrato,
    carta,
    auditoria,
    resumen,
  };
}
