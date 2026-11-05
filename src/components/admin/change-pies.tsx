"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Order } from "@/lib/orders";
import { formatCents } from "@/lib/format";
import { getQuickEdit, quickChangeItems, type QuickEditData } from "@/app/admin/orders/admin-order-actions";
import { Spinner, beginBusy, endBusy, toast } from "@/components/admin/feedback";

// Add or remove pies on an order straight from its card. Removing frees the spots, adding takes them,
// and a full slot can be overridden with one more tap.
export function ChangePies({ order: o }: { order: Order }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<QuickEditData | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [full, setFull] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  function toggle() {
    if (open) return close();
    setOpen(true);
    setFull(null);
    startLoad(async () => {
      const r = await getQuickEdit(o.id);
      if ("error" in r) {
        toast(r.error, "error");
        setOpen(false);
        return;
      }
      setData(r);
      setQty(Object.fromEntries(r.items.map((i) => [i.smi_id, i.qty])));
    });
  }

  function close() {
    setOpen(false);
    setData(null);
    setFull(null);
  }

  const bump = (id: string, d: number) => {
    setFull(null);
    setQty((q) => ({ ...q, [id]: Math.max((q[id] ?? 0) + d, 0) }));
  };

  const units = data ? data.items.reduce((a, i) => a + i.capacity_units * (qty[i.smi_id] ?? 0), 0) : 0;
  const changed = !!data && data.items.some((i) => (qty[i.smi_id] ?? 0) !== i.qty);
  const empty = !!data && data.items.every((i) => (qty[i.smi_id] ?? 0) === 0);
  const over = data ? units - data.slot_room : 0;

  function save(override: boolean) {
    if (!data) return;
    const items = data.items.filter((i) => (qty[i.smi_id] ?? 0) > 0).map((i) => ({ service_menu_item_id: i.smi_id, quantity: qty[i.smi_id] }));
    beginBusy();
    startSave(async () => {
      try {
        const r = await quickChangeItems({ order_id: o.id, items, capacity_override: override });
        if (r.error) {
          if (r.code === "SLOT_FULL" || r.code === "SOLD_OUT" || r.code === "ITEM_SOLD_OUT") setFull(r.error);
          else toast(r.error, "error");
          return;
        }
        const owed = r.owed_cents
          ? ` They owe ${formatCents(r.owed_cents)} more.`
          : r.refund_cents
            ? ` They already paid, so you owe them ${formatCents(r.refund_cents)} back.`
            : "";
        toast(`Saved. New total ${formatCents(r.total_cents ?? 0)}.${owed}`, "ok");
        close();
        router.refresh();
      } catch {
        toast("That didn't go through. Try again.", "error");
      } finally {
        endBusy();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${open ? "bg-char text-white" : "bg-cream text-ink hover:bg-line"}`}
      >
        ± Pies
      </button>
      {open && (
        <div className="basis-full rounded-xl border border-line bg-cream/60 p-2.5">
          {loading || !data ? (
            <div className="flex items-center gap-2 py-2 text-sm text-ink/60">
              <Spinner /> Loading the menu…
            </div>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {data.items.map((i) => {
                  const q = qty[i.smi_id] ?? 0;
                  const diff = q - i.qty;
                  return (
                    <li key={i.smi_id} className="flex items-center justify-between gap-2 py-1.5">
                      <div className="min-w-0">
                        <div className={`truncate text-[15px] ${q ? "font-semibold" : "text-ink/60"}`}>{i.name}</div>
                        <div className="text-xs text-ink/50">
                          {formatCents(i.price_cents)}
                          {diff !== 0 && <span className={diff > 0 ? "text-ember" : "text-ink/70"}> · {diff > 0 ? `+${diff}` : diff}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-line bg-white">
                        <button type="button" onClick={() => bump(i.smi_id, -1)} disabled={q === 0 || saving} className="h-10 w-10 text-lg font-bold disabled:opacity-30" aria-label={`One less ${i.name}`}>
                          −
                        </button>
                        <span className="w-7 text-center font-bold tabular-nums">{q}</span>
                        <button type="button" onClick={() => bump(i.smi_id, 1)} disabled={saving} className="h-10 w-10 text-lg font-bold text-ember disabled:opacity-30" aria-label={`One more ${i.name}`}>
                          +
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <p className={`mt-2 text-xs ${over > 0 ? "font-semibold text-amber-800" : "text-ink/60"}`}>
                {over > 0
                  ? `${data.slot_label} only has room for ${data.slot_room}. This makes it ${over} over.`
                  : `${data.slot_label}: ${data.slot_room - units} ${data.slot_room - units === 1 ? "spot" : "spots"} left after this change.`}
              </p>

              {full ? (
                <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm">
                  <div className="font-semibold text-amber-900">{full}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => save(true)} disabled={saving} className="busy-btn rounded-lg bg-ember px-3 py-2 font-semibold text-white disabled:opacity-60" aria-busy={saving}>
                      <span className="busy-label">Add anyway</span>
                      {saving && <Spinner className="busy-spinner" />}
                    </button>
                    <button type="button" onClick={() => setFull(null)} className="text-ink/60 underline">
                      Never mind
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => save(false)}
                    disabled={!changed || empty || saving}
                    aria-busy={saving}
                    className="busy-btn rounded-lg bg-ember px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <span className="busy-label">Save</span>
                    {saving && <Spinner className="busy-spinner" />}
                  </button>
                  <button type="button" onClick={close} className="px-2 py-2 text-sm text-ink/60 underline">
                    Close
                  </button>
                  {empty && <span className="text-xs text-ink/60">To drop every pie, use Cancel instead.</span>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
