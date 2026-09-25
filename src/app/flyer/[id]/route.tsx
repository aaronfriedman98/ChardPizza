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
const COAL = "#141110";
const AMBER = "#f2a33a";
const FLOUR = "#f3ebdd";
const BRICK = "#c8551e";

async function font(file: string) {
  const buf = await readFile(path.join(process.cwd(), "src", "assets", "fonts", file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
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
  const footerLine = [
    s.pickup_enabled ? "Pickup" : "",
    s.delivery_enabled ? `Delivery to ${zones.join(" & ")}` : "",
    payments,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const [anton, poppinsBold, poppins, qr] = await Promise.all([
    font("Anton-Regular.ttf"),
    font("Poppins-Bold.ttf"),
    font("Poppins-Regular.ttf"),
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#141110", light: "#f2a33a" } }),
  ]);
  const logo = `data:image/svg+xml;utf8,${encodeURIComponent(logoMarkSvgString(200))}`;
  const day = fmtDateOnly(s.service_date, "EEEE").toUpperCase();
  const dayFont = day.length > 8 ? 132 : 160;
  const menuFont = items.length > 3 ? 40 : 52;

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          flexDirection: "column",
          backgroundColor: COAL,
          backgroundImage: "radial-gradient(circle at 50% 38%, rgba(242,163,58,0.28) 0%, rgba(200,85,30,0.14) 28%, rgba(20,17,16,0) 60%)",
          color: FLOUR,
          fontFamily: "Poppins",
          position: "relative",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, paddingTop: 44 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={110} height={110} alt="" />
          <div style={{ fontFamily: "Anton", fontSize: 72, letterSpacing: 4, color: FLOUR, marginTop: 8 }}>CHAR&rsquo;D</div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 14 }}>
          <div style={{ fontFamily: "Anton", fontSize: dayFont, lineHeight: 0.9, color: AMBER, letterSpacing: 2 }}>{day}</div>
          <div style={{ fontFamily: "Anton", fontSize: 250, lineHeight: 0.85, color: FLOUR, letterSpacing: -4 }}>PIZZA</div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 18, fontSize: 32, fontWeight: 700, color: FLOUR }}>
            <span>{fmtDateOnly(s.service_date, "MMMM d")}</span>
            <span style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: AMBER }} />
            <span>
              {fmtTime(s.starts_at, tz)} – {fmtTime(s.ends_at, tz)}
            </span>
          </div>
        </div>

        {/* menu band */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 36, paddingLeft: 40, paddingRight: 40 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              backgroundColor: AMBER,
              color: COAL,
              padding: "28px 44px",
              borderRadius: 18,
              transform: "rotate(-1.2deg)",
              boxShadow: "0 30px 60px rgba(0,0,0,0.5)",
            }}
          >
            {items.slice(0, 5).map((it, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", paddingTop: i === 0 ? 0 : 18, borderTop: i === 0 ? "none" : "2px solid rgba(20,17,16,0.18)", marginTop: i === 0 ? 0 : 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontFamily: "Anton", fontSize: menuFont, letterSpacing: 1 }}>{it.name.toUpperCase()}</div>
                  <div style={{ fontFamily: "Anton", fontSize: menuFont }}>{it.price}</div>
                </div>
                {it.description && (
                  <div style={{ fontSize: 24, lineHeight: 1.25, marginTop: 6, color: "rgba(20,17,16,0.85)", maxWidth: 900 }}>{it.description}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", padding: "40px 64px 56px 64px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: AMBER,
                color: COAL,
                fontFamily: "Anton",
                fontSize: 48,
                letterSpacing: 4,
                padding: "16px 40px",
                borderRadius: 14,
              }}
            >
              ORDER NOW
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: FLOUR }}>{shortUrl}</div>
            <div style={{ fontSize: 24, color: "rgba(243,235,221,0.7)" }}>{footerLine}</div>
          </div>
          <div style={{ display: "flex", padding: 10, backgroundColor: AMBER, borderRadius: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} width={200} height={200} alt="" />
          </div>
        </div>

        {/* brick line */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 14, backgroundColor: BRICK }} />
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Anton", data: anton, weight: 400, style: "normal" },
        { name: "Poppins", data: poppinsBold, weight: 700, style: "normal" },
        { name: "Poppins", data: poppins, weight: 400, style: "normal" },
      ],
      headers: { "Cache-Control": "no-store", "Content-Disposition": "inline; filename=\"chard-pizza-flyer.png\"" },
    },
  );
}
