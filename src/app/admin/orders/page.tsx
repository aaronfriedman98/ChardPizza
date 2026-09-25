import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import type { Settings } from "@/lib/types";
import { type Order, STATUS_LABEL, PAY_LABEL, itemSummary } from "@/lib/orders";
import { formatCents, formatPhone } from "@/lib/format";
import { fmtDateTime } from "@/lib/time";

export const metadata = { title: "Orders | Char'd Pizza" };

const FILTERS = ["all", "active", "unpaid", "completed", "cancelled"] as const;
type F = (typeof FILTERS)[number];

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const f: F = FILTERS.includes(sp.f as F) ? (sp.f as F) : "all";
  const { supabase } = await requireAdmin();
  const { data: settingsRow } = await supabase.from("settings").select("time_zone").eq("id", true).single();
  const tz = (settingsRow as Pick<Settings, "time_zone">).time_zone;

  let query = supabase
    .from("orders")
    .select("*, order_items(id, item_name, quantity, unit_price_cents, line_total_cents, capacity_units_each), services(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (f === "active") query = query.in("status", ["confirmed", "making", "ready", "out_for_delivery"]);
  if (f === "unpaid") query = query.neq("payment_status", "paid").neq("status", "cancelled");
  if (f === "completed") query = query.eq("status", "completed");
  if (f === "cancelled") query = query.eq("status", "cancelled");
  if (q) {
    const digits = q.replace(/\D/g, "");
    query = query.or(`customer_name.ilike.%${q}%,order_number.ilike.%${q}%${digits ? `,customer_phone.ilike.%${digits}%` : ""}`);
  }
  const { data } = await query;
  const orders = (data ?? []) as (Order & { services: { name: string } })[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Orders</h1>
        <Link href="/admin/orders/new" className="btn-primary">+ New order</Link>
      </div>
      <form className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, phone, order #" className="input w-full sm:w-72" />
        <input type="hidden" name="f" value={f} />
        <button className="btn-primary">Search</button>
        <div className="flex gap-1.5 overflow-x-auto">
          {FILTERS.map((x) => (
            <Link
              key={x}
              href={`/admin/orders?f=${x}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium capitalize ${f === x ? "bg-char text-white" : "border border-line bg-white text-ink/70"}`}
            >
              {x}
            </Link>
          ))}
        </div>
      </form>

      <div className="card divide-y divide-line p-0">
        {orders.length === 0 && <div className="p-5 text-ink/60">No orders.</div>}
        {orders.map((o) => (
          <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex items-center gap-3 p-3.5 hover:bg-cream/60">
            <div className="w-24 shrink-0 font-mono text-sm text-ink/70">{o.order_number}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">
                {o.customer_name} <span className="font-normal text-ink/50">· {formatPhone(o.customer_phone)}</span>
              </div>
              <div className="truncate text-sm text-ink/60">
                {itemSummary(o)} · {o.services?.name} · {fmtDateTime(o.scheduled_at, tz)}
              </div>
            </div>
            <div className="hidden sm:flex flex-col items-end gap-1 text-xs">
              <span className="rounded-full bg-ink/10 px-2 py-0.5 font-semibold">{STATUS_LABEL[o.status]}</span>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${o.payment_status === "paid" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>{PAY_LABEL[o.payment_status]}</span>
            </div>
            <div className="w-20 shrink-0 text-right font-semibold">{formatCents(o.total_cents)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
