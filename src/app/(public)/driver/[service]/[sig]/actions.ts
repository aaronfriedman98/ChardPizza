"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { driverOk, driverPath } from "@/lib/driver";

type Result = { error?: string };
type Step = "on_the_way" | "delivered" | "delivered_paid" | "undo";

function touch(serviceId: string) {
  for (const p of ["/admin", "/admin/service", "/admin/kitchen", "/admin/handoff", "/admin/delivery", "/admin/orders"]) revalidatePath(p);
  revalidatePath(driverPath(serviceId));
}

// Everything the driver can do from her link: head out, hand over (and collect), or undo a mistaken tap.
export async function driverStep(serviceId: string, sig: string, orderId: string, step: Step): Promise<Result> {
  if (!driverOk(serviceId, sig)) return { error: "This link is no longer valid." };
  const db = createAdminClient();
  const { data: o } = await db
    .from("orders")
    .select("id, order_number, status, fulfillment, payment_status, payment_method, total_cents, service_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!o || o.service_id !== serviceId || o.fulfillment !== "delivery") return { error: "Order not found." };
  if (o.status === "cancelled") return { error: "This order was cancelled." };

  if (step === "on_the_way") {
    if (o.status === "completed" || o.status === "out_for_delivery") return {};
    const { error } = await db.from("orders").update({ status: "out_for_delivery" }).eq("id", o.id);
    if (error) return { error: error.message };
  } else if (step === "delivered" || step === "delivered_paid") {
    if (step === "delivered_paid" && o.payment_status !== "paid") {
      const { data: prior } = await db.from("payments").select("kind, amount_cents, status").eq("order_id", o.id);
      const already = (prior ?? []).reduce((a, p) => (p.status === "failed" ? a : a + (p.kind === "payment" ? p.amount_cents : -p.amount_cents)), 0);
      const due = Math.max(o.total_cents - already, 0);
      if (due > 0) {
        const { error: pErr } = await db.from("payments").insert({
          order_id: o.id, kind: "payment", method: o.payment_method === "card" ? "cash" : o.payment_method,
          amount_cents: due, status: "recorded", provider: "manual", note: "Collected by driver",
        });
        if (pErr) return { error: pErr.message };
      }
      await db.from("orders").update({ payment_status: "paid" }).eq("id", o.id);
    }
    const { error } = await db.from("orders").update({ status: "completed" }).eq("id", o.id);
    if (error) return { error: error.message };
  } else if (step === "undo") {
    if (o.status !== "completed") return {};
    const { error } = await db.from("orders").update({ status: "out_for_delivery", completed_at: null }).eq("id", o.id);
    if (error) return { error: error.message };
    // If she marked it collected by mistake, reverse just that money.
    const { data: driverPays } = await db.from("payments").select("kind, amount_cents, method, note").eq("order_id", o.id).in("note", ["Collected by driver", "Driver undid collected"]);
    const taken = (driverPays ?? []).reduce((a, p) => a + (p.kind === "payment" ? p.amount_cents : -p.amount_cents), 0);
    if (taken > 0) {
      await db.from("payments").insert({
        order_id: o.id, kind: "refund", method: driverPays![0].method, amount_cents: taken,
        status: "recorded", provider: "manual", note: "Driver undid collected",
      });
      const back = o.payment_method === "cash" ? "due_at_pickup" : o.payment_method === "zelle" ? "awaiting_payment" : "unpaid";
      await db.from("orders").update({ payment_status: back }).eq("id", o.id);
    }
  }
  await audit(db, null, `order.driver_${step}`, "order", o.id, { order_number: o.order_number, from: o.status });
  touch(serviceId);
  return {};
}
