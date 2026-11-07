"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/brand/logo";
import { formatCents } from "@/lib/format";
import { fmtTime } from "@/lib/time";
import { driverStep } from "./actions";

export type Stop = {
  id: string;
  order_number: string;
  scheduled_at: string;
  status: string;
  name: string;
  phone: string;
  zone: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  address_notes: string | null;
  special: string | null;
  items: { qty: number; name: string; pie: boolean }[];
  paid: boolean;
  method: string;
  total_cents: number;
};

// Where the map apps should go: street + city (zone name when no city was typed) + state. Apt stays out; it confuses the search.
function mapQuery(s: Stop) {
  return [s.line1, s.city || s.zone, "MI"].filter(Boolean).join(", ");
}
const waze = (s: Stop) => `https://waze.com/ul?q=${encodeURIComponent(mapQuery(s))}&navigate=yes`;
const gmaps = (s: Stop) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery(s))}&travelmode=driving`;
const pies = (s: Stop) => s.items.filter((i) => i.pie).reduce((a, i) => a + i.qty, 0);

const KITCHEN: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Cooking", cls: "bg-white/10 text-flour2" },
  making: { label: "In the oven", cls: "bg-ember/25 text-ember" },
  ready: { label: "Ready to grab", cls: "bg-green-500/20 text-green-300" },
  out_for_delivery: { label: "On the way", cls: "bg-sky-500/20 text-sky-300" },
  completed: { label: "Delivered", cls: "bg-white/10 text-flour2" },
};

export function DriverView({ stops, serviceId, sig, tz, business, title }: { stops: Stop[]; serviceId: string; sig: string; tz: string; business: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [, startTransition] = useTransition();

  const todo = stops.filter((s) => s.status !== "completed").sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const done = stops.filter((s) => s.status === "completed").sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const collect = todo.filter((s) => !s.paid).reduce((a, s) => a + s.total_cents, 0);
  const piesLeft = todo.reduce((a, s) => a + pies(s), 0);

  // Multi-stop route for whatever is left (Google Maps only; Waze does one stop at a time).
  const route =
    todo.length > 1
      ? `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(mapQuery(todo[todo.length - 1]))}&waypoints=${todo
          .slice(0, -1)
          .map((s) => encodeURIComponent(mapQuery(s)))
          .join("%7C")}`
      : null;

  function step(s: Stop, what: "on_the_way" | "delivered" | "delivered_paid" | "undo") {
    setError(null);
    setBusy(`${s.id}:${what}`);
    startTransition(async () => {
      try {
        const r = await driverStep(serviceId, sig, s.id, what);
        if (r.error) setError(r.error);
        router.refresh();
      } catch {
        setError("That didn't go through. Check your signal and tap again.");
      } finally {
        setBusy(null);
      }
    });
  }

  function onMyWay(s: Stop) {
    const first = s.name.trim().split(/\s+/)[0] ?? "";
    const text = `Hi ${first}! It's ${business}. I'm on my way with your pizza, see you in a few minutes!`;
    step(s, "on_the_way");
    // Open Messages in the same tap (iPhone blocks it after any waiting).
    window.location.assign(`sms:${s.phone}?&body=${encodeURIComponent(text)}`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header className="flex items-center gap-3">
        <LogoMark size={34} />
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.25em] text-flour2/70">Driver · {title}</div>
          <h1 className="font-display text-[30px] font-medium leading-none text-flour">Deliveries</h1>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Stops left" value={String(todo.length)} />
        <Stat label="Pies left" value={String(piesLeft)} />
        <Stat label="To collect" value={formatCents(collect)} tone={collect ? "amber" : undefined} />
      </div>

      {route && (
        <a href={route} target="_blank" rel="noreferrer" className="block rounded-xl border border-goldline bg-white/5 px-4 py-3 text-center font-semibold text-gold2">
          🗺️ Open all {todo.length} stops as one route (Google Maps)
        </a>
      )}

      {error && <div className="rounded-xl border border-red-400/50 bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</div>}

      {todo.length === 0 && <div className="rounded-2xl border border-goldline bg-white/5 p-6 text-center text-flour2">{stops.length ? "All delivered. Nice work! 🍕" : "No deliveries yet."}</div>}

      <ol className="space-y-3">
        {todo.map((s, i) => {
          const k = KITCHEN[s.status] ?? KITCHEN.confirmed;
          const isBusy = (w: string) => busy === `${s.id}:${w}`;
          return (
            <li key={s.id} className={`rounded-2xl border bg-[var(--wood2)] p-4 ${s.status === "out_for_delivery" ? "border-sky-400/60" : "border-goldline"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold2 font-bold text-black">{i + 1}</span>
                  <span className="font-display text-[22px] leading-none text-gold2 tabular-nums">{fmtTime(s.scheduled_at, tz)}</span>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {s.zone && <span className="rounded-full bg-gold2/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold2">{s.zone}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${k.cls}`}>{k.label}</span>
                </div>
              </div>

              <div className="mt-2 text-[20px] font-semibold text-flour">{s.name}</div>
              <div className="text-[15px] text-flour2">
                {s.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}
                <span className="text-flour2/60"> · {s.order_number}</span>
              </div>

              <div className="mt-3 rounded-xl bg-black/25 px-3 py-2.5">
                <div className="text-[17px] font-semibold leading-snug text-flour">{s.line1 ?? "No address"}</div>
                {s.line2 && <div className="text-[15px] font-semibold text-gold2">{s.line2}</div>}
                <div className="text-[14px] text-flour2">{[s.city, s.zone && s.city !== s.zone ? s.zone : null].filter(Boolean).join(" · ")}</div>
                {s.address_notes && <div className="mt-1.5 rounded-lg bg-amber-400/15 px-2 py-1 text-[14px] text-amber-200">📍 {s.address_notes}</div>}
                {s.special && <div className="mt-1.5 rounded-lg bg-amber-400/15 px-2 py-1 text-[14px] text-amber-200">“{s.special}”</div>}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <a href={waze(s)} target="_blank" rel="noreferrer" className="rounded-xl bg-[#33ccff] py-3 text-center font-bold text-black">
                  Waze
                </a>
                <a href={gmaps(s)} target="_blank" rel="noreferrer" className="rounded-xl bg-white py-3 text-center font-bold text-black">
                  Google Maps
                </a>
                <a href={`tel:${s.phone}`} className="rounded-xl border border-goldline py-3 text-center font-semibold text-flour">
                  📞 Call
                </a>
                <button type="button" onClick={() => onMyWay(s)} disabled={!!busy} className="rounded-xl border border-goldline py-3 font-semibold text-flour disabled:opacity-50">
                  {isBusy("on_the_way") ? "…" : "💬 On my way"}
                </button>
              </div>

              <div className={`mt-3 rounded-xl px-3 py-2 text-center text-[17px] font-bold ${s.paid ? "bg-green-500/15 text-green-300" : "bg-amber-400/20 text-amber-200"}`}>
                {s.paid ? "PAID · just hand it over" : `COLLECT ${formatCents(s.total_cents)} · ${s.method === "zelle" ? "Zelle" : s.method === "card" ? "card not paid yet, call us" : "cash"}`}
              </div>

              <div className="mt-2 grid gap-2">
                {s.paid ? (
                  <button type="button" onClick={() => step(s, "delivered")} disabled={!!busy} className="rounded-xl bg-green-600 py-3.5 text-[17px] font-bold text-white disabled:opacity-50">
                    {isBusy("delivered") ? "Saving…" : "✓ Delivered"}
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => step(s, "delivered_paid")} disabled={!!busy} className="rounded-xl bg-green-600 py-3.5 text-[17px] font-bold text-white disabled:opacity-50">
                      {isBusy("delivered_paid") ? "Saving…" : `✓ Delivered · got ${formatCents(s.total_cents)}`}
                    </button>
                    <button type="button" onClick={() => step(s, "delivered")} disabled={!!busy} className="rounded-xl border border-goldline py-2.5 font-semibold text-flour2 disabled:opacity-50">
                      {isBusy("delivered") ? "Saving…" : "Delivered, but they didn't pay me"}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {done.length > 0 && (
        <section>
          <button type="button" onClick={() => setShowDone((v) => !v)} className="w-full rounded-xl border border-goldline/60 px-4 py-2.5 text-left text-sm font-semibold text-flour2">
            {showDone ? "▾" : "▸"} Delivered ({done.length})
          </button>
          {showDone && (
            <ul className="mt-2 space-y-2">
              {done.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-goldline/40 px-3 py-2 opacity-70">
                  <div className="min-w-0">
                    <div className="truncate text-flour line-through decoration-flour2/50">
                      {fmtTime(s.scheduled_at, tz)} · {s.name}
                    </div>
                    <div className="truncate text-xs text-flour2">
                      {s.line1}
                      {s.zone ? ` · ${s.zone}` : ""} · {s.paid ? "paid" : "NOT paid"}
                    </div>
                  </div>
                  <button type="button" onClick={() => step(s, "undo")} disabled={!!busy} className="shrink-0 rounded-lg border border-goldline px-3 py-1.5 text-sm text-flour2 disabled:opacity-50">
                    {busy === `${s.id}:undo` ? "…" : "Undo"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="pb-6 text-center text-[11px] uppercase tracking-[0.2em] text-flour2/50">Updates on its own every 30 seconds</p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className="rounded-xl border border-goldline bg-white/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-flour2/70">{label}</div>
      <div className={`font-display text-[24px] leading-tight tabular-nums ${tone ? "text-amber-200" : "text-flour"}`}>{value}</div>
    </div>
  );
}
