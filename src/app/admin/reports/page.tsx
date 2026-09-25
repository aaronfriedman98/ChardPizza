import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import type { AdminUser, Expense, ExpenseCategory, Service, Settings } from "@/lib/types";
import { serviceReport, partnerLedger, categoryTotals, type ServiceReport } from "@/lib/reports";
import { formatCents } from "@/lib/format";
import { fmtDateOnly, fmtDateTime, fmtTime } from "@/lib/time";

export const metadata = { title: "Reports | Char'd Pizza" };

const TABS = ["overview", "service", "partners", "customers"] as const;
type Tab = (typeof TABS)[number];

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";
  const { supabase } = await requireAdmin();

  const [{ data: settingsRow }, { data: serviceRows }, { data: expenseRows }, { data: catRows }, { data: partnerRows }] = await Promise.all([
    supabase.from("settings").select("*").eq("id", true).single(),
    supabase.from("services").select("*").in("status", ["scheduled", "live", "completed", "archived"]).order("service_date", { ascending: false }).limit(60),
    supabase.from("expenses").select("*").is("deleted_at", null).order("expense_date", { ascending: false }),
    supabase.from("expense_categories").select("*").order("sort_order"),
    supabase.from("admin_users").select("id, display_name").eq("is_partner", true).eq("is_active", true).order("created_at"),
  ]);
  const settings = settingsRow as Settings;
  const tz = settings.time_zone;
  const services = (serviceRows ?? []) as Service[];
  const expenses = (expenseRows ?? []) as Expense[];
  const categories = (catRows ?? []) as ExpenseCategory[];
  const partners = (partnerRows ?? []) as Pick<AdminUser, "id" | "display_name">[];

  const selectedId = typeof sp.service === "string" ? sp.service : services[0]?.id;
  const selected = services.find((s) => s.id === selectedId) ?? services[0] ?? null;

  const q = (t: Tab, extra = "") => `/admin/reports?tab=${t}${selected ? `&service=${selected.id}` : ""}${extra}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Reports</h1>
        <div className="flex gap-1 rounded-xl border border-line bg-white p-1">
          {TABS.map((t) => (
            <Link key={t} href={q(t)} className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${tab === t ? "bg-ember text-white" : "text-ink/70 hover:bg-cream"}`}>
              {t === "service" ? "Sale night" : t}
            </Link>
          ))}
        </div>
      </div>

      {services.length === 0 && <div className="card text-ink/60">No sales yet. Reports fill in as you run services.</div>}

      {tab === "overview" && services.length > 0 && <Overview services={services} expenses={expenses} supabase={supabase} tz={tz} />}
      {tab === "service" && selected && <ServiceTab services={services} selected={selected} expenses={expenses} categories={categories} partners={partners} supabase={supabase} tz={tz} />}
      {tab === "partners" && <PartnersTab expenses={expenses} partners={partners} categories={categories} services={services} supabase={supabase} />}
      {tab === "customers" && <CustomersTab supabase={supabase} tz={tz} />}
    </div>
  );
}

type DB = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

