import type { Service, Settings } from "@/lib/types";
import { formatCents } from "@/lib/format";
import { fmtDateOnly, fmtDateTime, fmtTime } from "@/lib/time";

export type ShareItem = { name: string; price_cents: number; description: string | null; is_sold_out: boolean };

export type ShareContext = {
  service: Service;
  settings: Settings;
  items: ShareItem[];
  zoneNames: string[];
};

export function orderUrl(settings: Settings, src = "whatsapp") {
  const base = settings.public_url.replace(/\/+$/, "");
  return `${base}/order?src=${encodeURIComponent(src)}`;
}

export function shareVars({ service: s, settings, items, zoneNames }: ShareContext): Record<string, string> {
  const tz = settings.time_zone;
  const menu = items
    .filter((i) => !i.is_sold_out)
    .map((i) => `• ${i.name} — ${formatCents(i.price_cents)}`)
    .join("\n");
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
