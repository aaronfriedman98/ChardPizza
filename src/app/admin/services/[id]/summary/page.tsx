import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import type { Service, Settings } from "@/lib/types";
import { serviceReport } from "@/lib/reports";
import { moneyBySale, netIn } from "@/lib/transfer";
import { itemSummary } from "@/lib/orders";
import { formatCents } from "@/lib/format";
import { fmtDateOnly, fmtTime } from "@/lib/time";
import { STATUS_LABEL as SERVICE_STATUS } from "@/lib/service-state";
import { SummaryOrders, CompleteSaleButton, type SummaryOrder } from "./summary-client";

export const metadata = { title: "Sale summary | Char'd Pizza" };

const UNPAID = ["unpaid", "awaiting_payment", "due_at_pickup"];

export default async function SaleSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data: row } = await supabase.from("services").select("*").eq("id", id).maybeSingle();
  if (!row) notFound();
  const service = row as Service;

  const [{ data: settings }, r, money, { data: deposits }, { data: cats }, { data: admins }] = await Promise.all([
    supabase.from("settings").select("time_zone").eq("id", true).single(),
    serviceReport(supabase, service),
    moneyBySale(supabase, id),
    supabase.from("account_transactions").select("amount_cents").eq("kind", "deposit").eq("service_id", id),
    supabase.from("expense_categories").select("id, name"),
    supabase.from("admin_users").select("id, display_name"),
  ]);
  const tz = (settings as Pick<Settings, "time_zone">).time_zone;
  const catName = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]));
  const adminName = new Map((admins ?? []).map((a) => [a.id as string, a.display_name as string]));

  const live = r.liveOrders;
  const unpaid = live.filter((o) => UNPAID.includes(o.payment_status));
  const unpaidCents = unpaid.reduce((a, o) => a + o.total_cents, 0);
  const notHanded = live.filter((o) => o.status !== "completed");
  const m = money.get(id) ?? { zelle: 0, cash: 0, card: 0, stripeFee: 0, feeEstimated: false };
  const profit = r.netSales - r.expenseTotal - m.stripeFee;
  const moved = (deposits ?? []).reduce((a, d) => a + (d.amount_cents as number), 0);
  const held = netIn(m) - moved;
  const owedForSale = r.expenses.filter((e) => e.paid_by === "partner" && e.is_reimbursable && !e.reimbursed_at);
  const owedCents = owedForSale.reduce((a, e) => a + e.amount_cents, 0);
  const closed = service.status === "completed" || service.status === "archived";
  const ended = new Date(service.ends_at) < new Date();

  const orders: SummaryOrder[] = r.orders
    .filter((o) => o.status !== "pending_payment" || o.payment_status === "paid")
    .map((o) => ({
      id: o.id,
      order_number: o.order_number,
      customer_name: o.customer_name,
      fulfillment: o.fulfillment,
      status: o.status,
      payment_status: o.payment_status,
      payment_method: o.payment_method,
      total_cents: o.total_cents,
      time: fmtTime(o.scheduled_at, tz),
      items: itemSummary(o),
      cancel_reason: o.cancel_reason,
    }));

  const steps: { done: boolean; title: string; detail: ReactNode }[] = [
    {
      done: notHanded.length === 0,
      title: notHanded.length ? `${notHanded.length} ${notHanded.length === 1 ? "order isn't" : "orders aren't"} marked picked up or delivered` : "Every order handed off",
      detail: notHanded.length ? "Tap Picked up or Delivered below." : null,
    },
    {
      done: unpaid.length === 0,
      title: unpaid.length ? `${unpaid.length} ${unpaid.length === 1 ? "person hasn't" : "people haven't"} paid · ${formatCents(unpaidCents)}` : "Everyone paid",
      detail: unpaid.length ? unpaid.map((o) => o.customer_name).join(", ") : null,
    },
    {
      done: r.expenses.length > 0,
      title: r.expenses.length ? `${r.expenses.length} ${r.expenses.length === 1 ? "expense" : "expenses"} logged · ${formatCents(r.expenseTotal)}` : "No expenses logged yet",
      detail: (
        <>
          Forgot something? Chef, delivery, cleaning, supplies.{" "}
          <Link href={`/admin/expenses?service=${id}&add=1`} className="font-semibold text-ember hover:underline">
            + Add expense
          </Link>
        </>
      ),
    },
    {
      done: held === 0 && owedCents === 0,
      title:
        held === 0 && owedCents === 0
          ? "Money settled with the Char'd account"
          : [held !== 0 ? `${formatCents(held)} of this sale's money is still in your account` : null, owedCents ? `you're owed ${formatCents(owedCents)} for expenses` : null]
              .filter(Boolean)
              .join(" · "),
      detail:
        held === 0 && owedCents === 0 ? null : (
          <Link href="/admin/settle" className="font-semibold text-ember hover:underline">
            Settle up →
          </Link>
        ),
    },
    {
      done: closed,
      title: closed ? "Sale marked completed" : ended ? "Sale is over but not marked completed" : "Sale is still running",
      detail: closed ? null : <CompleteSaleButton serviceId={id} ended={ended} />,
    },
  ];
  const left = steps.filter((s) => !s.done).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/admin/services" className="text-sm text-ink/60 hover:text-ink">
        ← Services
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title truncate">{service.name}</h1>
            <span className="rounded-full bg-ink/10 px-2.5 py-1 text-xs font-semibold text-ink/70">{SERVICE_STATUS[service.status]}</span>
          </div>
          <div className="text-sm text-ink/60">
            {fmtDateOnly(service.service_date, "EEEE, MMM d, yyyy")} · {fmtTime(service.starts_at, tz)} to {fmtTime(service.ends_at, tz)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={`/admin/service?service=${id}`} className="btn-ghost border border-line">
            Board
          </Link>
          <Link href={`/admin/reports?tab=service&service=${id}`} className="btn-ghost border border-line">
            Full report
          </Link>
          <Link href={`/admin/services/${id}`} className="btn-ghost border border-line">
            Setup
          </Link>
        </div>
      </header>

      {/* Money */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Pies sold" value={String(r.unitsSold)} sub={`${live.length} orders`} />
        <Tile label="Sales" value={formatCents(r.netSales)} sub={`${r.pickupCount} pickup · ${r.deliveryCount} delivery`} />
        <Tile label="Collected" value={formatCents(r.collected)} sub={[m.zelle && `Zelle ${formatCents(m.zelle)}`, m.cash && `cash ${formatCents(m.cash)}`, m.card && `card ${formatCents(m.card)}`].filter(Boolean).join(" · ") || "nothing yet"} />
        <Tile label="Not paid yet" value={formatCents(unpaidCents)} sub={unpaid.length ? `${unpaid.length} ${unpaid.length === 1 ? "person" : "people"}` : "all paid"} tone={unpaidCents ? "amber" : "green"} />
        <Tile label="Expenses" value={formatCents(r.expenseTotal)} sub={`${r.expenses.length} logged`} />
        <Tile
          label="Profit"
          value={formatCents(profit)}
          sub={[m.stripeFee ? `after ${formatCents(m.stripeFee)} Stripe fees` : null, unpaidCents ? "if everyone pays" : null].filter(Boolean).join(", ") || "sales − expenses"}
          tone={profit >= 0 ? "green" : "red"}
        />
      </div>

      {/* To finish */}
      <section className={`card space-y-3 border-2 ${left ? "border-amber-300" : "border-green-300"}`}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">{left ? `To finish this sale · ${left} left` : "✓ This sale is all wrapped up"}</h2>
        </div>
        <ul className="space-y-2.5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.done ? "bg-green-600 text-white" : "border-2 border-amber-400 text-amber-700"}`}>
                {s.done ? "✓" : ""}
              </span>
              <div className="min-w-0">
                <div className={`font-semibold ${s.done ? "text-ink/60" : ""}`}>{s.title}</div>
                {s.detail && <div className="text-sm text-ink/70">{s.detail}</div>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Orders */}
        <section id="orders" className="min-w-0">
          <SummaryOrders orders={orders} />
        </section>

        <div className="space-y-5">
          {/* Where the money is */}
          <section className="card space-y-2 text-sm">
            <h2 className="font-semibold">Where the money is</h2>
            <Row label="Zelle" value={m.zelle} />
            <Row label="Cash" value={m.cash} />
            <Row label="Card" value={m.card} />
            {m.stripeFee > 0 && <Row label={`Stripe fee${m.feeEstimated ? " (est.)" : ""}`} value={-m.stripeFee} />}
            <div className="border-t border-line pt-2">
              <Row label="Reached your account" value={netIn(m)} strong />
              <Row label="Moved to Char'd" value={-moved} />
            </div>
            <div className="border-t border-line pt-2">
              <Row label="Still in your account" value={held} strong />
            </div>
            {(held !== 0 || owedCents > 0) && (
              <Link href="/admin/settle" className="block pt-1 font-semibold text-ember hover:underline">
                Settle up →
              </Link>
            )}
          </section>

          {/* Expenses */}
          <section className="card space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Expenses</h2>
              <Link href={`/admin/expenses?service=${id}&add=1`} className="text-sm font-semibold text-ember hover:underline">
                + Add
              </Link>
            </div>
            {r.expenses.length === 0 ? (
              <p className="text-sm text-ink/60">None yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {[...r.expenses]
                  .sort((a, b) => a.expense_date.localeCompare(b.expense_date))
                  .map((e) => (
                    <li key={e.id}>
                      <Link href={`/admin/expenses?service=${id}`} className="flex items-center gap-2 py-2 text-sm hover:bg-cream">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{[e.category_id ? catName.get(e.category_id) : null, e.vendor, e.description].filter(Boolean).join(" · ") || "Expense"}</div>
                          <div className="truncate text-xs text-ink/60">
                            {fmtDateOnly(e.expense_date, "MMM d")} · {e.paid_by === "business" ? "Char'd account" : (adminName.get(e.paid_by_admin_id ?? "") ?? "Partner")}
                            {e.paid_by === "partner" && e.is_reimbursable && (
                              <span className={e.reimbursed_at ? "text-green-700" : "font-semibold text-amber-700"}> · {e.reimbursed_at ? "paid back" : "owed"}</span>
                            )}
                          </div>
                        </div>
                        <div className="tabular-nums">{formatCents(e.amount_cents)}</div>
                      </Link>
                    </li>
                  ))}
                <li className="flex justify-between pt-2 text-sm font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCents(r.expenseTotal)}</span>
                </li>
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "amber" | "red" }) {
  const color = tone === "green" ? "text-green-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : "";
  return (
    <div className="card p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="truncate text-xs text-ink/60">{sub}</div>}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : "text-ink/70"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value < 0 ? `−${formatCents(-value)}` : formatCents(value)}</span>
    </div>
  );
}
