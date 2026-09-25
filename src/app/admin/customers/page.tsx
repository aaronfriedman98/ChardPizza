import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import type { Settings } from "@/lib/types";
import { formatCents, formatPhone } from "@/lib/format";
import { fmtDate } from "@/lib/time";

export const metadata = { title: "Customers | Char'd Pizza" };

type Row = { id: string; full_name: string; phone: string; email: string | null; order_count: number; lifetime_spend_cents: number; last_order_at: string | null; first_order_at: string | null };

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const sort = sp.sort === "spend" ? "lifetime_spend_cents" : sp.sort === "orders" ? "order_count" : "last_order_at";
  const { supabase } = await requireAdmin();
  const { data: settingsRow } = await supabase.from("settings").select("time_zone").eq("id", true).single();
  const tz = (settingsRow as Pick<Settings, "time_zone">).time_zone;

  let query = supabase.from("customers").select("id, full_name, phone, email, order_count, lifetime_spend_cents, last_order_at, first_order_at").order(sort, { ascending: false, nullsFirst: false }).limit(300);
  if (q) {
    const digits = q.replace(/\D/g, "");
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%${digits ? `,phone.ilike.%${digits}%` : ""}`);
  }
  const { data } = await query;
  const rows = (data ?? []) as Row[];
  const totalSpend = rows.reduce((a, r) => a + r.lifetime_spend_cents, 0);
  const repeat = rows.filter((r) => r.order_count > 1).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Customers</h1>
        <p className="text-sm text-ink/60">Built automatically from orders. No accounts, nothing customers can see.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Customers" value={String(rows.length)} />
        <Tile label="Repeat" value={rows.length ? `${Math.round((repeat / rows.length) * 100)}%` : "—"} />
        <Tile label="Lifetime sales" value={formatCents(totalSpend)} />
      </div>
      <form className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, phone, email" className="input w-full sm:w-72" />
        <button className="btn-primary">Search</button>
        <div className="ml-auto flex gap-1.5 text-sm">
          {[
            ["recent", "Most recent"],
            ["orders", "Most orders"],
            ["spend", "Top spend"],
          ].map(([k, label]) => (
            <Link key={k} href={`/admin/customers?sort=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`rounded-full px-3 py-1.5 font-medium ${(sp.sort ?? "recent") === k ? "bg-char text-white" : "border border-line bg-white text-ink/70"}`}>
              {label}
            </Link>
          ))}
        </div>
      </form>
      <div className="card divide-y divide-line p-0">
        {rows.length === 0 && <div className="p-5 text-ink/60">No customers yet.</div>}
        {rows.map((c) => (
          <Link key={c.id} href={`/admin/customers/${c.id}`} className="flex items-center gap-3 p-3.5 hover:bg-cream/60">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{c.full_name}</div>
              <div className="truncate text-sm text-ink/60">
                {formatPhone(c.phone)}
                {c.email ? ` · ${c.email}` : ""}
              </div>
            </div>
            <div className="hidden sm:block text-right text-sm text-ink/60">
              {c.last_order_at ? `last ${fmtDate(c.last_order_at, tz, "MMM d, yyyy")}` : ""}
            </div>
            <div className="w-20 text-right text-sm">
              <div className="font-semibold">{c.order_count} orders</div>
              <div className="text-ink/60">{formatCents(c.lifetime_spend_cents)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
