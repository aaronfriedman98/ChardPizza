"use client";

import { useState, useTransition } from "react";
import type { MenuItem, Service, ServiceMenuItem } from "@/lib/types";
import { centsToDollarsInput } from "@/lib/format";
import { Switch } from "@/components/ui/switch";
import { saveServiceMenu } from "../actions";
import { NextStepLink } from "./stepper";

type Row = {
  menu_item_id: string;
  included: boolean;
  price: string;
  quantity_limit: string;
  is_available: boolean;
  description_override: string | null;
};

export function MenuStep({ service, library, serviceMenu }: { service: Service; library: MenuItem[]; serviceMenu: ServiceMenuItem[] }) {
  const existing = new Map(serviceMenu.map((m) => [m.menu_item_id, m]));
  const [rows, setRows] = useState<Row[]>(() =>
    library
      .filter((item) => item.is_active || existing.has(item.id))
      .map((item) => {
        const e = existing.get(item.id);
        return {
          menu_item_id: item.id,
          included: !!e,
          price: centsToDollarsInput(e?.price_cents ?? item.default_price_cents),
          quantity_limit: e?.quantity_limit == null ? "" : String(e.quantity_limit),
          is_available: e?.is_available ?? true,
          description_override: e?.description_override ?? null,
        };
      }),
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const byId = new Map(library.map((i) => [i.id, i]));

  function update(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.menu_item_id === id ? { ...r, ...patch } : r)));
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await saveServiceMenu(service.id, rows);
      setMsg(r);
    });
  }

  const includedCount = rows.filter((r) => r.included).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-ink/60">
        Tick what is on the menu for this service. Prices start from the library and can be changed for this night only.
      </p>

      <div className="card divide-y divide-line p-0">
        {rows.length === 0 && <p className="p-5 text-ink/60">The menu library is empty. Add items under Menu first.</p>}
        {rows.map((r) => {
          const item = byId.get(r.menu_item_id)!;
          return (
            <div key={r.menu_item_id} className={`p-4 space-y-3 ${r.included ? "" : "opacity-70"}`}>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--ember)]"
                  checked={r.included}
                  onChange={(e) => update(r.menu_item_id, { included: e.target.checked })}
                  aria-label={`Offer ${item.name}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">
                    {item.name}
                    {!item.is_active && <span className="ml-2 text-xs text-ink/50">(inactive in library)</span>}
                  </div>
                  <div className="text-xs text-ink/50">
                    {item.category} · {item.capacity_units === 0 ? "no oven capacity" : `${item.capacity_units} pizza unit${item.capacity_units === 1 ? "" : "s"}`}
                  </div>
                </div>
              </div>
              {r.included && (
                <div className="grid gap-3 sm:grid-cols-3 pl-8">
                  <label className="block">
                    <span className="label">Price tonight ($)</span>
                    <input inputMode="decimal" value={r.price} onChange={(e) => update(r.menu_item_id, { price: e.target.value })} className="input" />
                  </label>
                  <label className="block">
                    <span className="label">Limit (blank = none)</span>
                    <input
                      inputMode="numeric"
                      value={r.quantity_limit}
                      onChange={(e) => update(r.menu_item_id, { quantity_limit: e.target.value })}
                      className="input"
                      placeholder="e.g. 20"
                    />
                  </label>
                  <div className="flex items-end justify-between gap-3 pb-1">
                    <span className="text-sm">Available</span>
                    <Switch checked={r.is_available} onChange={(v) => update(r.menu_item_id, { is_available: v })} label={`${item.name} available`} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={save}>
          {pending ? "Saving..." : `Save menu (${includedCount} item${includedCount === 1 ? "" : "s"})`}
        </button>
        {msg?.error && <span className="text-sm text-red-700">{msg.error}</span>}
        {msg?.ok && <span className="text-sm text-green-700">{msg.ok}</span>}
        <NextStepLink serviceId={service.id} next="capacity" />
      </div>
    </div>
  );
}
