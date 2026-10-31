import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Board } from "@/components/board";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <p className="grid min-h-screen place-items-center text-ink-soft">Cargando…</p>;
  if (!user) return <Navigate to="/login" />;
  return <Board />;
}
