"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { dollarsToCents } from "@/lib/format";
import type { PriceTier } from "@/lib/types";

export type Result = { error?: string; ok?: string };

function touch(orderId?: string) {
  for (const p of ["/admin", "/admin/service", "/admin/kitchen", "/admin/handoff", "/admin/delivery", "/admin/orders", "/admin/reports"]) revalidatePath(p);
  if (orderId) revalidatePath(`/admin/orders/${orderId}`);
}

export async function getPriceTiers(): Promise<PriceTier[]> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("price_tiers").select("*").eq("is_active", true).order("sort_order");
  return (data ?? []) as PriceTier[];
}

/** tier + override both empty = back to menu price. */
export async function applyPricing(orderId: string, tierId: string | null, overrideDollars: string | null, note?: string): Promise<Result> {
  const { admin } = await requireAdmin();
  let override: number | null = null;
  if (overrideDollars && overrideDollars.trim() !== "") {
    override = dollarsToCents(overrideDollars);
    if (override === null) return { error: "Custom pie price should be a dollar amount like 20 or 22.50." };
  }
  const db = createAdminClient();
  const { error } = await db.rpc("apply_order_pricing", {
    payload: { order_id: orderId, admin_id: admin.id, tier_id: tierId, override_cents: override, note: note ?? "" },
  });
  if (error) return { error: error.message.replace(/^[A-Z_]+: /, "") };
  touch(orderId);
  return { ok: "Pricing updated." };
}

const tierSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Give the tier a name").max(60),
  price: z.string().trim().min(1, "Price per pie is required"),
  is_active: z.boolean(),
});

export async function savePriceTier(input: unknown): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = tierSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const pie_price_cents = dollarsToCents(parsed.data.price);
  if (pie_price_cents === null) return { error: "Price per pie should be a dollar amount like 20." };
  const row = { name: parsed.data.name, pie_price_cents, is_active: parsed.data.is_active };
  if (parsed.data.id) {
    const { error } = await supabase.from("price_tiers").update(row).eq("id", parsed.data.id);
    if (error) return { error: error.message };
    await audit(supabase, admin.id, "price_tier.updated", "price_tier", parsed.data.id, row);
  } else {
    const { data: max } = await supabase.from("price_tiers").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase.from("price_tiers").insert({ ...row, sort_order: (max?.sort_order ?? 0) + 10 }).select("id").single();
    if (error) return { error: error.message };
    await audit(supabase, admin.id, "price_tier.created", "price_tier", data.id, row);
  }
  revalidatePath("/admin/settings/pricing");
  return { ok: "Saved." };
}

export async function deletePriceTier(id: string): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("price_tier_id", id);
  if (count && count > 0) return { error: "Orders use this tier. Turn it off instead so history keeps its label." };
  const { error } = await supabase.from("price_tiers").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, "price_tier.deleted", "price_tier", id);
  revalidatePath("/admin/settings/pricing");
  return { ok: "" };
}
