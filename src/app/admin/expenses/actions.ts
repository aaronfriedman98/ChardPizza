"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/format";

export type Result = { error?: string; ok?: string; id?: string };

const optText = z.string().trim().transform((v) => (v === "" ? null : v));
const schema = z.object({
  id: z.string().uuid().optional(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  amount: z.string().trim().min(1, "Amount is required"),
  category_id: z.string().uuid().or(z.literal("")),
  vendor: optText,
  description: optText,
  receipt_url: optText,
  service_id: z.string().uuid().or(z.literal("")),
  paid_by: z.enum(["business", "partner"]),
  paid_by_admin_id: z.string().uuid().or(z.literal("")),
  is_reimbursable: z.boolean(),
  notes: optText,
});

export async function saveExpense(input: unknown): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const v = parsed.data;
  const amount_cents = dollarsToCents(v.amount);
  if (amount_cents === null || amount_cents <= 0) return { error: "Amount should be a dollar figure like 42.50." };
  if (v.paid_by === "partner" && !v.paid_by_admin_id) return { error: "Pick which partner paid." };

  const row = {
    expense_date: v.expense_date,
    amount_cents,
    category_id: v.category_id || null,
    vendor: v.vendor,
    description: v.description,
    receipt_url: v.receipt_url,
    service_id: v.service_id || null,
    paid_by: v.paid_by,
    paid_by_admin_id: v.paid_by === "partner" ? v.paid_by_admin_id : null,
    is_reimbursable: v.paid_by === "partner" ? v.is_reimbursable : false,
    notes: v.notes,
  };

  let id: string | undefined = v.id;
  if (v.id) {
    const { error } = await supabase.from("expenses").update(row).eq("id", v.id);
    if (error) return { error: error.message };
    await audit(supabase, admin.id, "expense.updated", "expense", v.id, row);
  } else {
    const { data, error } = await supabase.from("expenses").insert({ ...row, created_by: admin.id }).select("id").single();
    if (error) return { error: error.message };
    id = data.id as string;
    await audit(supabase, admin.id, "expense.created", "expense", data.id as string, row);
  }
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/reports");
  return { ok: "Saved.", id };
}

export async function setReimbursed(id: string, reimbursed: boolean): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const { error } = await supabase.from("expenses").update({ reimbursed_at: reimbursed ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, reimbursed ? "expense.reimbursed" : "expense.unreimbursed", "expense", id);
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/reports");
  return { ok: "" };
}

export async function deleteExpense(id: string): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const { error } = await supabase.from("expenses").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, "expense.deleted", "expense", id);
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/reports");
  return { ok: "" };
}

export async function saveCategory(name: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const clean = name.trim();
  if (!clean) return { error: "Category name is required." };
  const { data: max } = await supabase.from("expense_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from("expense_categories").insert({ name: clean, sort_order: (max?.sort_order ?? 0) + 10 }).select("id").single();
  if (error) return { error: error.message.includes("duplicate") ? "That category already exists." : error.message };
  revalidatePath("/admin/expenses");
  return { ok: "Added.", id: data.id };
}

/** Signed URL for a receipt in the private bucket, valid for one hour. */
export async function receiptUrl(path: string): Promise<string | null> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
