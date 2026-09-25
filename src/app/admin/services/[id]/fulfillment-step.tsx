"use client";

import { useState, useTransition } from "react";
import type { DeliveryZone, Service, ServiceDeliveryZone } from "@/lib/types";
import { centsToDollarsInput, formatCents } from "@/lib/format";
import { Switch } from "@/components/ui/switch";
import { saveFulfillment } from "../actions";
import { NextStepLink } from "./stepper";

export function FulfillmentStep({ service: s, zones, serviceZones }: { service: Service; zones: DeliveryZone[]; serviceZones: ServiceDeliveryZone[] }) {
  const [pickup, setPickup] = useState(s.pickup_enabled);
  const [delivery, setDelivery] = useState(s.delivery_enabled);
  const [selected, setSelected] = useState<Record<string, { on: boolean; fee: string }>>(() => {
    const m: Record<string, { on: boolean; fee: string }> = {};
    for (const z of zones) {
      const sz = serviceZones.find((x) => x.delivery_zone_id === z.id);
      m[z.id] = { on: !!sz, fee: sz?.fee_cents_override != null ? centsToDollarsInput(sz.fee_cents_override) : "" };
    }
    return m;
  });
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await saveFulfillment(s.id, {
        pickup_enabled: pickup,
        delivery_enabled: delivery,
        zones: delivery ? Object.entries(selected).filter(([, v]) => v.on).map(([id, v]) => ({ delivery_zone_id: id, fee_override: v.fee })) : [],
      });
      setMsg(r);
    });
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-4 py-1">
          <div>
            <div className="font-semibold">Pickup</div>
            <div className="text-sm text-ink/60">Customers pick a time slot and collect at the pickup address.</div>
          </div>
          <Switch checked={pickup} onChange={setPickup} label="Pickup enabled" />
        </div>
        <div className="flex items-center justify-between gap-4 py-1 border-t border-line">
          <div>
            <div className="font-semibold">Delivery</div>
            <div className="text-sm text-ink/60">Customers choose a zone and enter an address. The zone fee is added automatically.</div>
          </div>
          <Switch checked={delivery} onChange={setDelivery} label="Delivery enabled" />
        </div>
      </section>

      {delivery && (
        <section className="card space-y-3">
          <div>
            <h2 className="text-lg font-bold">Zones for this service</h2>
            <p className="text-sm text-ink/60">Standard fees come from Settings. Override a fee here for this night only.</p>
          </div>
          {zones.filter((z) => z.is_active).length === 0 && (
            <p className="text-sm text-amber-700">No active zones. Add some under Settings, then Delivery Zones.</p>
          )}
          <div className="divide-y divide-line">
            {zones
              .filter((z) => z.is_active || selected[z.id]?.on)
              .map((z) => (
                <div key={z.id} className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--ember)]"
                    checked={selected[z.id]?.on ?? false}
                    onChange={(e) => setSelected((m) => ({ ...m, [z.id]: { ...m[z.id], on: e.target.checked } }))}
                    aria-label={`Deliver to ${z.name}`}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{z.name}</div>
                    <div className="text-xs text-ink/50">Standard fee {formatCents(z.fee_cents)}</div>
                  </div>
                  {selected[z.id]?.on && (
                    <input
                      inputMode="decimal"
                      placeholder={centsToDollarsInput(z.fee_cents)}
                      value={selected[z.id].fee}
                      onChange={(e) => setSelected((m) => ({ ...m, [z.id]: { ...m[z.id], fee: e.target.value } }))}
                      className="input w-24 text-right"
                      aria-label={`${z.name} fee override`}
                    />
                  )}
                </div>
              ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={save}>
          {pending ? "Saving..." : "Save"}
        </button>
        {msg?.error && <span className="text-sm text-red-700">{msg.error}</span>}
        {msg?.ok && <span className="text-sm text-green-700">{msg.ok}</span>}
        <NextStepLink serviceId={s.id} next="payment" />
      </div>
    </div>
  );
}
