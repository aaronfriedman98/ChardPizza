"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/format";

export type Result = { error?: string; ok?: string };

const bool = z.enum(["on", "off"]).transform((v) => v === "on");
const optText = z.string().trim().transform((v) => (v === "" ? null : v));

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Item name is required").max(80),
  description: optText,
  category: z.string().trim().min(1, "Category is required").max(40),
  price: z.string().trim().min(1, "Price is required"),
  capacity_units: z.coerce.number().min(0).max(20),
  sku: optText,
  is_active: bool,
});

export async function saveMenuItem(_prev: Result | undefined, formData: FormData): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const raw = Object.fromEntries(formData);
  if (raw.id === "") delete raw.id;
  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const default_price_cents = dollarsToCents(parsed.data.price);
  if (default_price_cents === null) return { error: "Price should be a dollar amount like 22 or 22.50." };

  const row = {
    name: parsed.data.name,
    description: parsed.data.description,
    category: parsed.data.category,
    default_price_cents,
    capacity_units: parsed.data.capacity_units,
    sku: parsed.data.sku,
    is_active: parsed.data.is_active,
  };

  if (parsed.data.id) {
    const { error } = await supabase.from("menu_items").update(row).eq("id", parsed.data.id);
    if (error) return { error: error.message };
    await audit(supabase, admin.id, "menu_item.updated", "menu_item", parsed.data.id, row);
  } else {
    const { data: max } = await supabase
      .from("menu_items")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await supabase
      .from("menu_items")
      .insert({ ...row, sort_order: (max?.sort_order ?? 0) + 10 })
      .select("id")
      .single();
    if (error) return { error: error.message };
    await audit(supabase, admin.id, "menu_item.created", "menu_item", data.id, row);
  }
  revalidatePath("/admin/menu");
  return { ok: "Saved." };
}

export async function setMenuItemActive(id: string, is_active: boolean): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const { error } = await supabase.from("menu_items").update({ is_active }).eq("id", id);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, is_active ? "menu_item.activated" : "menu_item.deactivated", "menu_item", id);
  revalidatePath("/admin/menu");
  return { ok: "" };
}

export async function deleteMenuItem(id: string): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const { count } = await supabase
    .from("service_menu_items")
    .select("id", { count: "exact", head: true })
    .eq("menu_item_id", id);
  if (count && count > 0) {
    return { error: "This item has been used on a service. Deactivate it instead so history stays intact." };
  }
  const { error } = await supabase.from("menu_items").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, "menu_item.deleted", "menu_item", id);
  revalidatePath("/admin/menu");
  return { ok: "" };
}

export async function reorderMenuItems(ids: string[]): Promise<Result> {
  const { supabase } = await requireAdmin();
  const results = await Promise.all(
    ids.map((id, i) => supabase.from("menu_items").update({ sort_order: (i + 1) * 10 }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  revalidatePath("/admin/menu");
  return { ok: "" };
}
