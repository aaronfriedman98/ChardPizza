"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/format";
import { buildSlots, zonedToIso } from "@/lib/time";
import type { Service, ServiceStatus, OrderingOverride, Settings, SlotAvailability } from "@/lib/types";

export type Result = { error?: string; ok?: string; needsConfirm?: string[] };

const optText = z.string().trim().transform((v) => (v === "" ? null : v));
const timeRe = /^\d{2}:\d{2}$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

async function loadSettings(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"]) {
  const { data } = await supabase.from("settings").select("*").eq("id", true).single();
  return data as Settings;
}

async function loadService(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], id: string) {
  const { data, error } = await supabase.from("services").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Service not found");
  return data as Service;
}

async function orderCount(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], serviceId: string) {
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("service_id", serviceId)
    .neq("status", "cancelled");
  return count ?? 0;
}

function touch(id?: string) {
  revalidatePath("/admin/services");
  if (id) revalidatePath(`/admin/services/${id}`);
  revalidatePath("/admin");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Step 1: Basics (create + edit)
// ---------------------------------------------------------------------------
const basicsSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, "Give the service a name").max(80),
    service_date: z.string().regex(dateRe, "Pick a date"),
    start_time: z.string().regex(timeRe, "Pick a start time"),
    end_time: z.string().regex(timeRe, "Pick an end time"),
    opens_date: z.string().regex(dateRe).or(z.literal("")),
    opens_time: z.string().regex(timeRe).or(z.literal("")),
    closes_date: z.string().regex(dateRe).or(z.literal("")),
    closes_time: z.string().regex(timeRe).or(z.literal("")),
    notes: optText,
  })
  .refine((v) => (v.opens_date === "") === (v.opens_time === ""), {
    message: "Ordering opens needs both a date and a time (or leave both blank).",
  })
  .refine((v) => (v.closes_date === "") === (v.closes_time === ""), {
    message: "Ordering closes needs both a date and a time (or leave both blank).",
  });

function basicsToRow(v: z.infer<typeof basicsSchema>, tz: string) {
  const starts_at = zonedToIso(v.service_date, v.start_time, tz);
  const ends_at = zonedToIso(v.service_date, v.end_time, tz);
  if (new Date(ends_at) <= new Date(starts_at)) return { error: "End time must be after start time." } as const;
  const ordering_opens_at = v.opens_date ? zonedToIso(v.opens_date, v.opens_time, tz) : null;
  const ordering_closes_at = v.closes_date ? zonedToIso(v.closes_date, v.closes_time, tz) : null;
  if (ordering_opens_at && ordering_closes_at && new Date(ordering_closes_at) <= new Date(ordering_opens_at)) {
    return { error: "Ordering must close after it opens." } as const;
  }
  return {
    row: { name: v.name, service_date: v.service_date, starts_at, ends_at, ordering_opens_at, ordering_closes_at, notes: v.notes },
  } as const;
}

async function regenerateSlots(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  serviceId: string,
  startsAt: string,
  endsAt: string,
  slotMinutes: number,
  capacity: number,
) {
  await supabase.from("service_time_slots").delete().eq("service_id", serviceId);
  const slots = buildSlots(startsAt, endsAt, slotMinutes).map((s, i) => ({
    service_id: serviceId,
    ...s,
    capacity_units: capacity,
    sort_order: i,
  }));
  if (slots.length === 0) return;
  const { error } = await supabase.from("service_time_slots").insert(slots);
  if (error) throw new Error(error.message);
}

