import { requireAdmin } from "@/lib/auth";
import { settleState } from "@/lib/transfer";
import { SettleView } from "./settle-view";

export const metadata = { title: "Settle up | Char'd Pizza" };

export default async function SettlePage() {
  const { supabase, admin } = await requireAdmin();
  const [state, { data: services }] = await Promise.all([
    settleState(supabase, admin.id),
    supabase.from("services").select("id, name, service_date"),
  ]);
  const svcName = Object.fromEntries((services ?? []).map((s) => [s.id as string, s.name as string]));
  return <SettleView state={state} svcName={svcName} />;
}
