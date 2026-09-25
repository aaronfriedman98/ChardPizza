"use client";

import { useMemo } from "react";
import type { Order } from "@/lib/orders";
import { buildBatches } from "@/lib/batches";
import { fmtTime } from "@/lib/time";

/**
 * The oven's to-do list: batches in the order they should be made.
 * Each batch is one or more orders that can be baked type-by-type without delaying anyone.
 */
export function CallSheet({ orders, typeOrder, tz, compact = false }: { orders: Order[]; typeOrder: string[]; tz: string; compact?: boolean }) {
  const batches = useMemo(() => buildBatches(orders, typeOrder), [orders, typeOrder]);
  const totalPies = batches.reduce((a, b) => a + b.lines.reduce((x, l) => x + l.qty, 0), 0);

  return (
    <div className={`rounded-2xl bg-char text-white ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-semibold uppercase tracking-[0.25em] text-amber">Oven · make in this order</div>
        <div className="text-xs text-white/50">{totalPies} pies to go</div>
      </div>
      {batches.length === 0 && <div className="mt-2 text-white/60">Nothing to make.</div>}
      <ol className="mt-2 space-y-1.5">
        {batches.map((b, i) => {
          const newSlot = i === 0 || batches[i - 1].slotStart !== b.slotStart;
          return (
            <li key={`${b.slotStart}-${b.orders[0]?.id}`}>
              {newSlot && (
                <div className={`${i === 0 ? "" : "mt-2"} text-[11px] font-semibold uppercase tracking-wide text-white/50`}>{fmtTime(b.slotStart, tz)}</div>
              )}
              <div className={`flex items-start gap-3 rounded-xl px-3 py-2 ${i === 0 ? "bg-amber text-coal" : "bg-white/[0.06]"}`}>
                <span className={`mt-0.5 w-5 shrink-0 text-xs font-bold ${i === 0 ? "text-coal/60" : "text-white/40"}`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                    {b.lines.map((l) => (
                      <span key={l.name} className={compact ? "text-lg" : "text-2xl"}>
                        <b className={`font-display ${compact ? "text-2xl" : "text-4xl"} ${i === 0 ? "" : "text-amber"}`}>{l.qty}</b> {l.name}
                      </span>
                    ))}
                  </div>
                  <div className={`truncate text-xs ${i === 0 ? "text-coal/70" : "text-white/50"}`}>
                    {b.orders.map((o) => `${o.name}${o.flags.length ? ` (${o.flags.join(", ")})` : ""}`).join(" · ")}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
