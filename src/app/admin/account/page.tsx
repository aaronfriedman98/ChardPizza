import { requireAdmin } from "@/lib/auth";
import type { AccountTransaction, AdminUser, Service } from "@/lib/types";
import { AccountView } from "./account-view";

export const metadata = { title: "Account | Char'd Pizza" };

export default async function AccountPage() {
  const { supabase } = await requireAdmin();
  const [{ data: txns }, { data: partners }, { data: services }, { data: pays }] = await Promise.all([
    supabase.from("account_transactions").select("*").order("txn_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
    supabase.from("admin_users").select("id, display_name, is_partner").eq("is_active", true).order("created_at"),
    supabase.from("services").select("id, name, service_date, status").order("service_date", { ascending: false }).limit(40),
    // Zelle and cash land in your own account; card money goes through Stripe to the business.
    supabase.from("payments").select("kind, method, amount_cents, status, orders!inner(service_id)").in("method", ["zelle", "cash"]).neq("status", "failed"),
  ]);
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
    />
  );
}
