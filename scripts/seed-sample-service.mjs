// Creates a published sample service for the next Saturday, 7-10 PM Detroit time, ordering open now.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { TZDate } from "@date-fns/tz";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const tz = "America/Detroit";

const today = new TZDate(new Date(), tz);
const daysToSat = (6 - today.getDay() + 7) % 7 || 7;
const sat = new TZDate(today.getFullYear(), today.getMonth(), today.getDate() + daysToSat, 0, 0, 0, tz);
const at = (h, m = 0) => new TZDate(sat.getFullYear(), sat.getMonth(), sat.getDate(), h, m, 0, tz).toISOString();
const dateStr = `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, "0")}-${String(sat.getDate()).padStart(2, "0")}`;

const { data: svc, error } = await db.from("services").insert({
  name: "Saturday Night Pizza",
  service_date: dateStr,
  starts_at: at(19), ends_at: at(22),
  ordering_opens_at: new Date().toISOString(), ordering_closes_at: at(21, 30),
  status: "scheduled", pizza_capacity_total: 65, slot_minutes: 15, default_slot_capacity: 5,
  pickup_enabled: true, delivery_enabled: true, cash_enabled: true, zelle_enabled: true,
  customer_instructions: "Park on the street and come to the side door.",
}).select("id").single();
if (error) throw error;

const { data: items } = await db.from("menu_items").select("id, default_price_cents, sort_order").eq("is_active", true).order("sort_order");
await db.from("service_menu_items").insert(items.map((i) => ({ service_id: svc.id, menu_item_id: i.id, price_cents: i.default_price_cents, sort_order: i.sort_order })));

const slots = [];
for (let t = new Date(at(19)); t < new Date(at(22)); t = new Date(t.getTime() + 15 * 60000)) {
  slots.push({ service_id: svc.id, slot_start: t.toISOString(), slot_end: new Date(t.getTime() + 15 * 60000).toISOString(), capacity_units: 5, sort_order: slots.length });
}
await db.from("service_time_slots").insert(slots);

const { data: zones } = await db.from("delivery_zones").select("id").eq("is_active", true);
await db.from("service_delivery_zones").insert(zones.map((z) => ({ service_id: svc.id, delivery_zone_id: z.id })));
console.log(`created ${dateStr} service ${svc.id} with ${items.length} items, ${slots.length} slots, ${zones.length} zones`);
