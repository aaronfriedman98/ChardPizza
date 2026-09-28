/**
 * Char'd brand mark.
 * LogoMark: a brick oven arch (three courses, mortar lines) over a stone hearth, with a three-tongue flame.
 * Wordmark: "CHAR'D" set in Rubik Burned with an ember gradient rising from the baseline (see .wordmark).
 */
export function LogoMark({ size = 48, className = "", gold = "#c9a25c", brick = "#8a4a2c", flame = "#e0642a" }: { size?: number; className?: string; gold?: string; brick?: string; flame?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} role="img" aria-label="Char'd oven mark" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cm-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={flame} />
          <stop offset="0.55" stopColor="#f2a33a" />
          <stop offset="1" stopColor="#ffe08a" />
        </linearGradient>
        <linearGradient id="cm-brick" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={brick} />
          <stop offset="1" stopColor="#5e3120" />
        </linearGradient>
      </defs>
      {/* outer arch */}
      <path d="M6 46V32a26 26 0 0 1 52 0v14" stroke={gold} strokeWidth="1.6" strokeLinecap="round" />
      {/* brick courses (three concentric arches) */}
      <path d="M10 46V32a22 22 0 0 1 44 0v14" stroke="#1a110c" strokeWidth="0.8" />
      <path d="M10 46V32a22 22 0 0 1 44 0v14 h-6 V32a16 16 0 0 0-32 0v14z" fill="url(#cm-brick)" />
      {/* mortar joints */}
      <g stroke="#1a110c" strokeWidth="0.9" strokeLinecap="round">
        <path d="M13 40 L18.5 40.5" />
        <path d="M15.5 30 L20.5 32.5" />
        <path d="M22 21.5 L25.5 26" />
        <path d="M32 18 L32 24" />
        <path d="M42 21.5 L38.5 26" />
        <path d="M48.5 30 L43.5 32.5" />
        <path d="M51 40 L45.5 40.5" />
        <path d="M12 35 L16 35.5" />
        <path d="M52 35 L48 35.5" />
      </g>
      {/* hearth stone */}
      <rect x="4" y="46" width="56" height="6" rx="1" fill="#2a1a12" stroke={gold} strokeWidth="1.2" />
      <path d="M8 49h48" stroke="#1a110c" strokeWidth="0.8" strokeDasharray="6 4" />
      {/* flame */}
      <path d="M32 44c-7-3.5-8-10-3.5-14.5 0 4 2.6 5.4 4 5.4-1.6-4 .6-8.4 5-11-1.2 5 4.4 6.6 4.2 11.8-.2 4.3-3.8 7.4-9.7 8.3z" fill="url(#cm-flame)" />
      <path d="M32 42.5c-3.4-2-3.6-5.4-1.4-7.6 0 2 1.4 2.8 2.2 2.8-.8-2.2.4-4.4 2.4-5.6-.4 2.6 2.4 3.4 2.2 6-.1 2.2-2.2 4-5.4 4.4z" fill="#fff3c4" opacity="0.85" />
      {/* embers on the hearth */}
      <g fill="#f2a33a" opacity="0.8">
        <circle cx="22" cy="49" r="0.9" />
        <circle cx="41" cy="49" r="0.9" />
        <circle cx="32" cy="49.2" r="1.1" />
      </g>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark leading-none ${className}`} aria-label="Char'd">
      CHAR&rsquo;D
    </span>
  );
}

export function Logo({ size = 56, stacked = false, className = "" }: { size?: number; stacked?: boolean; className?: string }) {
  return (
    <span className={`inline-flex ${stacked ? "flex-col items-center gap-2" : "flex-row items-center gap-3"} ${className}`}>
      <LogoMark size={size} />
      <Wordmark className={stacked ? "text-[1.5em]" : "text-[1.15em]"} />
    </span>
  );
}

/** The oven mark as a standalone SVG string, for image generation (flyers). */
export function logoMarkSvgString(size = 200, gold = "#c9a25c", flame = "#e0642a"): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${flame}"/><stop offset="0.55" stop-color="#f2a33a"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a4a2c"/><stop offset="1" stop-color="#5e3120"/></linearGradient>
</defs>
<path d="M6 46V32a26 26 0 0 1 52 0v14" stroke="${gold}" stroke-width="1.6" stroke-linecap="round"/>
<path d="M10 46V32a22 22 0 0 1 44 0v14 h-6 V32a16 16 0 0 0-32 0v14z" fill="url(#b)"/>
<g stroke="#1a110c" stroke-width="0.9" stroke-linecap="round"><path d="M13 40 L18.5 40.5"/><path d="M15.5 30 L20.5 32.5"/><path d="M22 21.5 L25.5 26"/><path d="M32 18 L32 24"/><path d="M42 21.5 L38.5 26"/><path d="M48.5 30 L43.5 32.5"/><path d="M51 40 L45.5 40.5"/><path d="M12 35 L16 35.5"/><path d="M52 35 L48 35.5"/></g>
<rect x="4" y="46" width="56" height="6" rx="1" fill="#2a1a12" stroke="${gold}" stroke-width="1.2"/>
<path d="M32 44c-7-3.5-8-10-3.5-14.5 0 4 2.6 5.4 4 5.4-1.6-4 .6-8.4 5-11-1.2 5 4.4 6.6 4.2 11.8-.2 4.3-3.8 7.4-9.7 8.3z" fill="url(#f)"/>
<path d="M32 42.5c-3.4-2-3.6-5.4-1.4-7.6 0 2 1.4 2.8 2.2 2.8-.8-2.2.4-4.4 2.4-5.6-.4 2.6 2.4 3.4 2.2 6-.1 2.2-2.2 4-5.4 4.4z" fill="#fff3c4" opacity="0.85"/>
<g fill="#f2a33a" opacity="0.8"><circle cx="22" cy="49" r="0.9"/><circle cx="41" cy="49" r="0.9"/><circle cx="32" cy="49.2" r="1.1"/></g>
</svg>`;
}
