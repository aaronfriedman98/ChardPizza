"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { queueSort, type Order, type OrderStatus, type PaymentMethod, type PaymentStatus } from "@/lib/orders";

export type Result = { error?: string; ok?: string };

const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["making", "ready", "cancelled"],
  making: ["ready", "confirmed", "cancelled"],
  ready: ["completed", "out_for_delivery", "making", "confirmed", "cancelled"],
  out_for_delivery: ["completed", "ready"],
  completed: ["ready"],
  cancelled: ["confirmed"],
};

function touch() {
  for (const p of ["/admin", "/admin/service", "/admin/kitchen", "/admin/handoff", "/admin/delivery", "/admin/orders"]) revalidatePath(p);
}

async function getOrder(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], id: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, status, fulfillment, payment_status, payment_method, total_cents, production_priority, is_rush, is_on_hold, customer_arrived, service_id")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error("Order not found");
  return data;
}

export async function setOrderStatus(orderId: string, next: OrderStatus, note?: string): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const o = await getOrder(supabase, orderId);
  if (!ALLOWED[o.status as OrderStatus].includes(next)) return { error: `Cannot move from ${o.status} to ${next}.` };
  if (next === "out_for_delivery" && o.fulfillment !== "delivery") return { error: "Only delivery orders go out for delivery." };

  const patch: Record<string, unknown> = { status: next };
  if (next === "cancelled") patch.cancel_reason = note ?? null;
  // Un-completing clears the completion stamp so timers make sense again.
  if (o.status === "completed" && next === "ready") patch.completed_at = null;
  if (o.status === "ready" && (next === "making" || next === "confirmed")) patch.ready_at = null;

  const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, `order.${next}`, "order", orderId, { order_number: o.order_number, from: o.status, note: note ?? null });
  touch();
  return { ok: "" };
}

export async function markPaid(orderId: string, method?: PaymentMethod, note?: string): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const o = await getOrder(supabase, orderId);
  if (o.payment_status === "paid") return { ok: "" };

  const { data: prior } = await supabase.from("payments").select("kind, amount_cents, status").eq("order_id", orderId);
  const already = (prior ?? []).reduce(
    (a, p) => (p.status === "failed" ? a : a + (p.kind === "payment" ? p.amount_cents : -p.amount_cents)),
    0,
  );
  const due = Math.max(o.total_cents - already, 0);
  const m = method ?? (o.payment_method as PaymentMethod);

  if (due > 0) {
    const { error: pErr } = await supabase.from("payments").insert({
      order_id: orderId,
      kind: "payment",
      method: m,
      amount_cents: due,
      status: "recorded",
      provider: "manual",
      recorded_by: admin.id,
      note: note ?? null,
    });
    if (pErr) return { error: pErr.message };
  }
  const { error } = await supabase.from("orders").update({ payment_status: "paid", payment_method: m }).eq("id", orderId);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, "order.paid", "order", orderId, { order_number: o.order_number, method: m, amount_cents: due });
  touch();
  return { ok: "" };
}

/** Reverses a Mark Paid done by mistake. Writes a refund row so the ledger still adds up. */
export async function markUnpaid(orderId: string): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const o = await getOrder(supabase, orderId);
  if (o.payment_status !== "paid") return { ok: "" };
  const { data: prior } = await supabase.from("payments").select("kind, amount_cents, status").eq("order_id", orderId);
  const paid = (prior ?? []).reduce(
    (a, p) => (p.status === "failed" ? a : a + (p.kind === "payment" ? p.amount_cents : -p.amount_cents)),
    0,
  );
  if (paid > 0) {
    await supabase.from("payments").insert({
      order_id: orderId,
      kind: "refund",
      method: o.payment_method,
      amount_cents: paid,
      status: "recorded",
      provider: "manual",
      recorded_by: admin.id,
      note: "Marked paid by mistake",
    });
  }
  const back: PaymentStatus = o.payment_method === "cash" ? "due_at_pickup" : o.payment_method === "zelle" ? "awaiting_payment" : "unpaid";
  const { error } = await supabase.from("orders").update({ payment_status: back }).eq("id", orderId);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, "order.unpaid", "order", orderId, { order_number: o.order_number });
  touch();
  return { ok: "" };
}

export async function setFlag(orderId: string, flag: "is_rush" | "is_on_hold" | "customer_arrived", value: boolean): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const { error } = await supabase.from("orders").update({ [flag]: value }).eq("id", orderId);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, `order.${flag}.${value ? "on" : "off"}`, "order", orderId);
  touch();
  return { ok: "" };
}

/** Swaps production priority with the neighbour in the given direction within the same service queue. */
export async function movePriority(orderId: string, direction: "up" | "down"): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const o = await getOrder(supabase, orderId);
  const { data: rows } = await supabase
    .from("orders")
    .select("id, production_priority, is_rush, is_on_hold, customer_arrived, created_at")
    .eq("service_id", o.service_id)
    .in("status", ["confirmed", "making"])
    .eq("is_on_hold", false);
  const list = ((rows ?? []) as unknown as Order[]).sort(queueSort);
  const idx = list.findIndex((r) => r.id === orderId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return { ok: "" };
  const me = list[idx];
  const other = list[swapIdx];
  // Equal priorities would not reorder; nudge by one second.
  let mine = other.production_priority;
  let theirs = me.production_priority;
  if (mine === theirs) {
    if (direction === "up") mine -= 1;
    else theirs -= 1;
  }
  const r1 = await supabase.from("orders").update({ production_priority: mine }).eq("id", me.id);
  const r2 = await supabase.from("orders").update({ production_priority: theirs }).eq("id", other.id);
  if (r1.error || r2.error) return { error: (r1.error ?? r2.error)!.message };
  await audit(supabase, admin.id, `order.move_${direction}`, "order", orderId);
  touch();
  return { ok: "" };
}

const noteSchema = z.object({ body: z.string().trim().min(1).max(500), is_customer_facing: z.boolean().optional() });

export async function addNote(orderId: string, input: unknown): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { error: "Write a note first." };
  const { error } = await supabase.from("order_notes").insert({
    order_id: orderId,
    body: parsed.data.body,
    is_customer_facing: parsed.data.is_customer_facing ?? false,
    created_by: admin.id,
  });
  if (error) return { error: error.message };
  touch();
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: "Note added." };
}
