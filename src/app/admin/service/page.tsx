import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { pickOpsService } from "@/lib/ops";
import { loadServiceOrders } from "@/lib/orders";
import { ServiceBoard } from "./board";

export const metadata = { title: "Service Board | Char'd Pizza" };

export default async function ServiceBoardPage({ searchParams }: PageProps<"/admin/service">) {
  const { service: sid } = await searchParams;
  const { supabase } = await requireAdmin();
  const { settings, service, availability, candidates } = await pickOpsService(supabase, typeof sid === "string" ? sid : undefined);

  if (!service || !availability) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Service Board</h1>
        <div className="card text-ink/70">
          No published service right now.{" "}
          <Link href="/admin/services" className="text-ember hover:underline">
            Publish one
          </Link>{" "}
          and it will show up here.
        </div>
      </div>
    );
  }

  const [orders, { data: expenseRows }] = await Promise.all([
    loadServiceOrders(supabase, service.id),
    supabase.from("expenses").select("amount_cents").eq("service_id", service.id).is("deleted_at", null),
  ]);
  const expenseCents = (expenseRows ?? []).reduce((a, e) => a + (e.amount_cents as number), 0);
  return <ServiceBoard service={service} availability={availability} orders={orders} settings={settings} candidates={candidates} expenseCents={expenseCents} />;
}
