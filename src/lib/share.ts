import type { Service, Settings } from "@/lib/types";
import { formatCents } from "@/lib/format";
import { fmtDateOnly, fmtDateTime, fmtTime } from "@/lib/time";

export type ShareItem = { name: string; price_cents: number; description: string | null; is_sold_out: boolean; is_pie: boolean };
export type ShareSlot = { slot_start: string; is_blocked: boolean; units_remaining: number };

export type ShareContext = {
  service: Service;
  settings: Settings;
  items: ShareItem[];
  zoneNames: string[];
  /** Slots with live availability, for the "open times" line. */
  slots?: ShareSlot[];
  /** Pizzas left for the whole night (dough limit). */
  unitsRemaining?: number;
};

const clock = (iso: string, tz: string) => fmtTime(iso, tz).replace(/ [AP]M$/, "");

/** "⏰ Open times: 7:00, 7:30, 8:15 PM", or a short note when everything / nothing is open. */
function slotsLine(slots: ShareSlot[] | undefined, unitsRemaining: number | undefined, tz: string): string {
  if (!slots?.length) return "";
  const now = Date.now();
  const upcoming = slots.filter((x) => new Date(x.slot_start).getTime() > now);
  if (!upcoming.length) return "";
  const open = unitsRemaining === 0 ? [] : upcoming.filter((x) => !x.is_blocked && Number(x.units_remaining) > 0);
  if (!open.length) return "⏰ Every time is booked up.";
  const last = fmtTime(open[open.length - 1].slot_start, tz);
  const suffix = last.slice(-2);
  if (open.length === upcoming.length && open.length > 3) return `⏰ Every time from ${clock(open[0].slot_start, tz)} to ${clock(open[open.length - 1].slot_start, tz)} ${suffix} is open.`;
  return `⏰ Open times: ${open.map((x) => clock(x.slot_start, tz)).join(", ")} ${suffix}`;
}

export function orderUrl(settings: Settings, src = "whatsapp") {
  const base = settings.public_url.replace(/\/+$/, "");
  return `${base}/order?src=${encodeURIComponent(src)}`;
}

export function shareVars({ service: s, settings, items, zoneNames, slots, unitsRemaining }: ShareContext): Record<string, string> {
  const tz = settings.time_zone;
  const available = items.filter((i) => !i.is_sold_out);
  const sides = available.filter((i) => !i.is_pie);
  const menu = [
    ...available.filter((i) => i.is_pie).map((i) => `• ${i.name} — ${formatCents(i.price_cents)}`),
    ...(sides.length ? [`On the side: ${sides.map((i) => `${i.name} ${formatCents(i.price_cents)}`).join(" · ")}`] : []),
  ].join("\n");
  const hours = `${fmtTime(s.starts_at, tz)} to ${fmtTime(s.ends_at, tz)}`;
  const zones = zoneNames.join(" & ");
  const deliveryTo = s.delivery_enabled && zones ? `\n🚗 Delivering to ${zones}` : "";
  const when_line =
    s.pickup_enabled && s.delivery_enabled
      ? `Pickup or delivery, ${hours}${deliveryTo}`
      : s.delivery_enabled
        ? `Delivery only, ${hours}${deliveryTo}`
        : `Pickup only, ${hours}`;
  const payments = [s.cash_enabled && "Cash", s.zelle_enabled && "Zelle", s.card_enabled && "Card"].filter(Boolean) as string[];
  const opensSoon = s.ordering_opens_at && new Date(s.ordering_opens_at) > new Date();
  return {
    service_name: s.name,
    day: fmtDateOnly(s.service_date, "EEEE"),
    date: fmtDateOnly(s.service_date, "MMMM d"),
    start: fmtTime(s.starts_at, tz),
    end: fmtTime(s.ends_at, tz),
    menu,
    order_url: orderUrl(settings),
    when_line,
    slots_line: slotsLine(slots, unitsRemaining, tz),
    delivery_line: s.delivery_enabled && zoneNames.length ? `\nDelivery to ${zoneNames.join(" & ")}` : "",
    payment_line: payments.length ? `${payments.join(" or ")} accepted.\n` : "",
    opens_line: opensSoon ? `Ordering opens ${fmtDateTime(s.ordering_opens_at!, tz)}.\n` : "",
    business_name: settings.business_name,
  };
}

export function renderTemplate(template: string, vars: Record<string, string>) {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
