import type { Settings } from "@/lib/types";
import type { Order } from "@/lib/orders";
import { formatCents } from "@/lib/format";
import { fmtTime } from "@/lib/time";

export type MessageTemplate = { key: string; name: string; channel: "email" | "sms" | "whatsapp"; subject: string | null; body: string; is_active: boolean; sort_order: number };

/** Placeholder values for one order. `extras` lets a button pass eta_minutes or similar. */
export function messageVars(
  o: Order,
  settings: Pick<Settings, "business_name" | "time_zone" | "zelle_instructions" | "pickup_address" | "public_url">,
  extras: Record<string, string | number> = {},
): Record<string, string> {
  const first = o.customer_name.trim().split(/\s+/)[0] ?? o.customer_name;
  const paymentInstructions =
    o.payment_status === "paid"
      ? "You're all paid up."
      : o.payment_method === "zelle"
        ? settings.zelle_instructions ?? ""
        : o.payment_method === "cash"
          ? "Cash is due at pickup."
          : "";
  return {
    first_name: first,
    name: o.customer_name,
    order_number: o.order_number,
    pickup_time: fmtTime(o.scheduled_at, settings.time_zone),
    business_name: settings.business_name,
    items: o.order_items.map((it) => `${it.quantity}× ${it.item_name}`).join(", "),
    total: formatCents(o.total_cents),
    payment_instructions: paymentInstructions,
    pickup_address: settings.pickup_address ?? "",
    order_link: `${settings.public_url.replace(/\/+$/, "")}/order/${o.order_number}`,
    eta_minutes: "10",
    ...Object.fromEntries(Object.entries(extras).map(([k, v]) => [k, String(v)])),
  };
}

export function renderMessage(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "").replace(/[ \t]+\n/g, "\n").trim();
}

/** WhatsApp deep link to a specific number with prefilled text. Works on phone and desktop. */
export function whatsAppLink(e164Phone: string, text: string) {
  return `https://wa.me/${e164Phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** Native SMS link. iOS wants "&body", Android accepts "?body"; "?&body" satisfies both. */
export function smsLink(e164Phone: string, text: string) {
  return `sms:${e164Phone}?&body=${encodeURIComponent(text)}`;
}
