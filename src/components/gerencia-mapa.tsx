const TRAZO =
  "M86.8 296.9 L77.5 291.4 L66.8 283.8 L60.6 287.5 L42.1 284.3 L36.8 274.4 L32.8 274.8 L11.0 261.7 L8.0 254.6 L16.1 252.8 L15.2 241.4 L20.3 233.0 L31.1 231.5 L40.3 217.1 L48.6 205.0 L40.6 199.6 L44.7 186.3 L39.8 165.3 L44.4 159.3 L41.0 139.8 L32.2 127.6 L35.0 116.5 L42.0 118.1 L46.1 111.3 L41.0 97.8 L43.7 94.4 L54.9 95.2 L71.3 79.1 L80.3 76.7 L80.5 69.1 L84.5 49.7 L97.0 39.1 L110.7 38.6 L112.5 33.9 L129.5 35.8 L146.7 24.2 L155.2 19.1 L165.7 8.0 L173.4 9.4 L179.1 15.4 L174.9 23.2 L160.9 27.0 L155.4 38.5 L147.0 45.1 L140.6 53.6 L138.0 70.0 L131.9 83.4 L143.2 84.9 L146.0 95.5 L150.8 100.5 L152.5 109.8 L149.9 118.2 L150.7 123.0 L156.0 124.9 L161.2 133.0 L189.2 130.7 L201.9 133.7 L217.2 153.4 L226.0 151.0 L241.7 152.2 L254.2 149.6 L261.9 153.5 L257.9 165.9 L253.1 173.6 L251.4 190.0 L255.8 205.3 L261.9 212.1 L262.7 217.2 L251.7 228.7 L259.6 233.7 L265.4 241.7 L272.0 264.6 L267.9 267.4 L263.6 253.9 L257.6 246.6 L250.4 254.5 L207.9 254.0 L208.2 268.4 L221.0 270.8 L220.2 279.5 L215.9 277.2 L203.6 281.0 L203.5 297.6 L213.1 306.0 L216.6 319.1 L216.0 329.1 L206.2 392.0 L195.3 379.8 L188.8 379.3 L202.9 355.9 L186.2 345.2 L173.1 347.1 L165.3 343.2 L153.2 349.2 L137.0 346.4 L124.2 322.3 L114.1 316.4 L107.1 305.6 L92.6 294.7 L86.8 296.9 Z";

const SITIOS: { clave: string; x: number; y: number }[] = [
  { clave: "bogot", x: 115.2, y: 185.3 },
  { clave: "cali", x: 61.6, y: 214.2 },
  { clave: "medell", x: 82.7, y: 149.9 },
  { clave: "barran", x: 99.2, y: 41.8 },
  { clave: "bucara", x: 135.9, y: 130 },
  { clave: "cartag", x: 83.8, y: 54.7 },
];

function plano(nombre: string) {
  return nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function sitioDe(nombre: string) {
  const limpio = plano(nombre);
  return SITIOS.find((sitio) => limpio.includes(sitio.clave)) ?? null;
}

export function MapaPais({
  ciudades,
  activa,
  onElegir,
}: {
  ciudades: { id: number; nombre: string; abiertos: number; activa: boolean }[];
  activa: number;
  onElegir: (id: number) => void;
}) {
  const sueltas = ciudades.filter((ciudad) => !sitioDe(ciudad.nombre));
  return (
    <div>
      <svg viewBox="0 0 280 400" className="mx-auto h-[28rem] w-full max-w-sm" role="img" aria-label="Mapa de Colombia">
        <path d={TRAZO} className="fill-navy/10 stroke-navy" strokeWidth="2" />
        {ciudades.map((ciudad) => {
          const sitio = sitioDe(ciudad.nombre);
          if (!sitio) return null;
          const on = ciudad.id === activa;
          return (
            <g key={ciudad.id} onClick={() => onElegir(ciudad.id)} className="cursor-pointer">
              <circle cx={sitio.x} cy={sitio.y} r={on ? 9 : 7} className={ciudad.activa ? "fill-lime stroke-navy" : "fill-ink-soft"} strokeWidth="2" />
              <text x={sitio.x + 12} y={sitio.y + 4} className="fill-navy text-[11px] font-semibold">
                {ciudad.nombre} · {ciudad.abiertos}
              </text>
            </g>
          );
        })}
      </svg>
      {sueltas.length ? (
        <p className="mt-2 text-xs text-ink-soft">
          Sin punto en el mapa: {sueltas.map((ciudad) => ciudad.nombre).join(", ")}. Toca el nombre en la lista.
        </p>
      ) : (
        <p className="mt-2 text-xs text-ink-soft">Toca una ciudad en el mapa para verla.</p>
      )}
    </div>
  );
}
