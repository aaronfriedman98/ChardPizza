import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DeliveryZone, MenuItem, Service, ServiceAvailability, ServiceMenuItem, Settings, SlotAvailability } from "@/lib/types";
import { publicState, type PublicState } from "@/lib/service-state";

export async function getSettings(): Promise<Settings> {
  const db = createAdminClient();
  const { data } = await db.from("settings").select("*").eq("id", true).single();
  return data as Settings;
}

export type CurrentService = {
  service: Service;
  state: PublicState;
  availability: ServiceAvailability;
};

/** The one service the public site is about right now: the soonest published service that has not ended. */
export async function getCurrentService(): Promise<CurrentService | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("services")
    .select("*")
    .in("status", ["scheduled", "live"])
    .gt("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const service = data as Service;
  const { data: avail } = await db.from("service_availability").select("*").eq("service_id", service.id).single();
  const availability = avail as ServiceAvailability;
  return { service, state: publicState(service, new Date(), Number(availability.units_remaining)), availability };
}

export type PublicMenuItem = {
  smi_id: string;
  menu_item_id: string;
  name: string;
  description: string | null;
  category: string;
  price_cents: number;
  capacity_units: number;
  photo_url: string | null;
  is_sold_out: boolean;
  quantity_remaining: number | null;
};

export type PublicSlot = {
  id: string;
  slot_start: string;
  slot_end: string;
  /** Pizza units this slot can still take, after preorder caps and the dough total. */
  remaining: number;
  is_blocked: boolean;
};

export type PublicZone = { id: string; name: string; fee_cents: number; description: string | null };

export type OrderingData = {
  settings: Settings;
  service: Service;
  state: PublicState;
  availability: ServiceAvailability;
  items: PublicMenuItem[];
  slots: PublicSlot[];
  zones: PublicZone[];
};

export async function getOrderingData(serviceId: string): Promise<OrderingData | null> {
  const db = createAdminClient();
  const now = new Date();
  const [settingsQ, serviceQ, availQ, smiQ, itemAvailQ, slotsQ, zonesQ] = await Promise.all([
    db.from("settings").select("*").eq("id", true).single(),
    db.from("services").select("*").eq("id", serviceId).maybeSingle(),
    db.from("service_availability").select("*").eq("service_id", serviceId).single(),
    db.from("service_menu_items").select("*, menu_items(*)").eq("service_id", serviceId).eq("is_available", true).order("sort_order"),
    db.from("service_item_availability").select("*").eq("service_id", serviceId),
    db.from("slot_availability").select("*").eq("service_id", serviceId).order("slot_start"),
    db.from("service_delivery_zones").select("fee_cents_override, delivery_zones(*)").eq("service_id", serviceId),
  ]);
  if (!serviceQ.data) return null;
  const service = serviceQ.data as Service;
  const settings = settingsQ.data as Settings;
  const availability = availQ.data as ServiceAvailability;
  const serviceRemaining = Number(availability.units_remaining);

  const itemAvail = new Map(
    ((itemAvailQ.data ?? []) as { service_menu_item_id: string; is_sold_out: boolean; quantity_remaining: number | null }[]).map((a) => [
      a.service_menu_item_id,
      a,
    ]),
  );
  const items: PublicMenuItem[] = ((smiQ.data ?? []) as (ServiceMenuItem & { menu_items: MenuItem })[]).map((r) => {
    const a = itemAvail.get(r.id);
    return {
      smi_id: r.id,
      menu_item_id: r.menu_item_id,
      name: r.menu_items.name,
      description: r.description_override ?? r.menu_items.description,
      category: r.menu_items.category,
      price_cents: r.price_cents,
      capacity_units: Number(r.menu_items.capacity_units),
      photo_url: r.menu_items.photo_url,
      is_sold_out: a?.is_sold_out ?? false,
      quantity_remaining: a?.quantity_remaining ?? null,
    };
  });

  const isPreorder = now < new Date(service.starts_at);
  const slots: PublicSlot[] = ((slotsQ.data ?? []) as SlotAvailability[])
    .filter((s) => new Date(s.slot_end) > now)
    .map((s) => {
      let cap = s.capacity_units;
      if (isPreorder) {
        if (s.preorder_cap_units != null) cap = Math.min(cap, s.preorder_cap_units);
        else if (service.preorder_reserve_units != null) cap = Math.max(cap - service.preorder_reserve_units, 0);
        else if (service.preorder_reserve_percent != null) cap = Math.floor((cap * (100 - service.preorder_reserve_percent)) / 100);
      }
      const remaining = Math.max(Math.min(cap - Number(s.units_sold), serviceRemaining), 0);
      return { id: s.slot_id, slot_start: s.slot_start, slot_end: s.slot_end, remaining, is_blocked: s.is_blocked };
    });

  const zones: PublicZone[] = ((zonesQ.data ?? []) as unknown as { fee_cents_override: number | null; delivery_zones: DeliveryZone }[])
    .filter((z) => z.delivery_zones?.is_active)
    .map((z) => ({
      id: z.delivery_zones.id,
      name: z.delivery_zones.name,
      fee_cents: z.fee_cents_override ?? z.delivery_zones.fee_cents,
      description: z.delivery_zones.description,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { settings, service, state: publicState(service, now, serviceRemaining), availability, items, slots, zones };
}
