// Exercises place_order against the real database with a throwaway service.
// Runs the blueprint's edge cases: slot capacity, simultaneous last spot, dough total, cancellation.
// Everything it creates is deleted at the end. Usage: node scripts/test-capacity.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
}
const code = (err) => err?.message?.split(":")[0] ?? "";

// --- setup -----------------------------------------------------------------
const now = Date.now();
const startsAt = new Date(now + 60 * 60 * 1000);
const endsAt = new Date(now + 2 * 60 * 60 * 1000);

const { data: item } = await db
  .from("menu_items")
  .insert({ name: "TEST Pie", default_price_cents: 1000, capacity_units: 1, category: "Test" })
  .select("id")
  .single();

const { data: svc } = await db
  .from("services")
  .insert({
    name: "TEST service",
    service_date: startsAt.toISOString().slice(0, 10),
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: "scheduled",
    pizza_capacity_total: 6,
    slot_minutes: 15,
    default_slot_capacity: 5,
  })
  .select("id")
  .single();

const { data: smi } = await db
  .from("service_menu_items")
  .insert({ service_id: svc.id, menu_item_id: item.id, price_cents: 1000 })
  .select("id")
  .single();

const { data: slots } = await db
  .from("service_time_slots")
  .insert([
    { service_id: svc.id, slot_start: startsAt.toISOString(), slot_end: new Date(startsAt.getTime() + 15 * 60000).toISOString(), capacity_units: 5, sort_order: 0 },
    { service_id: svc.id, slot_start: new Date(startsAt.getTime() + 15 * 60000).toISOString(), slot_end: new Date(startsAt.getTime() + 30 * 60000).toISOString(), capacity_units: 5, sort_order: 1 },
  ])
  .select("id, sort_order")
  .order("sort_order");
const [slotA, slotB] = slots.map((s) => s.id);

let phoneSeq = 5550000;
const order = (qty, slot, extra = {}) =>
  db.rpc("place_order", {
    payload: {
      service_id: svc.id,
      fulfillment: "pickup",
      time_slot_id: slot,
      items: [{ service_menu_item_id: smi.id, quantity: qty }],
      customer: { name: "Test Person", phone: `+1248${++phoneSeq}`, email: "" },
      delivery: null,
      payment_method: "cash",
      special_instructions: "",
      source: "test",
      ...extra,
    },
  });

try {
  // Scenario 1: slot cap 5, 4 sold, order of 2 must fail; order of 1 must pass.
  const r1 = await order(4, slotA);
  check("4 pizzas into empty slot succeeds", !r1.error, r1.error?.message);
  const r2 = await order(2, slotA);
  check("2 more into slot with 1 left is refused", code(r2.error) === "SLOT_FULL", r2.error?.message);
  const r3 = await order(1, slotA);
  check("1 more into slot with 1 left succeeds", !r3.error, r3.error?.message);

  // Scenario 3: dough total 6, 5 sold, 2 pizzas in the other slot must fail, 1 must pass.
  const r4 = await order(2, slotB);
  check("dough total blocks 2 when only 1 unit is left overall", code(r4.error) === "SOLD_OUT", r4.error?.message);

  // Scenario 2: two customers race for the final unit; exactly one wins.
  const [ra, rb] = await Promise.all([order(1, slotB), order(1, slotB)]);
  const wins = [ra, rb].filter((r) => !r.error).length;
  check("simultaneous orders for the last unit: exactly one succeeds", wins === 1, `${wins} succeeded`);

  // Scenario 12: cancel one order, capacity returns.
  const { data: firstOrder } = await db.from("orders").select("id").eq("order_number", r1.data.order_number).single();
  await db.from("orders").update({ status: "cancelled", cancel_reason: "test" }).eq("id", firstOrder.id);
  const r5 = await order(3, slotA);
  check("after cancelling 4, a 3-pizza order fits again", !r5.error, r5.error?.message);

  // Scenario 5: paused service refuses new orders but keeps old ones.
  await db.from("services").update({ ordering_override: "paused" }).eq("id", svc.id);
  const r6 = await order(1, slotA);
  check("paused service refuses new orders", code(r6.error) === "ORDERING_PAUSED", r6.error?.message);
  const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("service_id", svc.id).neq("status", "cancelled");
  check("existing orders survive the pause", count === 3, `${count} live orders`);
  await db.from("services").update({ ordering_override: "auto" }).eq("id", svc.id);

  // Blocked slot.
  await db.from("service_time_slots").update({ is_blocked: true }).eq("id", slotB);
  const r7 = await order(1, slotB);
  check("blocked slot is refused", code(r7.error) === "SLOT_FULL", r7.error?.message);

  // Price is taken from the database, and totals are right.
  const { data: o5 } = await db.from("orders").select("subtotal_cents, total_cents, capacity_units").eq("order_number", r5.data.order_number).single();
  check("server-side pricing: 3 x $10 = $30", o5.subtotal_cents === 3000 && o5.total_cents === 3000 && Number(o5.capacity_units) === 3);

  // Order numbers look right.
  check("order number format CHAR-####", /^CHAR-\d{4,}$/.test(r1.data.order_number), r1.data.order_number);
} finally {
  // --- teardown ---------------------------------------------------------------
  const { data: orders } = await db.from("orders").select("id, customer_id").eq("service_id", svc.id);
  const ids = (orders ?? []).map((o) => o.id);
  if (ids.length) {
    await db.from("order_items").delete().in("order_id", ids);
    await db.from("order_status_history").delete().in("order_id", ids);
    await db.from("orders").delete().in("id", ids);
    await db.from("customers").delete().in("id", [...new Set((orders ?? []).map((o) => o.customer_id))]);
  }
  await db.from("services").delete().eq("id", svc.id); // cascades slots + service menu
  await db.from("menu_items").delete().eq("id", item.id);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
