/**
 * Char'd brand: nine rounded bricks in a half circle over a two-piece hearth (brick red),
 * and the wordmark CHAR'D in Anton with a grit filter. Files for print and email live in /public/brand.
 */
const BRICKS = (() => {
  const n = 9, r = 46, cx = 60, cy = 66, bh = 16, gap = 0.07;
  const step = Math.PI / n;
  const width = 2 * r * Math.sin((step * (1 - gap)) / 2);
  const out: { x: number; y: number; w: number; h: number; rot: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI - step * (i + 0.5);
    const x = cx + r * Math.cos(a);
    const y = cy - r * Math.sin(a);
    out.push({ x: x - width / 2, y: y - bh / 2, w: width, h: bh, rot: -(a * 180) / Math.PI + 90 });
  }
  return { bricks: out, hearth: { y: cy + 4, left: cx - r - bh / 2 - 2, w: r + bh / 2 + 0.5, h: bh * 0.62, right: cx + 1.5 }, bh };
})();

export function LogoMark({ size = 48, color = "#b8472a", className = "" }: { size?: number; color?: string; className?: string }) {
  const h = Math.round((size * 84) / 120);
  return (
    <svg width={size} height={h} viewBox="0 0 120 84" className={className} role="img" aria-label="Char'd brick oven" xmlns="http://www.w3.org/2000/svg">
      {BRICKS.bricks.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={BRICKS.bh * 0.22} fill={color} transform={`rotate(${b.rot} ${b.x + b.w / 2} ${b.y + b.h / 2})`} />
      ))}
      <rect x={BRICKS.hearth.left} y={BRICKS.hearth.y} width={BRICKS.hearth.w} height={BRICKS.hearth.h} rx="2.4" fill={color} />
      <rect x={BRICKS.hearth.right} y={BRICKS.hearth.y} width={BRICKS.hearth.w} height={BRICKS.hearth.h} rx="2.4" fill={color} />
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
      <Wordmark className={stacked ? "text-[1.4em]" : "text-[1.1em]"} />
    </span>
  );
}

/** The mark as a standalone SVG string, for image generation (flyers). */
export function logoMarkSvgString(size = 200, color = "#b8472a"): string {
  const h = Math.round((size * 84) / 120);
  const rects = BRICKS.bricks
    .map((b) => `<rect x="${b.x.toFixed(2)}" y="${b.y.toFixed(2)}" width="${b.w.toFixed(2)}" height="${b.h}" rx="${(BRICKS.bh * 0.22).toFixed(2)}" fill="${color}" transform="rotate(${b.rot.toFixed(2)} ${(b.x + b.w / 2).toFixed(2)} ${(b.y + b.h / 2).toFixed(2)})"/>`)
    .join("");
  const hearth = `<rect x="${BRICKS.hearth.left}" y="${BRICKS.hearth.y}" width="${BRICKS.hearth.w}" height="${BRICKS.hearth.h.toFixed(2)}" rx="2.4" fill="${color}"/><rect x="${BRICKS.hearth.right}" y="${BRICKS.hearth.y}" width="${BRICKS.hearth.w}" height="${BRICKS.hearth.h.toFixed(2)}" rx="2.4" fill="${color}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${h}" viewBox="0 0 120 84">${rects}${hearth}</svg>`;
}
