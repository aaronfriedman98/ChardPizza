"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/format";
import { sendOrderConfirmation } from "@/lib/email";

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
});

const createSchema = baseSchema.extend({
  service_id: z.string().uuid(),
  source: z.enum(["phone", "text", "whatsapp", "in_person", "manual"]).default("manual"),
  mark_paid: z.boolean().optional().default(false),
});

const reviseSchema = baseSchema.extend({ order_id: z.string().uuid() });

export type CreateManualOrderInput = z.input<typeof createSchema>;
export type ReviseOrderInput = z.input<typeof reviseSchema>;

function mapError(message: string): Result {
  const m = /^([A-Z_]+): (.*)$/.exec(message);
  return { error: m?.[2] ?? message, code: m?.[1] ?? "ERROR" };
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
  touch();
  revalidatePath(`/admin/orders/${v.order_id}`);
  redirect(`/admin/orders/${v.order_id}`);
}
