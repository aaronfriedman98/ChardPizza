import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import type {
  DeliveryZone,
  MenuItem,
  Service,
  ServiceAvailability,
  ServiceDeliveryZone,
  ServiceMenuItem,
  Settings,
  SlotAvailability,
} from "@/lib/types";
import { BasicsForm } from "../basics-form";
import { ServiceHeader } from "./service-header";
import { Stepper, type Step } from "./stepper";
import { MenuStep } from "./menu-step";
import { CapacityStep } from "./capacity-step";
import { FulfillmentStep } from "./fulfillment-step";
import { PaymentStep } from "./payment-step";
import { ReviewStep } from "./review-step";

export const metadata = { title: "Service | Char'd Pizza" };

const STEPS: Step[] = ["basics", "menu", "capacity", "fulfillment", "payment", "review"];

export default async function ServiceDetailPage({ params, searchParams }: PageProps<"/admin/services/[id]">) {
  const { id } = await params;
  const { step: stepParam } = await searchParams;
  const step: Step = STEPS.includes(stepParam as Step) ? (stepParam as Step) : "review";

  const { supabase } = await requireAdmin();
  const { data: serviceRow } = await supabase.from("services").select("*").eq("id", id).maybeSingle();
  if (!serviceRow) notFound();
  const service = serviceRow as Service;

  const [settingsQ, libraryQ, smiQ, slotsQ, zonesQ, szQ, availQ, ordersQ] = await Promise.all([
    supabase.from("settings").select("*").eq("id", true).single(),
    supabase.from("menu_items").select("*").order("sort_order").order("name"),
    supabase.from("service_menu_items").select("*").eq("service_id", id).order("sort_order"),
    supabase.from("slot_availability").select("*").eq("service_id", id).order("slot_start"),
    supabase.from("delivery_zones").select("*").order("sort_order"),
    supabase.from("service_delivery_zones").select("*").eq("service_id", id),
    supabase.from("service_availability").select("*").eq("service_id", id).single(),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("service_id", id).neq("status", "cancelled"),
  ]);

  const settings = settingsQ.data as Settings;
  const library = (libraryQ.data ?? []) as MenuItem[];
  const serviceMenu = (smiQ.data ?? []) as ServiceMenuItem[];
  const slots = (slotsQ.data ?? []) as SlotAvailability[];
  const zones = (zonesQ.data ?? []) as DeliveryZone[];
  const serviceZones = (szQ.data ?? []) as ServiceDeliveryZone[];
  const availability = availQ.data as ServiceAvailability;
  const orderCount = ordersQ.count ?? 0;
  const tz = settings.time_zone;

  return (
    <div className="space-y-5">
      <Link href="/admin/services" className="text-sm text-ink/60 hover:text-ink">
        ← Services
      </Link>
      <ServiceHeader service={service} availability={availability} orderCount={orderCount} tz={tz} />
      <Stepper current={step} serviceId={service.id} />

      {step === "basics" && <BasicsForm service={service} tz={tz} hasOrders={orderCount > 0} />}
      {step === "menu" && <MenuStep service={service} library={library} serviceMenu={serviceMenu} />}
      {step === "capacity" && <CapacityStep service={service} slots={slots} availability={availability} tz={tz} />}
      {step === "fulfillment" && <FulfillmentStep service={service} zones={zones} serviceZones={serviceZones} />}
      {step === "payment" && <PaymentStep service={service} settings={settings} />}
      {step === "review" && (
        <ReviewStep
          service={service}
          library={library}
          serviceMenu={serviceMenu}
          slots={slots}
          zones={zones}
          serviceZones={serviceZones}
          availability={availability}
          orderCount={orderCount}
          tz={tz}
        />
      )}
    </div>
  );
}
