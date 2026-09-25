import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoMark, Wordmark } from "@/components/brand/logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/public";
import { formatCents, formatPhone } from "@/lib/format";
import { fmtDateOnly, fmtTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your order | Char'd Pizza" };

type OrderRow = {
  id: string;
  order_number: string;
  fulfillment: "pickup" | "delivery";
  scheduled_at: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_zone_name: string | null;
  delivery_fee_cents: number;
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  subtotal_cents: number;
  processing_fee_cents: number;
  total_cents: number;
  payment_method: "cash" | "zelle" | "card";
  payment_status: string;
  special_instructions: string | null;
  confirmation_token: string;
  services: { name: string; service_date: string; customer_instructions: string | null };
  order_items: { id: string; item_name: string; quantity: number; line_total_cents: number }[];
};

const STATUS_COPY: Record<string, string> = {
  pending_payment: "Waiting for payment",
  confirmed: "Confirmed",
  making: "In the oven",
  ready: "Ready for pickup",
  out_for_delivery: "Out for delivery",
  completed: "Picked up",
  cancelled: "Cancelled",
};

const PAY_COPY: Record<string, string> = {
  unpaid: "Not paid yet",
  awaiting_payment: "Awaiting your Zelle",
  due_at_pickup: "Pay at pickup",
  paid: "Paid",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

export default async function ConfirmationPage({ params, searchParams }: PageProps<"/order/[orderNumber]">) {
  const { orderNumber } = await params;
  const { t } = await searchParams;
  if (typeof t !== "string" || !t) notFound();

  const db = createAdminClient();
  const [{ data }, settings] = await Promise.all([
    db
      .from("orders")
      .select("*, services(name, service_date, customer_instructions), order_items(id, item_name, quantity, line_total_cents)")
      .eq("order_number", orderNumber.toUpperCase())
      .eq("confirmation_token", t)
      .maybeSingle(),
    getSettings(),
  ]);
  if (!data) notFound();
  const o = data as unknown as OrderRow;
  const tz = settings.time_zone;
  const first = o.customer_name.split(" ")[0];
  const cancelled = o.status === "cancelled";

  return (
    <main className="min-h-dvh">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark size={32} />
          <Wordmark className="text-xl" />
        </Link>
        <span className="rounded-full border border-flour/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest">{STATUS_COPY[o.status] ?? o.status}</span>
      </header>

      <section className="ember-glow">
        <div className="mx-auto max-w-2xl px-5 pb-12 pt-6 text-center">
          <div className="rise text-xs font-semibold uppercase tracking-[0.3em] text-amber">{cancelled ? "Order cancelled" : "You're in"}</div>
          <h1 className="rise rise-1 mt-2 font-display text-5xl uppercase leading-none sm:text-6xl">
            {cancelled ? "Sorry, " : "Thanks, "}
            {first}
          </h1>
          <div className="rise rise-2 mt-5 inline-block rounded-2xl border border-amber/40 bg-amber/10 px-6 py-3">
            <div className="text-[11px] uppercase tracking-[0.3em] text-flour/60">Order number</div>
            <div className="font-display text-4xl tracking-wider text-amber">{o.order_number}</div>
          </div>
          {!cancelled && (
            <p className="rise rise-3 mt-5 text-lg">
              {o.fulfillment === "delivery" ? "Delivery" : "Pickup"} <b>{fmtDateOnly(o.services.service_date, "EEEE, MMMM d")}</b> at{" "}
              <b>{fmtTime(o.scheduled_at, tz)}</b>
            </p>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-2xl space-y-4 px-5 pb-16">
        {/* Payment */}
        {!cancelled && (
          <div className={`rounded-2xl border p-5 ${o.payment_status === "paid" ? "border-green-500/40 bg-green-500/10" : "border-amber/40 bg-amber/[0.07]"}`}>
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-amber">Payment</div>
              <div className="text-sm font-semibold">{PAY_COPY[o.payment_status] ?? o.payment_status}</div>
            </div>
            <div className="mt-2 font-display text-3xl">{formatCents(o.total_cents)}</div>
            {o.payment_method === "zelle" && o.payment_status !== "paid" && (
              <p className="mt-2 text-flour/85">{settings.zelle_instructions ?? "We'll send Zelle instructions shortly."}</p>
            )}
            {o.payment_method === "cash" && o.payment_status !== "paid" && <p className="mt-2 text-flour/85">Cash is due when you pick up.</p>}
          </div>
        )}

        {/* Where */}
        <div className="rounded-2xl border border-flour/10 bg-white/[0.03] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-amber">{o.fulfillment === "delivery" ? "Delivering to" : "Pickup at"}</div>
          {o.fulfillment === "delivery" ? (
            <div className="mt-2">
              <div className="font-semibold">
                {o.address_line1}
                {o.address_line2 ? `, ${o.address_line2}` : ""}
              </div>
              <div className="text-flour/70">
                {o.address_city ? `${o.address_city} · ` : ""}
                {o.delivery_zone_name}
              </div>
            </div>
          ) : (
            <div className="mt-2">
              {settings.pickup_address && (
                <a
                  className="font-semibold underline-offset-4 hover:underline"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.pickup_address)}`}
                  target="_blank"
                  rel="noopener"
                >
                  {settings.pickup_address}
                </a>
              )}
              {settings.pickup_instructions && <p className="mt-1 text-flour/70">{settings.pickup_instructions}</p>}
            </div>
          )}
          {o.services.customer_instructions && <p className="mt-3 text-sm text-flour/70">{o.services.customer_instructions}</p>}
        </div>

        {/* Items */}
        <div className="rounded-2xl border border-flour/10 bg-white/[0.03] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-amber">Your order</div>
          <ul className="mt-2 divide-y divide-flour/10">
            {o.order_items.map((it) => (
              <li key={it.id} className="flex justify-between py-2">
                <span>
                  <span className="font-display text-lg text-amber">{it.quantity}×</span> {it.item_name}
                </span>
                <span>{formatCents(it.line_total_cents)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-flour/10 pt-3 text-sm text-flour/70">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCents(o.subtotal_cents)}</span>
            </div>
            {o.delivery_fee_cents > 0 && (
              <div className="flex justify-between">
                <span>Delivery</span>
                <span>{formatCents(o.delivery_fee_cents)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 text-lg font-bold text-flour">
              <span>Total</span>
              <span>{formatCents(o.total_cents)}</span>
            </div>
          </div>
          {o.special_instructions && <p className="mt-3 text-sm text-flour/60">Note: {o.special_instructions}</p>}
        </div>

        <div className="rounded-2xl border border-flour/10 bg-white/[0.03] p-5 text-sm text-flour/70">
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-amber">Details</div>
          <div className="mt-2">
            {o.customer_name} · {formatPhone(o.customer_phone)}
            {o.customer_email ? ` · ${o.customer_email}` : ""}
          </div>
          <p className="mt-2">Keep this link. It shows your order status, and it&rsquo;s where we&rsquo;ll update you if anything changes.</p>
          {settings.business_email && (
            <p className="mt-2">
              Questions? <a className="text-amber hover:underline" href={`mailto:${settings.business_email}`}>{settings.business_email}</a>
            </p>
          )}
        </div>

        <div className="pt-2 text-center">
          <Link href="/" className="btn-outline">
            Back to Char&rsquo;d
          </Link>
        </div>
      </section>
    </main>
  );
}
