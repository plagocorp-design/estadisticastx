import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/client";
import { prepareTeam } from "@/lib/casos.functions";
import { resolverUsuario } from "@/lib/control.functions";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      await navigate({ to: "/" });
    } catch {
      setError("No pude entrar. Revisa usuario y clave.");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-navy px-10 py-12 text-paper lg:flex">
        <div className="flex items-center gap-3">
          <Mark />
          <p className="text-lg font-semibold tracking-tight">Vincula Libre</p>
        </div>
        <div>
          <p className="text-sm font-medium text-lime">Seguimiento de afiliaciones</p>
          <h1 className="mt-3 max-w-md text-4xl font-semibold leading-tight">
            Cada asesor ve lo suyo. El asesor líder y coordinación ven el equipo y preguntan en cada proceso.
          </h1>
          <ol className="mt-8 space-y-2 text-sm text-paper/80">
            <li>1. El propietario dijo sí</li>
            <li>2. Documentos y formulario</li>
            <li>3. Firma de carta y contrato</li>
            <li>4. Póliza en Vía Seguros</li>
            <li>5. Operativa, tarjeta y entrega</li>
          </ol>
        </div>
        <p className="text-xs text-paper/60">Radio Taxi Aeropuerto · Taxis Libres</p>
      </section>
      <section className="flex items-center justify-center px-5 py-10">
        <form onSubmit={submit} className="rise w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <Mark />
            <p className="text-lg font-semibold">Vincula Libre</p>
          </div>
          <h2 className="text-2xl font-semibold">Entra</h2>
          <p className="mt-1 text-sm text-ink-soft">Escribe tu usuario y tu clave. Ya no hay que escoger el nombre.</p>
          <label className="mt-6 block text-sm font-medium" htmlFor="usuario">
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
            className="mt-5 h-12 w-full rounded-2xl bg-lime font-semibold text-ink disabled:opacity-60"
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Mark() {
  return (
    <span className="grid h-10 w-10 place-items-center rounded-xl bg-lime text-lg font-bold text-navy">T</span>
  );
}
