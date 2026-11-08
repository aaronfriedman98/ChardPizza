"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/format";
import { notifyOwnerNewOrder, sendOrderConfirmation } from "@/lib/email";
import { applyCardFee, createCheckoutForOrder, releaseExpiredCardHolds, stripeConfigured } from "@/lib/stripe";

const schema = z.object({
  service_id: z.string().uuid(),
  fulfillment: z.enum(["pickup", "delivery"]),
  time_slot_id: z.string().uuid("Pick a time."),
  items: z.array(z.object({ service_menu_item_id: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1, "Pick at least one item."),
  customer: z.object({
    name: z.string().trim().min(2, "Enter your name.").max(80),
    phone: z.string().trim().min(10, "Enter your phone number."),
    email: z.string().trim().email("That email doesn't look right.").max(120).or(z.literal("")),
  }),
  delivery: z
    .object({
      zone_id: z.string().uuid("Pick a delivery zone."),
      line1: z.string().trim().min(3, "Enter your street address.").max(120),
      line2: z.string().trim().max(60).optional().default(""),
      city: z.string().trim().max(60).optional().default(""),
      notes: z.string().trim().max(200).optional().default(""),
    })
    .nullable(),
  payment_method: z.enum(["cash", "zelle", "card"]),
  special_instructions: z.string().trim().max(300).optional().default(""),
  source: z.string().trim().max(40).optional().default("website"),
});

export type PlaceOrderInput = z.input<typeof schema>;
export type PlaceOrderResult = { error: string; code: string } | void;

const FRIENDLY: Record<string, string> = {
  ORDERING_CLOSED: "Ordering just closed. Sorry!",
  ORDERING_PAUSED: "Ordering is paused for a few minutes. Try again shortly.",
  ORDERING_NOT_OPEN: "Ordering has not opened yet.",
  SOLD_OUT: "We just sold out for this sale.",
  SLOT_FULL: "That time just filled up. Pick another one.",
  ITEM_SOLD_OUT: "One of your items just sold out.",
};

export async function placeOrder(raw: PlaceOrderInput): Promise<PlaceOrderResult> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form.", code: "INVALID" };
  const v = parsed.data;

  const phone = normalizePhone(v.customer.phone);
  if (!phone) return { error: "Enter a 10-digit US phone number.", code: "INVALID" };
  if (v.fulfillment === "delivery" && !v.delivery) return { error: "Enter your delivery address.", code: "INVALID" };
  if (v.payment_method === "card" && !stripeConfigured()) return { error: "Card payments aren't available right now. Choose cash or Zelle.", code: "INVALID" };

  // Abandoned card checkouts give their time slots back before we count what's left.
  await releaseExpiredCardHolds();
  const db = createAdminClient();
  const { data, error } = await db.rpc("place_order", {
    payload: {
      service_id: v.service_id,
      fulfillment: v.fulfillment,
      time_slot_id: v.time_slot_id,
      items: v.items,
      customer: { name: v.customer.name, phone, email: v.customer.email },
      delivery: v.fulfillment === "delivery" ? v.delivery : null,
      payment_method: v.payment_method,
      special_instructions: v.special_instructions,
      source: v.source || "website",
      referral: null,
      created_by_admin_id: null,
      capacity_override: false,
    },
  });

  if (error) {
    const m = /^([A-Z_]+): (.*)$/.exec(error.message);
    const code = m?.[1] ?? "ERROR";
    const detail = m?.[2] ?? "";
    // Keep the database's specific count ("Only 1 pizza spot left at that time.") when it has one.
    const message = detail && (code === "SLOT_FULL" || code === "SOLD_OUT" || code === "ITEM_SOLD_OUT") ? detail : (FRIENDLY[code] ?? (detail || "Something went wrong. Please try again."));
    console.error("place_order failed:", error.message);
    return { error: message, code };
  }

  const result = data as { id: string; order_number: string; token: string };

  if (v.payment_method === "card") {
    // Card: the order holds its slot as "awaiting payment"; the confirmation email goes out once Stripe says paid.
    let url: string;
    try {
      await applyCardFee(result.id);
      url = await createCheckoutForOrder(result.id, await siteOrigin());
    } catch (e) {
      console.error("stripe checkout failed:", e);
      await db.from("orders").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "Card checkout could not start" }).eq("id", result.id);
      return { error: "We couldn't open the card payment page. Try again, or choose cash or Zelle.", code: "CARD_ERROR" };
    }
    redirect(url);
  }

  await Promise.all([sendOrderConfirmation(result.id), notifyOwnerNewOrder(result.id)]);
  redirect(`/order/${result.order_number}?t=${result.token}`);
}

