import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { pickOpsService } from "@/lib/ops";
import { loadServiceOrders } from "@/lib/orders";
import type { ServiceWaste } from "@/lib/types";
import { KitchenView } from "./kitchen-view";

export const metadata = { title: "Kitchen | Char'd Pizza" };

export default async function KitchenPage({ searchParams }: PageProps<"/admin/kitchen">) {
  const { service: sid } = await searchParams;
  const { supabase } = await requireAdmin();
  const { settings, service, availability } = await pickOpsService(supabase, typeof sid === "string" ? sid : undefined);
  if (!service || !availability) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Kitchen</h1>
        <div className="card text-ink/70">
          No published service. <Link href="/admin/services" className="text-ember hover:underline">Services</Link>
        </div>
      </div>
    );
  }
  const [orders, { data: waste }, { data: smi }] = await Promise.all([
    loadServiceOrders(supabase, service.id),
    supabase.from("service_waste").select("*").eq("service_id", service.id).order("created_at", { ascending: false }),
    supabase.from("service_menu_items").select("menu_item_id, menu_items(name, capacity_units)").eq("service_id", service.id).order("sort_order"),
  ]);
  const pieTypes = ((smi ?? []) as unknown as { menu_item_id: string; menu_items: { name: string; capacity_units: number } }[])
    .filter((r) => Number(r.menu_items.capacity_units) > 0)
    .map((r) => ({ menu_item_id: r.menu_item_id, name: r.menu_items.name }));
  return <KitchenView service={service} orders={orders} settings={settings} availability={availability} waste={(waste ?? []) as ServiceWaste[]} pieTypes={pieTypes} />;
}
