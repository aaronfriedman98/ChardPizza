import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import type { Order } from "@/lib/orders";
import { getOrderingData } from "@/lib/public";
import { OrderEditor } from "../../order-editor";

export const metadata = { title: "Edit order | Char'd Pizza" };

export default async function EditOrderPage({ params }: PageProps<"/admin/orders/[id]/edit">) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("orders")
    .select("*, order_items(id, item_name, quantity, unit_price_cents, line_total_cents, capacity_units_each)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const order = data as Order;
  const ordering = await getOrderingData(order.service_id);
  if (!ordering) notFound();

  const locked = order.status === "completed" || order.status === "cancelled";

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/admin/orders/${order.id}`} className="text-sm text-ink/60 hover:text-ink">
          ← {order.order_number}
        </Link>
        <h1 className="page-title">Edit {order.order_number}</h1>
        <p className="text-sm text-ink/60">Changes re-check slot and dough capacity. The customer&rsquo;s original prices are kept.</p>
      </div>
      {locked ? (
        <div className="card text-ink/70">This order is {order.status}. Restore it from the order page before editing.</div>
      ) : (
        <OrderEditor data={ordering} order={order} />
      )}
    </div>
  );
}
