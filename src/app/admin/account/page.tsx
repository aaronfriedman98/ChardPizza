import { requireAdmin } from "@/lib/auth";
import type { AccountTransaction, AdminUser, Service } from "@/lib/types";
import { AccountView, type OwedExpense } from "./account-view";

export const metadata = { title: "Account | Char'd Pizza" };

export default async function AccountPage() {
  const { supabase, admin } = await requireAdmin();
  const [{ data: txns }, { data: partners }, { data: services }, { data: pays }, { data: owedRows }, { data: unpaidRows }] = await Promise.all([
    supabase.from("account_transactions").select("*").order("txn_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
    supabase.from("admin_users").select("id, display_name, is_partner").eq("is_active", true).order("created_at"),
    supabase.from("services").select("id, name, service_date, status").order("service_date", { ascending: false }).limit(40),
    // Zelle and cash land in your own account; card money goes through Stripe to the business.
    supabase.from("payments").select("kind, method, amount_cents, status, orders!inner(service_id)").in("method", ["zelle", "cash"]).neq("status", "failed"),
    // What you paid out of pocket and have not been paid back for yet.
    supabase.from("expenses").select("id, expense_date, vendor, description, amount_cents, service_id").eq("paid_by", "partner").eq("paid_by_admin_id", admin.id).eq("is_reimbursable", true).is("reimbursed_at", null).is("deleted_at", null).order("expense_date"),
    // Zelle/cash orders nobody has paid yet. Shown so it is clear they are NOT in the transfer.
    supabase.from("orders").select("service_id, customer_name, total_cents").in("payment_method", ["zelle", "cash"]).neq("payment_status", "paid").not("status", "in", "(cancelled,pending_payment)"),
  ]);
  const unpaid: Record<string, { name: string; cents: number }[]> = {};
  for (const u of unpaidRows ?? []) (unpaid[u.service_id] ??= []).push({ name: u.customer_name, cents: u.total_cents });
  const collected = new Map<string, { zelle: number; cash: number }>();
  for (const p of (pays ?? []) as unknown as { kind: string; method: "zelle" | "cash"; amount_cents: number; orders: { service_id: string } }[]) {
    const cur = collected.get(p.orders.service_id) ?? { zelle: 0, cash: 0 };
    cur[p.method] += p.kind === "payment" ? p.amount_cents : -p.amount_cents;
    collected.set(p.orders.service_id, cur);
  }
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
