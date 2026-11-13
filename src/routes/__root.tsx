import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { EcoBotones } from "@/components/eco-botones";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

function publicShareHost(raw: string) {
  const host = raw.split(",")[0]?.trim().split(":")[0]?.toLowerCase() ?? "";
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) return "";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return "";
  if (host === "vercel.app" || host.endsWith(".vercel.app") || host === "vercel.com" || host.endsWith(".vercel.com")) return "";
  return host;
}

export const Route = createRootRoute({
  headers: () => ({
    "cache-control": "no-store",
  }),
  head: () => {
    const host = publicShareHost(String(import.meta.env.VITE_PUBLIC_HOSTNAME ?? ""));
    const xBanner = host ? `https://${host}/x-banner.jpg` : "";
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "Vincula Libre" },
        { name: "theme-color", content: "#1B3A4B" },
        ...(xBanner ? [{ property: "x:game:image", content: xBanner }] : []),
      ],
      links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap",
      },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      ],
    };
  },
  component: () => (
    <html lang="es" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var k='vl-boot';function retry(){var now=Date.now(),prev=0;try{prev=Number(sessionStorage.getItem(k)||0);}catch(e){}if(prev&&now-prev<20000){if(document.body)document.body.innerHTML='<p style=\"font-family:Outfit,sans-serif;text-align:center;margin-top:40vh;color:#1B3A4B\">No cargó. Cierra esta pestaña y vuelve a abrir el sitio.</p>';return;}try{sessionStorage.setItem(k,String(now));}catch(e){}location.replace(location.pathname+(location.search?location.search+'&':'?')+'r='+now);}window.addEventListener('error',function(e){var t=e.target;if(!t||(t.tagName!=='SCRIPT'&&t.tagName!=='LINK'))return;var src=String(t.src||t.href||'');if(src.indexOf('/assets/')===-1)return;retry();},true);window.addEventListener('unhandledrejection',function(e){var msg=String((e.reason&&e.reason.message)||e.reason||'');if(msg.indexOf('/assets/')===-1&&msg.indexOf('dynamically imported module')===-1)return;retry();});setTimeout(function(){try{sessionStorage.removeItem(k);}catch(e){}},8000);})();",
          }}
        />
        <PreviewHostBridge />
        <EcoBotones />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