export async function createService(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const raw = Object.fromEntries(formData);
  delete raw.id;
  const parsed = basicsSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const settings = await loadSettings(supabase);
  const built = basicsToRow(parsed.data, settings.time_zone);
  if ("error" in built) return { error: built.error };

  const { data, error } = await supabase
    .from("services")
    .insert({
      ...built.row,
      slot_minutes: settings.default_slot_minutes,
      default_slot_capacity: settings.default_slot_capacity,
      allow_special_instructions: settings.special_instructions_enabled,
      created_by: admin.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await regenerateSlots(supabase, data.id, built.row.starts_at, built.row.ends_at, settings.default_slot_minutes, settings.default_slot_capacity);
  await audit(supabase, admin.id, "service.created", "service", data.id, { name: built.row.name });
  touch(data.id);
  redirect(`/admin/services/${data.id}?step=menu`);
}

export async function updateBasics(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = basicsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (!parsed.data.id) return { error: "Missing service." };
  const settings = await loadSettings(supabase);
  const built = basicsToRow(parsed.data, settings.time_zone);
  if ("error" in built) return { error: built.error };

  const before = await loadService(supabase, parsed.data.id);
  const timesChanged = before.starts_at !== built.row.starts_at || before.ends_at !== built.row.ends_at;
  if (timesChanged && (await orderCount(supabase, before.id)) > 0) {
    return { error: "Orders already exist for this service, so the hours cannot change. Adjust individual slots instead." };
  }

  const { error } = await supabase.from("services").update(built.row).eq("id", before.id);
  if (error) return { error: error.message };
  if (timesChanged) {
    await regenerateSlots(supabase, before.id, built.row.starts_at, built.row.ends_at, before.slot_minutes, before.default_slot_capacity);
  }
  await audit(supabase, admin.id, "service.basics_updated", "service", before.id, built.row);
  touch(before.id);
  return { ok: timesChanged ? "Saved. Time slots were regenerated." : "Saved." };
}

// ---------------------------------------------------------------------------
// Step 2: Menu
// ---------------------------------------------------------------------------
const menuRowsSchema = z.array(
  z.object({
    menu_item_id: z.string().uuid(),
    included: z.boolean(),
    price: z.string(),
    quantity_limit: z.string(),
    is_available: z.boolean(),
    description_override: z.string().nullable(),
  }),
);

export async function saveServiceMenu(serviceId: string, rowsInput: unknown): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = menuRowsSchema.safeParse(rowsInput);
  if (!parsed.success) return { error: "Menu data was not valid." };

  const { data: existing } = await supabase.from("service_menu_items").select("id, menu_item_id").eq("service_id", serviceId);
  const existingByItem = new Map((existing ?? []).map((r) => [r.menu_item_id as string, r.id as string]));

  // Items with orders cannot be removed, only hidden.
  const { data: usedRows } = await supabase
    .from("order_items")
    .select("service_menu_item_id, orders!inner(service_id, status)")
    .eq("orders.service_id", serviceId)
    .neq("orders.status", "cancelled");
  const used = new Set((usedRows ?? []).map((r) => r.service_menu_item_id as string));

  let sort = 0;
  for (const r of parsed.data) {
    const smiId = existingByItem.get(r.menu_item_id);
    if (!r.included) {
      if (smiId) {
        if (used.has(smiId)) {
          await supabase.from("service_menu_items").update({ is_available: false }).eq("id", smiId);
        } else {
          await supabase.from("service_menu_items").delete().eq("id", smiId);
        }
      }
      continue;
    }
    const price_cents = dollarsToCents(r.price);
    if (price_cents === null) return { error: `Price for one of the items is not a valid amount.` };
    const quantity_limit = r.quantity_limit.trim() === "" ? null : parseInt(r.quantity_limit, 10);
    if (quantity_limit !== null && (Number.isNaN(quantity_limit) || quantity_limit < 0)) {
      return { error: "Quantity limit must be a whole number or blank." };
    }
    const row = {
      price_cents,
      quantity_limit,
      is_available: r.is_available,
      description_override: r.description_override?.trim() || null,
      sort_order: (sort += 10),
    };
    if (smiId) {
      const { error } = await supabase.from("service_menu_items").update(row).eq("id", smiId);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase
        .from("service_menu_items")
        .insert({ service_id: serviceId, menu_item_id: r.menu_item_id, ...row });
      if (error) return { error: error.message };
    }
  }
  await audit(supabase, admin.id, "service.menu_updated", "service", serviceId, {
    items: parsed.data.filter((r) => r.included).length,
  });
  touch(serviceId);
  return { ok: "Menu saved." };
}

export async function setServiceItemSoldOut(smiId: string, serviceId: string, soldOut: boolean): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const { error } = await supabase.from("service_menu_items").update({ sold_out_manual: soldOut }).eq("id", smiId);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, soldOut ? "service.item_sold_out" : "service.item_back_in_stock", "service_menu_item", smiId);
  touch(serviceId);
  return { ok: "" };
}

