"use client";

import { useBusyTransition } from "@/components/admin/feedback";
import { useState } from "react";
import type { PriceTier } from "@/lib/types";
import { centsToDollarsInput } from "@/lib/format";
import { Switch } from "@/components/ui/switch";
import { Modal } from "@/components/ui/modal";
import { deletePriceTier, savePriceTier } from "@/app/admin/orders/pricing-actions";
import { tierLabel } from "@/lib/pricing";

export function PricingEditor({ tiers }: { tiers: PriceTier[] }) {
  const [editing, setEditing] = useState<PriceTier | "new" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useBusyTransition();

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink/60">
          Special pricing you can put on any order with one tap: a flat price per pie, or dollars off whatever the pie costs that night. Sides keep their normal price. A custom one-off price is also available on each order.
        </p>
        <button className="btn-primary shrink-0" onClick={() => setEditing("new")}>+ Add tier</button>
      </div>
      {message && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" onClick={() => setMessage(null)}>{message}</p>}
      <div className="card divide-y divide-line p-0">
        {tiers.length === 0 && <p className="p-5 text-ink/60">No tiers yet.</p>}
        {tiers.map((t) => (
          <div key={t.id} className={`flex items-center gap-3 p-4 ${t.is_active ? "" : "opacity-60"}`}>
            <button className="flex-1 text-left" onClick={() => setEditing(t)}>
              <div className="font-semibold">
                {t.name} <span className="text-ember">{tierLabel(t)}</span>
              </div>
            </button>
            <Switch
              checked={t.is_active}
              label={`${t.name} active`}
              onChange={(v) =>
                startTransition(async () => {
                  const r = await savePriceTier({ id: t.id, name: t.name, mode: t.discount_cents != null ? "off" : "flat", price: centsToDollarsInput(t.discount_cents ?? t.pie_price_cents), is_active: v });
                  if (r.error) setMessage(r.error);
                })
              }
            />
          </div>
        ))}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add price tier" : "Edit price tier"}>
        {editing !== null && <TierForm tier={editing === "new" ? null : editing} onDone={() => setEditing(null)} onError={setMessage} pending={pending} />}
      </Modal>
    </div>
  );
}

function TierForm({ tier, onDone, onError }: { tier: PriceTier | null; onDone: () => void; onError: (m: string) => void; pending: boolean }) {
  const [name, setName] = useState(tier?.name ?? "");
  const [mode, setMode] = useState<"flat" | "off">(tier?.discount_cents != null ? "off" : "flat");
  const [price, setPrice] = useState(tier ? centsToDollarsInput(tier.discount_cents ?? tier.pie_price_cents) : "");
  const [active, setActive] = useState(tier?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useBusyTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await savePriceTier({ id: tier?.id, name, mode, price, is_active: active });
          if (r.error) setError(r.error);
          else onDone();
        });
      }}
    >
      <label className="block">
        <span className="label">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Family & friends" required autoFocus />
      </label>
      <div>
        <span className="label">How it prices</span>
        <div className="flex rounded-lg border border-line bg-white p-0.5 text-sm">
          {(["off", "flat"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded-md px-2.5 py-1.5 font-medium ${mode === m ? "bg-char text-white" : "text-ink/70"}`}>
              {m === "off" ? "Dollars off each pie" : "Flat price per pie"}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="label">{mode === "off" ? "Off each pie ($)" : "Price per pie ($)"}</span>
        <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="input text-lg font-bold" placeholder={mode === "off" ? "5.00" : "20.00"} required />
        <span className="mt-1 block text-xs text-ink/50">{mode === "off" ? "A $30 pie becomes $25 with $5 off. Follows menu prices automatically." : "Every pie costs this, whatever the menu says."}</span>
      </label>
      <div className="flex items-center justify-between text-sm">
        <span>Active</span>
        <Switch checked={active} onChange={setActive} label="Active" />
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex items-center justify-between pt-1">
        {tier ? (
          <button
            type="button"
            className="btn-ghost text-red-700"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete ${tier.name}?`)) return;
              startTransition(async () => {
                const r = await deletePriceTier(tier.id);
                if (r.error) onError(r.error);
                onDone();
              });
            }}
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <button className="btn-primary" disabled={pending}>{pending ? "Saving..." : tier ? "Save" : "Add tier"}</button>
      </div>
    </form>
  );
}
