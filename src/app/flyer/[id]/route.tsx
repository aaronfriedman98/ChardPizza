import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logoMarkSvgString } from "@/components/brand/logo";
import type { DeliveryZone, MenuItem, Service, ServiceMenuItem, Settings } from "@/lib/types";
import { formatCents } from "@/lib/format";
import { fmtDateOnly, fmtTime } from "@/lib/time";
import { orderUrl } from "@/lib/share";

export const runtime = "nodejs";

const W = 1080;
const H = 1350;
const WOOD = "#160f0b";
const WOOD2 = "#241812";
const FLOUR = "#f1e6d2";
const FLOUR2 = "#cdbfa6";
const GOLD = "#c9a25c";
const GOLD2 = "#e3c783";
const LINE = "rgba(201,162,92,0.35)";

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

export async function GET(_req: Request, ctx: RouteContext<"/flyer/[id]">) {
  const { id } = await ctx.params;
  const db = createAdminClient();
  const [{ data: serviceRow }, { data: settingsRow }, { data: smi }, { data: sz }] = await Promise.all([
    db.from("services").select("*").eq("id", id).maybeSingle(),
    db.from("settings").select("*").eq("id", true).single(),
    db.from("service_menu_items").select("*, menu_items(name, description)").eq("service_id", id).eq("is_available", true).eq("sold_out_manual", false).order("sort_order"),
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
  const items = ((smi ?? []) as (ServiceMenuItem & { menu_items: Pick<MenuItem, "name" | "description"> })[]).map((r) => ({
    name: r.menu_items.name,
    description: r.description_override ?? r.menu_items.description ?? "",
    price: formatCents(r.price_cents),
  }));
  const zones = ((sz ?? []) as unknown as { delivery_zones: Pick<DeliveryZone, "name"> }[]).map((z) => z.delivery_zones.name);
  const url = orderUrl(settings, "flyer");
  const shortUrl = settings.public_url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const payments = [s.cash_enabled && "Cash", s.zelle_enabled && "Zelle", s.card_enabled && "Card"].filter(Boolean).join(" · ");
  const footerLine = [s.pickup_enabled ? "Pickup" : "", s.delivery_enabled ? `Delivery to ${zones.join(" & ")}` : "", payments].filter(Boolean).join("   ·   ");

  const [cormorant, cormorantItalic, inter, interBold, qr, poster] = await Promise.all([
    font("CormorantGaramond-Medium.ttf"),
    font("CormorantGaramond-SemiBoldItalic.ttf"),
    font("Inter-Regular.ttf"),
    font("Inter-SemiBold.ttf"),
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#160f0b", light: "#e3c783" } }),
    posterDataUri(),
  ]);
  const logo = `data:image/svg+xml;utf8,${encodeURIComponent(logoMarkSvgString(120))}`;
  const day = fmtDateOnly(s.service_date, "EEEE");
  const menuFont = items.length > 3 ? 40 : 50;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", backgroundColor: WOOD, color: FLOUR, fontFamily: "Inter", position: "relative" }}>
        {/* oven glow behind the top */}
        {poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} width={W} height={640} alt="" style={{ position: "absolute", top: 0, left: 0, width: W, height: 640, objectFit: "cover", objectPosition: "center 60%", opacity: 0.85 }} />
        )}
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: 640, background: "linear-gradient(180deg, rgba(22,15,11,0.55) 0%, rgba(22,15,11,0.15) 40%, rgba(22,15,11,0.85) 80%, #160f0b 100%)" }} />

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "48px 64px 0 64px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={64} height={64} alt="" />
          <div style={{ fontFamily: "CormorantItalic", fontSize: 62, color: FLOUR, marginTop: 6 }}>Char’d</div>
          <div style={{ marginLeft: "auto", fontSize: 18, letterSpacing: 6, color: GOLD, textTransform: "uppercase", fontWeight: 600 }}>Wood-fired · Southfield</div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column", padding: "150px 64px 0 64px" }}>
          <div style={{ fontSize: 20, letterSpacing: 8, color: GOLD, textTransform: "uppercase", fontWeight: 600 }}>{`${day} sale`}</div>
          <div style={{ display: "flex", fontFamily: "Cormorant", fontSize: 122, lineHeight: 0.95, color: FLOUR, marginTop: 14 }}>
            <span>Thin, crispy,&nbsp;</span>
          </div>
          <div style={{ display: "flex", fontFamily: "Cormorant", fontSize: 122, lineHeight: 0.95, color: FLOUR }}>
            <span>and&nbsp;</span>
            <span style={{ fontFamily: "CormorantItalic" }}>Char’d.</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 30, fontSize: 32, color: FLOUR2 }}>
            <span style={{ color: FLOUR, fontWeight: 600 }}>{fmtDateOnly(s.service_date, "MMMM d")}</span>
            <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: GOLD }} />
            <span>{`${fmtTime(s.starts_at, tz)} – ${fmtTime(s.ends_at, tz)}`}</span>
          </div>
        </div>

        {/* gold rule */}
        <div style={{ margin: "44px 64px 0 64px", height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />

        {/* menu */}
        <div style={{ display: "flex", flexDirection: "column", padding: "26px 64px 0 64px" }}>
          <div style={{ fontSize: 16, letterSpacing: 6, color: GOLD, textTransform: "uppercase", fontWeight: 600 }}>Tonight’s menu</div>
          {items.slice(0, 4).map((it, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", paddingTop: 20, paddingBottom: 16, borderBottom: `1px solid ${LINE}` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
                <div style={{ fontFamily: "Cormorant", fontSize: menuFont, color: FLOUR }}>{it.name}</div>
                <div style={{ flex: 1, borderBottom: `1px dashed rgba(201,162,92,0.5)`, marginBottom: 10 }} />
                <div style={{ fontFamily: "Cormorant", fontSize: menuFont, color: GOLD2 }}>{it.price}</div>
              </div>
              {it.description && <div style={{ fontSize: 22, lineHeight: 1.35, marginTop: 4, color: FLOUR2, maxWidth: 860 }}>{it.description}</div>}
            </div>
          ))}
        </div>

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", padding: "0 64px 56px 64px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: GOLD, color: WOOD, fontSize: 22, letterSpacing: 6, textTransform: "uppercase", fontWeight: 600, padding: "20px 40px" }}>
              {`Order at ${shortUrl}`}
            </div>
            <div style={{ fontSize: 22, color: FLOUR2 }}>{footerLine}</div>
          </div>
          <div style={{ display: "flex", padding: 10, backgroundColor: GOLD2, border: `1px solid ${GOLD}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} width={190} height={190} alt="" />
          </div>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 10, backgroundColor: WOOD2, borderTop: `1px solid ${GOLD}` }} />
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Cormorant", data: cormorant, weight: 500, style: "normal" },
        { name: "CormorantItalic", data: cormorantItalic, weight: 600, style: "italic" },
        { name: "Inter", data: inter, weight: 400, style: "normal" },
        { name: "Inter", data: interBold, weight: 600, style: "normal" },
      ],
      headers: { "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="chard-pizza-flyer.png"' },
    },
  );
}