// ---------------------------------------------------------------------------
// Step 3: Capacity
// ---------------------------------------------------------------------------
const capacitySchema = z.object({
  pizza_capacity_total: z.coerce.number().int().min(0).max(10000),
  slot_minutes: z.coerce.number().int().min(5).max(240),
  default_slot_capacity: z.coerce.number().int().min(0).max(1000),
  preorder_mode: z.enum(["all", "units", "percent"]),
  preorder_value: z.coerce.number().min(0).max(10000).optional(),
});

export async function saveCapacitySettings(serviceId: string, input: unknown, confirm = false): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = capacitySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the numbers." };
  const v = parsed.data;
  const before = await loadService(supabase, serviceId);

  const { data: avail } = await supabase.from("service_availability").select("*").eq("service_id", serviceId).single();
  const unitsSold = Number(avail?.units_sold ?? 0);
  if (v.pizza_capacity_total < unitsSold && !confirm) {
    return { needsConfirm: [`Total capacity ${v.pizza_capacity_total} is below the ${unitsSold} pizza units already sold.`] };
  }

  const slotMinutesChanged = v.slot_minutes !== before.slot_minutes;
  if (slotMinutesChanged && (await orderCount(supabase, serviceId)) > 0) {
    return { error: "Orders already exist, so the slot length cannot change." };
  }

  const row = {
    pizza_capacity_total: v.pizza_capacity_total,
    slot_minutes: v.slot_minutes,
    default_slot_capacity: v.default_slot_capacity,
    preorder_reserve_units: v.preorder_mode === "units" ? Math.round(v.preorder_value ?? 0) : null,
    preorder_reserve_percent: v.preorder_mode === "percent" ? Math.round(v.preorder_value ?? 0) : null,
  };
  const { error } = await supabase.from("services").update(row).eq("id", serviceId);
  if (error) return { error: error.message };
  if (slotMinutesChanged) {
    await regenerateSlots(supabase, serviceId, before.starts_at, before.ends_at, v.slot_minutes, v.default_slot_capacity);
  }
  await audit(supabase, admin.id, "service.capacity_updated", "service", serviceId, row);
  touch(serviceId);
  return { ok: slotMinutesChanged ? "Saved. Slots were regenerated." : "Saved." };
}

const slotRowsSchema = z.array(
  z.object({
    id: z.string().uuid(),
    capacity_units: z.number().int().min(0).max(1000),
    preorder_cap_units: z.number().int().min(0).max(1000).nullable(),
    is_blocked: z.boolean(),
  }),
);

export async function saveSlots(serviceId: string, rowsInput: unknown, confirm = false): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = slotRowsSchema.safeParse(rowsInput);
  if (!parsed.success) return { error: "Slot data was not valid." };

  const { data: availRows } = await supabase.from("slot_availability").select("*").eq("service_id", serviceId);
  const avail = new Map(((availRows ?? []) as SlotAvailability[]).map((a) => [a.slot_id, a]));

  const warnings: string[] = [];
  for (const r of parsed.data) {
    const a = avail.get(r.id);
    if (!a) continue;
    if (r.capacity_units < Number(a.units_sold)) {
      warnings.push(`A slot would drop to ${r.capacity_units} with ${a.units_sold} already sold.`);
    }
  }
  if (warnings.length && !confirm) return { needsConfirm: warnings };

  const results = await Promise.all(
    parsed.data.map((r) =>
      supabase
        .from("service_time_slots")
        .update({ capacity_units: r.capacity_units, preorder_cap_units: r.preorder_cap_units, is_blocked: r.is_blocked })
        .eq("id", r.id)
        .eq("service_id", serviceId),
    ),
  );
  const failed = results.find((x) => x.error);
  if (failed?.error) return { error: failed.error.message };
  await audit(supabase, admin.id, "service.slots_updated", "service", serviceId, { slots: parsed.data.length });
  touch(serviceId);
  return { ok: "Slots saved." };
}

