/**
 * Char'd brand mark: a thin oven arch in gold with a small flame, and an italic serif wordmark.
 */
export function LogoMark({ size = 40, className = "", color = "#c9a25c", flame = "#e0642a" }: { size?: number; className?: string; color?: string; flame?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} role="img" aria-label="Char'd oven mark" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 34V25a16 16 0 0 1 32 0v9" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M4 34h40" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M24 31c-5-3-4-8-1-11 0 3 2 4 3 4-1-3 1-6 4-8-1 4 3 5 3 9 0 3-3 6-9 6z" fill={flame} />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display italic font-semibold leading-none tracking-[0.01em] ${className}`} aria-label="Char'd">
      Char&rsquo;d
    </span>
  );
}

export function Logo({ size = 40, stacked = false, className = "" }: { size?: number; stacked?: boolean; className?: string }) {
  return (
    <span className={`inline-flex ${stacked ? "flex-col items-center gap-2" : "flex-row items-center gap-3"} ${className}`}>
      <LogoMark size={size} />
      <Wordmark className={stacked ? "text-[1.7em]" : "text-[1.4em]"} />
    </span>
  );
}

/** The oven mark as a standalone SVG string, for image generation (flyers). */
export function logoMarkSvgString(size = 200, color = "#c9a25c", flame = "#e0642a"): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M8 34V25a16 16 0 0 1 32 0v9" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
<path d="M4 34h40" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
<path d="M24 31c-5-3-4-8-1-11 0 3 2 4 3 4-1-3 1-6 4-8-1 4 3 5 3 9 0 3-3 6-9 6z" fill="${flame}"/>
</svg>`;
}
