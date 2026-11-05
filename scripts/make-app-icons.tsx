// Home-screen / PWA icons: brick mark centred on wood, full-bleed (iOS rounds the corners itself).
// Run: npx tsx scripts/make-app-icons.tsx
import { mkdir, writeFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import { logoMarkSvgString } from "../src/components/brand/logo";

const WOOD = "#160f0b";
const BRICK = "#b8472a";
const uri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/** `inset` leaves safe padding for Android "maskable" icons, which crop to a circle. */
function Icon({ size, inset }: { size: number; inset: number }) {
  const w = Math.round(size * (1 - inset * 2));
  const h = Math.round((w * 84) / 120);
  return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: WOOD }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={uri(logoMarkSvgString(w, BRICK))} width={w} height={h} alt="" style={{ marginTop: Math.round(size * 0.04) }} />
    </div>
  );
}

async function render(file: string, size: number, inset: number) {
  const res = new ImageResponse(<Icon size={size} inset={inset} />, { width: size, height: size });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  console.log("wrote", file);
}

async function main() {
  await mkdir("public/icons", { recursive: true });
  await render("src/app/apple-icon.png", 180, 0.16);
  await render("public/icons/icon-192.png", 192, 0.16);
  await render("public/icons/icon-512.png", 512, 0.16);
  await render("public/icons/icon-512-maskable.png", 512, 0.24);
}
main().catch((e) => { console.error(e); process.exit(1); });
