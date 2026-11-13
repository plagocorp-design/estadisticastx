import { useEffect } from "react";

const VERBOS = ["guardar", "crear", "enviar", "pasar", "borrar", "eliminar", "activar", "desactivar", "subir", "firmar", "pausar", "reabrir", "cambiar", "reenviar", "actualizar", "exportar", "registrar"];

function esAccion(boton: HTMLButtonElement) {
  if (boton.dataset.eco === "no") return false;
  const texto = (boton.innerText || boton.getAttribute("aria-label") || "").trim().toLowerCase();
  return VERBOS.some((verbo) => texto.includes(verbo));
}

function nota(boton: HTMLButtonElement, ok: boolean) {
  boton.classList.remove("vl-ok", "vl-mal");
  void boton.offsetWidth;
  boton.classList.add(ok ? "vl-ok" : "vl-mal");
  const aviso = document.createElement("span");
  aviso.className = ok ? "vl-nota vl-nota-ok" : "vl-nota vl-nota-mal";
  aviso.textContent = ok ? "Listo" : "No se guardó";
  const caja = boton.getBoundingClientRect();
  aviso.style.left = `${Math.max(8, caja.left)}px`;
  aviso.style.top = `${Math.max(8, caja.top - 30)}px`;
  document.body.appendChild(aviso);
  window.setTimeout(() => aviso.remove(), 1500);
}

function fallo(texto: string) {
  try {
    const dato = JSON.parse(texto) as { error?: unknown };
    return Boolean(dato && typeof dato === "object" && "error" in dato && dato.error);
  } catch {
    return false;
  }
}

export function EcoBotones() {
  useEffect(() => {
    const original = window.fetch.bind(window);
    let pendiente: { boton: HTMLButtonElement; hasta: number } | null = null;

    function alClick(event: MouseEvent) {
      const boton = (event.target as HTMLElement | null)?.closest("button");
      if (!boton || boton.disabled || !esAccion(boton)) return;
      const espera = window.setTimeout(() => {
        if (pendiente?.boton === boton) {
          pendiente = null;
          nota(boton, false);
        }
      }, 1600);
      pendiente = { boton, hasta: Date.now() + 1600 };
      boton.dataset.vlEspera = String(espera);
    }

    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const metodo = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const esFn = metodo === "POST" && (url.includes("/_serverFn/") || url.includes("/api/"));
      const marca = esFn && pendiente && Date.now() < pendiente.hasta ? pendiente : null;
      if (marca) {
        window.clearTimeout(Number(marca.boton.dataset.vlEspera || 0));
        pendiente = null;
      }
      try {
        const respuesta = await original(input, init);
        if (!marca) return respuesta;
        let mal = !respuesta.ok;
        if (!mal && url.includes("/_serverFn/")) mal = fallo(await respuesta.clone().text());
        nota(marca.boton, !mal);
        return respuesta;
      } catch (err) {
        if (marca) nota(marca.boton, false);
        throw err;
      }
    };

    document.addEventListener("click", alClick, true);
    return () => {
      document.removeEventListener("click", alClick, true);
      window.fetch = original;
    };
  }, []);

  return null;
}
