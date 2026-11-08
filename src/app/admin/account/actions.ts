"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/format";
import { fmtDate, fmtDateOnly } from "@/lib/time";

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
  for (const p of ["/admin/account", "/admin", "/admin/reports", "/admin/expenses"]) revalidatePath(p);
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

const transferSchema = z.object({ expense_ids: z.array(z.string().uuid()).max(200) });

/**
 * "I transferred it": records the Zelle + cash you took in as deposits (one per sale), and marks the
 * expenses you chose to keep as paid back. Both are worked out here from the database, not from the page.
 * Net effect on the Char'd balance = what you actually transferred.
 */
export async function recordTransfer(input: unknown): Promise<Result & { transferred_cents?: number }> {
  const { supabase, admin } = await requireAdmin();
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the expenses you picked." };
  const keepIds = parsed.data.expense_ids;

  const [{ data: pays }, { data: deposits }, { data: services }, { data: settings }] = await Promise.all([
    supabase.from("payments").select("kind, method, amount_cents, status, orders!inner(service_id)").in("method", ["zelle", "cash"]).neq("status", "failed"),
    supabase.from("account_transactions").select("service_id, amount_cents").eq("kind", "deposit").not("service_id", "is", null),
    supabase.from("services").select("id, name, service_date"),
    supabase.from("settings").select("time_zone").eq("id", true).single(),
  ]);
  const due = new Map<string, number>();
  for (const p of (pays ?? []) as unknown as { kind: string; amount_cents: number; orders: { service_id: string } }[]) {
    due.set(p.orders.service_id, (due.get(p.orders.service_id) ?? 0) + (p.kind === "payment" ? p.amount_cents : -p.amount_cents));
  }
  for (const d of deposits ?? []) due.set(d.service_id!, (due.get(d.service_id!) ?? 0) - d.amount_cents);
  const lines = [...due.entries()].filter(([, cents]) => cents > 0);
  const collected = lines.reduce((sum, [, c]) => sum + c, 0);

  let kept = 0;
  if (keepIds.length) {
    const { data: exp } = await supabase
      .from("expenses")
      .select("id, amount_cents")
      .in("id", keepIds)
      .eq("paid_by", "partner")
      .eq("paid_by_admin_id", admin.id)
      .eq("is_reimbursable", true)
      .is("reimbursed_at", null)
      .is("deleted_at", null);
    if ((exp ?? []).length !== keepIds.length) return { error: "One of those expenses changed. Reload the page and try again." };
    kept = (exp ?? []).reduce((sum, e) => sum + e.amount_cents, 0);
  }
  const transferred = collected - kept;
  if (collected <= 0) return { error: "Nothing to move right now." };
  if (transferred < 0) return { error: "You picked more to keep than you took in. Uncheck some expenses." };

  const today = fmtDate(new Date().toISOString(), settings?.time_zone ?? "America/Detroit", "yyyy-MM-dd");
  const byId = new Map((services ?? []).map((s) => [s.id, s]));
  const rows = lines.map(([service_id, amount_cents]) => {
    const s = byId.get(service_id);
    return {
      kind: "deposit" as const,
      txn_date: today,
      amount_cents,
      service_id,
      created_by: admin.id,
      description: s ? `Zelle + cash from ${s.name} (${fmtDateOnly(s.service_date, "MMM d")})` : "Zelle + cash from a sale",
    };
  });
  const { data: inserted, error } = await supabase.from("account_transactions").insert(rows).select("id");
  if (error) return { error: error.message };

  if (keepIds.length) {
    const { error: rErr } = await supabase.from("expenses").update({ reimbursed_at: new Date().toISOString() }).in("id", keepIds).is("reimbursed_at", null);
    if (rErr) return { error: `The deposit was recorded, but marking your expenses paid back failed: ${rErr.message}. Mark them on the Expenses page.` };
  }
  await audit(supabase, admin.id, "account.transfer_in", "account_transaction", inserted?.[0]?.id ?? null, {
    collected_cents: collected,
    kept_cents: kept,
    transferred_cents: transferred,
    expense_ids: keepIds,
  });
  touch();
  return { ok: "Recorded.", transferred_cents: transferred };
}
