"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dollarsToCents, normalizePhone } from "@/lib/format";

export type Result = { error?: string; ok?: string };

const bool = z.enum(["on", "off"]).transform((v) => v === "on");
const optText = z.string().trim().transform((v) => (v === "" ? null : v));
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const settingsSchema = z.object({
  business_name: z.string().trim().min(1, "Business name is required"),
  business_phone: optText,
  show_phone_publicly: bool,
  business_email: optText.pipe(z.string().email("Business email is not valid").nullable()),
  pickup_address: optText,
  pickup_instructions: optText,
  zelle_instructions: optText,
  whatsapp_url: optText.pipe(z.string().url("WhatsApp link must be a full URL").nullable()),
  instagram_url: optText.pipe(z.string().url("Instagram link must be a full URL").nullable()),
  about_text: optText,
  time_zone: z.string().trim().min(1),
  default_slot_minutes: int(5, 120),
  default_slot_capacity: int(0, 500),
  late_warning_minutes: int(0, 240),
  late_critical_minutes: int(0, 240),
  ready_uncollected_minutes: int(0, 240),
  special_instructions_enabled: bool,
  msg_no_service: z.string().trim().min(1),
  msg_upcoming: z.string().trim().min(1),
  msg_paused: z.string().trim().min(1),
  msg_sold_out: z.string().trim().min(1),
  msg_closed: z.string().trim().min(1),
});

export async function updateSettings(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const values = parsed.data;
  if (values.business_phone) {
    const phone = normalizePhone(values.business_phone);
    if (!phone) return { error: "Business phone should be a 10-digit US number." };
    values.business_phone = phone;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: values.time_zone });
  } catch {
    return { error: "Time zone is not a valid IANA zone (example: America/Detroit)." };
  }

  const { error } = await supabase.from("settings").update(values).eq("id", true);
  if (error) return { error: error.message };

  await audit(supabase, admin.id, "settings.updated", "settings", "1", { fields: Object.keys(values) });
  revalidatePath("/admin/settings");
  revalidatePath("/");
  return { ok: "Settings saved." };
}

// ---------------------------------------------------------------------------
// Delivery zones
// ---------------------------------------------------------------------------
const zoneSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Zone name is required"),
  fee: z.string().trim(),
  description: optText,
  is_active: bool,
});

export async function saveZone(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const raw = Object.fromEntries(formData);
  if (raw.id === "") delete raw.id;
  const parsed = zoneSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const fee_cents = dollarsToCents(parsed.data.fee || "0");
  if (fee_cents === null) return { error: "Fee should be a dollar amount like 5 or 7.50." };

  const row = {
    name: parsed.data.name,
    fee_cents,
    description: parsed.data.description,
    is_active: parsed.data.is_active,
  };

  if (parsed.data.id) {
    const { error } = await supabase.from("delivery_zones").update(row).eq("id", parsed.data.id);
    if (error) return { error: error.message };
    await audit(supabase, admin.id, "delivery_zone.updated", "delivery_zone", parsed.data.id, row);
  } else {
    const { data: max } = await supabase
      .from("delivery_zones")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await supabase
      .from("delivery_zones")
      .insert({ ...row, sort_order: (max?.sort_order ?? 0) + 10 })
      .select("id")
      .single();
    if (error) return { error: error.message };
    await audit(supabase, admin.id, "delivery_zone.created", "delivery_zone", data.id, row);
  }
  revalidatePath("/admin/settings/zones");
  return { ok: "Zone saved." };
}

export async function setZoneActive(id: string, is_active: boolean): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const { error } = await supabase.from("delivery_zones").update({ is_active }).eq("id", id);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, is_active ? "delivery_zone.enabled" : "delivery_zone.disabled", "delivery_zone", id);
  revalidatePath("/admin/settings/zones");
  return { ok: "" };
}

export async function deleteZone(id: string): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("delivery_zone_id", id);
  if (count && count > 0) {
    return { error: "This zone has orders attached. Turn it off instead of deleting it." };
  }
  const { error } = await supabase.from("delivery_zones").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, "delivery_zone.deleted", "delivery_zone", id);
  revalidatePath("/admin/settings/zones");
  return { ok: "" };
}

export async function reorderZones(ids: string[]): Promise<Result> {
  const { supabase } = await requireAdmin();
  const results = await Promise.all(
    ids.map((id, i) => supabase.from("delivery_zones").update({ sort_order: (i + 1) * 10 }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  revalidatePath("/admin/settings/zones");
  return { ok: "" };
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------
const passwordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match.", path: ["confirm"] });

export async function changePassword(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  await audit(supabase, admin.id, "admin.password_changed", "admin_user", admin.id);
  return { ok: "Password updated." };
}

const nameSchema = z.object({ display_name: z.string().trim().min(1, "Name is required").max(60) });

export async function updateDisplayName(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = nameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { error } = await supabase
    .from("admin_users")
    .update({ display_name: parsed.data.display_name })
    .eq("id", admin.id);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: "Name updated." };
}