async function Overview({ services, expenses, supabase, tz }: { services: Service[]; expenses: Expense[]; supabase: DB; tz: string }) {
  const reports = await Promise.all(services.slice(0, 24).map((s) => serviceReport(supabase, s)));
  const generalExpenses = expenses.filter((e) => !e.service_id).reduce((a, e) => a + e.amount_cents, 0);
  const totals = reports.reduce(
    (a, r) => ({ orders: a.orders + r.liveOrders.length, units: a.units + r.unitsSold, net: a.net + r.netSales, exp: a.exp + r.expenseTotal, profit: a.profit + r.profit }),
    { orders: 0, units: 0, net: 0, exp: 0, profit: 0 },
  );
  const maxNet = Math.max(...reports.map((r) => r.netSales), 1);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Tile label="Sales" value={String(reports.length)} />
        <Tile label="Orders" value={String(totals.orders)} sub={`${totals.units} pizza units`} />
        <Tile label="Net sales" value={formatCents(totals.net)} />
        <Tile label="Expenses" value={formatCents(totals.exp + generalExpenses)} sub={generalExpenses ? `${formatCents(generalExpenses)} not tied to a sale` : undefined} />
        <Tile label="Profit" value={formatCents(totals.profit - generalExpenses)} tone={totals.profit - generalExpenses >= 0 ? "green" : "red"} sub="after general expenses" />
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-ink/50">
            <tr>
              <th className="p-3">Sale</th>
              <th className="p-3 text-right">Orders</th>
              <th className="p-3 text-right">Units</th>
              <th className="p-3">Net sales</th>
              <th className="p-3 text-right">Expenses</th>
              <th className="p-3 text-right">Profit</th>
              <th className="p-3 text-right">Avg order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {reports.map((r) => (
              <tr key={r.service.id}>
                <td className="p-3">
                  <Link href={`/admin/reports?tab=service&service=${r.service.id}`} className="font-semibold hover:underline">
                    {r.service.name}
                  </Link>
                  <div className="text-xs text-ink/50">{fmtDateOnly(r.service.service_date, "EEE, MMM d, yyyy")}</div>
                </td>
                <td className="p-3 text-right tabular-nums">{r.liveOrders.length}</td>
                <td className="p-3 text-right tabular-nums">
                  {r.unitsSold}
                  <span className="text-ink/40">/{r.service.pizza_capacity_total}</span>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 rounded bg-ember" style={{ width: `${Math.max((r.netSales / maxNet) * 120, 2)}px` }} />
                    <span className="tabular-nums">{formatCents(r.netSales)}</span>
                  </div>
                </td>
                <td className="p-3 text-right tabular-nums">{formatCents(r.expenseTotal)}</td>
                <td className={`p-3 text-right font-semibold tabular-nums ${r.profit >= 0 ? "text-green-700" : "text-red-700"}`}>{formatCents(r.profit)}</td>
                <td className="p-3 text-right tabular-nums">{formatCents(r.avgOrder)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink/50">Times shown in {tz.replace("_", " ")}. Cancelled and unpaid card orders are excluded.</p>
    </div>
  );
}

async function ServiceTab({
  services,
  selected,
  expenses,
  categories,
  partners,
  supabase,
  tz,
}: {
  services: Service[];
  selected: Service;
  expenses: Expense[];
  categories: ExpenseCategory[];
  partners: Pick<AdminUser, "id" | "display_name">[];
  supabase: DB;
  tz: string;
}) {
  const r = await serviceReport(supabase, selected);
  const share = partners.length ? Math.round(r.profit / partners.length) : r.profit;
  const cats = categoryTotals(r.expenses, categories);
  const maxSlot = Math.max(...r.bySlot.map((s) => Math.max(s.units, s.capacity)), 1);
  return (
    <div className="space-y-5">
      <form className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value="service" />
        <select name="service" defaultValue={selected.id} className="input w-auto">
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.service_date}
            </option>
          ))}
        </select>
        <button className="btn-ghost border border-line">Show</button>
        <Link href={`/admin/expenses?service=${selected.id}`} className="ml-auto text-sm text-ember hover:underline">
          Add expenses for this sale →
        </Link>
      </form>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card space-y-1">
          <h2 className="font-bold">Profit, shown the long way</h2>
          <Line label="Item sales" cents={r.itemSales} />
          <Line label="+ Delivery fees" cents={r.deliveryFees} />
          {r.processingFees > 0 && <Line label="+ Card fees collected" cents={r.processingFees} />}
          <Line label="= Gross sales" cents={r.grossSales} bold />
          <Line label="− Refunds" cents={r.refunds} />
          <Line label="= Net sales" cents={r.netSales} bold />
          <Line label="− Expenses tied to this sale" cents={r.expenseTotal} />
          <Line label="= Profit" cents={r.profit} bold tone={r.profit >= 0 ? "green" : "red"} />
          {partners.length > 1 && <Line label={`Each partner's share (÷${partners.length})`} cents={share} />}
          <div className="mt-2 border-t border-line pt-2 text-sm text-ink/60">
            Collected so far {formatCents(r.collected)}. Outstanding {formatCents(r.outstanding)}.
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="font-bold">The night in numbers</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Mini label="Orders" value={String(r.liveOrders.length)} sub={`${r.pickupCount} pickup · ${r.deliveryCount} delivery`} />
            <Mini label="Pizza units" value={`${r.unitsSold} / ${selected.pizza_capacity_total}`} sub={r.soldOutAt ? `sold out ${fmtDateTime(r.soldOutAt, tz)}` : "did not sell out"} />
            <Mini label="Pies lost" value={String(r.wastedUnits)} sub={r.waste.length ? r.waste.map((w) => `${w.qty} ${w.name} ${w.reason}`).join(", ") : "none logged"} />
            <Mini label="Avg order" value={formatCents(r.avgOrder)} sub={`${r.avgUnitsPerOrder} pizzas per order`} />
            <Mini label="Preorders vs live" value={`${r.preorderCount} / ${r.liveCount}`} sub="placed before vs during service" />
            <Mini label="Customers" value={`${r.newCustomers} new · ${r.returningCustomers} back`} />
            <Mini label="Timing" value={r.avgMinutesLate === null ? "—" : r.lateCount === 0 ? "On time" : `${r.avgMinutesLate} min late avg`} sub={r.avgMinutesLate === null ? "no ready times yet" : `${r.lateCount} orders ran late`} />
          </div>
          <div className="text-sm text-ink/70">
            Paid by: {r.byPaymentMethod.map((p) => `${p.method} ${p.count} (${formatCents(p.cents)})`).join(" · ") || "—"}
          </div>
          {r.sourceCounts.length > 0 && <div className="text-sm text-ink/70">Came from: {r.sourceCounts.map((s) => `${s.source} ${s.count}`).join(" · ")}</div>}
        </section>

        <section className="card space-y-2">
          <h2 className="font-bold">Items</h2>
          <ul className="divide-y divide-line text-sm">
            {r.items.map((it) => (
              <li key={it.name} className="flex justify-between py-1.5">
                <span>
                  <b>{it.qty}</b> × {it.name}
                </span>
                <span className="tabular-nums">{formatCents(it.cents)}</span>
              </li>
            ))}
            {r.items.length === 0 && <li className="py-1.5 text-ink/50">No items sold.</li>}
          </ul>
        </section>

        <section className="card space-y-2">
          <h2 className="font-bold">Load by time slot</h2>
          <ul className="space-y-1 text-sm">
            {r.bySlot.map((s) => (
              <li key={s.time} className="flex items-center gap-2">
                <span className="w-16 tabular-nums text-ink/70">{fmtTime(s.time, tz)}</span>
                <div className="relative h-4 flex-1 rounded bg-cream">
                  <div className="absolute inset-y-0 left-0 rounded bg-ink/10" style={{ width: `${(s.capacity / maxSlot) * 100}%` }} />
                  <div className={`absolute inset-y-0 left-0 rounded ${s.units > s.capacity ? "bg-red-500" : "bg-ember"}`} style={{ width: `${(s.units / maxSlot) * 100}%` }} />
                </div>
                <span className="w-16 text-right tabular-nums">
                  {s.units}/{s.capacity}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink/50">Grey is capacity, orange is sold. Full bars every week mean it&rsquo;s time to raise the number.</p>
        </section>

        <section className="card space-y-2 lg:col-span-2">
          <h2 className="font-bold">Expenses for this sale</h2>
          {cats.length === 0 ? (
            <p className="text-sm text-ink/50">None recorded. Profit above is before ingredients.</p>
          ) : (
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {cats.map((c) => (
                <li key={c.name} className="flex justify-between">
                  <span>{c.name}</span>
                  <span className="tabular-nums">{formatCents(c.cents)}</span>
                </li>
              ))}
            </ul>
          )}
          {expenses.some((e) => !e.service_id) && <p className="text-xs text-ink/50">General expenses (software, equipment) are not included here. See Overview.</p>}
        </section>
      </div>
    </div>
  );
}

async function PartnersTab({
  expenses,
  partners,
  categories,
  services,
  supabase,
}: {
  expenses: Expense[];
  partners: Pick<AdminUser, "id" | "display_name">[];
  categories: ExpenseCategory[];
  services: Service[];
  supabase: DB;
}) {
  const ledger = partnerLedger(expenses, partners);
  const reports = await Promise.all(services.filter((s) => s.status === "completed" || s.status === "archived").slice(0, 24).map((s) => serviceReport(supabase, s)));
  const generalExpenses = expenses.filter((e) => !e.service_id).reduce((a, e) => a + e.amount_cents, 0);
  const totalProfit = reports.reduce((a, r) => a + r.profit, 0) - generalExpenses;
  const share = partners.length ? Math.round(totalProfit / partners.length) : totalProfit;
  const cats = categoryTotals(expenses, categories);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        {ledger.map((l) => (
          <section key={l.admin.id} className="card space-y-1">
            <h2 className="font-bold">{l.admin.display_name}</h2>
            <Line label="Paid out of pocket" cents={l.paidOutOfPocket} />
            <Line label="Of which reimbursable" cents={l.reimbursable} />
            <Line label="Already reimbursed" cents={l.reimbursed} />
            <Line label="Business still owes" cents={l.owed} bold tone={l.owed > 0 ? "amber" : undefined} />
          </section>
        ))}
        {ledger.length === 0 && <div className="card text-ink/60">No partners marked yet. Partners are admin users with the partner flag.</div>}
      </div>
      <section className="card space-y-1">
        <h2 className="font-bold">Profit split, completed sales</h2>
        <Line label={`Profit across ${reports.length} completed sale${reports.length === 1 ? "" : "s"}`} cents={reports.reduce((a, r) => a + r.profit, 0)} />
        <Line label="− General expenses (not tied to a sale)" cents={generalExpenses} />
        <Line label="= Profit to split" cents={totalProfit} bold tone={totalProfit >= 0 ? "green" : "red"} />
        {partners.length > 0 && <Line label={`Each partner (÷${partners.length})`} cents={share} bold />}
        <p className="pt-2 text-xs text-ink/50">Reimbursements are separate from profit: an owed expense is paid back first, then profit splits evenly.</p>
      </section>
      <section className="card space-y-2">
        <h2 className="font-bold">All-time spend by category</h2>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {cats.map((c) => (
            <li key={c.name} className="flex justify-between">
              <span>{c.name}</span>
              <span className="tabular-nums">{formatCents(c.cents)}</span>
            </li>
          ))}
          {cats.length === 0 && <li className="text-ink/50">No expenses yet.</li>}
        </ul>
      </section>
    </div>
  );
}

async function CustomersTab({ supabase, tz }: { supabase: DB; tz: string }) {
  const [{ data: custRows }, { data: orderRows }] = await Promise.all([
    supabase.from("customers").select("id, full_name, order_count, lifetime_spend_cents, last_order_at").order("lifetime_spend_cents", { ascending: false }).limit(15),
    supabase.from("orders").select("customer_id, fulfillment, source, status").neq("status", "cancelled"),
  ]);
  const customers = (custRows ?? []) as { id: string; full_name: string; order_count: number; lifetime_spend_cents: number; last_order_at: string | null }[];
  const orders = (orderRows ?? []) as { customer_id: string; fulfillment: string; source: string }[];
  const perCustomer = new Map<string, number>();
  for (const o of orders) perCustomer.set(o.customer_id, (perCustomer.get(o.customer_id) ?? 0) + 1);
  const total = perCustomer.size;
  const repeat = Array.from(perCustomer.values()).filter((n) => n > 1).length;
  const delivery = orders.filter((o) => o.fulfillment === "delivery").length;
  const sources = new Map<string, number>();
  for (const o of orders) sources.set(o.source, (sources.get(o.source) ?? 0) + 1);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile label="Customers" value={String(total)} />
        <Tile label="Repeat" value={total ? `${Math.round((repeat / total) * 100)}%` : "—"} sub={`${repeat} ordered more than once`} />
        <Tile label="Orders" value={String(orders.length)} sub={`${orders.length ? Math.round((delivery / orders.length) * 100) : 0}% delivery`} />
        <Tile label="Top source" value={Array.from(sources).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"} sub={Array.from(sources).map(([s, n]) => `${s} ${n}`).join(" · ")} />
      </div>
      <section className="card p-0">
        <h2 className="p-4 pb-2 font-bold">Top customers</h2>
        <ul className="divide-y divide-line text-sm">
          {customers.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2">
              <span className="w-6 text-ink/40">{i + 1}</span>
              <Link href={`/admin/customers/${c.id}`} className="flex-1 font-medium hover:underline">
                {c.full_name}
              </Link>
              <span className="text-ink/60">{c.order_count} orders</span>
              <span className="w-20 text-right tabular-nums">{formatCents(c.lifetime_spend_cents)}</span>
              <span className="hidden w-24 text-right text-xs text-ink/50 sm:block">{c.last_order_at ? fmtDateOnly(c.last_order_at.slice(0, 10), "MMM d") : ""}</span>
            </li>
          ))}
          {customers.length === 0 && <li className="px-4 py-3 text-ink/50">No customers yet.</li>}
        </ul>
        <p className="px-4 pb-3 text-xs text-ink/50">Times in {tz.replace("_", " ")}.</p>
      </section>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "red" }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">{label}</div>
      <div className={`truncate text-xl font-bold tabular-nums ${tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : ""}`}>{value}</div>
      {sub && <div className="truncate text-xs text-ink/60">{sub}</div>}
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-cream p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-ink/50">{label}</div>
      <div className="font-bold">{value}</div>
      {sub && <div className="text-xs text-ink/60">{sub}</div>}
    </div>
  );
}

function Line({ label, cents, bold, tone }: { label: string; cents: number; bold?: boolean; tone?: "green" | "red" | "amber" }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "font-bold" : "text-ink/80"}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : ""}`}>{formatCents(cents)}</span>
    </div>
  );
}
