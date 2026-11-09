import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { prepareTeam } from "@/lib/casos.functions";
import { entradaPermitida, resolverUsuario } from "@/lib/control.functions";

export const Route = createFileRoute("/login")({ component: Login });

const puntos = [
  { titulo: "Cada proceso", texto: "Placa, documentos, firma, póliza y tarjeta, en el orden en que van." },
  { titulo: "El equipo", texto: "Quién está en la calle, quién en el call, y cómo va la meta del mes." },
  { titulo: "Cada área", texto: "Operativa, Vía Seguros y servicio al cliente marcan solo lo suyo." },
];

function Login() {
  const { user, isPending } = useCurrentUserState();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isPending || !user) return;
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.replace(next === "/piloto" ? "/piloto" : "/");
  }, [isPending, user]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    let email = "";
    try {
      email = await resolverUsuario({ data: usuario });
    } catch {
      email = "";
    }
    if (!email) {
      setError("Usuario o clave incorrectos");
      setBusy(false);
      return;
    }
    try {
      await prepareTeam();
      const result = await authClient.signIn.email({ email, password });
      if (result.error || !result.data) {
        setError("Usuario o clave incorrectos");
        setBusy(false);
        return;
      }
      const token = (result.data as { token?: string }).token;
      if (token) sessionStorage.setItem("grok-auth.bearer-token", token);
      let permiso: { ok: boolean; motivo: string } | null = await entradaPermitida().catch(() => null);
      if (!permiso) {
        await new Promise((resolver) => setTimeout(resolver, 400));
        permiso = await entradaPermitida().catch(() => ({ ok: true, motivo: "" }));
      }
      if (!permiso?.ok) {
        await authClient.signOut();
        sessionStorage.removeItem("grok-auth.bearer-token");
        setError(permiso?.motivo || "Tu usuario no puede entrar");
        setBusy(false);
        return;
      }
      let entro = false;
      for (let intento = 0; intento < 5; intento += 1) {
        const sesion = await authClient.getSession();
        if (sesion.data?.user) {
          entro = true;
          break;
        }
        await new Promise((resolver) => setTimeout(resolver, 250));
      }
      if (!entro) {
        setError("La clave sirvió, pero la sesión no quedó. Entra otra vez.");
        setBusy(false);
        return;
      }
      sessionStorage.setItem("vl-entro", String(Date.now()));
      sessionStorage.removeItem("vl-reintento");
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next === "/piloto" ? "/piloto" : "/");
    } catch {
      setError("No pude entrar. Revisa usuario y clave.");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.15fr_0.85fr]">
      <section className="flex min-h-[100svh] flex-col bg-navy px-6 py-7 text-paper lg:h-screen lg:overflow-hidden lg:px-12 lg:py-8">
        <img
          src="/taxis-libres-marca.png"
          alt="Taxis Libres"
          width={615}
          height={210}
          className="h-10 w-auto max-w-[168px] self-start object-contain lg:h-12 lg:max-w-[200px]"
        />
        <div className="mt-8 max-w-xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-lime uppercase">Radio Taxi Aeropuerto</p>
          <h1 className="mt-2 text-5xl font-semibold leading-[0.95] tracking-tight">Vincula Libre</h1>
          <p className="mt-3 max-w-md text-base leading-snug text-paper/90">
            El sistema de seguimiento de afiliaciones. De la llamada hasta la tarjeta, cada quien ve lo que le toca.
          </p>
        </div>
        <ul className="mt-5 grid max-w-xl gap-2">
          {puntos.map((punto) => (
            <li key={punto.titulo} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lime" />
              <span>
                <span className="block text-sm font-semibold">{punto.titulo}</span>
                <span className="block text-sm leading-snug text-paper/75">{punto.texto}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="taxi-escena" aria-label="Un taxi de Taxis Libres llega, recoge al pasajero y se va">
          <EscenaTaxi />
        </div>
      </section>
      <section className="flex items-center justify-center bg-paper px-5 py-10">
        <form onSubmit={submit} className="rise w-full max-w-md rounded-3xl border border-line bg-card px-6 py-8 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.16em] text-ink-soft uppercase">Ingreso</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Entra a tu trabajo</h2>
          <p className="mt-2 text-sm text-ink-soft">Usuario y clave. No hace falta escoger el nombre de una lista.</p>
          <label className="mt-7 block text-sm font-medium" htmlFor="usuario">
            Usuario
          </label>
          <input
            id="usuario"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="david"
            className="mt-2 h-12 w-full rounded-2xl border border-line bg-card px-4 outline-none focus:border-navy"
            required
          />
          <label className="mt-4 block text-sm font-medium" htmlFor="clave">
            Clave
          </label>
          <input
            id="clave"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-line bg-card px-4 outline-none focus:border-navy"
            required
          />
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-6 h-12 w-full rounded-2xl bg-lime font-semibold text-ink disabled:opacity-60"
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
          <p className="mt-5 text-center text-xs text-ink-soft">Taxis Libres · Vincula Libre</p>
        </form>
      </section>
    </main>
  );
}

const CONFETI = [
  { x: "-54px", y: "-72px", r: "140deg", c: "#c6e84a", d: "0s" },
  { x: "36px", y: "-80px", r: "-120deg", c: "#ffffff", d: "0.04s" },
  { x: "-18px", y: "-96px", r: "80deg", c: "#f5c518", d: "0.08s" },
  { x: "62px", y: "-48px", r: "160deg", c: "#c6e84a", d: "0.02s" },
  { x: "-70px", y: "-36px", r: "-90deg", c: "#ffffff", d: "0.1s" },
  { x: "14px", y: "-110px", r: "40deg", c: "#f5c518", d: "0.06s" },
  { x: "78px", y: "-88px", r: "-150deg", c: "#ffffff", d: "0.12s" },
  { x: "-36px", y: "-58px", r: "110deg", c: "#c6e84a", d: "0.05s" },
  { x: "48px", y: "-64px", r: "200deg", c: "#ffffff", d: "0.09s" },
  { x: "-8px", y: "-46px", r: "-40deg", c: "#f5c518", d: "0.03s" },
  { x: "-84px", y: "-70px", r: "70deg", c: "#c6e84a", d: "0.11s" },
  { x: "24px", y: "-28px", r: "180deg", c: "#ffffff", d: "0.07s" },
];

function EscenaTaxi() {
  return (
    <div className="taxi-escena-lienzo" aria-hidden="true">
      <div className="taxi-via" />
      <div className="taxi-confeti">
        {CONFETI.map((papel) => (
          <i
            key={`${papel.x}-${papel.y}`}
            style={{ ["--x" as string]: papel.x, ["--y" as string]: papel.y, ["--r" as string]: papel.r, background: papel.c, animationDelay: papel.d }}
          />
        ))}
      </div>
      <div className="taxi-auto">
        <img src="/taxi-libre.png" alt="" className="block h-auto w-full" />
      </div>
    </div>
  );
}
