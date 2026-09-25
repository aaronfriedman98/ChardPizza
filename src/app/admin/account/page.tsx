import { requireAdmin } from "@/lib/auth";
import type { AccountTransaction, AdminUser, Service } from "@/lib/types";
import { AccountView } from "./account-view";

export const metadata = { title: "Account | Char'd Pizza" };

export default async function AccountPage() {
  const { supabase } = await requireAdmin();
  const [{ data: txns }, { data: partners }, { data: services }] = await Promise.all([
    supabase.from("account_transactions").select("*").order("txn_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
    supabase.from("admin_users").select("id, display_name, is_partner").eq("is_active", true).order("created_at"),
    supabase.from("services").select("id, name, service_date, status").order("service_date", { ascending: false }).limit(40),
  ]);
  return (
    <AccountView
      transactions={(txns ?? []) as AccountTransaction[]}
      partners={(partners ?? []) as Pick<AdminUser, "id" | "display_name" | "is_partner">[]}
      services={(services ?? []) as Pick<Service, "id" | "name" | "service_date" | "status">[]}
    />
  );
}
