"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Settings } from "@/lib/types";
import type { Order } from "@/lib/orders";
import { minutesBehind, wasEmailed, wasTextedConfirmation } from "@/lib/orders";
import { type MessageTemplate, messageVars, renderMessage, whatsAppLink, smsLink } from "@/lib/messages";
import { getMessageTemplates, logMessage } from "@/app/admin/orders/message-actions";

let cache: MessageTemplate[] | null = null;

const FALLBACK_CONFIRMATION =
  "Hi {{first_name}}! Got your {{business_name}} order {{order_number}}: {{items}}. {{pickup_time}}. {{payment_instructions}} Track it here: {{order_link}}";

/**
 * "Text confirmation" on an order card. Shows only when the customer got no email
 * (none given, or it failed) and nobody has texted a confirmation yet. Opens the
 * phone's SMS app with the order_received template filled in; logs the tap.
 */
export function ConfirmText({ order: o, settings }: { order: Order; settings: Settings }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (wasEmailed(o) || o.status === "cancelled" || o.status === "completed") return null;
  if (wasTextedConfirmation(o)) {
    return <span className="rounded-lg bg-green-50 px-2.5 py-2 text-xs font-semibold text-green-700">✓ Confirmation texted</span>;
  }

  async function send() {
    setBusy(true);
    const templates = cache ?? (await getMessageTemplates());
    cache = templates;
    const t = templates.find((x) => x.key === "order_received");
    const when = `${o.fulfillment === "delivery" ? "Delivery" : "Pickup"} ${new Date(o.scheduled_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: settings.time_zone })}`;
    const body = renderMessage(t?.body ?? FALLBACK_CONFIRMATION, messageVars(o, settings, { pickup_time: when }));
    window.open(smsLink(o.customer_phone, body), "_blank", "noopener");
    await logMessage({ order_id: o.id, template_key: "order_received", channel: "sms", recipient: o.customer_phone, body });
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={send}
      className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
      title="No email went out for this order. Send them a confirmation text."
    >
      📩 Text confirmation
    </button>
  );
}

/**
 * "Message" button on an order card. Opens a menu of templates; each one builds the
 * personalised text and opens WhatsApp (or SMS) to the customer with it prefilled.
 * The admin presses send in WhatsApp. The tap is logged on the order.
 */
export function QuickSend({ order: o, settings, compact }: { order: Order; settings: Settings; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>(cache ?? []);
  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || cache) return;
    getMessageTemplates().then((t) => {
      cache = t;
      setTemplates(t);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function send(template: MessageTemplate | null, customBody?: string) {
    const extras: Record<string, string | number> = {};
    if (template?.key === "running_behind") {
      const guess = Math.max(minutesBehind(o, new Date()), 5);
      const eta = prompt("About how many minutes behind?", String(guess));
      if (eta === null) return;
      extras.eta_minutes = eta.replace(/\D/g, "") || guess;
    }
    const body = template ? renderMessage(template.body, messageVars(o, settings, extras)) : (customBody ?? "");
    if (!body) return;
    const url = channel === "whatsapp" ? whatsAppLink(o.customer_phone, body) : smsLink(o.customer_phone, body);
    window.open(url, "_blank", "noopener");
    void logMessage({ order_id: o.id, template_key: template?.key ?? null, channel, recipient: o.customer_phone, body });
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-lg bg-green-600 font-semibold text-white hover:bg-green-700 ${compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
        title="Message the customer on WhatsApp"
      >
        💬 Message
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-64 rounded-xl border border-line bg-white p-1.5 shadow-xl">
          <div className="mb-1 flex rounded-lg bg-cream p-0.5 text-xs">
            {(["whatsapp", "sms"] as const).map((c) => (
              <button key={c} onClick={() => setChannel(c)} className={`flex-1 rounded-md py-1 font-semibold ${channel === c ? "bg-white shadow" : "text-ink/60"}`}>
                {c === "whatsapp" ? "WhatsApp" : "Text (SMS)"}
              </button>
            ))}
          </div>
          {templates.length === 0 && <div className="px-2 py-1.5 text-xs text-ink/50">Loading…</div>}
          {templates
            .filter((t) => (o.fulfillment === "delivery" ? true : !["out_for_delivery", "delivery_arriving"].includes(t.key)))
            .map((t) => (
              <button key={t.key} onClick={() => send(t)} className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-cream">
                {t.name}
              </button>
            ))}
          <button
            onClick={() => {
              const text = prompt(`Message to ${o.customer_name}:`, `Hi ${o.customer_name.split(" ")[0]}, `);
              if (text) send(null, text);
            }}
            className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-ink/70 hover:bg-cream"
          >
            Custom message…
          </button>
        </div>
      )}
    </div>
  );
}
