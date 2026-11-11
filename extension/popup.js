const url = document.querySelector("#url");
const token = document.querySelector("#token");
const aviso = document.querySelector("#aviso");
chrome.storage.sync.get({ token: "", url: "https://vincula-libre.vercel.app" }, (guardado) => {
  url.value = guardado.url || "";
  token.value = guardado.token || "";
});
document.querySelector("#guardar").addEventListener("click", () => {
  chrome.storage.sync.set({ url: url.value.trim(), token: token.value.trim() }, () => {
    aviso.textContent = "Listo. Vuelve a WhatsApp Web y recarga la página.";
  });
});
