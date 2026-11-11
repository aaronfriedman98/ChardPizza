import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { pickOpsService } from "@/lib/ops";
import { loadServiceOrders } from "@/lib/orders";
import { OpsList } from "@/components/admin/ops-list";

export const metadata = { title: "Handoff | Char'd Pizza" };

export default async function HandoffPage({ searchParams }: PageProps<"/admin/handoff">) {
  const { service: sid } = await searchParams;
  const { supabase } = await requireAdmin();
  const { settings, service } = await pickOpsService(supabase, typeof sid === "string" ? sid : undefined);
  if (!service) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Handoff</h1>
        <div className="card text-ink/70">
          No published service. <Link href="/admin/services" className="text-ember hover:underline">Services</Link>
        </div>
      </div>
    );
  }
  const orders = await loadServiceOrders(supabase, service.id);
  return (
    <OpsList
      title="Handoff"
      service={service}
      settings={settings}
      orders={orders.filter((o) => o.fulfillment === "pickup")}
      allOrders={orders}
      mode="handoff"
      sections={[
        { key: "ready", label: "Ready to hand out", match: (o) => o.status === "ready" },
        { key: "soon", label: "Coming up", match: (o) => o.status === "making" || o.status === "confirmed" },
        { key: "done", label: "Picked up", match: (o) => o.status === "completed", collapsed: true },
      ]}
    />
  );
}
