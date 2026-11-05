import "server-only";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOwnerNewOrder, sendOrderConfirmation } from "@/lib/email";
import { cardFeeCents } from "@/lib/fees";
import type { Settings } from "@/lib/types";

/** Stripe Checkout keeps a session open at least 30 minutes; the order's slot is held a little longer. */
const SESSION_MINUTES = 30;
const HOLD_MINUTES = SESSION_MINUTES + 2;

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key);
  return client;
}

export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;

type OrderForCheckout = {
  id: string;
  order_number: string;
  status: string;
  confirmation_token: string;
  customer_email: string | null;
  delivery_fee_cents: number;
  delivery_zone_name: string | null;
  processing_fee_cents: number;
  total_cents: number;
  services: { name: string; service_date: string };
  order_items: { item_name: string; quantity: number; unit_price_cents: number }[];
};

/** Opens a Stripe-hosted payment page for a card order that is still waiting for payment. Returns its URL. */
export async function createCheckoutForOrder(orderId: string, origin: string): Promise<string> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("orders")
    .select("id, order_number, status, confirmation_token, customer_email, delivery_fee_cents, delivery_zone_name, processing_fee_cents, total_cents, services(name, service_date), order_items(item_name, quantity, unit_price_cents)")
    .eq("id", orderId)
    .single();
  if (error || !data) throw new Error("Order not found");
  const o = data as unknown as OrderForCheckout;
  if (o.status !== "pending_payment") throw new Error("Order is not waiting for card payment");

  const back = `${origin}/order/${o.order_number}?t=${o.confirmation_token}`;
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = o.order_items.map((it) => ({
    quantity: it.quantity,
    price_data: { currency: "usd", unit_amount: it.unit_price_cents, product_data: { name: it.item_name } },
  }));
  if (o.delivery_fee_cents > 0) {
    line_items.push({
      quantity: 1,
      price_data: { currency: "usd", unit_amount: o.delivery_fee_cents, product_data: { name: `Delivery${o.delivery_zone_name ? ` · ${o.delivery_zone_name}` : ""}` } },
    });
  }

  if (o.processing_fee_cents > 0) {
    line_items.push({
      quantity: 1,
      price_data: { currency: "usd", unit_amount: o.processing_fee_cents, product_data: { name: "Card processing fee" } },
    });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60 + 30;
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items,
    client_reference_id: o.id,
    customer_email: o.customer_email ?? undefined,
    metadata: { order_id: o.id, order_number: o.order_number },
    payment_intent_data: {
      description: `${o.order_number} · ${o.services.name}`,
      metadata: { order_id: o.id, order_number: o.order_number },
    },
    expires_at: expiresAt,
    success_url: `${back}&paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${back}&canceled=1`,
  });

  // Hold the slot until just after Stripe gives up on this session.
  await db
    .from("orders")
    .update({ expires_at: new Date((expiresAt + (HOLD_MINUTES - SESSION_MINUTES) * 60) * 1000).toISOString() })
    .eq("id", o.id)
    .eq("status", "pending_payment");

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

/** Adds the customer-paid card fee (from Settings) to a freshly placed card order. place_order itself leaves it at 0. */
export async function applyCardFee(orderId: string): Promise<void> {
  const db = createAdminClient();
  const [{ data: settings }, { data: order }] = await Promise.all([
    db.from("settings").select("card_fee_mode, card_fee_percent, card_fee_flat_cents").eq("id", true).single(),
    db.from("orders").select("subtotal_cents, delivery_fee_cents, processing_fee_cents").eq("id", orderId).single(),
  ]);
  if (!settings || !order || order.processing_fee_cents > 0) return;
  const fee = cardFeeCents(order.subtotal_cents + order.delivery_fee_cents, settings as Settings);
  if (fee <= 0) return;
  await db
    .from("orders")
    .update({ processing_fee_cents: fee, total_cents: order.subtotal_cents + order.delivery_fee_cents + fee })
    .eq("id", orderId)
    .eq("status", "pending_payment");
}

/**
 * Records a finished Stripe payment against its order. Safe to call more than once
 * (the success page and the webhook both call it); only the first call writes.
 */
export async function settleCheckoutSession(sessionId: string): Promise<{ orderId: string; paid: boolean } | null> {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId) return null;
  if (session.payment_status !== "paid") return { orderId, paid: false };

  const db = createAdminClient();
  const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? session.id;

  const { data: existing } = await db.from("payments").select("id").eq("provider_reference", intentId).maybeSingle();
  if (existing) return { orderId, paid: true };

  const { error: payErr } = await db.from("payments").insert({
    order_id: orderId,
    kind: "payment",
    method: "card",
    amount_cents: session.amount_total ?? 0,
    status: "succeeded",
    provider: "stripe",
    provider_reference: intentId,
    note: "Stripe Checkout",
  });
  // A unique-violation here means a parallel call already recorded it.
  if (payErr && !/duplicate|unique/i.test(payErr.message)) throw new Error(payErr.message);
  if (payErr) return { orderId, paid: true };

  const { data: order } = await db.from("orders").select("status").eq("id", orderId).single();
  // Paid after the hold lapsed: bring the order back; the kitchen sees it like any other.
  const status = order?.status === "pending_payment" || order?.status === "cancelled" ? "confirmed" : order?.status;
  await db
    .from("orders")
    .update({ payment_status: "paid", status, expires_at: null, cancelled_at: null, cancel_reason: null })
    .eq("id", orderId);

  await Promise.all([sendOrderConfirmation(orderId), notifyOwnerNewOrder(orderId)]);
  return { orderId, paid: true };
}

/** Frees time slots held by card orders whose payment page was abandoned. */
export async function releaseExpiredCardHolds(): Promise<void> {
  const db = createAdminClient();
  await db
    .from("orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "Card payment not completed" })
    .eq("status", "pending_payment")
    .neq("payment_status", "paid")
    .lt("expires_at", new Date().toISOString());
}

/** Called when Stripe reports a session expired: cancel that order now instead of waiting for the sweep. */
export async function cancelExpiredSession(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId) return;
  const db = createAdminClient();
  await db
    .from("orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "Card payment not completed" })
    .eq("id", orderId)
    .eq("status", "pending_payment");
}
