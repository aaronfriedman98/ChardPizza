import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe, stripeConfigured } from "@/lib/stripe";

// Money customers paid that lands in Aaron's personal account: Zelle, cash, and card (Stripe pays out
// to the same account, minus its fee). One place so the Account page and the "I transferred" button agree.

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

export async function moneyBySale(supabase: SupabaseClient): Promise<Map<string, SaleMoney>> {
  const { data } = await supabase
    .from("payments")
    .select("kind, method, amount_cents, status, provider, provider_reference, orders!inner(service_id)")
    .in("method", ["zelle", "cash", "card"])
    .neq("status", "failed");
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
