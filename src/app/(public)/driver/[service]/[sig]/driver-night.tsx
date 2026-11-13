import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadServiceOrders } from "@/lib/orders";
import { driverSig } from "@/lib/driver";
import { fmtDateOnly } from "@/lib/time";
import type { Settings } from "@/lib/types";
import { AutoRefresh } from "../../../partner/[token]/auto-refresh";
import { DriverView, type Stop } from "./driver-view";

// One sale night's deliveries. Used by the per-night link and the every-week link.
export async function DriverNight({ serviceId }: { serviceId: string }) {
  const db = createAdminClient();
  const [{ data: service }, { data: settingsRow }] = await Promise.all([
    db.from("services").select("id, name, service_date").eq("id", serviceId).maybeSingle(),
    db.from("settings").select("*").eq("id", true).single(),
  ]);
  if (!service) notFound();
  const settings = settingsRow as Settings;
  const orders = await loadServiceOrders(db, serviceId);

  const stops: Stop[] = orders
    .filter((o) => o.fulfillment === "delivery" && o.status !== "cancelled" && o.status !== "pending_payment")
    .map((o) => ({
      id: o.id,
      order_number: o.order_number,
      scheduled_at: o.scheduled_at,
      status: o.status,
      name: o.customer_name,
      phone: o.customer_phone,
      zone: o.delivery_zone_name,
      line1: o.address_line1,
      line2: o.address_line2,
      city: o.address_city,
      address_notes: o.address_notes,
      special: o.special_instructions,
      items: o.order_items.map((it) => ({ qty: it.quantity, name: it.item_name, pie: Number(it.capacity_units_each) > 0 })),
      paid: o.payment_status === "paid",
      method: o.payment_method,
      total_cents: o.total_cents,
    }));

  return (
    <main className="min-h-dvh px-4 py-5">
      <AutoRefresh />
      <DriverView
        stops={stops}
        serviceId={serviceId}
        sig={driverSig(serviceId)}
        tz={settings.time_zone}
        business={settings.business_name}
        title={`${service.name} · ${fmtDateOnly(service.service_date, "EEE MMM d")}`}
      />
    </main>
  );
}
