import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import type { Settings } from "@/lib/types";
import { type Order, STATUS_LABEL, PAY_LABEL } from "@/lib/orders";
import { formatCents, formatPhone } from "@/lib/format";
import { fmtDateTime, fmtTime } from "@/lib/time";
import { OrderCard } from "@/components/admin/order-card";
import { LiveRefresh } from "@/components/admin/live-refresh";
import { NoteForm } from "./note-form";

export const metadata = { title: "Order | Char'd Pizza" };

type Note = { id: string; body: string; is_customer_facing: boolean; created_at: string; admin_users: { display_name: string } | null };
type Payment = { id: string; kind: string; method: string; amount_cents: number; status: string; note: string | null; recorded_at: string; admin_users: { display_name: string } | null };
type History = { id: string; from_status: string | null; to_status: string; changed_at: string; note: string | null; admin_users: { display_name: string } | null };
type Notification = { id: string; channel: string; template_key: string | null; status: string; sent_at: string | null; created_at: string; error: string | null };

export default async function OrderDetailPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const [{ data: orderRow }, { data: settingsRow }] = await Promise.all([
    supabase
      .from("orders")
      .select("*, order_items(id, item_name, quantity, unit_price_cents, line_total_cents, capacity_units_each), services(id, name, service_date)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("settings").select("*").eq("id", true).single(),
  ]);
  if (!orderRow) notFound();
  const o = orderRow as Order & { services: { id: string; name: string; service_date: string } };
  const settings = settingsRow as Settings;
  const tz = settings.time_zone;

  const [{ data: notes }, { data: payments }, { data: history }, { data: notifications }] = await Promise.all([
    supabase.from("order_notes").select("id, body, is_customer_facing, created_at, admin_users(display_name)").eq("order_id", id).order("created_at", { ascending: false }),
    supabase.from("payments").select("id, kind, method, amount_cents, status, note, recorded_at, admin_users(display_name)").eq("order_id", id).order("recorded_at"),
    supabase.from("order_status_history").select("id, from_status, to_status, changed_at, note, admin_users(display_name)").eq("order_id", id).order("changed_at"),
    supabase.from("notifications").select("id, channel, template_key, status, sent_at, created_at, error").eq("order_id", id).order("created_at"),
  ]);

  const paidTotal = ((payments ?? []) as unknown as Payment[]).reduce((a, p) => (p.status === "failed" ? a : a + (p.kind === "payment" ? p.amount_cents : -p.amount_cents)), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/admin/orders" className="text-sm text-ink/60 hover:text-ink">
            ← Orders
          </Link>
          <h1 className="page-title">
            {o.order_number} · {o.customer_name}
          </h1>
          <div className="text-sm text-ink/60">
            <Link href={`/admin/services/${o.services.id}`} className="hover:underline">
              {o.services.name}
            </Link>{" "}
            · placed {fmtDateTime(o.created_at, tz)} · from {o.source}
          </div>
        </div>
        <LiveRefresh serviceId={o.service_id} intervalMs={30000} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <OrderCard order={o} now={new Date()} tz={tz} thresholds={settings} />

          <section className="card space-y-2">
            <h2 className="font-bold">Customer</h2>
            <div className="text-sm">
              <div>
                <Link href={`/admin/customers/${o.customer_id}`} className="font-semibold hover:underline">
                  {o.customer_name}
                </Link>
              </div>
              <div>
                <a href={`tel:${o.customer_phone}`} className="hover:underline">{formatPhone(o.customer_phone)}</a>
                {o.customer_email && (
                  <>
                    {" · "}
                    <a href={`mailto:${o.customer_email}`} className="hover:underline">{o.customer_email}</a>
                  </>
                )}
              </div>
              {o.fulfillment === "delivery" && (
                <div className="mt-1 text-ink/70">
                  {o.address_line1}
                  {o.address_line2 ? `, ${o.address_line2}` : ""}
                  {o.address_city ? `, ${o.address_city}` : ""} · {o.delivery_zone_name} · {formatCents(o.delivery_fee_cents)} fee
                  {o.address_notes && <div>Notes: {o.address_notes}</div>}
                </div>
              )}
            </div>
          </section>

          <section className="card space-y-2">
            <h2 className="font-bold">Totals</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
              <dt className="text-ink/60">Items</dt><dd className="text-right">{formatCents(o.subtotal_cents)}</dd>
              {o.delivery_fee_cents > 0 && (<><dt className="text-ink/60">Delivery</dt><dd className="text-right">{formatCents(o.delivery_fee_cents)}</dd></>)}
              {o.processing_fee_cents > 0 && (<><dt className="text-ink/60">Processing</dt><dd className="text-right">{formatCents(o.processing_fee_cents)}</dd></>)}
              <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{formatCents(o.total_cents)}</dd>
              <dt className="text-ink/60">Recorded payments</dt><dd className="text-right">{formatCents(paidTotal)}</dd>
              <dt className="text-ink/60">Status</dt><dd className="text-right">{PAY_LABEL[o.payment_status]} · {o.payment_method}</dd>
            </dl>
            {(payments ?? []).length > 0 && (
              <ul className="mt-2 divide-y divide-line text-sm">
                {((payments ?? []) as unknown as Payment[]).map((p) => (
                  <li key={p.id} className="flex justify-between py-1.5">
                    <span>
                      {p.kind === "refund" ? "Refund" : "Payment"} · {p.method} · {p.admin_users?.display_name ?? "system"} · {fmtDateTime(p.recorded_at, tz)}
                      {p.note && <span className="text-ink/50"> · {p.note}</span>}
                    </span>
                    <span className={p.kind === "refund" ? "text-red-700" : ""}>{p.kind === "refund" ? "−" : ""}{formatCents(p.amount_cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className="card space-y-3">
            <h2 className="font-bold">Notes</h2>
            <NoteForm orderId={o.id} />
            <ul className="space-y-2 text-sm">
              {(notes ?? []).length === 0 && <li className="text-ink/50">No notes yet.</li>}
              {((notes ?? []) as unknown as Note[]).map((n) => (
                <li key={n.id} className={`rounded-lg px-3 py-2 ${n.is_customer_facing ? "bg-blue-50" : "bg-cream"}`}>
                  <div>{n.body}</div>
                  <div className="mt-0.5 text-xs text-ink/50">
                    {n.admin_users?.display_name ?? "—"} · {fmtDateTime(n.created_at, tz)}
                    {n.is_customer_facing && " · customer-facing"}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card space-y-2">
            <h2 className="font-bold">Messages sent</h2>
            <ul className="text-sm">
              {(notifications ?? []).length === 0 && <li className="text-ink/50">Nothing sent yet. Notifications arrive in a later step.</li>}
              {((notifications ?? []) as unknown as Notification[]).map((n) => (
                <li key={n.id} className="flex justify-between py-1">
                  <span>
                    {n.template_key ?? "message"} · {n.channel} · {n.status}
                    {n.error && <span className="text-red-700"> · {n.error}</span>}
                  </span>
                  <span className="text-ink/50">{fmtTime(n.sent_at ?? n.created_at, tz)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card space-y-2">
            <h2 className="font-bold">History</h2>
            <ul className="text-sm">
              {((history ?? []) as unknown as History[]).map((h) => (
                <li key={h.id} className="flex justify-between gap-3 py-1">
                  <span>
                    {h.from_status ? `${STATUS_LABEL[h.from_status as keyof typeof STATUS_LABEL] ?? h.from_status} → ` : "Created as "}
                    <b>{STATUS_LABEL[h.to_status as keyof typeof STATUS_LABEL] ?? h.to_status}</b>
                    {h.admin_users?.display_name ? ` · ${h.admin_users.display_name}` : ""}
                    {h.note && <span className="text-ink/50"> · {h.note}</span>}
                  </span>
                  <span className="shrink-0 text-ink/50">{fmtDateTime(h.changed_at, tz)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
