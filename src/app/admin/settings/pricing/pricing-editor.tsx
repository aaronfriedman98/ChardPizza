"use client";

import { useState, useTransition } from "react";
import type { PriceTier } from "@/lib/types";
import { centsToDollarsInput, formatCents } from "@/lib/format";
import { Switch } from "@/components/ui/switch";
import { Modal } from "@/components/ui/modal";
import { deletePriceTier, savePriceTier } from "@/app/admin/orders/pricing-actions";

export function PricingEditor({ tiers }: { tiers: PriceTier[] }) {
  const [editing, setEditing] = useState<PriceTier | "new" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink/60">
          Special per-pie prices you can put on any order with one tap. Sides keep their normal price. A custom one-off price is also available on each order.
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
                {t.name} <span className="text-ember">{formatCents(t.pie_price_cents)} per pie</span>
              </div>
            </button>
            <Switch
              checked={t.is_active}
              label={`${t.name} active`}
              onChange={(v) =>
                startTransition(async () => {
                  const r = await savePriceTier({ id: t.id, name: t.name, price: centsToDollarsInput(t.pie_price_cents), is_active: v });
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
  const [price, setPrice] = useState(tier ? centsToDollarsInput(tier.pie_price_cents) : "");
  const [active, setActive] = useState(tier?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await savePriceTier({ id: tier?.id, name, price, is_active: active });
          if (r.error) setError(r.error);
          else onDone();
        });
      }}
    >
      <label className="block">
        <span className="label">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Family & friends" required autoFocus />
      </label>
      <label className="block">
        <span className="label">Price per pie ($)</span>
        <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="input text-lg font-bold" placeholder="20.00" required />
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
