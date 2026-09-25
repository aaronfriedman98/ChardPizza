import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { pickOpsService } from "@/lib/ops";
import { loadServiceOrders } from "@/lib/orders";
import { ServiceBoard } from "./board";

export const metadata = { title: "Service Board | Char'd Pizza" };

export default async function ServiceBoardPage({ searchParams }: PageProps<"/admin/service">) {
  const { service: sid } = await searchParams;
  const { supabase } = await requireAdmin();
  const { settings, service, availability, candidates } = await pickOpsService(supabase, typeof sid === "string" ? sid : undefined);

  if (!service || !availability) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Service Board</h1>
        <div className="card text-ink/70">
          No published service right now.{" "}
          <Link href="/admin/services" className="text-ember hover:underline">
            Publish one
          </Link>{" "}
          and it will show up here.
        </div>
      </div>
    );
  }

  const [orders, { data: smi }] = await Promise.all([
    loadServiceOrders(supabase, service.id),
    supabase.from("service_menu_items").select("menu_items(name, capacity_units)").eq("service_id", service.id).order("sort_order"),
  ]);
  const typeOrder = ((smi ?? []) as unknown as { menu_items: { name: string; capacity_units: number } }[]).filter((r) => Number(r.menu_items.capacity_units) > 0).map((r) => r.menu_items.name);
  return <ServiceBoard service={service} availability={availability} orders={orders} settings={settings} candidates={candidates} typeOrder={typeOrder} />;
}
