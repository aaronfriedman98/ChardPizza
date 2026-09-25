"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { Service, ServiceAvailability, Settings } from "@/lib/types";
import { type Order, ACTIVE, minutesBehind, minutesReady, urgency, queueSort } from "@/lib/orders";
import { formatCents } from "@/lib/format";
import { fmtTime } from "@/lib/time";
import { OrderCard } from "@/components/admin/order-card";
import { LiveRefresh } from "@/components/admin/live-refresh";
import { CallSheet } from "@/components/admin/call-sheet";
import { setOrderingOverride } from "@/app/admin/services/actions";

type Filter = "all" | "active" | "pickup" | "delivery" | "unpaid" | "late" | "ready" | "done";
type Group = "slot" | "queue" | "status";

export function ServiceBoard({
  service: s,
  availability,
  orders,
  settings,
  candidates,
  typeOrder,
}: {
  service: Service;
  availability: ServiceAvailability;
  orders: Order[];
  settings: Settings;
  candidates: Service[];
  typeOrder: string[];
}) {
  const router = useRouter();
  const tz = settings.time_zone;
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState<Filter>("active");
  const [group, setGroup] = useState<Group>("slot");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  // ---- metrics ------------------------------------------------------------
  const live = orders.filter((o) => o.status !== "cancelled");
  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const revenue = live.reduce((a, o) => a + o.total_cents, 0);
  const paidTotal = live.filter((o) => o.payment_status === "paid").reduce((a, o) => a + o.total_cents, 0);
  const lateOrders = active.filter((o) => minutesBehind(o, now) > 0);
  const avgBehind = lateOrders.length ? Math.round(lateOrders.reduce((a, o) => a + minutesBehind(o, now), 0) / lateOrders.length) : 0;
  const waiting = active.filter((o) => o.status === "ready" && o.fulfillment === "pickup").length;
  const health = avgBehind === 0 ? "On schedule" : avgBehind < settings.late_critical_minutes ? "Slightly behind" : "Kitchen backed up";
  const healthTone = avgBehind === 0 ? "bg-green-100 text-green-800" : avgBehind < settings.late_critical_minutes ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-800";
  const nextUp = active.filter((o) => o.status === "confirmed" || o.status === "making").sort(queueSort)[0];
  const paused = s.ordering_override === "paused";

  // ---- filtering ----------------------------------------------------------
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/\D/g, "") || q.trim().toLowerCase();
    return orders.filter((o) => {
      if (needle) {
        const hay = `${o.customer_name} ${o.order_number} ${o.customer_phone}`.toLowerCase();
        if (!hay.includes(needle) && !o.customer_phone.replace(/\D/g, "").includes(needle)) return false;
      }
      switch (filter) {
        case "active": return ACTIVE.includes(o.status) || o.status === "pending_payment";
        case "pickup": return o.fulfillment === "pickup" && ACTIVE.includes(o.status);
        case "delivery": return o.fulfillment === "delivery" && ACTIVE.includes(o.status);
        case "unpaid": return o.payment_status !== "paid" && o.status !== "cancelled";
        case "late": return urgency(o, now, settings) !== "none";
        case "ready": return o.status === "ready" || o.status === "out_for_delivery";
        case "done": return o.status === "completed" || o.status === "cancelled";
        default: return true;
      }
    });
  }, [orders, filter, q, now, settings]);

  const groups = useMemo(() => {
    const m = new Map<string, Order[]>();
    if (group === "queue") {
      m.set("Production queue", [...shown].sort(queueSort));
    } else if (group === "status") {
      for (const o of shown) {
        const k = o.status;
        m.set(k, [...(m.get(k) ?? []), o]);
      }
    } else {
      for (const o of shown) {
        const k = fmtTime(o.scheduled_at, tz);
        m.set(k, [...(m.get(k) ?? []), o]);
      }
    }
    return Array.from(m.entries());
  }, [shown, group, tz]);

  const Chip = ({ f, label, count }: { f: Filter; label: string; count?: number }) => (
    <button
      onClick={() => setFilter(f)}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${filter === f ? "bg-char text-white" : "bg-white border border-line text-ink/70 hover:bg-cream"}`}
    >
      {label}
      {count !== undefined && count > 0 && <span className="ml-1 opacity-70">{count}</span>}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">{s.name}</h1>
            <LiveRefresh serviceId={s.id} />
          </div>
          <div className="text-sm text-ink/60">
            {fmtTime(s.starts_at, tz)} to {fmtTime(s.ends_at, tz)} ·{" "}
            <Link href={`/admin/services/${s.id}`} className="text-ember hover:underline">
              settings
            </Link>
            {" · "}
            <Link href={`/admin/orders/new?service=${s.id}`} className="text-ember hover:underline">
              + manual order
            </Link>
            {candidates.length > 1 && (
              <>
                {" · "}
                <select
                  className="rounded border border-line bg-white px-1 py-0.5 text-sm"
                  value={s.id}
                  onChange={(e) => router.push(`/admin/service?service=${e.target.value}`)}
                >
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.service_date}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await setOrderingOverride(s.id, paused ? "auto" : "paused");
              if (r.error) setError(r.error);
            })
          }
          className={`rounded-xl px-5 py-3 text-base font-bold text-white shadow-md transition disabled:opacity-60 ${paused ? "bg-green-600 hover:bg-green-700" : "bg-amber-500 hover:bg-amber-600"}`}
        >
          {paused ? "▶ RESUME ORDERS" : "⏸ PAUSE NEW ORDERS"}
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" onClick={() => setError(null)}>
          {error}
        </p>
      )}

      {/* metrics */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Dough used" value={`${Number(availability.units_sold) + Number(availability.units_wasted)} / ${s.pizza_capacity_total}`} sub={`${Number(availability.units_remaining)} left${Number(availability.units_wasted) ? ` · ${Number(availability.units_wasted)} lost` : ""}`} />
        <Stat label="Orders" value={String(live.length)} sub={`${live.filter((o) => o.fulfillment === "pickup").length} pickup · ${live.filter((o) => o.fulfillment === "delivery").length} delivery`} />
        <Stat label="Revenue" value={formatCents(revenue)} sub={`${formatCents(paidTotal)} paid`} />
        <Stat label="Outstanding" value={formatCents(revenue - paidTotal)} sub={`${live.filter((o) => o.payment_status !== "paid").length} unpaid`} tone={revenue - paidTotal > 0 ? "amber" : "green"} />
        <Stat label="Next up" value={nextUp ? fmtTime(nextUp.scheduled_at, tz) : "—"} sub={nextUp ? nextUp.customer_name : "queue empty"} />
        <div className="card flex flex-col justify-center p-3">
          <span className={`self-start rounded-full px-2.5 py-1 text-xs font-bold ${healthTone}`}>{health}</span>
          <div className="mt-1 text-xs text-ink/60">
            {lateOrders.length ? `${lateOrders.length} behind, avg ${avgBehind} min` : "nothing late"}
            {waiting ? ` · ${waiting} waiting` : ""}
          </div>
          {avgBehind >= settings.late_critical_minutes && !paused && <div className="mt-1 text-xs font-semibold text-red-700">Consider pausing new orders.</div>}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4 min-w-0">
      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, order #"
          className="input w-full sm:w-64"
        />
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <Chip f="active" label="Active" count={active.length} />
          <Chip f="late" label="Late" count={orders.filter((o) => urgency(o, now, settings) !== "none").length} />
          <Chip f="ready" label="Ready" count={orders.filter((o) => o.status === "ready" || o.status === "out_for_delivery").length} />
          <Chip f="unpaid" label="Unpaid" count={live.filter((o) => o.payment_status !== "paid").length} />
          <Chip f="pickup" label="Pickup" />
          <Chip f="delivery" label="Delivery" />
          <Chip f="done" label="Done" count={orders.filter((o) => o.status === "completed" || o.status === "cancelled").length} />
          <Chip f="all" label="All" />
        </div>
        <div className="ml-auto flex rounded-lg border border-line bg-white p-0.5 text-sm">
          {(["slot", "queue", "status"] as Group[]).map((g) => (
            <button key={g} onClick={() => setGroup(g)} className={`rounded-md px-2.5 py-1 capitalize ${group === g ? "bg-char text-white" : "text-ink/70"}`}>
              {g === "slot" ? "By time" : g === "queue" ? "Queue order" : "By status"}
            </button>
          ))}
        </div>
      </div>

      {/* cards */}
      {shown.length === 0 && <div className="card text-ink/60">No orders match.</div>}
      {groups.map(([label, list]) => (
        <section key={label} className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink/50">
            {label}
            <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px] text-ink/70">
              {list.reduce((a, o) => a + Number(o.capacity_units), 0)} units · {list.length} orders
            </span>
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((o) => (
              <OrderCard key={o.id} order={o} now={now} tz={tz} thresholds={settings} onError={setError} />
            ))}
          </div>
        </section>
      ))}

      </div>
      <aside className="xl:sticky xl:top-4 xl:self-start">
        <CallSheet orders={orders} typeOrder={typeOrder} tz={tz} compact />
      </aside>
      </div>

      {/* ready-too-long callout */}
      {active.some((o) => minutesReady(o, now) >= settings.ready_uncollected_minutes) && filter !== "ready" && (
        <button onClick={() => setFilter("ready")} className="fixed bottom-24 right-4 z-30 rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-lg md:bottom-6">
          Orders sitting ready →
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "amber" | "green" }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${tone === "amber" ? "text-amber-700" : tone === "green" ? "text-green-700" : ""}`}>{value}</div>
      {sub && <div className="truncate text-xs text-ink/60">{sub}</div>}
    </div>
  );
}
