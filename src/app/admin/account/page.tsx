import { requireAdmin } from "@/lib/auth";
import type { AccountTransaction, AdminUser, Service } from "@/lib/types";
import { AccountView, type OwedExpense } from "./account-view";
import { moneyBySale } from "@/lib/transfer";

export const metadata = { title: "Account | Char'd Pizza" };

export default async function AccountPage() {
  const { supabase, admin } = await requireAdmin();
  const [{ data: txns }, { data: partners }, { data: services }, collected, { data: owedRows }, { data: unpaidRows }] = await Promise.all([
    supabase.from("account_transactions").select("*").order("txn_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
    supabase.from("admin_users").select("id, display_name, is_partner").eq("is_active", true).order("created_at"),
    supabase.from("services").select("id, name, service_date, status").order("service_date", { ascending: false }).limit(40),
    // Zelle, cash, and card (Stripe pays out to your account, minus its fee) all land with you.
    moneyBySale(supabase),
    // What you paid out of pocket and have not been paid back for yet.
    supabase.from("expenses").select("id, expense_date, vendor, description, amount_cents, service_id").eq("paid_by", "partner").eq("paid_by_admin_id", admin.id).eq("is_reimbursable", true).is("reimbursed_at", null).is("deleted_at", null).order("expense_date"),
    // Orders nobody has paid yet. Shown so it is clear they are NOT in the transfer.
    supabase.from("orders").select("service_id, customer_name, total_cents").in("payment_method", ["zelle", "cash", "card"]).neq("payment_status", "paid").not("status", "in", "(cancelled,pending_payment)"),
  ]);
  const unpaid: Record<string, { name: string; cents: number }[]> = {};
  for (const u of unpaidRows ?? []) (unpaid[u.service_id] ??= []).push({ name: u.customer_name, cents: u.total_cents });
  return (
    <AccountView
      transactions={(txns ?? []) as AccountTransaction[]}
      partners={(partners ?? []) as Pick<AdminUser, "id" | "display_name" | "is_partner">[]}
      services={(services ?? []) as Pick<Service, "id" | "name" | "service_date" | "status">[]}
      collected={Object.fromEntries(collected)}
      owed={(owedRows ?? []) as OwedExpense[]}
      unpaid={unpaid}
    />
  );
}
