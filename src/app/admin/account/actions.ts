"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/format";

export type Result = { error?: string; ok?: string };

const MANUAL_KINDS = ["deposit", "partner_draw", "adjustment", "other"] as const;

const schema = z.object({
  kind: z.enum(MANUAL_KINDS),
  txn_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  amount: z.string().trim().min(1, "Amount is required"),
  direction: z.enum(["in", "out"]),
  description: z.string().trim().max(200).or(z.literal("")),
  partner_id: z.string().uuid().or(z.literal("")),
  service_id: z.string().uuid().or(z.literal("")),
});

function touch() {
  for (const p of ["/admin/account", "/admin", "/admin/reports"]) revalidatePath(p);
}

export async function addTransaction(input: unknown): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const v = parsed.data;
  const cents = dollarsToCents(v.amount);
  if (cents === null || cents <= 0) return { error: "Amount should be a dollar figure like 250 or 42.50." };
  if (v.kind === "partner_draw" && !v.partner_id) return { error: "Pick which partner took the money." };
  const signed = v.kind === "deposit" ? cents : v.kind === "partner_draw" ? -cents : v.direction === "in" ? cents : -cents;

  const { data, error } = await supabase
    .from("account_transactions")
    .insert({
      kind: v.kind,
      txn_date: v.txn_date,
      amount_cents: signed,
      description: v.description || null,
      partner_id: v.kind === "partner_draw" ? v.partner_id : null,
      service_id: v.service_id || null,
      created_by: admin.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await audit(supabase, admin.id, `account.${v.kind}`, "account_transaction", data.id, { amount_cents: signed });
  touch();
  return { ok: "Recorded." };
}

/** Records whatever difference is needed so the ledger matches the real bank balance. */
export async function setBalance(targetDollars: string, note: string): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const target = dollarsToCents(targetDollars);
  if (target === null) return { error: "Enter the balance as a dollar figure." };
  const { data: rows } = await supabase.from("account_transactions").select("amount_cents");
  const current = (rows ?? []).reduce((a, r) => a + r.amount_cents, 0);
  const diff = target - current;
  if (diff === 0) return { ok: "Already matches." };
  const { data, error } = await supabase
    .from("account_transactions")
    .insert({ kind: "adjustment", txn_date: new Date().toISOString().slice(0, 10), amount_cents: diff, description: note.trim() || "Balance corrected to match the bank", created_by: admin.id })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await audit(supabase, admin.id, "account.adjustment", "account_transaction", data.id, { from: current, to: target });
  touch();
  return { ok: "Balance updated." };
}

export async function deleteTransaction(id: string): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const { data: t } = await supabase.from("account_transactions").select("kind, expense_id").eq("id", id).single();
  if (!t) return { error: "Not found." };
  if (t.expense_id) return { error: "This entry comes from an expense. Edit or delete the expense instead." };
  if (t.kind === "opening_balance") return { error: "The opening balance stays. Use Set balance to correct it." };
  const { error } = await supabase.from("account_transactions").delete().eq("id", id);
  if (error) return { error: error.message };
  await audit(supabase, admin.id, "account.entry_deleted", "account_transaction", id);
  touch();
  return { ok: "" };
}
