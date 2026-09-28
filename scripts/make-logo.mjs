// Generates the Char'd brand mark (9 rounded bricks in a half circle over a two-piece hearth).
// Writes: src/app/icon.svg (favicon), public/brand/chard-mark.svg, and an HTML sheet used to
// render PNG lockups with the wordmark (see scripts/render-logo.sh).
import { mkdirSync, writeFileSync } from "node:fs";

const RED = "#b8472a";

export function markSvg({ color = RED, size = 512, bg = null } = {}) {
  const n = 9, r = 46, cx = 60, cy = 66, bh = 16, gap = 0.07;
  const step = Math.PI / n;
  const brickAngle = step * (1 - gap);
  const width = 2 * r * Math.sin(brickAngle / 2);
  let inner = "";
  if (bg) inner += `<rect width="120" height="84" fill="${bg}"/>`;
  for (let i = 0; i < n; i++) {
    const a = Math.PI - step * (i + 0.5);
    const x = cx + r * Math.cos(a);
    const y = cy - r * Math.sin(a);
    const rot = -(a * 180) / Math.PI + 90;
    inner += `<rect x="${(x - width / 2).toFixed(2)}" y="${(y - bh / 2).toFixed(2)}" width="${width.toFixed(2)}" height="${bh}" rx="${(bh * 0.22).toFixed(2)}" fill="${color}" transform="rotate(${rot.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})"/>`;
  }
  const y = cy + 4;
  inner += `<rect x="${cx - r - bh / 2 - 2}" y="${y}" width="${r + bh / 2 + 0.5}" height="${(bh * 0.62).toFixed(2)}" rx="2.4" fill="${color}"/>`;
  inner += `<rect x="${cx + 1.5}" y="${y}" width="${r + bh / 2 + 0.5}" height="${(bh * 0.62).toFixed(2)}" rx="2.4" fill="${color}"/>`;
  const h = Math.round((size * 84) / 120);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${h}" viewBox="0 0 120 84">${inner}</svg>`;
}

// Square favicon: mark centered on the wood color so it reads in a browser tab.
export function iconSvg() {
  const m = markSvg({ size: 120 }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="#160f0b"/><g transform="translate(4 22)">${m}</g></svg>`;
}

if (process.argv[1] && process.argv[1].endsWith("make-logo.mjs")) {
  mkdirSync("public/brand", { recursive: true });
  writeFileSync("public/brand/chard-mark.svg", markSvg());
  writeFileSync("public/brand/chard-mark-cream.svg", markSvg({ color: "#f1e6d2" }));
  writeFileSync("public/brand/chard-mark-black.svg", markSvg({ color: "#160f0b" }));
  writeFileSync("src/app/icon.svg", iconSvg());
  console.log("wrote mark svgs + favicon");
}
