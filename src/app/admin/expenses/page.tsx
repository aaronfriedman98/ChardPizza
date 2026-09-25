import { requireAdmin } from "@/lib/auth";
import type { AdminUser, Expense, ExpenseCategory, Service } from "@/lib/types";
import { ExpensesView } from "./expenses-view";

export const metadata = { title: "Expenses | Char'd Pizza" };

export default async function ExpensesPage({ searchParams }: PageProps<"/admin/expenses">) {
  const sp = await searchParams;
  const { supabase, admin } = await requireAdmin();
  const [{ data: expenses }, { data: categories }, { data: services }, { data: partners }] = await Promise.all([
    supabase.from("expenses").select("*").is("deleted_at", null).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
    supabase.from("expense_categories").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("services").select("id, name, service_date, status").order("service_date", { ascending: false }).limit(60),
    supabase.from("admin_users").select("id, display_name, is_partner, is_active").eq("is_active", true).order("created_at"),
  ]);
  return (
    <ExpensesView
      expenses={(expenses ?? []) as Expense[]}
      categories={(categories ?? []) as ExpenseCategory[]}
      services={(services ?? []) as Pick<Service, "id" | "name" | "service_date" | "status">[]}
      partners={(partners ?? []) as Pick<AdminUser, "id" | "display_name" | "is_partner">[]}
      me={admin.id}
      initialServiceId={typeof sp.service === "string" ? sp.service : undefined}
    />
  );
}
