import Link from "next/link";
import type { DeliveryZone, MenuItem, Service, ServiceAvailability, ServiceDeliveryZone, ServiceMenuItem, SlotAvailability } from "@/lib/types";
import { formatCents } from "@/lib/format";
import { fmtDateOnly, fmtDateTime, fmtTime } from "@/lib/time";
import { publicState, STATE_LABEL } from "@/lib/service-state";

function Block({ title, step, serviceId, children, warn }: { title: string; step: string; serviceId: string; children: React.ReactNode; warn?: string }) {
  return (
    <section className={`card space-y-2 ${warn ? "border-amber-300" : ""}`}>
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{title}</h2>
        <Link href={`/admin/services/${serviceId}?step=${step}`} className="text-sm text-ember hover:underline">
          Edit
        </Link>
      </div>
      {warn && <p className="text-sm text-amber-700">{warn}</p>}
      <div className="text-sm text-ink/80">{children}</div>
    </section>
  );
}

export function ReviewStep({
  service: s,
  library,
  serviceMenu,
  slots,
  zones,
  serviceZones,
  availability,
  orderCount,
  tz,
}: {
  service: Service;
  library: MenuItem[];
  serviceMenu: ServiceMenuItem[];
  slots: SlotAvailability[];
  zones: DeliveryZone[];
  serviceZones: ServiceDeliveryZone[];
  availability: ServiceAvailability;
  orderCount: number;
  tz: string;
}) {
  const byId = new Map(library.map((i) => [i.id, i]));
  const offered = serviceMenu.filter((m) => m.is_available);
  const state = publicState(s, new Date(), Number(availability?.units_remaining ?? Infinity));
  const gridTotal = slots.reduce((a, x) => a + (x.is_blocked ? 0 : x.capacity_units), 0);
  const blocked = slots.filter((x) => x.is_blocked).length;
  const payments = [s.cash_enabled && "Cash", s.zelle_enabled && "Zelle", s.card_enabled && "Card"].filter(Boolean).join(", ");

  return (
    <div className="grid gap-4 md:grid-cols-2 max-w-4xl">
      <Block title="Basics" step="basics" serviceId={s.id}>
        <div className="font-semibold text-base text-ink">{s.name}</div>
        <div>{fmtDateOnly(s.service_date)}</div>
        <div>
          {fmtTime(s.starts_at, tz)} to {fmtTime(s.ends_at, tz)}
        </div>
        <div className="mt-1 text-ink/60">
          Ordering opens: {s.ordering_opens_at ? fmtDateTime(s.ordering_opens_at, tz) : "when published"}
          <br />
          Ordering closes: {s.ordering_closes_at ? fmtDateTime(s.ordering_closes_at, tz) : "when the service ends"}
        </div>
        <div className="mt-1">
          Public state right now: <b>{STATE_LABEL[state]}</b>
        </div>
      </Block>

      <Block title="Menu" step="menu" serviceId={s.id} warn={offered.length === 0 ? "No items offered yet." : undefined}>
        <ul className="space-y-1">
          {offered.map((m) => {
            const item = byId.get(m.menu_item_id);
            return (
              <li key={m.id} className="flex justify-between gap-3">
                <span>
                  {item?.name ?? "Item"}
                  {m.quantity_limit != null && <span className="text-ink/50"> · limit {m.quantity_limit}</span>}
                </span>
                <span className="font-semibold">{formatCents(m.price_cents)}</span>
              </li>
            );
          })}
        </ul>
      </Block>

      <Block title="Capacity" step="capacity" serviceId={s.id} warn={s.pizza_capacity_total === 0 ? "Total pizza units is 0. Nothing can be sold." : undefined}>
        <div>
          <b>{s.pizza_capacity_total}</b> pizza units total · {Number(availability?.units_sold ?? 0)} sold · {orderCount} orders
        </div>
        <div>
          {slots.length} slots of {s.slot_minutes} min, adding up to {gridTotal} units
          {blocked > 0 && <span className="text-red-700"> · {blocked} blocked</span>}
        </div>
        <div className="text-ink/60">
          Preorder: {s.preorder_reserve_units != null ? `reserve ${s.preorder_reserve_units} per slot` : s.preorder_reserve_percent != null ? `reserve ${s.preorder_reserve_percent}% per slot` : "sell everything"}
        </div>
      </Block>

      <Block title="Pickup & Delivery" step="fulfillment" serviceId={s.id} warn={!s.pickup_enabled && !s.delivery_enabled ? "Neither pickup nor delivery is on." : undefined}>
        <div>Pickup: {s.pickup_enabled ? "on" : "off"}</div>
        <div>Delivery: {s.delivery_enabled ? "on" : "off"}</div>
        {s.delivery_enabled && (
          <ul className="mt-1">
            {serviceZones.map((sz) => {
              const z = zones.find((x) => x.id === sz.delivery_zone_id);
              return (
                <li key={sz.delivery_zone_id}>
                  {z?.name ?? "Zone"} · {formatCents(sz.fee_cents_override ?? z?.fee_cents ?? 0)}
                </li>
              );
            })}
          </ul>
        )}
      </Block>

      <Block title="Payment" step="payment" serviceId={s.id} warn={!payments ? "No payment method is on." : undefined}>
        <div>{payments || "None"}</div>
        <div>Special instructions: {s.allow_special_instructions ? "allowed" : "off"}</div>
        {s.customer_instructions && <div className="mt-1 text-ink/60">“{s.customer_instructions}”</div>}
      </Block>

      <section className="card space-y-2 md:col-span-2">
        <h2 className="font-bold">Next</h2>
        <p className="text-sm text-ink/70">
          {s.status === "draft"
            ? "When everything above looks right, press Publish at the top. The service goes on the public site immediately if ordering is open, or shows as upcoming until it opens."
            : "This service is published. Every setting stays editable; changes that affect existing orders will ask you to confirm."}
        </p>
      </section>
    </div>
  );
}
