const { toJSON, fromCrossJSON } = require("seroval");

const BASE = "http://127.0.0.1:8080";
const LIST = "eyJmaWxlIjoiL3NyYy9saWIvY2FsbGNlbnRlci5mdW5jdGlvbnMudHM_dHNzLXNlcnZlcmZuLXNwbGl0IiwiZXhwb3J0IjoibGlzdEVtcHJlc2FzX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ";
const STATS = "eyJmaWxlIjoiL3NyYy9saWIvY2FsbGNlbnRlci5mdW5jdGlvbnMudHM_dHNzLXNlcnZlcmZuLXNwbGl0IiwiZXhwb3J0Ijoic3RhdHNDYWxsX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ";
const PREP = "eyJmaWxlIjoiL3NyYy9saWIvY2Fzb3MuZnVuY3Rpb25zLnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6InByZXBhcmVUZWFtX2NyZWF0ZVNlcnZlckZuX2hhbmRsZXIifQ";
const BUSCAR = "eyJmaWxlIjoiL3NyYy9saWIvY2FsbGNlbnRlci5mdW5jdGlvbnMudHM_dHNzLXNlcnZlcmZuLXNwbGl0IiwiZXhwb3J0IjoiYnVzY2FyQ2FsbF9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0";

async function login() {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email: "david@vinculalibre.app", password: "David2026" }),
  });
  const cookie = res.headers.getSetCookie?.() || [];
  const raw = cookie.map((c) => c.split(";")[0]).join("; ");
  if (!res.ok) throw new Error(`login ${res.status} ${await res.text()}`);
  return raw;
}

async function rpc(cookie, id, data, method) {
  const verbo = method || "POST";
  const res = await fetch(`${BASE}/_serverFn/${id}`, {
    method: verbo,
    headers: {
      "content-type": "application/json",
      "x-tsr-serverFn": "true",
      origin: BASE,
      cookie,
    },
    body: verbo === "GET" ? undefined : JSON.stringify(toJSON({ data })),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${res.status} ${text.slice(0, 800)}`);
  const decoded = fromCrossJSON(JSON.parse(text), { plugins: [] });
  return decoded.result ?? decoded;
}

(async () => {
  const prep = await rpc("", PREP, {});
  console.log("prep", JSON.stringify(prep));
  const cookie = await login();
  const t0 = Date.now();
  const empresas = await rpc(cookie, LIST, undefined, "GET");
  console.log("listEmpresas ms", Date.now() - t0, "n", empresas.empresas.length);
  const foco = empresas.empresas.filter((e) => /TAX EXPRESS|AUTOLAGOS|ALO TAXIS|AIR TAXIS/i.test(e.empresa));
  for (const e of foco) {
    console.log(`${e.empresa} activa=${e.activa} total=${e.total} pendientes=${e.pendientes} tipificadas=${e.total - e.pendientes}`);
  }
  const suma = empresas.empresas.reduce((a, e) => a + e.pendientes, 0);
  const tot = empresas.empresas.reduce((a, e) => a + e.total, 0);
  console.log("TODAS", tot, "pendientes", suma, "apagadas", empresas.empresas.filter((e) => !e.activa).length);
  const stats = await rpc(cookie, STATS, {});
  const meses = (stats.meses || []).map((m) => `${m.mes}:${m.total}`);
  const gran = (stats.meses || []).reduce((a, m) => a + m.total, 0);
  console.log("STATS", meses.join(" "), "gran", gran);
  const busca = await rpc(cookie, BUSCAR, { q: "TAY373" });
  console.log("BUSCAR TAY373", JSON.stringify(busca));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
