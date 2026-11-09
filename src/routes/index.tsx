import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { authClient } from "@/lib/auth/client";
import { Board } from "@/components/board";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  const [revisado, setRevisado] = useState(false);

  useEffect(() => {
    if (isPending || user) return;
    let cancel = false;
    const entro = Number(sessionStorage.getItem("vl-entro") || 0);
    const reciente = entro > 0 && Date.now() - entro < 20000;
    if (reciente && sessionStorage.getItem("vl-reintento") !== "1") {
      sessionStorage.setItem("vl-reintento", "1");
      window.location.reload();
      return;
    }
    const espera = window.setTimeout(() => {
      void authClient.getSession().finally(() => {
        if (!cancel) setRevisado(true);
      });
    }, 400);
    return () => {
      cancel = true;
      window.clearTimeout(espera);
    };
  }, [isPending, user]);

  useEffect(() => {
    if (!user) return;
    sessionStorage.removeItem("vl-entro");
    sessionStorage.removeItem("vl-reintento");
  }, [user]);

  if (isPending || (!user && !revisado)) {
    return <p className="grid min-h-screen place-items-center text-ink-soft">Cargando…</p>;
  }
  if (!user) return <Navigate to="/login" />;
  return <Board />;
}
