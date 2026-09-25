"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Settings } from "@/lib/types";
import { type Order, STATUS_LABEL, PAY_LABEL, minutesBehind, minutesReady, urgency, firstName } from "@/lib/orders";
import { formatCents, formatPhone } from "@/lib/format";
import { fmtTime } from "@/lib/time";
import { markPaid, markUnpaid, movePriority, setFlag, setOrderStatus } from "@/app/admin/orders/actions";
import { QuickSend } from "@/components/admin/quick-send";

type Thresholds = Settings;

export function OrderCard({
  order: o,
  now,
  tz,
  thresholds,
  mode = "board",
  onError,
}: {
  order: Order;
  now: Date;
  tz: string;
  thresholds: Thresholds;
  mode?: "board" | "handoff" | "delivery";
  onError?: (m: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmPickup, setConfirmPickup] = useState(false);
  const u = urgency(o, now, thresholds);
  const behind = minutesBehind(o, now);
  const ready = minutesReady(o, now);
  const paid = o.payment_status === "paid";
  const done = o.status === "completed" || o.status === "cancelled";

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) onError?.(r.error);
    });
  }

  function complete() {
    if (!paid && !confirmPickup) {
      setConfirmPickup(true);
      return;
    }
    setConfirmPickup(false);
    run(() => setOrderStatus(o.id, "completed"));
  }

  const tone =
    o.status === "cancelled"
      ? "border-line opacity-50"
      : u === "critical"
        ? "border-red-400 ring-2 ring-red-200"
        : u === "warn"
          ? "border-amber-400 ring-2 ring-amber-100"
          : o.status === "ready"
            ? "border-green-400"
            : o.status === "making"
              ? "border-ember/60"
              : "border-line";

  const Btn = ({ children, onClick, primary, danger }: { children: React.ReactNode; onClick: () => void; primary?: boolean; danger?: boolean }) => (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
        primary ? "bg-ember text-white hover:bg-ember/90" : danger ? "text-red-700 hover:bg-red-50" : "bg-cream text-ink hover:bg-line"
      }`}
    >
      {children}
    </button>
  );

  return (
    <article className={`rounded-2xl border-2 bg-white p-3.5 shadow-sm ${tone} ${o.is_on_hold ? "bg-ink/5" : ""}`}>
      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display text-xl font-bold tabular-nums">{fmtTime(o.scheduled_at, tz)}</span>
            <Link href={`/admin/orders/${o.id}`} className="truncate text-lg font-semibold hover:underline">
              {o.customer_name}
            </Link>
            <span className="text-xs text-ink/50">{o.order_number}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-1.5">
            <Badge tone={o.fulfillment === "delivery" ? "blue" : "gray"}>{o.fulfillment === "delivery" ? `Delivery · ${o.delivery_zone_name ?? ""}` : "Pickup"}</Badge>
            <Badge tone={paid ? "green" : "amber"}>
              {paid ? "PAID" : PAY_LABEL[o.payment_status]} · {o.payment_method}
            </Badge>
            <Badge tone={o.status === "ready" ? "green" : o.status === "making" ? "ember" : "gray"}>{STATUS_LABEL[o.status]}</Badge>
            {o.is_rush && <Badge tone="red">RUSH</Badge>}
            {o.is_on_hold && <Badge tone="gray">ON HOLD</Badge>}
            {o.customer_arrived && !done && <Badge tone="blue">HERE</Badge>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-semibold">{formatCents(o.total_cents)}</div>
          {behind > 0 && <div className={`text-xs font-bold ${u === "critical" ? "text-red-700" : "text-amber-700"}`}>{behind} MIN BEHIND</div>}
          {ready > 0 && <div className={`text-xs font-bold ${u === "critical" ? "text-red-700" : u === "warn" ? "text-amber-700" : "text-green-700"}`}>READY {ready} MIN</div>}
        </div>
      </div>

      {/* items */}
      <ul className="mt-2 space-y-0.5">
        {o.order_items.map((it) => (
          <li key={it.id} className="flex gap-2 text-[15px]">
            <span className="w-7 shrink-0 text-right font-bold text-ember">{it.quantity}×</span>
            <span>{it.item_name}</span>
          </li>
        ))}
      </ul>
      {o.special_instructions && <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1 text-sm text-amber-900">“{o.special_instructions}”</p>}
      {mode === "delivery" && o.address_line1 && (
        <p className="mt-1.5 text-sm text-ink/80">
          {o.address_line1}
          {o.address_line2 ? `, ${o.address_line2}` : ""}
          {o.address_city ? `, ${o.address_city}` : ""}
          {o.address_notes ? ` · ${o.address_notes}` : ""}
        </p>
      )}
      {(mode === "delivery" || mode === "handoff") && (
        <a href={`tel:${o.customer_phone}`} className="mt-1 inline-block text-sm text-ink/60 hover:text-ink">
          {formatPhone(o.customer_phone)}
        </a>
      )}

      {/* actions */}
      {!done && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {(o.status === "making" || o.status === "confirmed") && (
            <Btn primary onClick={() => run(() => setOrderStatus(o.id, "ready"))}>Ready</Btn>
          )}
          {o.status === "ready" && o.fulfillment === "pickup" && (
            <Btn primary onClick={complete}>
              Picked up
            </Btn>
          )}
          {o.status === "ready" && o.fulfillment === "delivery" && (
            <Btn primary onClick={() => run(() => setOrderStatus(o.id, "out_for_delivery"))}>
              Out for delivery
            </Btn>
          )}
          {o.status === "out_for_delivery" && (
            <Btn primary onClick={complete}>
              Delivered
            </Btn>
          )}
          {!paid && <Btn onClick={() => run(() => markPaid(o.id))}>Mark paid</Btn>}
          <QuickSend order={o} settings={thresholds} />
          {paid && mode === "board" && (
            <Btn onClick={() => confirm("Undo Mark Paid on this order?") && run(() => markUnpaid(o.id))}>Undo paid</Btn>
          )}
          {mode === "board" && (
            <>
              {o.status !== "ready" && o.status !== "out_for_delivery" && (
                <>
                  <Btn onClick={() => run(() => setFlag(o.id, "customer_arrived", !o.customer_arrived))}>{o.customer_arrived ? "Not here" : "Here"}</Btn>
                  <Btn onClick={() => run(() => setFlag(o.id, "is_rush", !o.is_rush))}>{o.is_rush ? "Unrush" : "Rush"}</Btn>
                  <Btn onClick={() => run(() => setFlag(o.id, "is_on_hold", !o.is_on_hold))}>{o.is_on_hold ? "Release" : "Hold"}</Btn>
                  <span className="inline-flex overflow-hidden rounded-lg bg-cream">
                    <button disabled={pending} onClick={() => run(() => movePriority(o.id, "up"))} className="px-2 py-2 text-sm hover:bg-line" aria-label="Move up">
                      ▲
                    </button>
                    <button disabled={pending} onClick={() => run(() => movePriority(o.id, "down"))} className="px-2 py-2 text-sm hover:bg-line" aria-label="Move down">
                      ▼
                    </button>
                  </span>
                </>
              )}
              {o.status === "ready" && <Btn onClick={() => run(() => setOrderStatus(o.id, "confirmed"))}>Not ready</Btn>}
              <Btn
                danger
                onClick={() => {
                  const reason = prompt("Cancel this order? Reason (optional):");
                  if (reason === null) return;
                  run(() => setOrderStatus(o.id, "cancelled", reason));
                }}
              >
                Cancel
              </Btn>
            </>
          )}
        </div>
      )}
      {done && o.status === "completed" && mode === "board" && (
        <div className="mt-2">
          <Btn onClick={() => run(() => setOrderStatus(o.id, "ready"))}>Undo pickup</Btn>
        </div>
      )}

      {confirmPickup && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2 text-sm">
          <span className="font-semibold text-amber-900">Not marked paid.</span>
          <Btn
            primary
            onClick={() => {
              setConfirmPickup(false);
              run(async () => {
                const r = await markPaid(o.id);
                if (r.error) return r;
                return setOrderStatus(o.id, "completed");
              });
            }}
          >
            Mark paid & hand off
          </Btn>
          <Btn onClick={complete}>Hand off anyway</Btn>
          <button className="text-ink/60 underline" onClick={() => setConfirmPickup(false)}>
            Never mind
          </button>
        </div>
      )}
    </article>
  );
}

function Badge({ tone, children }: { tone: "gray" | "green" | "amber" | "red" | "blue" | "ember"; children: React.ReactNode }) {
  const cls = {
    gray: "bg-ink/10 text-ink/70",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-900",
    red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800",
    ember: "bg-ember/15 text-ember",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${cls}`}>{children}</span>;
}

export function NameLine({ o }: { o: Order }) {
  return (
    <span>
      <b>{firstName(o)}</b> {o.customer_name.slice(firstName(o).length)}
    </span>
  );
}
