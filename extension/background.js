chrome.runtime.onMessage.addListener((mensaje, _emisor, responder) => {
  if (!mensaje || mensaje.tipo !== "vincula") return;
  const cuerpo = mensaje.cuerpo || {};
  chrome.storage.sync.get({ token: "", url: "https://vincula-libre.vercel.app" }, (guardado) => {
    const token = String(guardado.token || "").trim();
    const base = String(guardado.url || "").replace(/\/$/, "");
    if (!token || !base) {
      responder({ ok: false, error: "Abre el icono de la extensión y pega la clave de Control." });
      return;
    }
    fetch(`${base}/api/wa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...cuerpo, token }),
    })
      .then((res) => res.json())
      .then((dato) => responder(dato))
      .catch(() => responder({ ok: false, error: "No pude hablar con Vincula Libre. Revisa la dirección en el icono." }));
  });
  return true;
});
