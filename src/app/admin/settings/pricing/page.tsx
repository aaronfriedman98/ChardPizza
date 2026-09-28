import { requireAdmin } from "@/lib/auth";
import type { PriceTier } from "@/lib/types";
import { PricingEditor } from "./pricing-editor";

export const metadata = { title: "Pricing | Char'd Pizza" };

export default async function PricingSettingsPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("price_tiers").select("*").order("sort_order");
  return <PricingEditor tiers={(data ?? []) as PriceTier[]} />;
}
