"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { normalizePhone } from "@/lib/format";

export type Result = { error?: string; ok?: string };
export type CustomerHit = { id: string; full_name: string; phone: string; email: string | null; order_count: number };

export async function lookupCustomers(needle: string): Promise<CustomerHit[]> {
  const { supabase } = await requireAdmin();
  const q = needle.trim();
  if (q.length < 3) return [];
  const digits = q.replace(/\D/g, "");
  let query = supabase.from("customers").select("id, full_name, phone, email, order_count").limit(6);
  query = digits.length >= 4 ? query.ilike("phone", `%${digits}%`) : query.ilike("full_name", `%${q}%`);
  const { data } = await query;
  return (data ?? []) as CustomerHit[];
}

const customerSchema = z.object({
  full_name: z.string().trim().min(2, "Name is required").max(80),
  phone: z.string().trim().min(10, "Phone is required"),
  email: z.string().trim().email("Email is not valid").or(z.literal("")),
  notes: z.string().trim().max(1000).or(z.literal("")),
});

export async function updateCustomer(id: string, _prev: Result | undefined, formData: FormData): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: "Phone should be a 10-digit US number." };

  const { data: clash } = await supabase.from("customers").select("id, full_name").eq("phone", phone).neq("id", id).maybeSingle();
  if (clash) return { error: `${clash.full_name} already has that phone number. Merge them instead.` };

  const { error } = await supabase
    .from("customers")
    .update({ full_name: parsed.data.full_name, phone, email: parsed.data.email || null, notes: parsed.data.notes || null })
    .eq("id", id);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, "customer.updated", "customer", id, { phone });
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers");
  return { ok: "Saved." };
}

/** Moves everything from `fromId` onto `intoId`, then deletes the empty duplicate. Deliberate, never automatic. */
export async function mergeCustomers(intoId: string, fromId: string): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  if (intoId === fromId) return { error: "Pick a different customer to merge." };
  const [{ data: into }, { data: from }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", intoId).single(),
    supabase.from("customers").select("*").eq("id", fromId).single(),
  ]);
  if (!into || !from) return { error: "Customer not found." };

  const r1 = await supabase.from("orders").update({ customer_id: intoId }).eq("customer_id", fromId);
  if (r1.error) return { error: r1.error.message };
  await supabase.from("customer_addresses").update({ customer_id: intoId }).eq("customer_id", fromId);
  await supabase.from("notifications").update({ customer_id: intoId }).eq("customer_id", fromId);

  const { data: agg } = await supabase.from("orders").select("total_cents, created_at, status").eq("customer_id", intoId).neq("status", "cancelled");
  const rows = agg ?? [];
  const first = rows.reduce<string | null>((a, o) => (!a || o.created_at < a ? o.created_at : a), null);
  const last = rows.reduce<string | null>((a, o) => (!a || o.created_at > a ? o.created_at : a), null);
  await supabase
    .from("customers")
    .update({
      order_count: rows.length,
      lifetime_spend_cents: rows.reduce((a, o) => a + o.total_cents, 0),
      first_order_at: first,
      last_order_at: last,
      email: into.email ?? from.email,
      notes: [into.notes, from.notes].filter(Boolean).join("\n") || null,
    })
    .eq("id", intoId);
  const { error } = await supabase.from("customers").delete().eq("id", fromId);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, "customer.merged", "customer", intoId, { from: fromId, from_phone: from.phone, from_name: from.full_name });
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${intoId}`);
  return { ok: `Merged ${from.full_name} into ${into.full_name}.` };
}