// ---------------------------------------------------------------------------
// Step 4: Fulfillment
// ---------------------------------------------------------------------------
const fulfillmentSchema = z.object({
  pickup_enabled: z.boolean(),
  delivery_enabled: z.boolean(),
  zones: z.array(z.object({ delivery_zone_id: z.string().uuid(), fee_override: z.string() })),
});

export async function saveFulfillment(serviceId: string, input: unknown): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = fulfillmentSchema.safeParse(input);
  if (!parsed.success) return { error: "Fulfillment data was not valid." };
  const v = parsed.data;
  if (!v.pickup_enabled && !v.delivery_enabled) return { error: "Turn on pickup, delivery, or both." };
  if (v.delivery_enabled && v.zones.length === 0) return { error: "Delivery is on but no zones are selected." };

  const zoneRows = [];
  for (const z of v.zones) {
    const fee = z.fee_override.trim() === "" ? null : dollarsToCents(z.fee_override);
    if (z.fee_override.trim() !== "" && fee === null) return { error: "A zone fee override is not a valid amount." };
    zoneRows.push({ service_id: serviceId, delivery_zone_id: z.delivery_zone_id, fee_cents_override: fee });
  }

  const { error } = await supabase
    .from("services")
    .update({ pickup_enabled: v.pickup_enabled, delivery_enabled: v.delivery_enabled })
    .eq("id", serviceId);
  if (error) return { error: error.message };
  await supabase.from("service_delivery_zones").delete().eq("service_id", serviceId);
  if (zoneRows.length) {
    const { error: zErr } = await supabase.from("service_delivery_zones").insert(zoneRows);
    if (zErr) return { error: zErr.message };
  }
  await audit(supabase, admin.id, "service.fulfillment_updated", "service", serviceId, v);
  touch(serviceId);
  return { ok: "Fulfillment saved." };
}

// ---------------------------------------------------------------------------
// Step 5: Payment + customer-facing options
// ---------------------------------------------------------------------------
const paymentSchema = z.object({
  cash_enabled: z.boolean(),
  zelle_enabled: z.boolean(),
  card_enabled: z.boolean(),
  allow_special_instructions: z.boolean(),
  customer_instructions: z.string().nullable(),
});

export async function savePayment(serviceId: string, input: unknown): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { error: "Payment data was not valid." };
  const v = parsed.data;
  if (!v.cash_enabled && !v.zelle_enabled && !v.card_enabled) return { error: "Turn on at least one payment method." };
  const row = { ...v, customer_instructions: v.customer_instructions?.trim() || null };
  const { error } = await supabase.from("services").update(row).eq("id", serviceId);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, "service.payment_updated", "service", serviceId, row);
  touch(serviceId);
  return { ok: "Payment options saved." };
}

// ---------------------------------------------------------------------------
// Lifecycle + live controls
// ---------------------------------------------------------------------------
const ALLOWED: Record<ServiceStatus, ServiceStatus[]> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["live", "draft", "completed", "cancelled"],
  live: ["completed", "scheduled", "cancelled"],
  completed: ["archived", "live"],
  cancelled: ["draft", "archived"],
  archived: ["completed"],
};

export async function setServiceStatus(serviceId: string, next: ServiceStatus): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const s = await loadService(supabase, serviceId);
  if (!ALLOWED[s.status].includes(next)) return { error: `Cannot go from ${s.status} to ${next}.` };

  if (next === "scheduled" && s.status === "draft") {
    const { count } = await supabase
      .from("service_menu_items")
      .select("id", { count: "exact", head: true })
      .eq("service_id", serviceId)
      .eq("is_available", true);
    if (!count) return { error: "Add at least one menu item before publishing." };
    if (s.pizza_capacity_total <= 0) return { error: "Set the total pizza capacity before publishing." };
    if (!s.cash_enabled && !s.zelle_enabled && !s.card_enabled) return { error: "Turn on a payment method before publishing." };
  }

  const { error } = await supabase.from("services").update({ status: next }).eq("id", serviceId);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, `service.${next}`, "service", serviceId, { from: s.status });
  touch(serviceId);
  return { ok: "" };
}