/** If this phone belongs to a customer with special pricing, return the per-pie price to show. */
export async function lookupPricing(rawPhone: string): Promise<{ tier: string; pie_price_cents: number; discount_cents: number | null } | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const db = createAdminClient();
  const { data } = await db.from("customers").select("price_tiers!default_price_tier_id(name, pie_price_cents, discount_cents, is_active)").eq("phone", phone).maybeSingle();
  const t = (data as unknown as { price_tiers: { name: string; pie_price_cents: number; discount_cents: number | null; is_active: boolean } | null } | null)?.price_tiers;
  if (!t || !t.is_active) return null;
  return { tier: t.name, pie_price_cents: t.pie_price_cents, discount_cents: t.discount_cents };
}

async function siteOrigin() {
  const h = await headers();
  return h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

/** "Pay now" on the order page, for a card order whose payment page was closed before paying. */
export async function resumeCardPayment(orderNumber: string, token: string): Promise<{ error: string } | void> {
  await releaseExpiredCardHolds();
  const db = createAdminClient();
  const { data } = await db.from("orders").select("id, status").eq("order_number", orderNumber).eq("confirmation_token", token).maybeSingle();
  if (!data) return { error: "We couldn't find that order." };
  if (data.status !== "pending_payment") return { error: "This order isn't waiting for a card payment anymore. Refresh the page." };
  let url: string;
  try {
    url = await createCheckoutForOrder(data.id, await siteOrigin());
  } catch (e) {
    console.error("stripe resume failed:", e);
    return { error: "We couldn't open the payment page. Try again in a moment." };
  }
  redirect(url);
}

/** Card won't go through? The customer can switch a waiting card order to Zelle or cash themselves. */
export async function switchToOfflinePayment(orderNumber: string, token: string, method: "zelle" | "cash"): Promise<{ error?: string }> {
  const db = createAdminClient();
  const { data: o } = await db
    .from("orders")
    .select("id, status, payment_status, total_cents, processing_fee_cents, services(cash_enabled, zelle_enabled)")
    .eq("order_number", orderNumber)
    .eq("confirmation_token", token)
    .maybeSingle();
  if (!o) return { error: "We couldn't find that order." };
  if (o.status !== "pending_payment" || o.payment_status === "paid") return { error: "This order isn't waiting for a card payment anymore. Refresh the page." };
  const svc = o.services as unknown as { cash_enabled: boolean; zelle_enabled: boolean } | null;
  if (method === "zelle" && !svc?.zelle_enabled) return { error: "Zelle isn't available for this sale." };
  if (method === "cash" && !svc?.cash_enabled) return { error: "Cash isn't available for this sale." };
  const { error } = await db
    .from("orders")
    .update({
      status: "confirmed",
      expires_at: null,
      payment_method: method,
      payment_status: method === "cash" ? "due_at_pickup" : "awaiting_payment",
      total_cents: o.total_cents - o.processing_fee_cents, // no card, no card fee
      processing_fee_cents: 0,
    })
    .eq("id", o.id)
    .eq("status", "pending_payment");
  if (error) return { error: "That didn't go through. Try again." };
  await db.from("audit_log").insert({ actor_id: null, action: "order.switched_to_" + method, entity_type: "order", entity_id: o.id, details: { order_number: orderNumber } });
  await Promise.all([sendOrderConfirmation(o.id), notifyOwnerNewOrder(o.id)]);
  return {};
}
