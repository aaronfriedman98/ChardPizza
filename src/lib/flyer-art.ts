/* Procedural textures for the flyer (grain, stamped speckle, brush stroke, torn paper). SVG data URIs that satori hands to resvg. */

export const FLYER = { CHAR: "#141110", AMBER: "#f2a33a", CREAM: "#f3ebdd", CREAM2: "#c9bda8", BRICK: "#b8472a", INK: "#1b1412" } as const;
const { CHAR } = FLYER;

export function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const uri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
export function hex(c: string) { return [1, 3, 5].map((i) => (parseInt(c.slice(i, i + 2), 16) / 255).toFixed(3)); }

/** Light grain, soft blotches and scratches for the charcoal background. */
export function grunge(w: number, h: number, seed = 3) {
  const r = rng(seed);
  let scratches = "";
  for (let i = 0; i < 40; i++) {
    const x = r() * w, y = r() * h, len = 40 + r() * 220, a = (r() - 0.5) * 0.6;
    scratches += `<line x1="${x}" y1="${y}" x2="${x + Math.cos(a) * len}" y2="${y + Math.sin(a) * len}" stroke="#f3ebdd" stroke-opacity="${0.03 + r() * 0.05}" stroke-width="${0.6 + r() * 1.2}"/>`;
  }
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" seed="${seed}"/><feColorMatrix values="0 0 0 0 0.95 0 0 0 0 0.9 0 0 0 0 0.82 0 0 0 2.2 -1.25"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity="0.5"/><filter id="b" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="${seed + 9}"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1.4 -0.55"/></filter><rect width="100%" height="100%" filter="url(#b)" opacity="0.55"/>${scratches}</svg>`);
}

/** Speckles in the given color, laid over big type so it reads stamped. */
export function distress(w: number, h: number, color: string, seed = 5, amount = 1) {
  const r = rng(seed);
  const [cr, cg, cb] = hex(color);
  let dots = "";
  for (let i = 0; i < 260 * amount; i++) dots += `<circle cx="${r() * w}" cy="${r() * h}" r="${0.6 + r() * r() * 5}" fill="${color}" fill-opacity="${0.5 + r() * 0.5}"/>`;
  for (let i = 0; i < 14 * amount; i++) {
    const x = r() * w, y = r() * h;
    dots += `<path d="M${x} ${y} l${20 + r() * 90} ${(r() - 0.5) * 8}" stroke="${color}" stroke-width="${1 + r() * 2.5}" stroke-linecap="round" opacity="0.8"/>`;
  }
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><filter id="d" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 ${cr} 0 0 0 0 ${cg} 0 0 0 0 ${cb} 0 0 0 9 -6.1"/></filter><rect width="100%" height="100%" filter="url(#d)"/>${dots}</svg>`);
}

/** Rough brush-stroke block. */
export function brush(w: number, h: number, color: string, seed = 11) {
  const r = rng(seed);
  const top: string[] = [], bot: string[] = [];
  for (let x = 14; x <= w - 14; x += 10) {
    top.push(`${x},${4 + r() * h * 0.12}`);
    bot.push(`${x},${h - 4 - r() * h * 0.12}`);
  }
  const rightEnd: string[] = [], leftEnd: string[] = [];
  for (let i = 0; i <= 8; i++) {
    const y = (h * i) / 8;
    rightEnd.push(`${w - 14 + r() * 14 - (i % 2 ? 10 : 0)},${y}`);
    leftEnd.push(`${r() * 12},${h - y}`);
  }
  let streaks = "";
  for (let i = 0; i < 7; i++) {
    const y = h * (0.1 + r() * 0.8);
    streaks += `<path d="M${w * (0.1 + r() * 0.3)} ${y} L${w * (0.75 + r() * 0.3)} ${y + (r() - 0.5) * 6}" stroke="${CHAR}" stroke-opacity="${0.08 + r() * 0.1}" stroke-width="${1 + r() * 2}"/>`;
  }
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><polygon fill="${color}" points="${[...top, ...rightEnd, ...bot.reverse(), ...leftEnd].join(" ")}"/>${streaks}</svg>`);
}

/** Paper with torn edges on the chosen sides. */
export function paper(w: number, h: number, color: string, sides: { t?: boolean; r?: boolean; b?: boolean; l?: boolean }, seed = 21) {
  const r = rng(seed), d = 16;
  const pts: string[] = [];
  const edge = (on: boolean | undefined, from: [number, number], to: [number, number], inward: [number, number]) => {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const n = Math.max(2, Math.round(len / 9));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const j = on ? r() * d * (r() < 0.15 ? 1.6 : 1) : 0;
      pts.push(`${(from[0] + (to[0] - from[0]) * t + inward[0] * j).toFixed(1)},${(from[1] + (to[1] - from[1]) * t + inward[1] * j).toFixed(1)}`);
    }
  };
  edge(sides.t, [0, 0], [w, 0], [0, 1]);
  edge(sides.r, [w, 0], [w, h], [-1, 0]);
  edge(sides.b, [w, h], [0, h], [0, -1]);
  edge(sides.l, [0, h], [0, 0], [1, 0]);
  const poly = pts.join(" ");
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><clipPath id="c"><polygon points="${poly}"/></clipPath><polygon fill="${color}" points="${poly}"/><filter id="p" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.6" numOctaves="3" seed="${seed}"/><feColorMatrix values="0 0 0 0 0.3 0 0 0 0 0.2 0 0 0 0 0.1 0 0 0 0.9 -0.35"/></filter><rect width="100%" height="100%" filter="url(#p)" opacity="0.45" clip-path="url(#c)"/></svg>`);
}

