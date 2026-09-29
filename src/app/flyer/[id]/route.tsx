import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logoMarkSvgString } from "@/components/brand/logo";
import type { DeliveryZone, MenuItem, Service, ServiceMenuItem, Settings } from "@/lib/types";
import { fmtDateOnly, fmtTime } from "@/lib/time";
import { orderUrl } from "@/lib/share";
import { FLYER, brush, distress, grunge, paper, uri } from "@/lib/flyer-art";

export const runtime = "nodejs";

const W = 1080;
const H = 1350;
const { CHAR, AMBER, CREAM, CREAM2, BRICK, INK } = FLYER;
const PIE_CAP = 3;
const SIDE_CAP = 4;

async function font(file: string) {
  const buf = await readFile(path.join(process.cwd(), "src", "assets", "fonts", file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function posterDataUri() {
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "media", "hero-oven.jpg"));
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const money = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const caps = (s: string) => s.toUpperCase().replace(/'/g, "’");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).replace(/[\s,.;]+\S*$/, "")}…` : s);

/** "7–10 PM", "7:30–10 PM", "11 AM–2 PM". */
function hoursRange(startIso: string, endIso: string, tz: string) {
  const a = fmtTime(startIso, tz).replace(":00", "");
  const b = fmtTime(endIso, tz).replace(":00", "");
  const [aT, aM] = a.split(" ");
  const [, bM] = b.split(" ");
  return `${aM === bM ? aT : a}–${b}`;
}

export async function GET(_req: Request, ctx: RouteContext<"/flyer/[id]">) {
  const { id } = await ctx.params;
  const db = createAdminClient();
  const [{ data: serviceRow }, { data: settingsRow }, { data: smi }, { data: sz }] = await Promise.all([
    db.from("services").select("*").eq("id", id).maybeSingle(),
    db.from("settings").select("*").eq("id", true).single(),
    db
      .from("service_menu_items")
      .select("*, menu_items(name, description, capacity_units)")
      .eq("service_id", id)
      .eq("is_available", true)
      .eq("sold_out_manual", false)
      .order("sort_order"),
    db.from("service_delivery_zones").select("delivery_zones(name)").eq("service_id", id),
  ]);
  if (!serviceRow) return new Response("Not found", { status: 404 });
  const s = serviceRow as Service;

  // Published sales are public information; anything else needs an admin.
  if (s.status !== "scheduled" && s.status !== "live") {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });
  }

  const settings = settingsRow as Settings;
  const tz = settings.time_zone;
  const rows = (smi ?? []) as (ServiceMenuItem & { menu_items: Pick<MenuItem, "name" | "description" | "capacity_units"> })[];
  const all = rows.map((r) => ({
    name: r.menu_items.name,
    description: r.description_override ?? r.menu_items.description ?? "",
    price_cents: r.price_cents,
    isPie: Number(r.menu_items.capacity_units) > 0,
  }));
  const pies = all.filter((i) => i.isPie);
  const sides = all.filter((i) => !i.isPie);
  const shown = pies.slice(0, PIE_CAP);
  const more = pies.length - shown.length;
  const uniform = pies.length > 0 && new Set(pies.map((p) => p.price_cents)).size === 1 ? `${money(pies[0].price_cents)} A PIE` : null;
  const tight = shown.length >= 3 || sides.length > 0 || more > 0;

  const zones = ((sz ?? []) as unknown as { delivery_zones: Pick<DeliveryZone, "name"> }[]).map((z) => z.delivery_zones.name);
  const url = orderUrl(settings, "flyer");
  const shortUrl = settings.public_url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const payments = [s.cash_enabled && "Cash", s.zelle_enabled && "Zelle", s.card_enabled && "Card"].filter(Boolean).join(" or ");
  const zoneText = zones.join(" & ");
  const how =
    s.pickup_enabled && s.delivery_enabled
      ? `Pickup or delivery${zoneText ? ` to ${zoneText}` : ""}`
      : s.delivery_enabled
        ? `Delivery only${zoneText ? ` · ${zoneText}` : ""}`
        : "Pickup only";
  const footerLine = [how, payments].filter(Boolean).join("  ·  ");

  const [anton, karla, karlaBold, qr, poster] = await Promise.all([
    font("Anton-Regular.ttf"),
    font("Karla-Regular.ttf"),
    font("Karla-Bold.ttf"),
    QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: INK, light: AMBER } }),
    posterDataUri(),
  ]);
  const day = fmtDateOnly(s.service_date, "EEEE").toUpperCase();
  const dateLine = `${fmtDateOnly(s.service_date, "MMM d").toUpperCase()}  ·  ${hoursRange(s.starts_at, s.ends_at, tz)}`;
  const dayFs = Math.min(tight ? 170 : 200, Math.floor(1560 / Math.max(day.length, 6)));
  const pizzaFs = tight ? 230 : 270;
  const label = { fontSize: 18, fontWeight: 700, letterSpacing: 6, color: AMBER } as const;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", backgroundColor: CHAR, color: CREAM, fontFamily: "Karla", position: "relative" }}>
        {poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} width={W} height={700} alt="" style={{ position: "absolute", top: 0, left: 0, width: W, height: 700, objectFit: "cover", objectPosition: "70% 55%", opacity: 0.8 }} />
        )}
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: 700, backgroundImage: `linear-gradient(180deg, rgba(20,17,16,0.7) 0%, rgba(20,17,16,0.05) 30%, rgba(20,17,16,0.6) 70%, ${CHAR} 100%)` }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={grunge(W, H)} width={W} height={H} alt="" style={{ position: "absolute", top: 0, left: 0 }} />

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", padding: "52px 64px 0 64px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={uri(logoMarkSvgString(78, BRICK))} width={78} height={55} alt="" />
          <div style={{ fontFamily: "Anton", fontSize: 44, marginLeft: 14, marginTop: 6, letterSpacing: 1 }}>{"CHAR’D"}</div>
          <div style={{ marginLeft: "auto", fontSize: 17, fontWeight: 700, letterSpacing: 6, color: AMBER }}>WOOD-FIRED · SOUTHFIELD</div>
        </div>

        {/* stamped headline */}
        <div style={{ display: "flex", flexDirection: "column", position: "relative", padding: `${tight ? 36 : 64}px 58px 0 58px` }}>
          <div style={{ fontFamily: "Anton", fontSize: dayFs, lineHeight: 0.9, color: AMBER, letterSpacing: 2 }}>{day}</div>
          <div style={{ fontFamily: "Anton", fontSize: pizzaFs, lineHeight: 0.86, color: CREAM, letterSpacing: 4, marginTop: 4 }}>PIZZA</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={distress(W, 520, CHAR, 7, 1.4)} width={W} height={520} alt="" style={{ position: "absolute", top: 40, left: 0 }} />
        </div>

        {/* date on a brush stroke */}
        <div style={{ display: "flex", position: "relative", width: 640, height: 92, marginLeft: 44, marginTop: 18, transform: "rotate(-2deg)", alignItems: "center", justifyContent: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brush(640, 92, AMBER)} width={640} height={92} alt="" style={{ position: "absolute", top: 0, left: 0 }} />
          <div style={{ fontFamily: "Anton", fontSize: 50, color: INK, letterSpacing: 3 }}>{dateLine}</div>
        </div>

        {/* menu */}
        <div style={{ display: "flex", flexDirection: "column", padding: "40px 64px 0 64px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={label}>THE PIES</div>
            <div style={{ flex: 1, height: 2, backgroundColor: BRICK, margin: "0 20px", opacity: 0.8 }} />
            {uniform && <div style={{ ...label, color: CREAM }}>{uniform}</div>}
          </div>
          {shown.map((p, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", marginTop: tight ? 18 : 26 }}>
              <div style={{ display: "flex", alignItems: "baseline" }}>
                <div style={{ fontFamily: "Anton", fontSize: tight ? 46 : 56, letterSpacing: 1.5, lineHeight: 1 }}>{caps(p.name)}</div>
                {!uniform && <div style={{ marginLeft: "auto", fontFamily: "Anton", fontSize: tight ? 40 : 48, color: AMBER }}>{money(p.price_cents)}</div>}
              </div>
              {p.description && (
                <div style={{ fontSize: tight ? 20 : 23, lineHeight: 1.35, color: CREAM2, marginTop: 6, maxWidth: 900 }}>{tight ? clip(p.description, 88) : p.description}</div>
              )}
            </div>
          ))}
          {more > 0 && <div style={{ ...label, fontSize: 19, letterSpacing: 5, marginTop: 18 }}>{`+ ${more} MORE ${more === 1 ? "PIE" : "PIES"} ON THE MENU`}</div>}
          {sides.length > 0 && (
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 18 }}>
              <div style={{ ...label, marginRight: 18 }}>ON THE SIDE</div>
              <div style={{ fontSize: 23, color: CREAM }}>{sides.slice(0, SIDE_CAP).map((x) => x.name).join("  ·  ") + (sides.length > SIDE_CAP ? "  & more" : "")}</div>
            </div>
          )}
        </div>

        {/* torn amber order strip */}
        <div style={{ display: "flex", position: "relative", marginTop: "auto", height: 244 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={paper(W, 244, AMBER, { t: true }, 31)} width={W} height={244} alt="" style={{ position: "absolute", top: 0, left: 0 }} />
          <div style={{ display: "flex", flex: 1, alignItems: "center", padding: "26px 64px 0 64px" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontFamily: "Anton", fontSize: 92, lineHeight: 0.95, color: INK, letterSpacing: 2 }}>ORDER NOW</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: INK, marginTop: 8 }}>{shortUrl}</div>
              <div style={{ fontSize: 20, color: INK, opacity: 0.75, marginTop: 8 }}>{footerLine}</div>
            </div>
            <div style={{ display: "flex", marginLeft: "auto", padding: 10, backgroundColor: INK, transform: "rotate(2deg)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} width={170} height={170} alt="" />
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Anton", data: anton, weight: 400, style: "normal" },
        { name: "Karla", data: karla, weight: 400, style: "normal" },
        { name: "Karla", data: karlaBold, weight: 700, style: "normal" },
      ],
      headers: { "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="chard-pizza-flyer.png"' },
    },
  );
}
