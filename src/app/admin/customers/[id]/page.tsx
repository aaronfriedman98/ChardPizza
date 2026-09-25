import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import type { Settings } from "@/lib/types";
import { type Order, STATUS_LABEL, PAY_LABEL, itemSummary, tallyItems } from "@/lib/orders";
import { formatCents, formatPhone } from "@/lib/format";
import { fmtDate, fmtDateTime } from "@/lib/time";
import { CustomerForm, MergeForm } from "../customer-forms";

export const metadata = { title: "Customer | Char'd Pizza" };

type Customer = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  order_count: number;
  lifetime_spend_cents: number;
  first_order_at: string | null;
  last_order_at: string | null;
};
type Address = { id: string; line1: string; line2: string | null; city: string | null; notes: string | null; delivery_zones: { name: string } | null };

export default async function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const [{ data: c }, { data: settingsRow }, { data: ordersData }, { data: addresses }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("settings").select("time_zone").eq("id", true).single(),
    supabase
      .from("orders")
      .select("*, order_items(id, item_name, quantity, unit_price_cents, line_total_cents, capacity_units_each), services(name, service_date)")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("customer_addresses").select("id, line1, line2, city, notes, delivery_zones(name)").eq("customer_id", id),
  ]);
  if (!c) notFound();
  const customer = c as Customer;
  const tz = (settingsRow as Pick<Settings, "time_zone">).time_zone;
  const orders = (ordersData ?? []) as (Order & { services: { name: string; service_date: string } })[];
  const live = orders.filter((o) => o.status !== "cancelled");
  const favorites = tallyItems(live).slice(0, 3);
  const pickups = live.filter((o) => o.fulfillment === "pickup").length;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/customers" className="text-sm text-ink/60 hover:text-ink">
          ← Customers
        </Link>
        <h1 className="page-title">{customer.full_name}</h1>
        <div className="text-sm text-ink/60">
          {formatPhone(customer.phone)}
          {customer.email ? ` · ${customer.email}` : ""}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile label="Orders" value={String(live.length)} sub={orders.length !== live.length ? `${orders.length - live.length} cancelled` : undefined} />
        <Tile label="Lifetime spend" value={formatCents(live.reduce((a, o) => a + o.total_cents, 0))} />
        <Tile label="First order" value={customer.first_order_at ? fmtDate(customer.first_order_at, tz, "MMM d, yyyy") : "—"} />
        <Tile label="Last order" value={customer.last_order_at ? fmtDate(customer.last_order_at, tz, "MMM d, yyyy") : "—"} sub={live.length ? `${pickups} pickup · ${live.length - pickups} delivery` : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <section className="card space-y-2">
            <h2 className="font-bold">Order history</h2>
            {favorites.length > 0 && (
              <div className="text-sm text-ink/60">
                Usually orders: {favorites.map((f) => `${f.name} (${f.qty})`).join(", ")}
              </div>
            )}
            <ul className="divide-y divide-line">
              {orders.length === 0 && <li className="py-2 text-ink/50">No orders yet.</li>}
              {orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/orders/${o.id}`} className="flex items-center gap-3 py-2.5 hover:bg-cream/60">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {o.order_number} <span className="text-ink/50">· {o.services?.name} · {fmtDateTime(o.scheduled_at, tz)}</span>
                      </div>
                      <div className="truncate text-sm text-ink/60">{itemSummary(o)}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-semibold">{formatCents(o.total_cents)}</div>
                      <div className="text-ink/50">
                        {STATUS_LABEL[o.status]} · {PAY_LABEL[o.payment_status]}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {(addresses ?? []).length > 0 && (
            <section className="card space-y-1">
              <h2 className="font-bold">Addresses</h2>
              <ul className="text-sm">
                {((addresses ?? []) as unknown as Address[]).map((a) => (
                  <li key={a.id}>
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ""}
                    {a.city ? `, ${a.city}` : ""}
                    {a.delivery_zones?.name ? ` · ${a.delivery_zones.name}` : ""}
                    {a.notes ? <span className="text-ink/50"> · {a.notes}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-5">
          <CustomerForm customer={customer} />
          <MergeForm customerId={customer.id} customerName={customer.full_name} />
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      {sub && <div className="text-xs text-ink/60">{sub}</div>}
    </div>
  );
}
