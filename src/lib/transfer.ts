import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe, stripeConfigured } from "@/lib/stripe";

// Money customers paid that lands in Aaron's personal account: Zelle, cash, and card (Stripe pays out
// to the same account, minus its fee). One place so every page and the Settle up button agree.

export type SaleMoney = { zelle: number; cash: number; card: number; stripeFee: number; feeEstimated: boolean };

/** Stripe's standard US card fee, used only if Stripe can't tell us the real one. */
const estimateFee = (cents: number) => Math.round(cents * 0.029) + 30;

async function stripeFee(intentId: string | null, amount: number): Promise<{ fee: number; estimated: boolean }> {
  if (!intentId || !stripeConfigured()) return { fee: estimateFee(amount), estimated: true };
  try {
    const pi = await stripe().paymentIntents.retrieve(intentId, { expand: ["latest_charge.balance_transaction"] });
    const bt = (pi.latest_charge as Stripe.Charge | null)?.balance_transaction as Stripe.BalanceTransaction | null;
    if (bt && typeof bt.fee === "number") return { fee: bt.fee, estimated: false };
  } catch (e) {
    console.error("stripe fee lookup failed:", intentId, e);
  }
  return { fee: estimateFee(amount), estimated: true };
}

export async function moneyBySale(supabase: SupabaseClient, serviceId?: string): Promise<Map<string, SaleMoney>> {
  let q = supabase
    .from("payments")
    .select("kind, method, amount_cents, status, provider, provider_reference, orders!inner(service_id)")
    .in("method", ["zelle", "cash", "card"])
    .neq("status", "failed");
  if (serviceId) q = q.eq("orders.service_id", serviceId);
  const { data } = await q;
  const rows = (data ?? []) as unknown as {
    kind: "payment" | "refund";
    method: "zelle" | "cash" | "card";
    amount_cents: number;
    provider: string;
    provider_reference: string | null;
    orders: { service_id: string };
  }[];

  // Card payments through Stripe: look up the real fee for each one (a handful per sale).
  const fees = await Promise.all(
    rows.map((p) => (p.method === "card" && p.kind === "payment" && p.provider === "stripe" ? stripeFee(p.provider_reference, p.amount_cents) : null)),
  );

  const out = new Map<string, SaleMoney>();
  rows.forEach((p, i) => {
    const cur = out.get(p.orders.service_id) ?? { zelle: 0, cash: 0, card: 0, stripeFee: 0, feeEstimated: false };
    cur[p.method] += p.kind === "payment" ? p.amount_cents : -p.amount_cents;
    const f = fees[i];
    if (f) {
      cur.stripeFee += f.fee;
      cur.feeEstimated ||= f.estimated;
    }
    out.set(p.orders.service_id, cur);
  });
  return out;
}

/** What actually reached your account for a sale. */
export const netIn = (m: SaleMoney) => m.zelle + m.cash + m.card - m.stripeFee;

// ---------------------------------------------------------------------------
// Settle up: you hold Char'd's sales money, Char'd owes you for what you paid.
// The difference is who pays whom.
// ---------------------------------------------------------------------------

export type HeldLine = SaleMoney & {
  service: { id: string; name: string; service_date: string };
  /** Already moved into the Char'd account for this sale. */
  moved: number;
  /** Still sitting in your account. Negative = you moved more than came in (a refund after a transfer). */
  held: number;
};
export type OwedExpense = {
  id: string;
  expense_date: string;
  vendor: string | null;
  description: string | null;
  amount_cents: number;
  service_id: string | null;
  category: string | null;
};
export type UnpaidOrder = { id: string; service_id: string; order_number: string; customer_name: string; total_cents: number };

export type SettleState = { lines: HeldLine[]; owed: OwedExpense[]; unpaid: UnpaidOrder[]; held: number; owedTotal: number };

export async function settleState(supabase: SupabaseClient, adminId: string): Promise<SettleState> {
  const [money, { data: deposits }, { data: services }, { data: owedRows }, { data: unpaidRows }] = await Promise.all([
    moneyBySale(supabase),
    supabase.from("account_transactions").select("service_id, amount_cents").eq("kind", "deposit").not("service_id", "is", null),
    supabase.from("services").select("id, name, service_date"),
    // What you paid out of pocket and nobody has paid you back for yet.
    supabase
      .from("expenses")
      .select("id, expense_date, vendor, description, amount_cents, service_id, expense_categories(name)")
      .eq("paid_by", "partner")
      .eq("paid_by_admin_id", adminId)
      .eq("is_reimbursable", true)
      .is("reimbursed_at", null)
      .is("deleted_at", null)
      .order("expense_date"),
    // Customers who haven't paid. Their money isn't with you, so it isn't counted.
    supabase
      .from("orders")
      .select("id, service_id, order_number, customer_name, total_cents")
      .in("payment_status", ["unpaid", "awaiting_payment", "due_at_pickup"])
      .not("status", "in", "(cancelled,pending_payment)")
      .order("order_number"),
  ]);

  const moved = new Map<string, number>();
  for (const d of deposits ?? []) moved.set(d.service_id as string, (moved.get(d.service_id as string) ?? 0) + (d.amount_cents as number));
  const byId = new Map((services ?? []).map((s) => [s.id as string, s as { id: string; name: string; service_date: string }]));
  const empty: SaleMoney = { zelle: 0, cash: 0, card: 0, stripeFee: 0, feeEstimated: false };

  const lines: HeldLine[] = [];
  for (const sid of new Set([...money.keys(), ...moved.keys()])) {
    const m = money.get(sid) ?? empty;
    const mv = moved.get(sid) ?? 0;
    const held = netIn(m) - mv;
    const service = byId.get(sid);
    if (held !== 0 && service) lines.push({ ...m, service, moved: mv, held });
  }
  lines.sort((a, b) => a.service.service_date.localeCompare(b.service.service_date));

  const owed = ((owedRows ?? []) as unknown as (Omit<OwedExpense, "category"> & { expense_categories: { name: string } | null })[]).map(
    ({ expense_categories, ...e }) => ({ ...e, category: expense_categories?.name ?? null }),
  );
  return {
    lines,
    owed,
    unpaid: (unpaidRows ?? []) as UnpaidOrder[],
    held: lines.reduce((a, l) => a + l.held, 0),
    owedTotal: owed.reduce((a, e) => a + e.amount_cents, 0),
  };
}
