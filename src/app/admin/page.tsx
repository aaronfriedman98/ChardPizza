import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { pickOpsService } from "@/lib/ops";
import { loadServiceOrders, ACTIVE, minutesBehind } from "@/lib/orders";
import type { Service } from "@/lib/types";
import { formatCents } from "@/lib/format";
import { fmtDateOnly, fmtDateTime, fmtTime } from "@/lib/time";
import { publicState, STATE_LABEL, STATE_TONE } from "@/lib/service-state";
import { LiveRefresh } from "@/components/admin/live-refresh";

export const metadata = { title: "Dashboard | Char'd Pizza" };

export default async function DashboardPage() {
  const { supabase, admin } = await requireAdmin();
  const [{ settings, service, availability }, { data: ledger }] = await Promise.all([pickOpsService(supabase), supabase.from("account_transactions").select("amount_cents")]);
  const balance = (ledger ?? []).reduce((a, r) => a + r.amount_cents, 0);
  const tz = settings.time_zone;
  const now = new Date();

  if (!service || !availability) {
    const { data: drafts } = await supabase.from("services").select("*").in("status", ["draft"]).order("service_date").limit(3);
    return (
      <div className="space-y-6">
        <h1 className="page-title">Hi {admin.display_name}</h1>
        <div className="card space-y-3">
          <p className="text-ink/70">No sale is published right now.</p>
          <p className="text-sm text-ink/60">Char&rsquo;d account balance: <b className="text-ink">{formatCents(balance)}</b></p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/services/new" className="btn-primary">+ New service</Link>
            <Link href="/admin/services" className="btn-ghost border border-line">All services</Link>
          </div>
          {(drafts ?? []).length > 0 && (
            <ul className="text-sm">
              {((drafts ?? []) as Service[]).map((d) => (
                <li key={d.id}>
                  Draft: <Link href={`/admin/services/${d.id}`} className="text-ember hover:underline">{d.name}</Link> · {fmtDateOnly(d.service_date)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  const orders = await loadServiceOrders(supabase, service.id);
  const live = orders.filter((o) => o.status !== "cancelled");
  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const revenue = live.reduce((a, o) => a + o.total_cents, 0);
  const paid = live.filter((o) => o.payment_status === "paid").reduce((a, o) => a + o.total_cents, 0);
  const late = active.filter((o) => minutesBehind(o, now) > 0).length;
  const state = publicState(service, now, Number(availability.units_remaining));
  const isToday = service.service_date === fmtDateOnly(new Date().toISOString().slice(0, 10), "yyyy-MM-dd");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="page-title">{isToday ? "Tonight" : "Next up"}</h1>
          <div className="text-sm text-ink/60">
            <Link href={`/admin/services/${service.id}`} className="font-semibold text-ink hover:underline">{service.name}</Link> · {fmtDateOnly(service.service_date)} ·{" "}
            {fmtTime(service.starts_at, tz)} to {fmtTime(service.ends_at, tz)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_TONE[state]}`}>{STATE_LABEL[state]}</span>
          <LiveRefresh serviceId={service.id} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Dough used" value={`${Number(availability.units_sold) + Number(availability.units_wasted)} / ${service.pizza_capacity_total}`} sub={`${Number(availability.units_remaining)} remaining${Number(availability.units_wasted) ? ` · ${Number(availability.units_wasted)} lost` : ""}`} />
        <Tile label="Orders" value={String(live.length)} sub={`${live.filter((o) => o.fulfillment === "delivery").length} delivery`} />
        <Tile label="Revenue" value={formatCents(revenue)} sub={`${formatCents(paid)} collected`} />
        <Tile label="Outstanding" value={formatCents(revenue - paid)} sub={late ? `${late} running late` : "nothing late"} tone={late ? "red" : revenue - paid > 0 ? "amber" : undefined} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Jump href="/admin/service" title="Service board" sub="Every order, one tap actions" />
        <Jump href="/admin/kitchen" title="Kitchen" sub="What to make next" />
        <Jump href="/admin/handoff" title="Handoff" sub="Name, paid, hand it over" />
        <Jump href={`/admin/services/${service.id}/share`} title="Share" sub="WhatsApp message and flyer" />
      </div>
      <Link href="/admin/account" className="card block text-sm hover:border-ember/60">
        <span className="text-ink/60">Char&rsquo;d account balance </span>
        <b className="text-lg">{formatCents(balance)}</b>
      </Link>

      {state === "upcoming" && service.ordering_opens_at && (
        <div className="card text-sm text-ink/70">Ordering opens {fmtDateTime(service.ordering_opens_at, tz)}.</div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "amber" | "red" }) {
  return (
    <div className="card">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-ink/60">{sub}</div>}
    </div>
  );
}

function Jump({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link href={href} className="card block transition hover:border-ember/60 hover:shadow">
      <div className="font-bold">{title} →</div>
      <div className="text-sm text-ink/60">{sub}</div>
    </Link>
  );
}
