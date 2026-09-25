import { requireAdmin } from "@/lib/auth";
import type { DeliveryZone } from "@/lib/types";
import { ZonesEditor } from "./zones-editor";

export const metadata = { title: "Delivery Zones | Char'd Pizza" };

export default async function ZonesPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("delivery_zones").select("*").order("sort_order").order("name");
  return <ZonesEditor zones={(data ?? []) as DeliveryZone[]} />;
}
