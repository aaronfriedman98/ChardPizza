"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Service, ServiceAvailability, ServiceWaste, Settings } from "@/lib/types";
import { type Order, queueSort, tallyItems, minutesBehind, firstName } from "@/lib/orders";
import { fmtTime } from "@/lib/time";
import { LiveRefresh } from "@/components/admin/live-refresh";
import { Modal } from "@/components/ui/modal";
import { setOrderStatus } from "@/app/admin/orders/actions";
import { deleteWaste, logWaste } from "@/app/admin/orders/waste-actions";

type PieType = { menu_item_id: string; name: string };

const REASONS: { key: ServiceWaste["reason"]; label: string }[] = [
  { key: "burnt", label: "Burnt" },
  { key: "dropped", label: "Dropped" },
  { key: "eaten", label: "We ate it" },
  { key: "given_away", label: "Gave it away" },
  { key: "other", label: "Other" },
];

/**
 * Kitchen screen. Pies are interchangeable until boxed, so this shows DEMAND
 * (what to make, by when) rather than which order a pie belongs to.
 * Ready = boxed for that customer, tapped by whoever boxes it.
 */
export function KitchenView({
  service: s,
  orders,
  settings,
  availability,
  waste,
  pieTypes,
}: {
  service: Service;
  orders: Order[];
  settings: Settings;
  availability: ServiceAvailability;
  waste: ServiceWaste[];
  pieTypes: PieType[];
}) {
  const tz = settings.time_zone;
  const [now, setNow] = useState(() => new Date());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const queue = useMemo(() => orders.filter((o) => o.status === "confirmed" || o.status === "making").sort(queueSort), [orders]);
  const active = queue.filter((o) => !o.is_on_hold);
  const held = queue.filter((o) => o.is_on_hold);
  const readyCount = orders.filter((o) => o.status === "ready").length;

  // Demand by time window: what is owed by each upcoming slot, and the running total.
  const windows = useMemo(() => {
    const m = new Map<string, Order[]>();
    for (const o of active) m.set(o.scheduled_at, [...(m.get(o.scheduled_at) ?? []), o]);
    const sorted = Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    let cumulative: Order[] = [];
    return sorted.map(([time, list]) => {
      cumulative = [...cumulative, ...list];
      return { time, items: tallyItems(list), cumulative: tallyItems(cumulative), orders: list.length, late: new Date(time) < now };
    });
  }, [active, now]);

  const priorityNow = active.filter((o) => o.is_rush || o.customer_arrived);
  const nextWindow = windows.find((w) => !w.late) ?? windows[0];
  const makeNow = tallyItems([...priorityNow, ...active.filter((o) => new Date(o.scheduled_at) <= new Date(now.getTime() + 30 * 60000))]);

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="page-title">Kitchen · {s.name}</h1>
          <div className="text-sm text-ink/60">
            {active.length} orders to box · {readyCount} ready · dough used {Number(availability.units_sold) + Number(availability.units_wasted)} of {s.pizza_capacity_total}
            {Number(availability.units_wasted) > 0 && <span className="text-red-700"> ({Number(availability.units_wasted)} lost)</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setLostOpen(true)} className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">
            Lost a pie
          </button>
          <LiveRefresh serviceId={s.id} intervalMs={20000} />
        </div>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" onClick={() => setError(null)}>{error}</p>}

      {/* MAKE NOW */}
      <section className="rounded-2xl bg-char p-4 text-white">
        <div className="flex items-baseline justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-amber">Make now</div>
          <div className="text-xs text-white/60">next 30 min, plus rush and customers who are here</div>
        </div>
        {makeNow.length === 0 ? (
          <div className="mt-1 text-white/60">Nothing owed yet.</div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-x-10 gap-y-2">
            {makeNow.map((b) => (
              <div key={b.name} className="flex items-baseline gap-2">
                <span className="font-display text-6xl font-black text-amber tabular-nums">{b.qty}</span>
                <span className="text-2xl font-semibold">{b.name}</span>
              </div>
            ))}
          </div>
        )}
        {priorityNow.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {priorityNow.map((o) => (
              <span key={o.id} className="rounded-full bg-white/10 px-3 py-1">
                {o.is_rush ? "RUSH" : "HERE"} · {firstName(o)} · {o.order_items.map((it) => `${it.quantity} ${it.item_name}`).join(", ")}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* DEMAND BY TIME */}
      <section className="card p-0">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="font-bold">What&rsquo;s owed, by time</h2>
          <span className="text-xs text-ink/50">running total on the right</span>
        </div>
        <ul className="divide-y divide-line">
          {windows.length === 0 && <li className="px-4 py-3 text-ink/50">Queue is empty.</li>}
          {windows.map((w) => (
            <li key={w.time} className={`flex items-center gap-3 px-4 py-2.5 ${w === nextWindow ? "bg-amber-50" : ""} ${w.late ? "text-red-700" : ""}`}>
              <div className="w-20 font-display text-xl tabular-nums">{fmtTime(w.time, tz)}</div>
              <div className="flex flex-1 flex-wrap gap-x-5 gap-y-1">
                {w.items.map((it) => (
                  <span key={it.name} className="text-lg">
                    <b className="text-ember">{it.qty}</b> {it.name}
                  </span>
                ))}
                <span className="text-xs text-ink/40 self-center">{w.orders} order{w.orders === 1 ? "" : "s"}</span>
              </div>
              <div className="hidden sm:flex flex-wrap justify-end gap-x-3 text-sm text-ink/50 tabular-nums">
                {w.cumulative.map((it) => (
                  <span key={it.name}>
                    {it.qty} {it.name}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* BOX IT */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">Box it · tap Ready when the pies are in the box</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {active.map((o, i) => {
            const behind = minutesBehind(o, now);
            return (
              <article key={o.id} className={`rounded-2xl border-2 bg-white p-4 ${o.is_rush ? "border-red-400" : o.customer_arrived ? "border-blue-400" : behind > 0 ? "border-amber-400" : "border-line"}`}>
                <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                  #{i + 1} · {fmtTime(o.scheduled_at, tz)} · {o.order_number}
                  {o.is_rush && <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] text-white">RUSH</span>}
                  {o.customer_arrived && <span className="ml-2 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] text-white">HERE</span>}
                  {behind > 0 && <span className="ml-2 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">{behind} MIN LATE</span>}
                </div>
                <div className="text-lg font-semibold">{firstName(o)}</div>
                <ul className="mt-1 space-y-0.5">
                  {o.order_items.map((it) => (
                    <li key={it.id} className="flex items-baseline gap-2">
                      <span className="w-8 text-right font-display text-2xl font-black text-ember tabular-nums">{it.quantity}</span>
                      <span className="text-xl font-bold">{it.item_name}</span>
                    </li>
                  ))}
                </ul>
                {o.special_instructions && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">“{o.special_instructions}”</p>}
                <button disabled={pending} onClick={() => run(() => setOrderStatus(o.id, "ready"))} className="mt-3 w-full rounded-xl bg-green-600 py-3 text-lg font-bold text-white hover:bg-green-700 disabled:opacity-50">
                  Ready
                </button>
              </article>
            );
          })}
          {active.length === 0 && <div className="card text-ink/60">Nothing to box.</div>}
        </div>
      </section>

      {held.length > 0 && (
        <section className="space-y-2 opacity-70">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">On hold</h2>
          <ul className="card divide-y divide-line p-0 text-sm">
            {held.map((o) => (
              <li key={o.id} className="flex justify-between px-4 py-2">
                <span>
                  {fmtTime(o.scheduled_at, tz)} · {o.customer_name}
                </span>
                <span className="text-ink/60">{o.order_items.map((it) => `${it.quantity} ${it.item_name}`).join(", ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {waste.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">Lost tonight</h2>
          <ul className="card divide-y divide-line p-0 text-sm">
            {waste.map((w) => (
              <li key={w.id} className="flex items-center justify-between px-4 py-2">
                <span>
                  <b>{Number(w.units)}</b> {w.item_name} · {REASONS.find((r) => r.key === w.reason)?.label ?? w.reason}
                  {w.note && <span className="text-ink/50"> · {w.note}</span>}
                  <span className="text-ink/40"> · {fmtTime(w.created_at, tz)}</span>
                </span>
                <button disabled={pending} className="text-xs text-ink/50 hover:text-red-700" onClick={() => confirm("Remove this entry?") && run(() => deleteWaste(w.id))}>
                  undo
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal open={lostOpen} onClose={() => setLostOpen(false)} title="Lost a pie">
        <LostPieForm serviceId={s.id} pieTypes={pieTypes} onDone={() => setLostOpen(false)} />
      </Modal>
    </div>
  );
}

function LostPieForm({ serviceId, pieTypes, onDone }: { serviceId: string; pieTypes: PieType[]; onDone: () => void }) {
  const [item, setItem] = useState<PieType | null>(pieTypes[0] ?? null);
  const [units, setUnits] = useState(1);
  const [reason, setReason] = useState<ServiceWaste["reason"]>("burnt");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">Counts against tonight&rsquo;s dough so you don&rsquo;t oversell. Shows up in the night&rsquo;s report.</p>
      <div className="flex flex-wrap gap-2">
        {pieTypes.map((p) => (
          <button key={p.menu_item_id} onClick={() => setItem(p)} className={`rounded-xl border px-3 py-2 font-semibold ${item?.menu_item_id === p.menu_item_id ? "border-ember bg-ember/10" : "border-line"}`}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="label mb-0">How many</span>
        <div className="flex items-center rounded-lg border border-line">
          <button onClick={() => setUnits(Math.max(1, units - 1))} className="h-11 w-11 text-xl">−</button>
          <span className="w-10 text-center text-xl font-bold">{units}</span>
          <button onClick={() => setUnits(units + 1)} className="h-11 w-11 text-xl">+</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button key={r.key} onClick={() => setReason(r.key)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${reason === r.key ? "bg-char text-white" : "border border-line"}`}>
            {r.label}
          </button>
        ))}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="Note (optional)" />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        disabled={pending || !item}
        className="btn-primary w-full"
        onClick={() =>
          startTransition(async () => {
            const r = await logWaste({ service_id: serviceId, menu_item_id: item?.menu_item_id ?? null, item_name: item?.name ?? "Pie", units, reason, note });
            if (r.error) setError(r.error);
            else onDone();
          })
        }
      >
        {pending ? "Saving..." : `Log ${units} lost`}
      </button>
    </div>
  );
}
