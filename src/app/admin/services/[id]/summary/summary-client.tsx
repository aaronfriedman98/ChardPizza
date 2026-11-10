"use client";

import Link from "next/link";
import { useState } from "react";
import { toast, useBusyTransition } from "@/components/admin/feedback";
import { markPaid, markUnpaid, setOrderStatus } from "@/app/admin/orders/actions";
import { setServiceStatus } from "@/app/admin/services/actions";
import { formatCents } from "@/lib/format";
import { PAY_LABEL, STATUS_LABEL, type OrderStatus, type PaymentMethod, type PaymentStatus } from "@/lib/orders";

export type SummaryOrder = {
  id: string;
  order_number: string;
  customer_name: string;
  fulfillment: "pickup" | "delivery";
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  total_cents: number;
  time: string;
  items: string;
  cancel_reason: string | null;
};

const UNPAID: PaymentStatus[] = ["unpaid", "awaiting_payment", "due_at_pickup"];
const METHOD: Record<PaymentMethod, string> = { zelle: "Zelle", cash: "Cash", card: "Card" };
type Filter = "todo" | "all" | "cancelled";

export function SummaryOrders({ orders }: { orders: SummaryOrder[] }) {
  const live = orders.filter((o) => o.status !== "cancelled");
  const isTodo = (o: SummaryOrder) => o.status !== "cancelled" && (UNPAID.includes(o.payment_status) || o.status !== "completed");
  const todo = orders.filter(isTodo);
  const cancelled = orders.filter((o) => o.status === "cancelled");
  const [filter, setFilter] = useState<Filter>(todo.length ? "todo" : "all");
  const [busy, setBusy] = useState<Set<string>>(() => new Set());

  // Each button runs on its own, so several can be tapped in a row.
  async function run(key: string, fn: () => Promise<{ error?: string }>) {
    setBusy((b) => new Set(b).add(key));
    try {
      const r = await fn();
      if (r.error) toast(r.error, "error");
    } catch {
      toast("That didn't go through. Reload the page and try again.", "error");
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(key);
        return n;
      });
    }
  }

  // The kitchen steps can be skipped after the fact: walk the order to Done.
  async function handOff(o: SummaryOrder) {
    if (o.status === "confirmed" || o.status === "making") {
      const r = await setOrderStatus(o.id, "ready");
      if (r.error) return r;
    }
    return setOrderStatus(o.id, "completed");
  }

  const shown = filter === "todo" ? todo : filter === "cancelled" ? cancelled : live;

  return (
    <div className="card space-y-3 p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <h2 className="font-semibold">Orders</h2>
        <div className="flex gap-1 rounded-lg bg-cream p-0.5 text-sm">
          {(
            [
              ["todo", `To finish (${todo.length})`],
              ["all", `All (${live.length})`],
              ["cancelled", `Cancelled (${cancelled.length})`],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-2.5 py-1 font-semibold ${filter === f ? "bg-white shadow" : "text-ink/60"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 && <p className="px-4 pb-4 text-sm text-ink/60">{filter === "todo" ? "✓ Nothing left. Every order is handed off and paid." : "None."}</p>}

      <ul className="divide-y divide-line">
        {shown.map((o) => {
          const unpaid = UNPAID.includes(o.payment_status);
          const paid = !unpaid && o.status !== "cancelled";
          const methods = Array.from(new Set<PaymentMethod>([o.payment_method, "zelle", "cash"]));
          const B = "rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50";
          return (
            <li key={o.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-semibold">{o.customer_name}</span>
                    <span className="text-xs text-ink/50">
                      {o.order_number} · {o.time} · {o.fulfillment === "delivery" ? "🚗 delivery" : "pickup"}
                    </span>
                  </div>
                  <div className="truncate text-sm text-ink/70">{o.items}</div>
                  {o.status === "cancelled" && o.cancel_reason && <div className="text-xs text-ink/50">{o.cancel_reason}</div>}
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-bold tabular-nums">{formatCents(o.total_cents)}</div>
                  <div className="mt-0.5 flex flex-wrap justify-end gap-1 text-[11px] font-semibold">
                    {o.status !== "completed" && <span className="rounded-full bg-ink/10 px-2 py-0.5 text-ink/70">{STATUS_LABEL[o.status]}</span>}
                    {o.status !== "cancelled" && (
                      <span className={`rounded-full px-2 py-0.5 ${paid ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>
                        {o.payment_status === "paid" ? `Paid · ${METHOD[o.payment_method]}` : PAY_LABEL[o.payment_status]}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {o.status !== "cancelled" && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {unpaid &&
                    methods.map((mth) => (
                      <button
                        key={mth}
                        disabled={busy.has(`${o.id}:pay`)}
                        onClick={() => run(`${o.id}:pay`, () => markPaid(o.id, mth))}
                        className={`${B} ${mth === o.payment_method ? "bg-green-700 text-white hover:bg-green-800" : "bg-cream hover:bg-line"}`}
                      >
                        ✓ Paid · {METHOD[mth]}
                      </button>
                    ))}
                  {o.status !== "completed" && (
                    <button disabled={busy.has(`${o.id}:done`)} onClick={() => run(`${o.id}:done`, () => handOff(o))} className={`${B} bg-char text-white hover:bg-char/90`}>
                      {o.fulfillment === "delivery" ? "Delivered" : "Picked up"}
                    </button>
                  )}
                  {paid && filter === "all" && (
                    <button
                      disabled={busy.has(`${o.id}:unpay`)}
                      onClick={() => confirm(`Undo Mark Paid for ${o.customer_name}?`) && run(`${o.id}:unpay`, () => markUnpaid(o.id))}
                      className="px-2 py-2 text-xs text-ink/50 hover:text-red-700"
                    >
                      Undo paid
                    </button>
                  )}
                  <Link href={`/admin/orders/${o.id}`} className="ml-auto px-2 py-2 text-sm text-ember hover:underline">
                    Open →
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CompleteSaleButton({ serviceId, ended }: { serviceId: string; ended: boolean }) {
  const [pending, startTransition] = useBusyTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!ended && !confirm("The sale hasn't reached its end time. Mark it completed anyway? It leaves the public site.")) return;
        startTransition(async () => {
          const r = await setServiceStatus(serviceId, "completed");
          if (r.error) toast(r.error, "error");
          else toast("Sale marked completed.");
        });
      }}
      className="mt-1 rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Mark sale completed"}
    </button>
  );
}
