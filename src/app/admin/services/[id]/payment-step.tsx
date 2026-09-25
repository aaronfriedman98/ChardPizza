"use client";

import { useState, useTransition } from "react";
import type { Service, Settings } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { savePayment } from "../actions";
import { NextStepLink } from "./stepper";

export function PaymentStep({ service: s, settings }: { service: Service; settings: Settings }) {
  const [cash, setCash] = useState(s.cash_enabled);
  const [zelle, setZelle] = useState(s.zelle_enabled);
  const [card, setCard] = useState(s.card_enabled);
  const [special, setSpecial] = useState(s.allow_special_instructions);
  const [instructions, setInstructions] = useState(s.customer_instructions ?? "");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await savePayment(s.id, {
        cash_enabled: cash,
        zelle_enabled: zelle,
        card_enabled: card,
        allow_special_instructions: special,
        customer_instructions: instructions,
      });
      setMsg(r);
    });
  }

  const RowT = ({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <div className="font-semibold">{label}</div>
        <div className="text-sm text-ink/60">{hint}</div>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );

  return (
    <div className="space-y-5 max-w-2xl">
      <section className="card divide-y divide-line">
        <RowT label="Cash" hint="Marked due at pickup. Tap Mark Paid when they hand it over." checked={cash} onChange={setCash} />
        <RowT
          label="Zelle"
          hint={settings.zelle_instructions ? `Customers see: "${settings.zelle_instructions}"` : "Add Zelle instructions under Settings."}
          checked={zelle}
          onChange={setZelle}
        />
        <RowT label="Credit / debit card" hint="Needs Stripe, which is a later step. Leave off for now." checked={card} onChange={setCard} disabled />
      </section>

      <section className="card space-y-4">
        <RowT
          label="Allow special instructions"
          hint="An optional note field at checkout. Turn off to keep orders standard."
          checked={special}
          onChange={setSpecial}
        />
        <label className="block">
          <span className="label">Message to customers for this service (optional)</span>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            className="input"
            placeholder="e.g. Please park on the street, not the driveway."
          />
          <span className="mt-1 block text-xs text-ink/50">Shown on the ordering page and the confirmation. Pickup instructions from Settings are shown too.</span>
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={save}>
          {pending ? "Saving..." : "Save"}
        </button>
        {msg?.error && <span className="text-sm text-red-700">{msg.error}</span>}
        {msg?.ok && <span className="text-sm text-green-700">{msg.ok}</span>}
        <NextStepLink serviceId={s.id} next="review" label="Review →" />
      </div>
    </div>
  );
}
