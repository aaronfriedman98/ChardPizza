import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { pickOpsService } from "@/lib/ops";
import { loadServiceOrders } from "@/lib/orders";
import { KitchenView } from "./kitchen-view";

export const metadata = { title: "Kitchen | Char'd Pizza" };

export default async function KitchenPage({ searchParams }: PageProps<"/admin/kitchen">) {
  const { service: sid } = await searchParams;
  const { supabase } = await requireAdmin();
  const { settings, service } = await pickOpsService(supabase, typeof sid === "string" ? sid : undefined);
  if (!service) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Kitchen</h1>
        <div className="card text-ink/70">
          No published service. <Link href="/admin/services" className="text-ember hover:underline">Services</Link>
        </div>
      </div>
    );
  }
  const orders = await loadServiceOrders(supabase, service.id);
  return <KitchenView service={service} orders={orders} settings={settings} />;
}