export async function setOrderingOverride(serviceId: string, override: OrderingOverride): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const { error } = await supabase.from("services").update({ ordering_override: override }).eq("id", serviceId);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, `service.ordering_${override}`, "service", serviceId);
  touch(serviceId);
  return { ok: "" };
}

export async function setSoldOut(serviceId: string, soldOut: boolean): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const { error } = await supabase.from("services").update({ is_sold_out: soldOut }).eq("id", serviceId);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, soldOut ? "service.sold_out" : "service.sold_out_cleared", "service", serviceId);
  touch(serviceId);
  return { ok: "" };
}

// ---------------------------------------------------------------------------
// Duplicate
// ---------------------------------------------------------------------------
export async function duplicateService(serviceId: string): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const src = await loadService(supabase, serviceId);

  // Same weekday, one week after the source. Times keep their wall-clock values.
  const shiftMs = 7 * 24 * 60 * 60 * 1000;
  const shift = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + shiftMs).toISOString() : null);
  const [y, m, d] = src.service_date.split("-").map(Number);
  const newDate = new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);

  const { data: created, error } = await supabase
    .from("services")
    .insert({
      name: src.name,
      service_date: newDate,
      starts_at: shift(src.starts_at),
      ends_at: shift(src.ends_at),
      ordering_opens_at: shift(src.ordering_opens_at),
      ordering_closes_at: shift(src.ordering_closes_at),
      status: "draft",
      ordering_override: "auto",
      pizza_capacity_total: src.pizza_capacity_total,
      slot_minutes: src.slot_minutes,
      default_slot_capacity: src.default_slot_capacity,
      pickup_enabled: src.pickup_enabled,
      delivery_enabled: src.delivery_enabled,
      cash_enabled: src.cash_enabled,
      zelle_enabled: src.zelle_enabled,
      card_enabled: src.card_enabled,
      allow_special_instructions: src.allow_special_instructions,
      preorder_reserve_units: src.preorder_reserve_units,
      preorder_reserve_percent: src.preorder_reserve_percent,
      customer_instructions: src.customer_instructions,
      notes: src.notes,
      created_by: admin.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  const newId = created.id as string;

  const { data: menu } = await supabase.from("service_menu_items").select("*").eq("service_id", serviceId);
  if (menu?.length) {
    await supabase.from("service_menu_items").insert(
      menu.map((m) => ({
        service_id: newId,
        menu_item_id: m.menu_item_id,
        price_cents: m.price_cents,
        description_override: m.description_override,
        is_available: m.is_available,
        quantity_limit: m.quantity_limit,
        sold_out_manual: false,
        sort_order: m.sort_order,
      })),
    );
  }

  const { data: slots } = await supabase.from("service_time_slots").select("*").eq("service_id", serviceId).order("sort_order");
  if (slots?.length) {
    await supabase.from("service_time_slots").insert(
      slots.map((s) => ({
        service_id: newId,
        slot_start: shift(s.slot_start),
        slot_end: shift(s.slot_end),
        capacity_units: s.capacity_units,
        preorder_cap_units: s.preorder_cap_units,
        is_blocked: false,
        sort_order: s.sort_order,
      })),
    );
  }

  const { data: zones } = await supabase.from("service_delivery_zones").select("*").eq("service_id", serviceId);
  if (zones?.length) {
    await supabase.from("service_delivery_zones").insert(
      zones.map((z) => ({ service_id: newId, delivery_zone_id: z.delivery_zone_id, fee_cents_override: z.fee_cents_override })),
    );
  }

  await audit(supabase, admin.id, "service.duplicated", "service", newId, { from: serviceId });
  touch(newId);
  redirect(`/admin/services/${newId}`);
}
