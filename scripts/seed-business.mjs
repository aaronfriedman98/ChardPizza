// One-time seed of real business data. Safe to re-run: updates settings, upserts menu items by name.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { error: sErr } = await supabase
  .from("settings")
  .update({
    business_name: "Char'd Pizza",
    business_phone: "+12483462347",
    show_phone_publicly: false,
    business_email: "chardpizza8@gmail.com",
    pickup_address: "17334 Shervilla Place, Southfield, MI",
    pickup_instructions: "We will text you when your order is coming out of the oven.",
    zelle_instructions: "Send your total by Zelle to 248-346-2347. Put your order number in the memo.",
    whatsapp_url: "https://chat.whatsapp.com/KYE6IwwUA2eHD4SCXBTQNN?mode=gi_t",
  })
  .eq("id", true);
if (sErr) throw sErr;

const items = [
  {
    name: "Char'd Pie",
    description:
      "Classic sauce + mozzarella, finished with basil, shaved parmesan, and garlic-infused avocado oil.",
    category: "Pizza",
    default_price_cents: 2200,
    capacity_units: 1,
    sku: "CHARD",
    sort_order: 10,
  },
  {
    name: "Pizza Bianca",
    description:
      "Mozzarella + creamy ricotta, finished with basil, shaved parmesan, and garlic-infused avocado oil.",
    category: "Pizza",
    default_price_cents: 2200,
    capacity_units: 1,
    sku: "BIANCA",
    sort_order: 20,
  },
];

for (const item of items) {
  const { data: existing } = await supabase.from("menu_items").select("id").eq("name", item.name).maybeSingle();
  const { error } = existing
    ? await supabase.from("menu_items").update(item).eq("id", existing.id)
    : await supabase.from("menu_items").insert(item);
  if (error) throw error;
  console.log(`${existing ? "updated" : "created"}: ${item.name}`);
}
console.log("settings updated");
