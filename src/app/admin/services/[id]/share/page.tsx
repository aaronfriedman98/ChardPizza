import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import type { DeliveryZone, MenuItem, Service, ServiceMenuItem, Settings } from "@/lib/types";
import { renderTemplate, shareVars, type ShareItem } from "@/lib/share";
import { SharePanel } from "./share-panel";

export const metadata = { title: "Share | Char'd Pizza" };

export default async function SharePage({ params }: PageProps<"/admin/services/[id]/share">) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const [{ data: serviceRow }, { data: settingsRow }, { data: smi }, { data: sz }] = await Promise.all([
    supabase.from("services").select("*").eq("id", id).maybeSingle(),
    supabase.from("settings").select("*").eq("id", true).single(),
    supabase.from("service_menu_items").select("*, menu_items(name, description)").eq("service_id", id).eq("is_available", true).order("sort_order"),
    supabase.from("service_delivery_zones").select("delivery_zones(name)").eq("service_id", id),
  ]);
  if (!serviceRow) notFound();
  const service = serviceRow as Service;
  const settings = settingsRow as Settings;
  const items: ShareItem[] = ((smi ?? []) as (ServiceMenuItem & { menu_items: Pick<MenuItem, "name" | "description"> })[]).map((r) => ({
    name: r.menu_items.name,
    price_cents: r.price_cents,
    description: r.description_override ?? r.menu_items.description,
    is_sold_out: r.sold_out_manual,
  }));
  const zoneNames = ((sz ?? []) as unknown as { delivery_zones: Pick<DeliveryZone, "name"> }[]).map((z) => z.delivery_zones.name);
  const vars = shareVars({ service, settings, items, zoneNames });
  const message = renderTemplate(settings.share_message_template, vars);

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/admin/services/${service.id}`} className="text-sm text-ink/60 hover:text-ink">
          ← {service.name}
        </Link>
        <h1 className="page-title">Share this sale</h1>
        <p className="text-sm text-ink/60">Copy the message and the flyer, then paste both into WhatsApp. Edit the wording here if tonight is different.</p>
      </div>
      <SharePanel serviceId={service.id} initialMessage={message} orderUrl={vars.order_url} />
    </div>
  );
}
