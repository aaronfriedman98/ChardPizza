"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type Result = { error?: string; ok?: string };

const schema = z.object({
  service_id: z.string().uuid(),
  menu_item_id: z.string().uuid().nullable(),
  item_name: z.string().trim().min(1).max(80),
  units: z.number().min(0.25).max(50),
  reason: z.enum(["burnt", "dropped", "eaten", "given_away", "other"]),
  note: z.string().trim().max(200).optional().default(""),
});

function touch() {
  for (const p of ["/admin", "/admin/service", "/admin/kitchen", "/admin/handoff", "/admin/reports"]) revalidatePath(p);
}

export async function logWaste(input: unknown): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const v = parsed.data;
  const { data, error } = await supabase
    .from("service_waste")
    .insert({ ...v, note: v.note || null, created_by: admin.id })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await audit(supabase, admin.id, "waste.logged", "service_waste", data.id, v);
  touch();
  return { ok: "Logged." };
}

export async function deleteWaste(id: string): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const { error } = await supabase.from("service_waste").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, "waste.removed", "service_waste", id);
  touch();
  return { ok: "" };
}
