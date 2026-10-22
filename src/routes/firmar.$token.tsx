import { createFileRoute } from "@tanstack/react-router";
import { PortalFirma } from "@/components/portal-firma";

export const Route = createFileRoute("/firmar/$token")({
  component: Firmar,
});

function Firmar() {
  const { token } = Route.useParams();
  return <PortalFirma token={token} />;
}
