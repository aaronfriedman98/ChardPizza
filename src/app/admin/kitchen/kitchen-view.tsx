"use client";

import { useEffect, useState, useTransition } from "react";
import type { Service, Settings } from "@/lib/types";
import { type Order, queueSort, tallyItems, minutesBehind, firstName } from "@/lib/orders";
import { fmtTime } from "@/lib/time";
import { LiveRefresh } from "@/components/admin/live-refresh";
import { movePriority, setOrderStatus } from "@/app/admin/orders/actions";

/** Kitchen screen: what to make next, in big type, nothing else. */
export function KitchenView({ service: s, orders, settings }: { service: Service; orders: Order[]; settings: Settings }) {
  const tz = settings.time_zone;
  const [now, setNow] = useState(() => new Date());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const queue = orders.filter((o) => o.status === "confirmed" || o.status === "making").sort(queueSort);
  const making = queue.filter((o) => o.status === "making");
  const upNext = queue.filter((o) => o.status === "confirmed" && !o.is_on_hold);
  const held = queue.filter((o) => o.is_on_hold);
  const horizon = new Date(now.getTime() + 30 * 60000);
  const soon = upNext.filter((o) => new Date(o.scheduled_at) <= horizon || o.is_rush || o.customer_arrived);
  const batch = tallyItems([...making, ...soon]);
  const readyCount = orders.filter((o) => o.status === "ready").length;

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
    });
  }

  const Card = ({ o, index }: { o: Order; index: number }) => {
    const behind = minutesBehind(o, now);
    return (
      <article className={`rounded-2xl border-2 bg-white p-4 ${o.status === "making" ? "border-ember" : o.is_rush ? "border-red-400" : "border-line"}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              #{index + 1} · {o.order_number} · {fmtTime(o.scheduled_at, tz)}
              {o.is_rush && <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] text-white">RUSH</span>}
              {o.customer_arrived && <span className="ml-2 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] text-white">HERE</span>}
              {behind > 0 && <span className="ml-2 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">{behind} MIN LATE</span>}
            </div>
            <div className="text-lg font-semibold">{firstName(o)}</div>
          </div>
          <span className="inline-flex overflow-hidden rounded-lg bg-cream">
            <button disabled={pending} onClick={() => run(() => movePriority(o.id, "up"))} className="px-3 py-2 text-lg hover:bg-line" aria-label="Move up">▲</button>
            <button disabled={pending} onClick={() => run(() => movePriority(o.id, "down"))} className="px-3 py-2 text-lg hover:bg-line" aria-label="Move down">▼</button>
          </span>
        </div>
        <ul className="mt-2 space-y-1">
          {o.order_items.map((it) => (
            <li key={it.id} className="flex items-baseline gap-3">
              <span className="w-10 text-right font-display text-3xl font-black text-ember tabular-nums">{it.quantity}</span>
              <span className="text-2xl font-bold">{it.item_name}</span>
            </li>
          ))}
        </ul>
        {o.special_instructions && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-base font-medium text-amber-900">“{o.special_instructions}”</p>}
        <div className="mt-3 flex gap-2">
          {o.status === "confirmed" ? (
            <button disabled={pending} onClick={() => run(() => setOrderStatus(o.id, "making"))} className="flex-1 rounded-xl bg-char py-3 text-lg font-bold text-white hover:bg-ink disabled:opacity-50">
              Start
            </button>
          ) : (
            <button disabled={pending} onClick={() => run(() => setOrderStatus(o.id, "ready"))} className="flex-1 rounded-xl bg-green-600 py-3 text-lg font-bold text-white hover:bg-green-700 disabled:opacity-50">
              Ready
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="page-title">Kitchen · {s.name}</h1>
          <div className="text-sm text-ink/60">
            {making.length} in the oven · {upNext.length} waiting · {readyCount} ready for handoff
          </div>
        </div>
        <LiveRefresh serviceId={s.id} intervalMs={20000} />
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" onClick={() => setError(null)}>{error}</p>}

      {/* batch summary */}
      <section className="rounded-2xl bg-char p-4 text-white">
        <div className="text-xs font-semibold uppercase tracking-[0.25em] text-amber">Next 30 minutes</div>
        {batch.length === 0 ? (
          <div className="mt-1 text-white/60">Nothing queued.</div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
            {batch.map((b) => (
              <div key={b.name} className="flex items-baseline gap-2">
                <span className="font-display text-5xl font-black text-amber tabular-nums">{b.qty}</span>
                <span className="text-xl font-semibold">{b.name}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {making.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ember">In the oven</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {making.map((o, i) => (
              <Card key={o.id} o={o} index={i} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">Make next</h2>
        {upNext.length === 0 && <div className="card text-ink/60">Queue is empty.</div>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {upNext.map((o, i) => (
            <Card key={o.id} o={o} index={making.length + i} />
          ))}
        </div>
      </section>

      {held.length > 0 && (
        <section className="space-y-2 opacity-70">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">On hold</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {held.map((o, i) => (
              <Card key={o.id} o={o} index={making.length + upNext.length + i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
