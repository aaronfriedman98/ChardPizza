"use client";

import { useState, useTransition } from "react";
import type { PriceTier } from "@/lib/types";
import type { Order } from "@/lib/orders";
import { centsToDollarsInput, formatCents } from "@/lib/format";
import { applyPricing } from "../pricing-actions";

/** Order page: put a price tier or a one-off per-pie price on this order. */
export function PricingPanel({ order: o, tiers }: { order: Order; tiers: PriceTier[] }) {
  const [custom, setCustom] = useState(o.pie_price_override_cents != null ? centsToDollarsInput(o.pie_price_override_cents) : "");
  const [note, setNote] = useState(o.pricing_note ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const done = o.status === "completed" || o.status === "cancelled";
  const pieCount = o.order_items.filter((it) => Number(it.capacity_units_each) > 0).reduce((a, it) => a + it.quantity, 0);
  const currentTier = tiers.find((t) => t.id === o.price_tier_id);

  function run(tierId: string | null, override: string | null) {
    setMsg(null);
    startTransition(async () => {
      const r = await applyPricing(o.id, tierId, override, note);
      setMsg(r.error ?? r.ok ?? null);
      if (!r.error && !override) setCustom("");
    });
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Pricing</h2>
        <span className="text-sm text-ink/60">
          {currentTier ? currentTier.name : o.pie_price_override_cents != null ? `Custom ${formatCents(o.pie_price_override_cents)}/pie` : "Regular price"}
        </span>
      </div>
      {pieCount === 0 ? (
        <p className="text-sm text-ink/50">No pies on this order.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={pending || done}
              onClick={() => run(null, null)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${!o.price_tier_id && o.pie_price_override_cents == null ? "bg-char text-white" : "border border-line hover:bg-cream"}`}
            >
              Regular
            </button>
            {tiers.map((t) => (
              <button
                key={t.id}
                disabled={pending || done}
                onClick={() => run(t.id, null)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${o.price_tier_id === t.id ? "bg-char text-white" : "border border-line hover:bg-cream"}`}
              >
                {t.name} · {formatCents(t.pie_price_cents)}/pie
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink/60">Custom per pie $</span>
            <input inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} className="input w-24" placeholder="22.50" disabled={done} />
            <input value={note} onChange={(e) => setNote(e.target.value)} className="input flex-1 min-w-[10rem]" placeholder="Why (optional)" disabled={done} />
            <button disabled={pending || done || !custom.trim()} className="btn-ghost border border-line text-sm" onClick={() => run(null, custom)}>
              Apply custom
            </button>
          </div>
          {msg && <p className="text-sm text-ink/60">{msg}</p>}
          <p className="text-xs text-ink/50">
            Applies to the {pieCount} pie{pieCount === 1 ? "" : "s"} on this order. Sides keep their price. If the order was already paid in full, it stays paid.
          </p>
        </>
      )}
    </section>
  );
}
