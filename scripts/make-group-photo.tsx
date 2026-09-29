// WhatsApp group profile photo (square, shown cropped to a circle).
// Run: npx tsx scripts/make-group-photo.tsx  →  public/brand/chard-whatsapp-group.png (+ mark-only variant)
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { logoMarkSvgString } from "../src/components/brand/logo";
import { FLYER, distress, grunge, uri } from "../src/lib/flyer-art";

const S = 1080;
const { CHAR, CREAM, BRICK } = FLYER;

async function font(f: string) {
  const b = await readFile(path.join(process.cwd(), "src/assets/fonts", f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/** Oven-mouth glow: hot core fading to brick then to nothing. */
function glow(cy: number, r: number) {
  return uri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><defs><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffb35c" stop-opacity="0.95"/><stop offset="0.25" stop-color="#f07a2e" stop-opacity="0.6"/><stop offset="0.6" stop-color="#b8472a" stop-opacity="0.22"/><stop offset="1" stop-color="#b8472a" stop-opacity="0"/></radialGradient><radialGradient id="v" cx="50%" cy="50%" r="50%"><stop offset="0.7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient></defs><ellipse cx="${S / 2}" cy="${cy}" rx="${r}" ry="${r * 0.6}" fill="url(#g)"/><rect width="${S}" height="${S}" fill="url(#v)"/></svg>`,
  );
}

function Photo({ wordmark }: { wordmark: boolean }) {
  const markW = wordmark ? 560 : 720;
  const markH = Math.round((markW * 84) / 120);
  // The glow sits where the oven mouth is: just under the arch's centre.
  const glowY = wordmark ? 505 : 610;
  return (
    <div style={{ width: S, height: S, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: CHAR, position: "relative" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={grunge(S, S, 12)} width={S} height={S} alt="" style={{ position: "absolute", top: 0, left: 0 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={glow(glowY, wordmark ? 320 : 400)} width={S} height={S} alt="" style={{ position: "absolute", top: 0, left: 0 }} />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={uri(logoMarkSvgString(markW, BRICK))} width={markW} height={markH} alt="" style={{ marginTop: wordmark ? 0 : 60 }} />
      {wordmark && (
        <div style={{ display: "flex", position: "relative", marginTop: 34 }}>
          <div style={{ fontFamily: "Anton", fontSize: 210, lineHeight: 1, color: CREAM, letterSpacing: 6 }}>{"CHAR’D"}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={distress(600, 210, CHAR, 19, 0.35)} width={600} height={210} alt="" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
        </div>
      )}
    </div>
  );
}

async function main() {
  const fonts = [{ name: "Anton", data: await font("Anton-Regular.ttf"), weight: 400 as const, style: "normal" as const }];
  for (const [file, wordmark] of [["chard-whatsapp-group.png", true], ["chard-whatsapp-group-mark.png", false]] as const) {
    const res = new ImageResponse(<Photo wordmark={wordmark} />, { width: S, height: S, fonts });
    await writeFile(path.join("public/brand", file), Buffer.from(await res.arrayBuffer()));
    console.log("wrote public/brand/" + file);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
