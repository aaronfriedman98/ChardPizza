"use client";

import { useMemo } from "react";
import type { Order } from "@/lib/orders";
import { buildRuns } from "@/lib/batches";
import { fmtTime } from "@/lib/time";

/**
 * The oven's to-do list: pie runs in the exact order to make them.
 * Runs batch the same pie type across orders whenever that delays nobody.
 */
export function CallSheet({ orders, tz, compact = false }: { orders: Order[]; tz: string; compact?: boolean }) {
  const runs = useMemo(() => buildRuns(orders), [orders]);
  const totalPies = runs.reduce((a, r) => a + r.qty, 0);

  return (
    <div className={`rounded-2xl bg-char text-white ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-semibold uppercase tracking-[0.25em] text-amber">Oven · make in this order</div>
        <div className="text-xs text-white/50">{totalPies} pies to go</div>
      </div>
      {runs.length === 0 && <div className="mt-2 text-white/60">Nothing to make.</div>}
      <ol className="mt-2 space-y-1">
        {runs.map((r, i) => {
          const newSlot = i === 0 || runs[i - 1].slotStart !== r.slotStart;
          const who = r.parts
            .map((p) => `${p.customer}${p.scheduledAt !== r.slotStart ? ` (${fmtTime(p.scheduledAt, tz)})` : ""}${p.flags.length ? ` ${p.flags.join("/")}` : ""}${r.parts.length > 1 ? ` ×${p.qty}` : ""}`)
            .join(", ");
          return (
            <li key={`${r.slotStart}-${i}`}>
              {newSlot && <div className={`${i === 0 ? "" : "mt-2"} text-[11px] font-semibold uppercase tracking-wide text-white/50`}>{fmtTime(r.slotStart, tz)}</div>}
              <div className={`flex items-center gap-3 rounded-xl px-3 py-1.5 ${i === 0 ? "bg-amber text-coal" : "bg-white/[0.06]"}`}>
                <span className={`w-5 shrink-0 text-xs font-bold ${i === 0 ? "text-coal/60" : "text-white/40"}`}>{i + 1}</span>
                <span className={`font-display tabular-nums ${compact ? "text-3xl" : "text-5xl"} ${i === 0 ? "" : "text-amber"}`}>{r.qty}</span>
                <div className="min-w-0 flex-1">
                  <div className={`font-semibold leading-tight ${compact ? "text-base" : "text-xl"}`}>{r.name}</div>
                  <div className={`truncate text-xs ${i === 0 ? "text-coal/70" : "text-white/50"}`}>
                    {who}
                    {r.completes.length > 0 && <span className={i === 0 ? "text-coal" : "text-green-300"}> · ✓ {r.completes.join(", ")} done</span>}
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
