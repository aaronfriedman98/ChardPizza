"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/format";
import { sendOrderConfirmation } from "@/lib/email";
import { getOrderingData } from "@/lib/public";
import { fmtTime } from "@/lib/time";

export type Result = { error?: string; code?: string };

const itemsSchema = z.array(z.object({ service_menu_item_id: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1, "Add at least one item.");
const deliverySchema = z
  .object({
    zone_id: z.string().uuid("Pick a delivery zone."),
    line1: z.string().trim().min(3, "Enter the street address."),
    line2: z.string().trim().max(60).optional().default(""),
    city: z.string().trim().max(60).optional().default(""),
    notes: z.string().trim().max(200).optional().default(""),
  })
  .nullable();

const baseSchema = z.object({
  fulfillment: z.enum(["pickup", "delivery"]),
  time_slot_id: z.string().uuid("Pick a time."),
  items: itemsSchema,
  customer: z.object({
    name: z.string().trim().min(2, "Enter the customer's name.").max(80),
    phone: z.string().trim().min(10, "Enter a phone number."),
    email: z.string().trim().email("That email doesn't look right.").or(z.literal("")),
  }),
  delivery: deliverySchema,
  payment_method: z.enum(["cash", "zelle", "card"]),
  special_instructions: z.string().trim().max(300).optional().default(""),
  capacity_override: z.boolean().optional().default(false),
  waive_delivery_fee: z.boolean().optional().default(false),
});

const createSchema = baseSchema.extend({
  service_id: z.string().uuid(),
  source: z.enum(["phone", "text", "whatsapp", "in_person", "manual"]).default("manual"),
  mark_paid: z.boolean().optional().default(false),
  price_tier_id: z.string().uuid().nullable().optional(),
});

const reviseSchema = baseSchema.extend({ order_id: z.string().uuid() });

export type CreateManualOrderInput = z.input<typeof createSchema>;
export type ReviseOrderInput = z.input<typeof reviseSchema>;

function mapError(message: string): Result {
  const m = /^([A-Z_]+): (.*)$/.exec(message);
  return { error: m?.[2] ?? message, code: m?.[1] ?? "ERROR" };
}

// Takes the delivery fee off an order (and lets a now-covered balance count as paid).
async function waiveDeliveryFee(db: ReturnType<typeof createAdminClient>, orderId: string) {
  const { data: o } = await db.from("orders").select("delivery_fee_cents, total_cents, payment_status").eq("id", orderId).single();
  if (!o || !o.delivery_fee_cents) return;
  const total = o.total_cents - o.delivery_fee_cents;
  const { data: pays } = await db.from("payments").select("kind, amount_cents, status").eq("order_id", orderId);
  const paid = (pays ?? []).filter((p) => p.status !== "failed").reduce((a, p) => a + (p.kind === "payment" ? p.amount_cents : -p.amount_cents), 0);
  await db
    .from("orders")
    .update({ delivery_fee_cents: 0, total_cents: total, ...(paid > 0 && paid >= total ? { payment_status: "paid" } : {}) })
    .eq("id", orderId);
}

function touch() {
  for (const p of ["/admin", "/admin/service", "/admin/kitchen", "/admin/handoff", "/admin/delivery", "/admin/orders", "/admin/customers"]) revalidatePath(p);
}

export async function createManualOrder(raw: CreateManualOrderInput): Promise<Result | void> {
  const { supabase, admin } = await requireAdmin();
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form.", code: "INVALID" };
  const v = parsed.data;
  const phone = normalizePhone(v.customer.phone);
  if (!phone) return { error: "Phone should be a 10-digit US number.", code: "INVALID" };
  if (v.fulfillment === "delivery" && !v.delivery) return { error: "Enter the delivery address.", code: "INVALID" };

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
      source: v.source,
      referral: null,
      created_by_admin_id: admin.id,
      capacity_override: v.capacity_override,
    },
  });
  if (error) return mapError(error.message);
  const result = data as { id: string; order_number: string };

  if (v.price_tier_id) {
    const { error: pErr } = await db.rpc("apply_order_pricing", { payload: { order_id: result.id, admin_id: admin.id, tier_id: v.price_tier_id, override_cents: null, note: "" } });
    if (pErr) console.error("apply_order_pricing failed:", pErr.message);
  }

  if (v.fulfillment === "delivery" && v.waive_delivery_fee) await waiveDeliveryFee(db, result.id);

  if (v.mark_paid) {
    const { data: o } = await supabase.from("orders").select("total_cents").eq("id", result.id).single();
    if (o && o.total_cents > 0) {
      await supabase.from("payments").insert({
        order_id: result.id,
        kind: "payment",
        method: v.payment_method,
        amount_cents: o.total_cents,
        status: "recorded",
        provider: "manual",
        recorded_by: admin.id,
        note: "Paid at time of manual order",
      });
      await supabase.from("orders").update({ payment_status: "paid" }).eq("id", result.id);
    }
  }
  await audit(supabase, admin.id, "order.created_manually", "order", result.id, {
    order_number: result.order_number,
    source: v.source,
    override: v.capacity_override,
  });
  await sendOrderConfirmation(result.id);
  touch();
  redirect(`/admin/orders/${result.id}`);
}

