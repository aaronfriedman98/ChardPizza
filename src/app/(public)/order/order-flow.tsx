"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { LogoMark, Wordmark } from "@/components/brand/logo";
import type { OrderingData, PublicSlot } from "@/lib/public";
import { formatCents } from "@/lib/format";
import { fmtDateOnly, fmtTime } from "@/lib/time";
import { placeOrder } from "./actions";

type Step = 1 | 2 | 3 | 4;
const STEP_TITLES: Record<Step, string> = { 1: "Menu", 2: "When & where", 3: "Your details", 4: "Review" };
const CONTACT_KEY = "chard.contact";

type Contact = { name: string; phone: string; email: string };
type Address = { line1: string; line2: string; city: string; notes: string };

export function OrderFlow({ data, source }: { data: OrderingData; source: string }) {
  const router = useRouter();
  const tz = data.settings.time_zone;
  const s = data.service;

  const [step, setStep] = useState<Step>(1);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">(s.pickup_enabled ? "pickup" : "delivery");
  const [zoneId, setZoneId] = useState<string>(data.zones[0]?.id ?? "");
  const [address, setAddress] = useState<Address>({ line1: "", line2: "", city: "", notes: "" });
  const [slotId, setSlotId] = useState<string>("");
  const [contact, setContact] = useState<Contact>({ name: "", phone: "", email: "" });
  const [special, setSpecial] = useState("");
  const [payment, setPayment] = useState<"cash" | "zelle" | "card">(s.zelle_enabled ? "zelle" : s.cash_enabled ? "cash" : "card");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Remember returning customers on this phone.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONTACT_KEY);
      if (saved) setContact(JSON.parse(saved));
    } catch {}
  }, []);

  const items = data.items;
  const byId = useMemo(() => new Map(items.map((i) => [i.smi_id, i])), [items]);
  const lines = useMemo(
    () => Object.entries(cart).filter(([, q]) => q > 0).map(([id, q]) => ({ item: byId.get(id)!, qty: q })).filter((l) => l.item),
    [cart, byId],
  );
  const units = lines.reduce((a, l) => a + l.item.capacity_units * l.qty, 0);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const subtotal = lines.reduce((a, l) => a + l.item.price_cents * l.qty, 0);
  const zone = data.zones.find((z) => z.id === zoneId) ?? null;
  const deliveryFee = fulfillment === "delivery" && zone ? zone.fee_cents : 0;
  const total = subtotal + deliveryFee;

  const slotOk = (slot: PublicSlot) => !slot.is_blocked && (units === 0 || slot.remaining >= units);
  const chosenSlot = data.slots.find((x) => x.id === slotId) ?? null;
  const firstOk = data.slots.find(slotOk) ?? null;

  useEffect(() => {
    // If the cart grew past the chosen slot, drop it so the user re-picks.
    if (chosenSlot && !slotOk(chosenSlot)) setSlotId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units]);

  function setQty(id: string, qty: number) {
    setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(20, qty)) }));
  }

  function canContinue(): string | null {
    if (step === 1) return count > 0 ? null : "Add something to your order.";
    if (step === 2) {
      if (fulfillment === "delivery" && (!zoneId || address.line1.trim().length < 3)) return "Enter your delivery address.";
      if (!slotId) return "Pick a time.";
      return null;
    }
    if (step === 3) {
      if (contact.name.trim().length < 2) return "Enter your name.";
      if (contact.phone.replace(/\D/g, "").length < 10) return "Enter your phone number.";
      if (contact.email && !/^\S+@\S+\.\S+$/.test(contact.email)) return "That email doesn't look right.";
      return null;
    }
    return null;
  }

  function next() {
    const why = canContinue();
    if (why) {
      setError(why);
      return;
    }
    setError(null);
    if (step === 3) {
      try {
        localStorage.setItem(CONTACT_KEY, JSON.stringify(contact));
      } catch {}
    }
    setStep((st) => (st < 4 ? ((st + 1) as Step) : st));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    setError(null);
    setStep((st) => (st > 1 ? ((st - 1) as Step) : st));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await placeOrder({
        service_id: s.id,
        fulfillment,
        time_slot_id: slotId,
        items: lines.map((l) => ({ service_menu_item_id: l.item.smi_id, quantity: l.qty })),
        customer: contact,
        delivery: fulfillment === "delivery" ? { zone_id: zoneId, ...address } : null,
        payment_method: payment,
        special_instructions: special,
        source,
      });
      if (r && "error" in r) {
        setError(r.error);
        if (r.code === "SLOT_FULL" || r.code === "SOLD_OUT") {
          setSlotId("");
          setStep(2);
        } else if (r.code === "ITEM_SOLD_OUT") {
          setStep(1);
        } else if (r.code.startsWith("ORDERING_")) {
          setStep(1);
        }
        router.refresh();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  const zelleText = data.settings.zelle_instructions;

  return (
    <div className="min-h-dvh pb-32">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-flour/10 bg-coal/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          {step > 1 ? (
            <button onClick={back} className="grid h-10 w-10 place-items-center rounded-full text-flour/80 hover:bg-white/10" aria-label="Back">
              ←
            </button>
          ) : (
            <Link href="/" className="grid h-10 w-10 place-items-center rounded-full text-flour/80 hover:bg-white/10" aria-label="Home">
              ←
            </Link>
          )}
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber">Step {step} of 4</div>
            <div className="font-display text-xl uppercase tracking-wide">{STEP_TITLES[step]}</div>
          </div>
          <div className="flex items-center gap-2">
            <LogoMark size={28} />
            <Wordmark className="hidden text-lg sm:inline" />
          </div>
        </div>
        <div className="h-1 bg-white/5">
          <div className="h-1 bg-amber transition-all duration-500" style={{ width: `${(step / 4) * 100}%` }} />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6">
        {error && (
          <div className="mb-5 rounded-xl border border-brick/50 bg-brick/15 px-4 py-3 text-sm font-medium text-flour" role="alert">
            {error}
          </div>
        )}

        {/* STEP 1: MENU */}
        {step === 1 && (
          <section key="s1" className="slide-in space-y-4">
            <div>
              <div className="text-sm text-flour/60">
                {fmtDateOnly(s.service_date, "EEEE, MMMM d")} · pickup {fmtTime(s.starts_at, tz)} to {fmtTime(s.ends_at, tz)}
              </div>
              <h1 className="font-display text-4xl uppercase leading-none text-flour">What are you having?</h1>
            </div>
            <ul className="space-y-3">
              {items.map((item) => {
                const qty = cart[item.smi_id] ?? 0;
                const maxed = item.quantity_remaining != null && qty >= item.quantity_remaining;
                return (
                  <li
                    key={item.smi_id}
                    className={`rounded-2xl border p-4 transition ${qty > 0 ? "border-amber/70 bg-amber/[0.06]" : "border-flour/10 bg-white/[0.03]"} ${item.is_sold_out ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-display text-2xl uppercase tracking-wide">{item.name}</div>
                        {item.description && <p className="mt-1 text-sm text-flour/65">{item.description}</p>}
                        <div className="mt-2 font-display text-xl text-amber">{formatCents(item.price_cents)}</div>
                      </div>
                      {item.is_sold_out ? (
                        <span className="brush shrink-0 text-xs font-bold uppercase tracking-widest">Sold out</span>
                      ) : qty === 0 ? (
                        <button onClick={() => setQty(item.smi_id, 1)} className="btn-amber shrink-0 px-5 py-2.5 text-sm">
                          Add
                        </button>
                      ) : (
                        <div className="flex shrink-0 items-center rounded-xl border border-amber/60">
                          <button onClick={() => setQty(item.smi_id, qty - 1)} className="h-11 w-11 text-xl text-amber" aria-label={`Fewer ${item.name}`}>
                            −
                          </button>
                          <span className="w-8 text-center font-display text-2xl">{qty}</span>
                          <button
                            onClick={() => setQty(item.smi_id, qty + 1)}
                            disabled={maxed}
                            className="h-11 w-11 text-xl text-amber disabled:opacity-30"
                            aria-label={`More ${item.name}`}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                    {item.quantity_remaining != null && item.quantity_remaining <= 5 && !item.is_sold_out && (
                      <div className="mt-2 text-xs text-amber">Only {item.quantity_remaining} left</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* STEP 2: WHEN & WHERE */}
        {step === 2 && (
          <section key="s2" className="slide-in space-y-6">
            {s.pickup_enabled && s.delivery_enabled && (
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.04] p-1.5">
                {(["pickup", "delivery"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFulfillment(f)}
                    className={`rounded-xl py-3 font-display text-lg uppercase tracking-wide transition ${fulfillment === f ? "bg-amber text-coal" : "text-flour/70"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}

            {fulfillment === "delivery" && (
              <div className="space-y-3">
                <h2 className="font-display text-3xl uppercase leading-none">Where to?</h2>
                <div className="grid grid-cols-2 gap-2">
                  {data.zones.map((z) => (
                    <button
                      key={z.id}
                      onClick={() => setZoneId(z.id)}
                      className={`rounded-xl border px-3 py-3 text-left transition ${zoneId === z.id ? "border-amber bg-amber/10" : "border-flour/15"}`}
                    >
                      <div className="font-semibold">{z.name}</div>
                      <div className="text-sm text-flour/60">+{formatCents(z.fee_cents)} delivery</div>
                    </button>
                  ))}
                </div>
                <input className="field" placeholder="Street address" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} autoComplete="street-address" />
                <div className="grid grid-cols-2 gap-2">
                  <input className="field" placeholder="Apt / unit (optional)" value={address.line2} onChange={(e) => setAddress({ ...address, line2: e.target.value })} />
                  <input className="field" placeholder="City" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} autoComplete="address-level2" />
                </div>
                <input className="field" placeholder="Delivery notes, e.g. side door (optional)" value={address.notes} onChange={(e) => setAddress({ ...address, notes: e.target.value })} />
              </div>
            )}

            <div className="space-y-3">
              <div>
                <h2 className="font-display text-3xl uppercase leading-none">{fulfillment === "delivery" ? "What time?" : "Pickup time"}</h2>
                <p className="mt-1 text-sm text-flour/60">
                  {units > 0 ? `Times that can fit ${units} ${units === 1 ? "pizza" : "pizzas"}.` : "Pick a window."}
                </p>
              </div>
              {data.slots.length === 0 && <p className="text-flour/70">No times left tonight.</p>}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {data.slots.map((slot) => {
                  const ok = slotOk(slot);
                  const chosen = slotId === slot.id;
                  const tight = ok && units > 0 && slot.remaining - units <= 1;
                  return (
                    <button
                      key={slot.id}
                      disabled={!ok}
                      onClick={() => setSlotId(slot.id)}
                      className={`rounded-xl border px-2 py-3 text-center transition ${
                        chosen ? "border-amber bg-amber text-coal" : ok ? "border-flour/15 hover:border-amber/60" : "border-flour/5 text-flour/25 line-through"
                      }`}
                    >
                      <div className="font-display text-lg leading-none">{fmtTime(slot.slot_start, tz)}</div>
                      {!ok && !slot.is_blocked && slot.remaining > 0 && <div className="mt-1 text-[10px] no-underline">only {slot.remaining} left</div>}
                      {tight && !chosen && <div className="mt-1 text-[10px] text-amber">{slot.remaining} left</div>}
                    </button>
                  );
                })}
              </div>
              {!slotId && firstOk && units > 0 && data.slots.some((x) => !slotOk(x)) && (
                <button onClick={() => setSlotId(firstOk.id)} className="text-sm text-amber underline-offset-4 hover:underline">
                  Earliest that fits your order: {fmtTime(firstOk.slot_start, tz)}
                </button>
              )}
            </div>
          </section>
        )}

        {/* STEP 3: DETAILS + PAYMENT */}
        {step === 3 && (
          <section key="s3" className="slide-in space-y-6">
            <div className="space-y-3">
              <h2 className="font-display text-3xl uppercase leading-none">Who&rsquo;s picking up?</h2>
              <input className="field" placeholder="Your name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} autoComplete="name" />
              <input className="field" type="tel" placeholder="Phone number" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} autoComplete="tel" inputMode="tel" />
              <input className="field" type="email" placeholder="Email (for your confirmation)" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} autoComplete="email" inputMode="email" />
            </div>

            <div className="space-y-3">
              <h2 className="font-display text-3xl uppercase leading-none">How will you pay?</h2>
              <div className="space-y-2">
                {s.zelle_enabled && (
                  <PayOption on={payment === "zelle"} onClick={() => setPayment("zelle")} title="Zelle" sub={zelleText ?? "We'll send instructions."} />
                )}
                {s.cash_enabled && <PayOption on={payment === "cash"} onClick={() => setPayment("cash")} title="Cash" sub="Pay when you pick up." />}
                {s.card_enabled && <PayOption on={payment === "card"} onClick={() => setPayment("card")} title="Card" sub="Pay now, securely." />}
              </div>
            </div>

            {s.allow_special_instructions && (
              <div className="space-y-2">
                <h2 className="font-display text-2xl uppercase leading-none text-flour/80">Anything we should know?</h2>
                <textarea className="field" rows={2} placeholder="Optional. Allergies, well done, etc." value={special} onChange={(e) => setSpecial(e.target.value)} maxLength={300} />
              </div>
            )}
          </section>
        )}

        {/* STEP 4: REVIEW */}
        {step === 4 && (
          <section key="s4" className="slide-in space-y-5">
            <h2 className="font-display text-4xl uppercase leading-none">Look good?</h2>
            <div className="rounded-2xl border border-flour/10 bg-white/[0.03] p-4">
              <ul className="divide-y divide-flour/10">
                {lines.map((l) => (
                  <li key={l.item.smi_id} className="flex justify-between py-2">
                    <span>
                      <span className="font-display text-lg text-amber">{l.qty}×</span> {l.item.name}
                    </span>
                    <span>{formatCents(l.item.price_cents * l.qty)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-1 border-t border-flour/10 pt-3 text-sm text-flour/70">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCents(subtotal)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span>Delivery · {zone?.name}</span>
                    <span>{formatCents(deliveryFee)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 text-lg font-bold text-flour">
                  <span>Total</span>
                  <span>{formatCents(total)}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Summary title={fulfillment === "delivery" ? "Delivery" : "Pickup"} onEdit={() => setStep(2)}>
                <div className="font-semibold">
                  {fmtDateOnly(s.service_date, "EEE, MMM d")} · {chosenSlot ? fmtTime(chosenSlot.slot_start, tz) : ""}
                </div>
                {fulfillment === "delivery" ? (
                  <div className="text-flour/70">
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ""}
                    {address.city ? `, ${address.city}` : ""} · {zone?.name}
                  </div>
                ) : (
                  <div className="text-flour/70">{data.settings.pickup_address}</div>
                )}
              </Summary>
              <Summary title="You" onEdit={() => setStep(3)}>
                <div className="font-semibold">{contact.name}</div>
                <div className="text-flour/70">{contact.phone}</div>
                {contact.email && <div className="text-flour/70">{contact.email}</div>}
                <div className="mt-1 text-flour/70">Paying by {payment}</div>
              </Summary>
            </div>
            {special && <div className="text-sm text-flour/60">Note: {special}</div>}
            <p className="text-xs text-flour/50">
              By placing this order you&rsquo;re reserving pizza for a specific time. If plans change, message us as early as you can.
            </p>
          </section>
        )}
      </main>

      {/* Sticky bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-flour/10 bg-coal/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-3">
          <div className="flex-1 leading-tight">
            <div className="text-xs uppercase tracking-widest text-flour/50">{count === 0 ? "Your order" : `${count} item${count === 1 ? "" : "s"}`}</div>
            <div className="font-display text-2xl">{formatCents(total)}</div>
          </div>
          {step < 4 ? (
            <button onClick={next} disabled={step === 1 && count === 0} className="btn-amber px-7">
              Continue
            </button>
          ) : (
            <button onClick={submit} disabled={pending} className="btn-amber px-7">
              {pending ? "Placing..." : "Place order"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PayOption({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button onClick={onClick} className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${on ? "border-amber bg-amber/10" : "border-flour/15 hover:border-flour/30"}`}>
      <span className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${on ? "border-amber bg-amber" : "border-flour/40"}`}>
        {on && <span className="h-2 w-2 rounded-full bg-coal" />}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-flour/60">{sub}</span>
      </span>
    </button>
  );
}

function Summary({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-flour/10 bg-white/[0.03] p-4 text-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-amber">{title}</span>
        <button onClick={onEdit} className="text-xs text-flour/60 underline-offset-2 hover:underline">
          Edit
        </button>
      </div>
      {children}
    </div>
  );
}
