"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { formatCents } from "@/lib/format";
import { fmtDate, fmtDateOnly } from "@/lib/time";
import { settleState } from "@/lib/transfer";

export type Result = { error?: string; ok?: string };

const schema = z.object({
  expense_ids: z.array(z.string().uuid()).max(200),
  /** The net the page showed. If the database disagrees, nothing is recorded. */
  expect_cents: z.number().int(),
});

/**
 * Squares you up with Char'd in one go:
 *  - every sale's money still in your account is recorded as deposited into the Char'd account
 *  - the expenses you picked are marked paid back to you
 * The ledger's net change equals what actually moved: + you paid Char'd, − Char'd paid you.
 * Everything is worked out again here from the database, not taken from the page.
 */
export async function settleUp(input: unknown): Promise<Result> {
  const { supabase, admin } = await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Check the expenses you picked." };
  const { expense_ids: keepIds, expect_cents } = parsed.data;

  const state = await settleState(supabase, admin.id);
  const owedById = new Map(state.owed.map((e) => [e.id, e]));
  if (keepIds.some((id) => !owedById.has(id))) return { error: "One of those expenses changed. Reload the page and try again." };
  const kept = keepIds.reduce((a, id) => a + owedById.get(id)!.amount_cents, 0);
  const net = state.held - kept;

  if (!state.lines.length && !keepIds.length) return { error: "Nothing to settle right now." };
  if (net !== expect_cents) return { error: "The numbers changed since this page loaded (someone paid or an expense was added). Reload and check again." };

  const { data: settings } = await supabase.from("settings").select("time_zone").eq("id", true).single();
  const today = fmtDate(new Date().toISOString(), settings?.time_zone ?? "America/Detroit", "yyyy-MM-dd");

  let firstId: string | null = null;
  if (state.lines.length) {
    const rows = state.lines.map((l) => ({
      kind: "deposit" as const,
      txn_date: today,
      amount_cents: l.held,
      service_id: l.service.id,
      created_by: admin.id,
      description: `${l.held < 0 ? "Correction: " : ""}Sales money from ${l.service.name} (${fmtDateOnly(l.service.service_date, "MMM d")})`,
    }));
    const { data: inserted, error } = await supabase.from("account_transactions").insert(rows).select("id");
    if (error) return { error: error.message };
    firstId = (inserted?.[0]?.id as string) ?? null;
  }

  if (keepIds.length) {
    const { error } = await supabase.from("expenses").update({ reimbursed_at: new Date().toISOString() }).in("id", keepIds).is("reimbursed_at", null);
    if (error) {
      return {
        error: state.lines.length
          ? `The sales money was recorded, but marking your expenses paid back failed: ${error.message}. Mark them on the Expenses page.`
          : error.message,
      };
    }
  }

  await audit(supabase, admin.id, "account.settle", "account_transaction", firstId, {
    held_cents: state.held,
    kept_cents: kept,
    net_cents: net,
    expense_ids: keepIds,
    sales: state.lines.map((l) => ({ service_id: l.service.id, held_cents: l.held })),
  });
  revalidatePath("/admin", "layout");
  return { ok: net > 0 ? `Recorded: you moved ${formatCents(net)} to Char'd.` : net < 0 ? `Recorded: Char'd paid you ${formatCents(-net)}.` : "Squared up. No money needed to move." };
}
