"use client";

import { useEffect, useRef, useState } from "react";
import type { Settings } from "@/lib/types";
import type { Order } from "@/lib/orders";
import { minutesBehind } from "@/lib/orders";
import { type MessageTemplate, messageVars, renderMessage, whatsAppLink, smsLink } from "@/lib/messages";
import { getMessageTemplates, logMessage } from "@/app/admin/orders/message-actions";

let cache: MessageTemplate[] | null = null;

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
