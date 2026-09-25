"use client";

import { useState, useTransition } from "react";
import type { Service, ServiceAvailability, SlotAvailability } from "@/lib/types";
import { fmtTime } from "@/lib/time";
import { saveCapacitySettings, saveSlots } from "../actions";
import { NextStepLink } from "./stepper";

type SlotRow = { id: string; capacity_units: number; preorder_cap_units: number | null; is_blocked: boolean };

export function CapacityStep({
  service: s,
  slots,
  availability,
  tz,
}: {
  service: Service;
  slots: SlotAvailability[];
  availability: ServiceAvailability;
  tz: string;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);

  // Settings block
  const [total, setTotal] = useState(String(s.pizza_capacity_total));
  const [slotMinutes, setSlotMinutes] = useState(String(s.slot_minutes));
  const [defaultCap, setDefaultCap] = useState(String(s.default_slot_capacity));
  const [preorderMode, setPreorderMode] = useState<"all" | "units" | "percent">(
    s.preorder_reserve_units != null ? "units" : s.preorder_reserve_percent != null ? "percent" : "all",
  );
  const [preorderValue, setPreorderValue] = useState(String(s.preorder_reserve_units ?? s.preorder_reserve_percent ?? 0));

  // Grid
  const [rows, setRows] = useState<SlotRow[]>(() =>
    slots.map((x) => ({ id: x.slot_id, capacity_units: x.capacity_units, preorder_cap_units: x.preorder_cap_units, is_blocked: x.is_blocked })),
  );
  const sold = new Map(slots.map((x) => [x.slot_id, Number(x.units_sold)]));
  const gridTotal = rows.reduce((a, r) => a + (r.is_blocked ? 0 : r.capacity_units), 0);

  function updateRow(id: string, patch: Partial<SlotRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function saveSettings(confirm = false) {
    setMsg(null);
    startTransition(async () => {
      const r = await saveCapacitySettings(
        s.id,
        { pizza_capacity_total: total, slot_minutes: slotMinutes, default_slot_capacity: defaultCap, preorder_mode: preorderMode, preorder_value: preorderValue },
        confirm,
      );
      if (r.needsConfirm) {
        if (window.confirm(`${r.needsConfirm.join("\n")}\n\nSave anyway? Existing orders are kept.`)) saveSettings(true);
        return;
      }
      setMsg(r);
    });
  }

  function saveGrid(confirm = false) {
    setMsg(null);
    startTransition(async () => {
      const r = await saveSlots(s.id, rows, confirm);
      if (r.needsConfirm) {
        if (window.confirm(`${r.needsConfirm.join("\n")}\n\nSave anyway? Existing orders are kept.`)) saveGrid(true);
        return;
      }
      setMsg(r);
    });
  }

  const slotsLocked = Number(availability?.order_count ?? 0) > 0;

  return (
    <div className="space-y-5 max-w-3xl">
      <section className="card space-y-4">
        <div>
          <h2 className="text-lg font-bold">Totals and defaults</h2>
          <p className="text-sm text-ink/60">Total pizza units is the dough limit for the night. Nothing sells past it, no matter what the slots say.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="label">Total pizza units (dough)</span>
            <input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} className="input text-lg font-bold" />
          </label>
          <label className="block">
            <span className="label">Slot length (min)</span>
            <input inputMode="numeric" value={slotMinutes} onChange={(e) => setSlotMinutes(e.target.value)} className="input" disabled={slotsLocked} />
            {slotsLocked && <span className="mt-1 block text-xs text-amber-700">Locked: orders exist.</span>}
          </label>
          <label className="block">
            <span className="label">Default pizzas per slot</span>
            <input inputMode="numeric" value={defaultCap} onChange={(e) => setDefaultCap(e.target.value)} className="input" />
            <span className="mt-1 block text-xs text-ink/50">Used for new slots. Apply to all below.</span>
          </label>
        </div>

        <div className="rounded-xl border border-line p-3 space-y-2">
          <div className="font-medium">Preorder limit</div>
          <p className="text-sm text-ink/60">Optionally hold back part of each slot until the service starts, for walk-ups and live orders.</p>
          <div className="flex flex-wrap gap-3 text-sm">
            {(["all", "units", "percent"] as const).map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input type="radio" name="preorder" checked={preorderMode === m} onChange={() => setPreorderMode(m)} className="accent-[var(--ember)]" />
                {m === "all" ? "Sell everything during preorder" : m === "units" ? "Reserve N pizzas per slot" : "Reserve % of each slot"}
              </label>
            ))}
          </div>
          {preorderMode !== "all" && (
            <input inputMode="numeric" value={preorderValue} onChange={(e) => setPreorderValue(e.target.value)} className="input max-w-[8rem]" />
          )}
        </div>

        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={pending} onClick={() => saveSettings()}>
            Save totals
          </button>
        </div>
      </section>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Time slots</h2>
            <p className="text-sm text-ink/60">
              Slot capacity adds up to <b>{gridTotal}</b> against a dough limit of <b>{s.pizza_capacity_total}</b>. It is fine for slots to add up to more; the dough limit wins.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-ghost border border-line text-sm"
              onClick={() => {
                const n = parseInt(defaultCap, 10);
                if (!Number.isNaN(n)) setRows((rs) => rs.map((r) => ({ ...r, capacity_units: n })));
              }}
            >
              Set all to {defaultCap || "default"}
            </button>
          </div>
        </div>

        {slots.length === 0 && <p className="text-ink/60">No slots. Check the hours on the Basics step.</p>}

        <div className="grid gap-2 sm:grid-cols-2">
          {slots.map((x) => {
            const r = rows.find((q) => q.id === x.slot_id)!;
            const soldUnits = sold.get(x.slot_id) ?? 0;
            const over = r.capacity_units < soldUnits;
            return (
              <div
                key={x.slot_id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${r.is_blocked ? "border-red-200 bg-red-50/60" : over ? "border-amber-300 bg-amber-50" : "border-line bg-white"}`}
              >
                <div className="w-20 font-semibold tabular-nums">{fmtTime(x.slot_start, tz)}</div>
                <div className="flex items-center gap-1">
                  <button className="h-8 w-8 rounded-lg border border-line hover:bg-cream" onClick={() => updateRow(r.id, { capacity_units: Math.max(0, r.capacity_units - 1) })} aria-label="Less">
                    −
                  </button>
                  <input
                    inputMode="numeric"
                    value={r.capacity_units}
                    onChange={(e) => updateRow(r.id, { capacity_units: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    className="h-8 w-12 rounded-lg border border-line text-center font-bold tabular-nums"
                    aria-label="Capacity"
                  />
                  <button className="h-8 w-8 rounded-lg border border-line hover:bg-cream" onClick={() => updateRow(r.id, { capacity_units: r.capacity_units + 1 })} aria-label="More">
                    +
                  </button>
                </div>
                <div className="flex-1 text-xs text-ink/60 tabular-nums">
                  {soldUnits} sold{over && <span className="text-amber-700 font-semibold"> · below sold</span>}
                </div>
                <button
                  className={`text-xs font-semibold rounded-lg px-2 py-1 ${r.is_blocked ? "bg-red-600 text-white" : "bg-ink/5 text-ink/60 hover:bg-ink/10"}`}
                  onClick={() => updateRow(r.id, { is_blocked: !r.is_blocked })}
                >
                  {r.is_blocked ? "Blocked" : "Block"}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={pending || slots.length === 0} onClick={() => saveGrid()}>
            {pending ? "Saving..." : "Save slots"}
          </button>
          {msg?.error && <span className="text-sm text-red-700">{msg.error}</span>}
          {msg?.ok && <span className="text-sm text-green-700">{msg.ok}</span>}
          <NextStepLink serviceId={s.id} next="fulfillment" />
        </div>
      </section>
    </div>
  );
}
