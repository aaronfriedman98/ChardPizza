"use client";

import Link from "next/link";
import { useState } from "react";
import { toast, useBusyTransition } from "@/components/admin/feedback";
import { formatCents } from "@/lib/format";
import { fmtDateOnly } from "@/lib/time";
import type { SettleState } from "@/lib/transfer";
import { settleUp } from "./actions";

export function SettleView({ state, svcName }: { state: SettleState; svcName: Record<string, string> }) {
  const { lines, owed, unpaid, held } = state;
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useBusyTransition();

  const keptList = owed.filter((e) => !skipped.has(e.id));
  const kept = keptList.reduce((a, e) => a + e.amount_cents, 0);
  const net = held - kept;
  const anything = lines.length > 0 || keptList.length > 0;

  function settle() {
    const what =
      net > 0
        ? `Did you move ${formatCents(net)} from your account into the Char'd account?`
        : net < 0
          ? `Did you move ${formatCents(-net)} from the Char'd account to yourself?`
          : "Square up? No money needs to move.";
    if (!confirm(`${what}\n\nThis records it so the Char'd balance matches the bank.`)) return;
    setError(null);
    startTransition(async () => {
      const r = await settleUp({ expense_ids: keptList.map((e) => e.id), expect_cents: net });
      if (r.error) setError(r.error);
      else {
        toast(r.ok ?? "Recorded.");
        setSkipped(new Set());
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="page-title">Settle up</h1>
        <p className="text-sm text-ink/60">
          All the sales money lands in your account, and you pay for things out of pocket. This works out who owes whom, so the Char&rsquo;d account ends up with
          exactly the profit.
        </p>
      </div>

      {/* The answer */}
      <div className={`card space-y-3 border-2 ${net > 0 ? "border-green-300" : net < 0 ? "border-amber-300" : "border-line"}`}>
        {!anything ? (
          <div>
            <div className="text-2xl font-bold text-green-700">✓ All settled</div>
            <p className="text-sm text-ink/60">Nothing between you and Char&rsquo;d right now.</p>
          </div>
        ) : (
          <>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">
                {net > 0 ? "You owe Char’d" : net < 0 ? "Char’d owes you" : "You’re even"}
              </div>
              <div className={`text-5xl font-black tabular-nums ${net > 0 ? "text-green-700" : net < 0 ? "text-amber-700" : ""}`}>{formatCents(Math.abs(net))}</div>
              <div className="mt-1 text-sm text-ink/70">
                {formatCents(held)} Char&rsquo;d money in your account − {formatCents(kept)} you paid for Char&rsquo;d
              </div>
            </div>
            <p className="text-sm">
              {net > 0 && (
                <>
                  Move <b>{formatCents(net)}</b> from your account into the Char&rsquo;d account, then tap the button.
                </>
              )}
              {net < 0 && (
                <>
                  Move <b>{formatCents(-net)}</b> from the Char&rsquo;d account to yourself, then tap the button. Or leave it: it comes out of the next sale&rsquo;s money on
                  its own.
                </>
              )}
              {net === 0 && "Nothing needs to move. Tap to mark it all squared up."}
            </p>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button
              disabled={pending}
              onClick={settle}
              className={`w-full rounded-xl px-4 py-3 text-base font-bold text-white disabled:opacity-60 sm:w-auto ${net < 0 ? "bg-amber-600 hover:bg-amber-700" : "bg-green-700 hover:bg-green-800"}`}
            >
              {pending ? "Recording…" : net > 0 ? `✓ I moved ${formatCents(net)} to Char’d` : net < 0 ? `✓ Char’d paid me ${formatCents(-net)}` : "✓ Square up"}
            </button>
          </>
        )}
      </div>

      {/* Money in */}
      <section className="card space-y-2">
        <h2 className="font-semibold">Char&rsquo;d money in your account</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-ink/60">None. Every paid order has already been moved over.</p>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map((l) => (
              <li key={l.service.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/services/${l.service.id}/summary`} className="font-semibold hover:underline">
                    {l.service.name} · {fmtDateOnly(l.service.service_date, "MMM d")}
                  </Link>
                  <div className="text-xs text-ink/60">
                    {[
                      l.zelle ? `${formatCents(l.zelle)} Zelle` : null,
                      l.cash ? `${formatCents(l.cash)} cash` : null,
                      l.card ? `${formatCents(l.card)} card − ${formatCents(l.stripeFee)} Stripe fee${l.feeEstimated ? " (est.)" : ""}` : null,
                    ]
                      .filter(Boolean)
                      .join(" + ")}
                    {l.moved ? ` − ${formatCents(l.moved)} already moved` : ""}
                  </div>
                </div>
                <div className={`font-bold tabular-nums ${l.held < 0 ? "text-amber-700" : ""}`}>{formatCents(l.held)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Money owed to you */}
      <section className="card space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">You paid for Char&rsquo;d</h2>
          <Link href="/admin/expenses" className="text-sm text-ember hover:underline">
            Expenses →
          </Link>
        </div>
        {owed.length === 0 ? (
          <p className="text-sm text-ink/60">Nothing. Every expense you paid has been paid back.</p>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {owed.map((e) => {
                const on = !skipped.has(e.id);
                return (
                  <li key={e.id} className={on ? "" : "opacity-50"}>
                    <label className="flex cursor-pointer items-center gap-3 py-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(ev) =>
                          setSkipped((s) => {
                            const n = new Set(s);
                            if (ev.target.checked) n.delete(e.id);
                            else n.add(e.id);
                            return n;
                          })
                        }
                        className="h-5 w-5 accent-green-700"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{[e.category, e.vendor, e.description].filter(Boolean).join(" · ") || "Expense"}</div>
                        <div className="truncate text-xs text-ink/60">
                          {fmtDateOnly(e.expense_date, "MMM d")}
                          {e.service_id ? ` · ${svcName[e.service_id] ?? "a sale"}` : " · not tied to a sale"}
                        </div>
                      </div>
                      <div className="tabular-nums">{formatCents(e.amount_cents)}</div>
                    </label>
                  </li>
                );
              })}
            </ul>
            {skipped.size > 0 && <p className="text-xs text-ink/60">Unchecked ones stay owed to you for next time.</p>}
          </>
        )}
      </section>

      {/* Not counted */}
      {unpaid.length > 0 && (
        <section className="card space-y-2 border-amber-200 bg-amber-50/40">
          <h2 className="font-semibold">Not paid yet (not counted)</h2>
          <p className="text-xs text-ink/60">Their money isn&rsquo;t in your account, so you don&rsquo;t owe it to Char&rsquo;d. Once you mark them paid, it shows up above.</p>
          <ul className="divide-y divide-amber-200/70">
            {unpaid.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2 text-sm">
                <Link href={`/admin/services/${u.service_id}/summary`} className="min-w-0 flex-1 truncate hover:underline">
                  <span className="font-semibold">{u.customer_name}</span>
                  <span className="text-ink/60">
                    {" "}
                    · {u.order_number} · {svcName[u.service_id] ?? "a sale"}
                  </span>
                </Link>
                <div className="tabular-nums">{formatCents(u.total_cents)}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
