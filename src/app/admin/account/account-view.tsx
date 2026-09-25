"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { AccountTransaction, AdminUser, Service } from "@/lib/types";
import { formatCents } from "@/lib/format";
import { fmtDateOnly } from "@/lib/time";
import { Modal } from "@/components/ui/modal";
import { addTransaction, deleteTransaction, setBalance } from "./actions";

type Partner = Pick<AdminUser, "id" | "display_name" | "is_partner">;
type Svc = Pick<Service, "id" | "name" | "service_date" | "status">;

const KIND_LABEL: Record<AccountTransaction["kind"], string> = {
  opening_balance: "Opening balance",
  deposit: "Deposit",
  expense: "Expense",
  reimbursement: "Reimbursed partner",
  partner_draw: "Partner draw",
  adjustment: "Adjustment",
  other: "Other",
};

export function AccountView({ transactions, partners, services }: { transactions: AccountTransaction[]; partners: Partner[]; services: Svc[] }) {
  const [modal, setModal] = useState<"deposit" | "partner_draw" | "other" | "set" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const partnerName = useMemo(() => new Map(partners.map((p) => [p.id, p.display_name])), [partners]);
  const svcName = useMemo(() => new Map(services.map((s) => [s.id, s.name])), [services]);

  const balance = transactions.reduce((a, t) => a + t.amount_cents, 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthIn = transactions.filter((t) => t.txn_date.startsWith(thisMonth) && t.amount_cents > 0 && t.kind !== "opening_balance").reduce((a, t) => a + t.amount_cents, 0);
  const monthOut = transactions.filter((t) => t.txn_date.startsWith(thisMonth) && t.amount_cents < 0).reduce((a, t) => a - t.amount_cents, 0);
  const draws = partners.filter((p) => p.is_partner).map((p) => ({ p, total: transactions.filter((t) => t.kind === "partner_draw" && t.partner_id === p.id).reduce((a, t) => a - t.amount_cents, 0) }));

  // Running balance, oldest first, then shown newest first.
  const withRunning = useMemo(() => {
    const asc = [...transactions].sort((a, b) => a.txn_date.localeCompare(b.txn_date) || a.created_at.localeCompare(b.created_at));
    let run = 0;
    const m = new Map<string, number>();
    for (const t of asc) {
      run += t.amount_cents;
      m.set(t.id, run);
    }
    return m;
  }, [transactions]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Char&rsquo;d account</h1>
          <p className="text-sm text-ink/60">The business bank balance as the system knows it. Expenses and reimbursements flow in on their own; deposits and draws you add.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => setModal("deposit")}>+ Deposit</button>
          <button className="btn-ghost border border-line" onClick={() => setModal("partner_draw")}>Partner draw</button>
          <button className="btn-ghost border border-line" onClick={() => setModal("other")}>Other</button>
          <button className="btn-ghost border border-line" onClick={() => setModal("set")}>Set balance</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="card md:col-span-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">Balance</div>
          <div className={`text-4xl font-bold tabular-nums ${balance < 0 ? "text-red-700" : ""}`}>{formatCents(balance)}</div>
        </div>
        <Tile label="In this month" value={formatCents(monthIn)} tone="green" />
        <Tile label="Out this month" value={formatCents(monthOut)} tone="amber" />
      </div>

      {draws.some((d) => d.total > 0) && (
        <div className="card text-sm">
          <span className="font-semibold">Draws taken: </span>
          {draws.map((d) => `${d.p.display_name} ${formatCents(d.total)}`).join(" · ")}
          <Link href="/admin/reports?tab=partners" className="ml-2 text-ember hover:underline">partner ledger →</Link>
        </div>
      )}

      {message && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" onClick={() => setMessage(null)}>{message}</p>
      )}

      <div className="card divide-y divide-line p-0">
        {transactions.map((t) => (
          <div key={t.id} className="flex items-center gap-3 p-3.5">
            <div className="w-24 shrink-0 text-sm text-ink/60">{fmtDateOnly(t.txn_date, "MMM d, yyyy")}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">
                {KIND_LABEL[t.kind]}
                {t.partner_id && <span className="font-normal text-ink/60"> · {partnerName.get(t.partner_id) ?? "partner"}</span>}
                {t.service_id && <span className="font-normal text-ink/60"> · {svcName.get(t.service_id) ?? "sale"}</span>}
              </div>
              <div className="truncate text-sm text-ink/60">
                {t.description}
                {t.expense_id && (
                  <>
                    {" "}
                    <Link href="/admin/expenses" className="text-ember hover:underline">expense</Link>
                  </>
                )}
              </div>
            </div>
            <div className="hidden sm:block w-24 text-right text-xs text-ink/50 tabular-nums">{formatCents(withRunning.get(t.id) ?? 0)}</div>
            <div className={`w-24 shrink-0 text-right font-semibold tabular-nums ${t.amount_cents < 0 ? "text-red-700" : "text-green-700"}`}>
              {t.amount_cents < 0 ? "−" : "+"}{formatCents(Math.abs(t.amount_cents))}
            </div>
            {!t.expense_id && t.kind !== "opening_balance" && (
              <button
                disabled={pending}
                className="text-xs text-ink/40 hover:text-red-700"
                onClick={() => {
                  if (!confirm("Delete this entry?")) return;
                  startTransition(async () => {
                    const r = await deleteTransaction(t.id);
                    if (r.error) setMessage(r.error);
                  });
                }}
                aria-label="Delete"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === "deposit" ? "Record a deposit" : modal === "partner_draw" ? "Partner draw" : modal === "other" ? "Other entry" : "Set balance"}>
        {modal === "set" ? (
          <SetBalanceForm current={balance} onDone={() => setModal(null)} />
        ) : (
          modal && <EntryForm kind={modal} partners={partners.filter((p) => p.is_partner)} services={services} onDone={() => setModal(null)} />
        )}
      </Modal>
    </div>
  );
}

function EntryForm({ kind, partners, services, onDone }: { kind: "deposit" | "partner_draw" | "other"; partners: Partner[]; services: Svc[]; onDone: () => void }) {
  const [form, setForm] = useState({
    txn_date: new Date().toISOString().slice(0, 10),
    amount: "",
    direction: "out" as "in" | "out",
    description: "",
    partner_id: partners[0]?.id ?? "",
    service_id: "",
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await addTransaction({ kind, ...form });
          if (r.error) setError(r.error);
          else onDone();
        });
      }}
    >
      <p className="text-sm text-ink/60">
        {kind === "deposit" && "Money going into the account: Zelle, cash deposits, whatever lands there."}
        {kind === "partner_draw" && "One of you took money out of the account. Tracked per partner so the split stays fair."}
        {kind === "other" && "Anything else: bank fees, interest, a transfer. Pick in or out."}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Date</span>
          <input type="date" value={form.txn_date} onChange={(e) => set({ txn_date: e.target.value })} className="input" required />
        </label>
        <label className="block">
          <span className="label">Amount ($)</span>
          <input inputMode="decimal" value={form.amount} onChange={(e) => set({ amount: e.target.value })} className="input text-lg font-bold" placeholder="0.00" required autoFocus />
        </label>
      </div>
      {kind === "partner_draw" && (
        <label className="block">
          <span className="label">Who</span>
          <select value={form.partner_id} onChange={(e) => set({ partner_id: e.target.value })} className="input">
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
        </label>
      )}
      {kind === "other" && (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-cream p-1 text-sm">
          {(["in", "out"] as const).map((d) => (
            <button key={d} type="button" onClick={() => set({ direction: d })} className={`rounded-md py-1.5 font-semibold ${form.direction === d ? "bg-white shadow" : "text-ink/60"}`}>
              {d === "in" ? "Money in" : "Money out"}
            </button>
          ))}
        </div>
      )}
      {kind === "deposit" && (
        <label className="block">
          <span className="label">From a sale night (optional)</span>
          <select value={form.service_id} onChange={(e) => set({ service_id: e.target.value })} className="input">
            <option value="">Not tied to a sale</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · {s.service_date}</option>
            ))}
          </select>
        </label>
      )}
      <input value={form.description} onChange={(e) => set({ description: e.target.value })} className="input" placeholder="Note (optional)" />
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving..." : "Record"}</button>
    </form>
  );
}

function SetBalanceForm({ current, onDone }: { current: number; onDone: () => void }) {
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await setBalance(target, note);
          if (r.error) setError(r.error);
          else onDone();
        });
      }}
    >
      <p className="text-sm text-ink/60">
        Type what the bank actually says. The system records the difference as an adjustment, so history stays honest. Currently {formatCents(current)}.
      </p>
      <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className="input text-lg font-bold" placeholder="3549.48" required autoFocus />
      <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="Why (optional), e.g. interest, forgot a Zelle" />
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving..." : "Set balance"}</button>
    </form>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" }) {
  return (
    <div className="card">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${tone === "green" ? "text-green-700" : tone === "amber" ? "text-amber-700" : ""}`}>{value}</div>
    </div>
  );
}
