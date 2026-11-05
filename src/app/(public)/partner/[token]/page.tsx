import { notFound } from "next/navigation";
import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/brand/logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickOpsService } from "@/lib/ops";
import { loadServiceOrders, tallyItems, minutesBehind, ACTIVE } from "@/lib/orders";
import { formatCents } from "@/lib/format";
import { fmtDateOnly, fmtTime } from "@/lib/time";
import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live numbers | Char'd Pizza", robots: { index: false, follow: false } };

// Read-only numbers for the partner. The link is the password: PARTNER_VIEW_TOKEN in the environment.
export default async function PartnerPage({ params }: PageProps<"/partner/[token]">) {
  const { token } = await params;
  const expected = process.env.PARTNER_VIEW_TOKEN ?? process.env.PARNTER_VIEW_TOKEN;
  if (!expected || token !== expected) notFound();

  const db = createAdminClient();
  const { settings, service: s, availability } = await pickOpsService(db);
  const tz = settings.time_zone;

  // Fall back to the most recent finished sale so the page always says something.
  let service = s;
  let avail = availability;
  let finished = false;
  if (!service) {
    const { data } = await db.from("services").select("*").in("status", ["completed", "live", "scheduled"]).order("starts_at", { ascending: false }).limit(1).maybeSingle();
    if (data) {
      service = data;
      const { data: a } = await db.from("service_availability").select("*").eq("service_id", data.id).single();
      avail = a;
      finished = true;
    }
  }

  const orders = service ? await loadServiceOrders(db, service.id) : [];
  const now = new Date();
  const live = orders.filter((o) => o.status !== "cancelled" && o.status !== "pending_payment");
  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const done = orders.filter((o) => o.status === "completed");
  const revenue = live.reduce((a, o) => a + o.total_cents, 0);
  const paid = live.filter((o) => o.payment_status === "paid").reduce((a, o) => a + o.total_cents, 0);
  const fees = live.reduce((a, o) => a + o.processing_fee_cents, 0);
  const pies = live.reduce((a, o) => a + Number(o.capacity_units), 0);
  const late = active.filter((o) => minutesBehind(o, now) > 0).length;
  const byMethod = (["card", "zelle", "cash"] as const).map((m) => ({ m, cents: live.filter((o) => o.payment_method === m).reduce((a, o) => a + o.total_cents, 0) }));
  const tally = tallyItems(live);
  const sold = Number(avail?.units_sold ?? 0);
  const lost = Number(avail?.units_wasted ?? 0);
  const total = Number(service?.pizza_capacity_total ?? 0);

  return (
    <main className="min-h-dvh px-5 py-6 sm:px-8">
      <AutoRefresh />
      <header className="mx-auto flex max-w-3xl items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark size={32} />
          <Wordmark className="text-2xl" />
        </Link>
        <span className="text-[11px] uppercase tracking-[0.25em] text-flour2/70">Partner view · live</span>
      </header>

      {!service ? (
        <section className="mx-auto mt-10 max-w-3xl text-center text-flour2">No sale on the books yet.</section>
      ) : (
        <section className="mx-auto mt-8 max-w-3xl space-y-6">
          <div>
            <div className="eyebrow">{finished ? "Last sale" : "Current sale"}</div>
            <h1 className="mt-1 font-display text-[40px] font-medium leading-none text-flour sm:text-[52px]">{service.name}</h1>
            <p className="mt-2 text-flour2">
              {fmtDateOnly(service.service_date, "EEEE, MMMM d")} · {fmtTime(service.starts_at, tz)} to {fmtTime(service.ends_at, tz)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile label="Pies sold" value={`${sold}${total ? ` / ${total}` : ""}`} sub={lost ? `${lost} lost` : `${Math.max(total - sold - lost, 0)} left`} />
            <Tile label="Orders" value={String(live.length)} sub={`${live.filter((o) => o.fulfillment === "pickup").length} pickup · ${live.filter((o) => o.fulfillment === "delivery").length} delivery`} />
            <Tile label="Handed out" value={`${done.length} / ${live.length}`} sub={late ? `${late} running late` : active.length ? "on schedule" : "nothing in progress"} />
            <Tile label="Sales" value={formatCents(revenue)} sub={fees ? `incl. ${formatCents(fees)} card fees` : "pies + delivery"} />
            <Tile label="Collected" value={formatCents(paid)} sub={`${live.filter((o) => o.payment_status === "paid").length} ${live.filter((o) => o.payment_status === "paid").length === 1 ? "order" : "orders"} paid`} />
            <Tile label="Still owed" value={formatCents(revenue - paid)} sub={`${live.filter((o) => o.payment_status !== "paid").length} unpaid, due at pickup`} tone={revenue - paid > 0 ? "amber" : "green"} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="panel p-5">
              <div className="eyebrow">By payment</div>
              <ul className="mt-3 space-y-2">
                {byMethod.map(({ m, cents }) => (
                  <li key={m} className="flex justify-between text-flour">
                    <span className="capitalize">{m}</span>
                    <span className="tabular-nums">{formatCents(cents)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="panel p-5">
              <div className="eyebrow">What sold</div>
              <ul className="mt-3 space-y-2">
                {tally.length === 0 && <li className="text-flour2">Nothing yet.</li>}
                {tally.map((t) => (
                  <li key={t.name} className="flex justify-between text-flour">
                    <span>{t.name}</span>
                    <span className="tabular-nums">{t.qty}</span>
                  </li>
                ))}
                {pies > 0 && (
                  <li className="flex justify-between border-t border-goldline pt-2 text-flour2">
                    <span>Pizzas total</span>
                    <span className="tabular-nums">{pies}</span>
                  </li>
                )}
              </ul>
            </div>
          </div>

          <p className="text-center text-[12px] uppercase tracking-[0.2em] text-flour2/50">Refreshes on its own every 30 seconds</p>
        </section>
      )}
    </main>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "amber" | "green" }) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-flour2/70">{label}</div>
      <div className={`mt-1 font-display text-[32px] leading-none tabular-nums ${tone === "amber" ? "text-gold2" : tone === "green" ? "text-green-400" : "text-flour"}`}>{value}</div>
      {sub && <div className="mt-1.5 text-[13px] text-flour2">{sub}</div>}
    </div>
  );
}