export async function reviseOrder(raw: ReviseOrderInput): Promise<Result | void> {
  const { admin } = await requireAdmin();
  const parsed = reviseSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form.", code: "INVALID" };
  const v = parsed.data;
  const phone = normalizePhone(v.customer.phone);
  if (!phone) return { error: "Phone should be a 10-digit US number.", code: "INVALID" };
  if (v.fulfillment === "delivery" && !v.delivery) return { error: "Enter the delivery address.", code: "INVALID" };

  const db = createAdminClient();
  const { error } = await db.rpc("revise_order", {
    payload: {
      order_id: v.order_id,
      admin_id: admin.id,
      fulfillment: v.fulfillment,
      time_slot_id: v.time_slot_id,
      items: v.items,
      customer: { name: v.customer.name, phone, email: v.customer.email },
      delivery: v.fulfillment === "delivery" ? v.delivery : null,
      payment_method: v.payment_method,
      special_instructions: v.special_instructions,
      capacity_override: v.capacity_override,
    },
  });
  if (error) return mapError(error.message);
  // Keep any special pricing the order had.
  const { data: after } = await db.from("orders").select("price_tier_id, pie_price_override_cents, pricing_note").eq("id", v.order_id).single();
  if (after && (after.price_tier_id || after.pie_price_override_cents != null)) {
    await db.rpc("apply_order_pricing", { payload: { order_id: v.order_id, admin_id: admin.id, tier_id: after.price_tier_id, override_cents: after.pie_price_override_cents, note: after.pricing_note ?? "" } });
  }
  if (v.fulfillment === "delivery" && v.waive_delivery_fee) await waiveDeliveryFee(db, v.order_id);
  touch();
  revalidatePath(`/admin/orders/${v.order_id}`);
  redirect(`/admin/orders/${v.order_id}`);
}

// ---------- Quick "change pies" from the order card ----------

export type QuickEditData = {
  items: { smi_id: string; name: string; price_cents: number; capacity_units: number; qty: number }[];
  slot_label: string;
  /** Pizza spots at this order's time if the order were empty (its own pies count as free). */
  slot_room: number;
  own_units: number;
};

export async function getQuickEdit(orderId: string): Promise<QuickEditData | { error: string }> {
  await requireAdmin();
  const db = createAdminClient();
  const { data: o } = await db
    .from("orders")
    .select("id, service_id, time_slot_id, capacity_units, status, order_items(service_menu_item_id, item_name, quantity)")
    .eq("id", orderId)
    .maybeSingle();
  if (!o) return { error: "Order not found." };
  if (o.status === "completed" || o.status === "cancelled") return { error: `This order is ${o.status}.` };
  const ordering = await getOrderingData(o.service_id);
  if (!ordering) return { error: "Couldn't load tonight's menu." };
  const have = new Map<string, number>();
  for (const it of o.order_items as { service_menu_item_id: string | null; item_name: string; quantity: number }[]) {
    const id = it.service_menu_item_id ?? ordering.items.find((i) => i.name === it.item_name)?.smi_id;
    if (id) have.set(id, (have.get(id) ?? 0) + it.quantity);
  }
  const slot = ordering.slots.find((s) => s.id === o.time_slot_id);
  const own = Number(o.capacity_units);
  return {
    items: ordering.items.map((i) => ({ smi_id: i.smi_id, name: i.name, price_cents: i.price_cents, capacity_units: i.capacity_units, qty: have.get(i.smi_id) ?? 0 })),
    slot_label: slot ? fmtTime(slot.slot_start, ordering.settings.time_zone) : "this time",
    slot_room: Math.max((slot?.remaining ?? 0) + own, 0),
    own_units: own,
  };
}

const quickSchema = z.object({ order_id: z.string().uuid(), items: itemsSchema, capacity_override: z.boolean().default(false) });

export async function quickChangeItems(raw: z.input<typeof quickSchema>): Promise<Result & { total_cents?: number; owed_cents?: number; refund_cents?: number }> {
  const { admin } = await requireAdmin();
  const parsed = quickSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the pies.", code: "INVALID" };
  const v = parsed.data;
  const db = createAdminClient();
  const { data: before } = await db.from("orders").select("fulfillment, delivery_fee_cents").eq("id", v.order_id).single();
  const keepWaiver = before?.fulfillment === "delivery" && before.delivery_fee_cents === 0;
  // Only items change: revise_order keeps the time, contact, delivery and payment method as they are.
  const { error } = await db.rpc("revise_order", {
    payload: { order_id: v.order_id, admin_id: admin.id, items: v.items, capacity_override: v.capacity_override },
  });
  if (error) return mapError(error.message);
  const { data: after } = await db.from("orders").select("total_cents, price_tier_id, pie_price_override_cents, pricing_note").eq("id", v.order_id).single();
  let total = after?.total_cents ?? 0;
  if (after && (after.price_tier_id || after.pie_price_override_cents != null)) {
    await db.rpc("apply_order_pricing", { payload: { order_id: v.order_id, admin_id: admin.id, tier_id: after.price_tier_id, override_cents: after.pie_price_override_cents, note: after.pricing_note ?? "" } });
    const { data: re } = await db.from("orders").select("total_cents").eq("id", v.order_id).single();
    total = re?.total_cents ?? total;
  }
  if (keepWaiver) {
    await waiveDeliveryFee(db, v.order_id);
    const { data: re } = await db.from("orders").select("total_cents").eq("id", v.order_id).single();
    total = re?.total_cents ?? total;
  }
  const { data: pays } = await db.from("payments").select("kind, amount_cents, status").eq("order_id", v.order_id);
  const paid = (pays ?? []).filter((p) => p.status !== "failed").reduce((a, p) => a + (p.kind === "payment" ? p.amount_cents : -p.amount_cents), 0);
  touch();
  revalidatePath(`/admin/orders/${v.order_id}`);
  return { total_cents: total, owed_cents: paid > 0 ? Math.max(total - paid, 0) : undefined, refund_cents: paid > total ? paid - total : undefined };
}
