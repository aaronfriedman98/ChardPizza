"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/format";

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
  SOLD_OUT: "We just sold out of pizza spots for tonight.",
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
  if (v.payment_method === "card") return { error: "Card payments are coming soon. Choose cash or Zelle.", code: "INVALID" };

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

  const result = data as { order_number: string; token: string };
  redirect(`/order/${result.order_number}?t=${result.token}`);
}
