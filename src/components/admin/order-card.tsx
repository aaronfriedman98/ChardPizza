"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Settings } from "@/lib/types";
import { type Order, STATUS_LABEL, PAY_LABEL, minutesBehind, minutesReady, urgency, firstName } from "@/lib/orders";
import { formatCents, formatPhone } from "@/lib/format";
import { fmtTime } from "@/lib/time";
import { markPaid, markUnpaid, movePriority, setFlag, setOrderStatus } from "@/app/admin/orders/actions";
import { ConfirmText, PriceText, QuickSend } from "@/components/admin/quick-send";
import { ChangePies } from "@/components/admin/change-pies";
import { Spinner, beginBusy, endBusy, toast } from "@/components/admin/feedback";

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
  const [confirmPickup, setConfirmPickup] = useState(false);
  // Buttons that are saving right now. Each tap runs on its own, so tapping Ready on three cards
  // (or two buttons on one card) never waits for or blocks the others.
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const armed = useRef<string | null>(null);
  const u = urgency(o, now, thresholds);
  const behind = minutesBehind(o, now);
  const ready = minutesReady(o, now);
  const paid = o.payment_status === "paid";
  const done = o.status === "completed" || o.status === "cancelled";

  function run(fn: () => Promise<{ error?: string }>) {
    const key = armed.current ?? "action";
    armed.current = null;
    if (busy.has(key)) return; // same button tapped twice while saving
    setBusy((b) => new Set(b).add(key));
    beginBusy();
    void (async () => {
      try {
        const r = await fn();
        if (r.error) {
          onError?.(r.error);
          toast(r.error, "error");
        }
      } catch {
        toast("That didn't go through. Try again.", "error");
      } finally {
        endBusy();
        setBusy((b) => {
          const n = new Set(b);
          n.delete(key);
          return n;
        });
      }
    })();
  }
  const B = { busyKeys: busy, arm: (k: string) => (armed.current = k) };

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
            {(o.price_tier_id || o.pie_price_override_cents != null) && <Badge tone="blue">SPECIAL PRICE</Badge>}
            {o.is_rush && <Badge tone="red">MAKE NOW</Badge>}
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
            <CardButton {...B} primary onClick={() => run(() => setOrderStatus(o.id, "ready"))}>Ready</CardButton>
          )}
          {o.status === "ready" && o.fulfillment === "pickup" && (
            <CardButton {...B} primary onClick={complete}>
              Picked up
            </CardButton>
          )}
          {o.status === "ready" && o.fulfillment === "delivery" && (
            <CardButton {...B} primary onClick={() => run(() => setOrderStatus(o.id, "out_for_delivery"))}>
              Out for delivery
            </CardButton>
          )}
          {o.status === "out_for_delivery" && (
            <CardButton {...B} primary onClick={complete}>
              Delivered
            </CardButton>
          )}
          {!paid && <CardButton {...B} onClick={() => run(() => markPaid(o.id))}>Mark paid</CardButton>}
          <ConfirmText order={o} settings={thresholds} />
          <PriceText order={o} settings={thresholds} />
          <QuickSend order={o} settings={thresholds} />
          {mode === "board" && <ChangePies order={o} />}
          {paid && mode === "board" && (
            <CardButton {...B} onClick={() => confirm("Undo Mark Paid on this order?") && run(() => markUnpaid(o.id))}>Undo paid</CardButton>
          )}
          {mode === "board" && (
            <>
              {o.status !== "ready" && o.status !== "out_for_delivery" && (
                <>
                  <CardButton {...B} onClick={() => run(() => setFlag(o.id, "customer_arrived", !o.customer_arrived))}>{o.customer_arrived ? "Not here" : "Here"}</CardButton>
                  <CardButton {...B} onClick={() => run(() => setFlag(o.id, "is_rush", !o.is_rush))}>{o.is_rush ? "Undo make now" : "Make now"}</CardButton>
                  <CardButton {...B} onClick={() => run(() => setFlag(o.id, "is_on_hold", !o.is_on_hold))}>{o.is_on_hold ? "Release" : "Hold"}</CardButton>
                  <span className="inline-flex overflow-hidden rounded-lg bg-cream">
                    <button disabled={busy.has("up")} onClick={() => { armed.current = "up"; run(() => movePriority(o.id, "up")); }} className="px-2 py-2 text-sm hover:bg-line" aria-label="Move up">
                      ▲
                    </button>
                    <button disabled={busy.has("down")} onClick={() => { armed.current = "down"; run(() => movePriority(o.id, "down")); }} className="px-2 py-2 text-sm hover:bg-line" aria-label="Move down">
                      ▼
                    </button>
                  </span>
                </>
              )}
              {o.status === "ready" && <CardButton {...B} onClick={() => run(() => setOrderStatus(o.id, "confirmed"))}>Not ready</CardButton>}
              <CardButton {...B}
                danger
                onClick={() => {
                  const reason = prompt("Cancel this order? Reason (optional):");
                  if (reason === null) return;
                  run(() => setOrderStatus(o.id, "cancelled", reason));
                }}
              >
                Cancel
              </CardButton>
            </>
          )}
        </div>
      )}
      {done && o.status === "completed" && mode === "board" && (
        <div className="mt-2">
          <CardButton {...B} onClick={() => run(() => setOrderStatus(o.id, "ready"))}>Undo pickup</CardButton>
        </div>
      )}

      {confirmPickup && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2 text-sm">
          <span className="font-semibold text-amber-900">Not marked paid.</span>
          <CardButton {...B}
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
          </CardButton>
          <CardButton {...B} onClick={complete}>Hand off anyway</CardButton>
          <button className="text-ink/60 underline" onClick={() => setConfirmPickup(false)}>
            Never mind
          </button>
        </div>
      )}
    </article>
  );
}

// Defined once, outside the card, so a redraw never swaps the button out from under a finger mid-tap.
function CardButton({
  children,
  onClick,
  primary,
  danger,
  busyKeys,
  arm,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  busyKeys: Set<string>;
  arm: (k: string) => void;
}) {
  const key = typeof children === "string" ? children : String(children);
  const mine = busyKeys.has(key);
  return (
    <button
      type="button"
      disabled={mine}
      aria-busy={mine}
      onClick={() => {
        arm(key);
        onClick();
      }}
      className={`busy-btn rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${
        primary ? "bg-ember text-white hover:bg-ember/90" : danger ? "text-red-700 hover:bg-red-50" : "bg-cream text-ink hover:bg-line"
      }`}
    >
      <span className="busy-label">{children}</span>
      {mine && <Spinner className="busy-spinner" />}
    </button>
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
