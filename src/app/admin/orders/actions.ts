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
  revalidatePath("/admin", "layout");
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

/**
 * Oven taps. `step` is a pie name (one more of that pie went in), "all" (every pie is in),
 * or "clear" (undo). The first pie in moves the order to Making; clearing moves it back.
 */
export async function ovenStep(orderId: string, step: string): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const { data: o, error: readErr } = await supabase
    .from("orders")
    .select("id, order_number, status, oven, order_items(item_name, quantity, capacity_units_each)")
    .eq("id", orderId)
    .single();
  if (readErr || !o) return { error: readErr?.message.includes("oven") ? "The oven column isn't in the database yet. Run the SQL first." : "Order not found." };
  if (o.status !== "confirmed" && o.status !== "making") return { error: "This order is already past the oven." };

  const totals = new Map<string, number>();
  for (const it of o.order_items as { item_name: string; quantity: number; capacity_units_each: number }[])
    if (Number(it.capacity_units_each) > 0) totals.set(it.item_name, (totals.get(it.item_name) ?? 0) + it.quantity);

  const cur = (o.oven ?? {}) as Record<string, number>;
  let oven: Record<string, number>;
  if (step === "all") oven = Object.fromEntries(totals);
  else if (step === "clear") oven = {};
  else {
    const total = totals.get(step);
    if (!total) return { error: "That pie isn't on this order anymore." };
    oven = { ...cur, [step]: Math.min((cur[step] ?? 0) + 1, total) };
  }

  const anyIn = Object.values(oven).some((n) => n > 0);
  const patch: Record<string, unknown> = { oven };
  if (anyIn && o.status === "confirmed") patch.status = "making";
  if (!anyIn && o.status === "making") patch.status = "confirmed";

  const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, "order.oven", "order", orderId, { order_number: o.order_number, step, oven });
  touch();
  return { ok: "" };
}

/**
 * Someone came early: hand them pies that are in the oven for another order.
 * Moves as many matching pies as `toId` still needs; `fromId` gets them back on the oven list.
 */
export async function takeOvenPies(toId: string, fromId: string): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  if (toId === fromId) return { error: "Pick a different order." };
  const { data: rows, error: readErr } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, status, oven, order_items(item_name, quantity, capacity_units_each)")
    .in("id", [toId, fromId]);
  if (readErr) return { error: readErr.message };
  type Row = { id: string; order_number: string; customer_name: string; status: string; oven: Record<string, number> | null; order_items: { item_name: string; quantity: number; capacity_units_each: number }[] };
  const to = (rows as Row[] | null)?.find((r) => r.id === toId);
  const from = (rows as Row[] | null)?.find((r) => r.id === fromId);
  if (!to || !from) return { error: "Order not found." };
  const baking = (s: string) => s === "confirmed" || s === "making";
  if (!baking(to.status)) return { error: "This order is already past the oven." };
  if (!baking(from.status)) return { error: `${from.customer_name}'s order is already past the oven. Refresh and try again.` };

  // Pie totals and how many are really in, per pie name, for both orders.
  const toTotals = new Map<string, number>();
  for (const it of to.order_items) if (Number(it.capacity_units_each) > 0) toTotals.set(it.item_name, (toTotals.get(it.item_name) ?? 0) + it.quantity);
  const fromTotals = new Map<string, number>();
  for (const it of from.order_items) if (Number(it.capacity_units_each) > 0) fromTotals.set(it.item_name, (fromTotals.get(it.item_name) ?? 0) + it.quantity);
  const toOven = { ...(to.oven ?? {}) };
  const fromOven = { ...(from.oven ?? {}) };

  const moved: { name: string; qty: number }[] = [];
  for (const [name, total] of toTotals) {
    const need = total - Math.min(toOven[name] ?? 0, total);
    const have = Math.min(fromOven[name] ?? 0, fromTotals.get(name) ?? 0);
    const n = Math.min(need, have);
    if (n <= 0) continue;
    toOven[name] = (toOven[name] ?? 0) + n;
    fromOven[name] = have - n;
    if (fromOven[name] === 0) delete fromOven[name];
    moved.push({ name, qty: n });
  }
  if (!moved.length) return { error: "Those pies aren't in the oven anymore. Refresh and try again." };

  const fromStill = Object.values(fromOven).some((n) => n > 0);
  const { error: e1 } = await supabase
    .from("orders")
    .update({ oven: fromOven, ...(!fromStill && from.status === "making" ? { status: "confirmed" } : {}) })
    .eq("id", fromId);
  if (e1) return { error: e1.message };
  const { error: e2 } = await supabase
    .from("orders")
    .update({ oven: toOven, ...(to.status === "confirmed" ? { status: "making" } : {}) })
    .eq("id", toId);
  if (e2) return { error: e2.message };

  const detail = { moved, from: from.order_number, to: to.order_number };
  await audit(supabase, admin.id, "order.oven_taken", "order", toId, detail);
  await audit(supabase, admin.id, "order.oven_given", "order", fromId, detail);
  touch();
  const n = moved.reduce((a, m) => a + m.qty, 0);
  return { ok: `Moved ${n} ${n === 1 ? "pie" : "pies"}. ${from.customer_name.split(/\s+/)[0]}'s ${n === 1 ? "is" : "are"} back on the oven list.` };
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
  // A card order paid another way at the door is a real order now: let the kitchen see it and stop the hold sweep.
  const promote = o.status === "pending_payment" ? { status: "confirmed" as const, expires_at: null } : {};
  const { error } = await supabase.from("orders").update({ payment_status: "paid", payment_method: m, ...promote }).eq("id", orderId);
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
  const all = ((rows ?? []) as unknown as Order[]).sort(queueSort);
  const me = all.find((r) => r.id === orderId);
  if (!me) return { error: "Only orders waiting for the oven can be moved." };
  // Make now and Here orders sort ahead of everyone else, so only move among orders of the same kind.
  const list = all.filter((r) => r.is_rush === me.is_rush && r.customer_arrived === me.customer_arrived);
  const idx = list.findIndex((r) => r.id === orderId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { error: direction === "up" ? "Already first in line." : "Already last in line." };
  const reordered = [...list];
  [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
  // Renumber so every order sorts strictly after the one before it, staying as close to its own time as possible.
  // (Several orders at one time share a priority, so a plain swap would not move anything.)
  let prev = -Infinity;
  const changes: { id: string; p: number }[] = [];
  for (const r of reordered) {
    const p = Math.max(r.production_priority, prev + 1);
    if (p !== r.production_priority) changes.push({ id: r.id, p });
    prev = p;
  }
  // The swap itself must stick even when the numbers already looked ordered.
  if (!changes.length) return { ok: "" };
  for (const c of changes) {
    const { error } = await supabase.from("orders").update({ production_priority: c.p }).eq("id", c.id);
    if (error) return { error: error.message };
  }
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
