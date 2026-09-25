/**
 * Char'd brand mark: a brick oven arch with a flame, and the wordmark beneath.
 * Pure SVG so it scales anywhere and can be recolored with CSS.
 */
export function LogoMark({ size = 64, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Char'd oven mark"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="chard-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#c8551e" />
          <stop offset="0.45" stopColor="#f2a33a" />
          <stop offset="1" stopColor="#ffd97a" />
        </linearGradient>
        <linearGradient id="chard-brick" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b8481a" />
          <stop offset="1" stopColor="#8f3512" />
        </linearGradient>
      </defs>
      {/* arch of bricks */}
      <g fill="url(#chard-brick)" stroke="#1b1614" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M8 58 L8 44 A42 42 0 0 1 92 44 L92 58 L80 58 L80 46 A30 30 0 0 0 20 46 L20 58 Z" />
      </g>
      {/* mortar lines */}
      <g stroke="#1b1614" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M14 58 L14 46" />
        <path d="M86 58 L86 46" />
        <path d="M19.5 33 L28 40" />
        <path d="M80.5 33 L72 40" />
        <path d="M32 22 L37 32" />
        <path d="M68 22 L63 32" />
        <path d="M50 12 L50 24" />
      </g>
      {/* hearth */}
      <rect x="6" y="58" width="88" height="8" rx="2" fill="#2a2321" stroke="#1b1614" strokeWidth="1.6" />
      {/* flame */}
      <path
        d="M50 55 C38 47 40 38 46 32 C45 38 49 40 50 40 C48 34 52 28 58 24 C55 31 61 34 61 41 C61 48 56 53 50 55 Z"
        fill="url(#chard-flame)"
      />
      <path d="M50 53 C45 49 46 44 49 41 C49 45 52 45 52 47 C54 44 55 47 54 49 C53 51 52 52 50 53 Z" fill="#fff3c4" opacity="0.9" />
      {/* char on the hearth */}
      <g fill="#f2a33a" opacity="0.7">
        <circle cx="30" cy="62" r="1" />
        <circle cx="70" cy="62" r="1" />
        <circle cx="50" cy="62" r="1.2" />
      </g>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display uppercase leading-none tracking-[0.06em] ${className}`} aria-label="Char'd">
      Char&rsquo;d
    </span>
  );
}

export function Logo({ size = 72, stacked = true, className = "" }: { size?: number; stacked?: boolean; className?: string }) {
  return (
    <span className={`inline-flex ${stacked ? "flex-col items-center gap-1" : "flex-row items-center gap-3"} ${className}`}>
      <LogoMark size={size} />
      <Wordmark className={stacked ? "text-[1.6em]" : "text-[1.4em]"} />
    </span>
  );
}

/** The oven mark as a standalone SVG string, for image generation (flyers) where React can't render. */
export function logoMarkSvgString(size = 200): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#c8551e"/><stop offset="0.45" stop-color="#f2a33a"/><stop offset="1" stop-color="#ffd97a"/></linearGradient>
<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8481a"/><stop offset="1" stop-color="#8f3512"/></linearGradient>
</defs>
<path d="M8 58 L8 44 A42 42 0 0 1 92 44 L92 58 L80 58 L80 46 A30 30 0 0 0 20 46 L20 58 Z" fill="url(#b)" stroke="#1b1614" stroke-width="1.6" stroke-linejoin="round"/>
<g stroke="#1b1614" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="M14 58 L14 46"/><path d="M86 58 L86 46"/><path d="M19.5 33 L28 40"/><path d="M80.5 33 L72 40"/><path d="M32 22 L37 32"/><path d="M68 22 L63 32"/><path d="M50 12 L50 24"/></g>
<rect x="6" y="58" width="88" height="8" rx="2" fill="#2a2321" stroke="#1b1614" stroke-width="1.6"/>
<path d="M50 55 C38 47 40 38 46 32 C45 38 49 40 50 40 C48 34 52 28 58 24 C55 31 61 34 61 41 C61 48 56 53 50 55 Z" fill="url(#f)"/>
<path d="M50 53 C45 49 46 44 49 41 C49 45 52 45 52 47 C54 44 55 47 54 49 C53 51 52 52 50 53 Z" fill="#fff3c4" opacity="0.9"/>
<g fill="#f2a33a" opacity="0.7"><circle cx="30" cy="62" r="1"/><circle cx="70" cy="62" r="1"/><circle cx="50" cy="62" r="1.2"/></g>
</svg>`;
}
