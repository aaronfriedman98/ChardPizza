"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrderingData, PublicSlot } from "@/lib/public";
import type { Order } from "@/lib/orders";
import { formatCents, formatPhone } from "@/lib/format";
import { fmtTime } from "@/lib/time";
import { Switch } from "@/components/ui/switch";
import { createManualOrder, reviseOrder } from "./admin-order-actions";
import { lookupCustomers, type CustomerHit } from "../customers/actions";

/**
 * One editor for both "new manual order" and "edit existing order".
 * Same rules as the public flow, plus an explicit capacity override switch.
 */
export function OrderEditor({ data, order }: { data: OrderingData; order?: Order }) {
  const router = useRouter();
  const tz = data.settings.time_zone;
  const s = data.service;
  const editing = !!order;

  const [cart, setCart] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    if (order) {
      for (const it of order.order_items) {
        const match = data.items.find((i) => i.name === it.item_name);
        if (match) m[match.smi_id] = (m[match.smi_id] ?? 0) + it.quantity;
      }
    }
    return m;
  });
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">(order?.fulfillment ?? (s.pickup_enabled ? "pickup" : "delivery"));
  const [zoneId, setZoneId] = useState<string>(() => data.zones.find((z) => z.name === order?.delivery_zone_name)?.id ?? data.zones[0]?.id ?? "");
  const [address, setAddress] = useState({ line1: order?.address_line1 ?? "", line2: order?.address_line2 ?? "", city: order?.address_city ?? "", notes: order?.address_notes ?? "" });
  const [slotId, setSlotId] = useState<string>(order?.time_slot_id ?? "");
  const [contact, setContact] = useState({ name: order?.customer_name ?? "", phone: order ? formatPhone(order.customer_phone) : "", email: order?.customer_email ?? "" });
  const [special, setSpecial] = useState(order?.special_instructions ?? "");
  const [payment, setPayment] = useState<"cash" | "zelle" | "card">(order?.payment_method ?? (s.cash_enabled ? "cash" : "zelle"));
  const [source, setSource] = useState<"phone" | "text" | "whatsapp" | "in_person" | "manual">("in_person");
  const [markPaid, setMarkPaid] = useState(false);
  const [override, setOverride] = useState(false);
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = useMemo(() => new Map(data.items.map((i) => [i.smi_id, i])), [data.items]);
  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([id, q]) => ({ item: byId.get(id)!, qty: q })).filter((l) => l.item);
  const units = lines.reduce((a, l) => a + l.item.capacity_units * l.qty, 0);
  const subtotal = lines.reduce((a, l) => a + l.item.price_cents * l.qty, 0);
  const zone = data.zones.find((z) => z.id === zoneId) ?? null;
  const total = subtotal + (fulfillment === "delivery" && zone ? zone.fee_cents : 0);

  // When editing, the order's own units are not "sold" against it.
  const ownUnits = order ? Number(order.capacity_units) : 0;
  const ownSlot = order?.time_slot_id ?? null;
  const slotRemaining = (slot: PublicSlot) => slot.remaining + (slot.id === ownSlot ? ownUnits : 0);
  const slotOk = (slot: PublicSlot) => override || (!slot.is_blocked && (units === 0 || slotRemaining(slot) >= units));
  // Include past slots when editing so the current one stays visible.
  const slots = data.slots;

  // Customer lookup as they type a phone or name.
  useEffect(() => {
    if (editing) return;
    const needle = contact.phone.replace(/\D/g, "").length >= 4 ? contact.phone : contact.name.length >= 3 ? contact.name : "";
    if (!needle) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => setHits(await lookupCustomers(needle)), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.phone, contact.name]);

  function submit() {
    setError(null);
    const payload = {
      fulfillment,
      time_slot_id: slotId,
      items: lines.map((l) => ({ service_menu_item_id: l.item.smi_id, quantity: l.qty })),
      customer: contact,
      delivery: fulfillment === "delivery" ? { zone_id: zoneId, ...address } : null,
      payment_method: payment,
      special_instructions: special,
      capacity_override: override,
    };
    startTransition(async () => {
      const r = editing
        ? await reviseOrder({ ...payload, order_id: order!.id })
        : await createManualOrder({ ...payload, service_id: s.id, source, mark_paid: markPaid });
      if (r && "error" in r) {
        setError(r.error ?? "Something went wrong.");
        if (r.code === "SLOT_FULL" || r.code === "SOLD_OUT") router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr] max-w-5xl">
      <div className="space-y-5">
        <section className="card space-y-3">
          <h2 className="font-bold">Items</h2>
          <ul className="divide-y divide-line">
            {data.items.map((item) => {
              const qty = cart[item.smi_id] ?? 0;
              return (
                <li key={item.smi_id} className={`flex items-center justify-between gap-3 py-2.5 ${item.is_sold_out && !override ? "opacity-50" : ""}`}>
                  <div>
                    <div className="font-semibold">
                      {item.name} <span className="font-normal text-ink/60">{formatCents(item.price_cents)}</span>
                      {item.is_sold_out && <span className="ml-2 text-xs font-bold uppercase text-red-700">sold out</span>}
                    </div>
                  </div>
                  <div className="flex items-center rounded-lg border border-line">
                    <button onClick={() => setCart({ ...cart, [item.smi_id]: Math.max(0, qty - 1) })} className="h-10 w-10 text-lg" aria-label="Fewer">−</button>
                    <span className="w-8 text-center font-bold">{qty}</span>
                    <button
                      onClick={() => setCart({ ...cart, [item.smi_id]: qty + 1 })}
                      disabled={item.is_sold_out && !override}
                      className="h-10 w-10 text-lg disabled:opacity-30"
                      aria-label="More"
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card space-y-3">
          <h2 className="font-bold">When and where</h2>
          {s.pickup_enabled && s.delivery_enabled && (
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-cream p-1">
              {(["pickup", "delivery"] as const).map((f) => (
                <button key={f} onClick={() => setFulfillment(f)} className={`rounded-lg py-2 font-semibold capitalize ${fulfillment === f ? "bg-white shadow" : "text-ink/60"}`}>
                  {f}
                </button>
              ))}
            </div>
          )}
          {fulfillment === "delivery" && (
            <div className="space-y-2">
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="input">
                {data.zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} · {formatCents(z.fee_cents)}
                  </option>
                ))}
              </select>
              <input className="input" placeholder="Street address" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Apt / unit" value={address.line2} onChange={(e) => setAddress({ ...address, line2: e.target.value })} />
                <input className="input" placeholder="City" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
              </div>
              <input className="input" placeholder="Delivery notes" value={address.notes} onChange={(e) => setAddress({ ...address, notes: e.target.value })} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {slots.map((slot) => {
              const ok = slotOk(slot);
              const chosen = slotId === slot.id;
              return (
                <button
                  key={slot.id}
                  disabled={!ok}
                  onClick={() => setSlotId(slot.id)}
                  className={`rounded-lg border px-1 py-2 text-center text-sm ${chosen ? "border-ember bg-ember text-white" : ok ? "border-line hover:border-ember/60" : "border-line/50 text-ink/30 line-through"}`}
                >
                  <div className="font-semibold">{fmtTime(slot.slot_start, tz)}</div>
                  <div className="text-[10px] opacity-80 no-underline">{slot.is_blocked ? "blocked" : `${slotRemaining(slot)} left`}</div>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
            <div className="text-sm">
              <div className="font-semibold text-amber-900">Override capacity</div>
              <div className="text-xs text-amber-800">Place it even if the slot or dough total is full. Use on purpose.</div>
            </div>
            <Switch checked={override} onChange={setOverride} label="Override capacity" />
          </div>
        </section>
      </div>

      <div className="space-y-5">
        <section className="card space-y-3">
          <h2 className="font-bold">Customer</h2>
          <input className="input" placeholder="Phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} inputMode="tel" />
          <input className="input" placeholder="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
          <input className="input" placeholder="Email (optional)" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} inputMode="email" />
          {hits.length > 0 && (
            <ul className="rounded-xl border border-line divide-y divide-line text-sm">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-cream"
                    onClick={() => {
                      setContact({ name: h.full_name, phone: formatPhone(h.phone), email: h.email ?? "" });
                      setHits([]);
                    }}
                  >
                    <span>
                      <b>{h.full_name}</b> · {formatPhone(h.phone)}
                    </span>
                    <span className="text-ink/50">{h.order_count} orders</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {s.allow_special_instructions !== false && (
            <textarea className="input" rows={2} placeholder="Special instructions" value={special} onChange={(e) => setSpecial(e.target.value)} />
          )}
        </section>

        <section className="card space-y-3">
          <h2 className="font-bold">Payment</h2>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-cream p-1">
            {(["cash", "zelle", "card"] as const).map((m) => (
              <button key={m} onClick={() => setPayment(m)} className={`rounded-lg py-2 font-semibold capitalize ${payment === m ? "bg-white shadow" : "text-ink/60"}`}>
                {m}
              </button>
            ))}
          </div>
          {!editing && (
            <>
              <div className="flex items-center justify-between gap-3 py-1">
                <span className="text-sm font-medium">Already paid</span>
                <Switch checked={markPaid} onChange={setMarkPaid} label="Already paid" />
              </div>
              <label className="block">
                <span className="label">How did they order?</span>
                <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="input">
                  <option value="in_person">In person</option>
                  <option value="phone">Phone call</option>
                  <option value="text">Text message</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="manual">Other</option>
                </select>
              </label>
            </>
          )}
        </section>

        <section className="card space-y-2">
          <div className="flex justify-between text-sm text-ink/70">
            <span>{lines.reduce((a, l) => a + l.qty, 0)} items · {units} pizza units</span>
            <span>{formatCents(subtotal)}</span>
          </div>
          {fulfillment === "delivery" && zone && (
            <div className="flex justify-between text-sm text-ink/70">
              <span>Delivery · {zone.name}</span>
              <span>{formatCents(zone.fee_cents)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>{formatCents(total)}</span>
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button onClick={submit} disabled={pending || lines.length === 0 || !slotId} className="btn-primary w-full py-3 text-base">
            {pending ? "Saving..." : editing ? "Save changes" : "Place order"}
          </button>
          {editing && <p className="text-xs text-ink/50">Prices already on the order are kept. New items use tonight&rsquo;s price. Payment status follows what has been recorded.</p>}
        </section>
      </div>
    </div>
  );
}
