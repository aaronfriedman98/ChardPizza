import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { pickOpsService } from "@/lib/ops";
import { loadServiceOrders } from "@/lib/orders";
import { OpsList } from "@/components/admin/ops-list";
import { DriverLink } from "@/components/admin/driver-link";
import { driverWeeklyPath } from "@/lib/driver";

export const metadata = { title: "Delivery | Char'd Pizza" };

export default async function DeliveryPage({ searchParams }: PageProps<"/admin/delivery">) {
  const { service: sid } = await searchParams;
  const { supabase } = await requireAdmin();
  const { settings, service } = await pickOpsService(supabase, typeof sid === "string" ? sid : undefined);
  // One link for the driver that never changes; it always opens the current sale.
  const driverUrl = `${(settings.public_url || "https://chardpizza.netlify.app").replace(/\/$/, "")}${driverWeeklyPath()}`;
  if (!service) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Delivery</h1>
        <DriverLink url={driverUrl} />
        <div className="card text-ink/70">
          No published service. <Link href="/admin/services" className="text-ember hover:underline">Services</Link>
        </div>
      </div>
    );
  }
  const orders = await loadServiceOrders(supabase, service.id);
  return (
    <div className="space-y-4">
    <DriverLink url={driverUrl} />
    <OpsList
      title="Delivery"
      service={service}
      settings={settings}
      orders={orders.filter((o) => o.fulfillment === "delivery")}
      allOrders={orders}
      mode="delivery"
      sections={[
        { key: "out", label: "Out for delivery", match: (o) => o.status === "out_for_delivery" },
        { key: "ready", label: "Ready to go", match: (o) => o.status === "ready" },
        { key: "soon", label: "Coming up", match: (o) => o.status === "making" || o.status === "confirmed" },
        { key: "done", label: "Delivered", match: (o) => o.status === "completed", collapsed: true },
      ]}
    />
    </div>
  );
}
