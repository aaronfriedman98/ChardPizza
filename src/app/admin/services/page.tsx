import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import type { Service, Settings } from "@/lib/types";
import { fmtDateOnly, fmtTime } from "@/lib/time";
import { publicState, STATE_LABEL, STATE_TONE, STATUS_LABEL } from "@/lib/service-state";
import { DuplicateButton } from "./duplicate-button";

export const metadata = { title: "Services | Char'd Pizza" };

export default async function ServicesPage() {
  const { supabase } = await requireAdmin();
  const [{ data: settings }, { data: rows }] = await Promise.all([
    supabase.from("settings").select("time_zone").eq("id", true).single(),
    supabase.from("services").select("*").order("service_date", { ascending: false }).order("starts_at", { ascending: false }),
  ]);
  const tz = (settings as Pick<Settings, "time_zone">).time_zone;
  const services = (rows ?? []) as Service[];
  const now = new Date();

  const upcoming = services.filter((s) => ["draft", "scheduled", "live"].includes(s.status));
  const past = services.filter((s) => !["draft", "scheduled", "live"].includes(s.status));

  function Row({ s }: { s: Service }) {
    const state = publicState(s, now);
    return (
      <li className="flex items-center gap-4 p-4">
        <Link href={`/admin/services/${s.id}`} className="flex-1 min-w-0">
          <div className="font-semibold truncate">{s.name}</div>
          <div className="text-sm text-ink/60">
            {fmtDateOnly(s.service_date)} · {fmtTime(s.starts_at, tz)} to {fmtTime(s.ends_at, tz)}
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs uppercase tracking-wide text-ink/50">{STATUS_LABEL[s.status]}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_TONE[state]}`}>{STATE_LABEL[state]}</span>
          <DuplicateButton id={s.id} />
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Services</h1>
          <p className="text-sm text-ink/60">A service is one sale: a date, hours, a menu, and capacity.</p>
        </div>
        <Link href="/admin/services/new" className="btn-primary shrink-0">
          + New service
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">Upcoming and drafts</h2>
        <ul className="card divide-y divide-line p-0">
          {upcoming.length === 0 && <li className="p-5 text-ink/60">Nothing scheduled. Create a service or duplicate a past one.</li>}
          {upcoming.map((s) => (
            <Row key={s.id} s={s} />
          ))}
        </ul>
      </section>

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">Past</h2>
          <ul className="card divide-y divide-line p-0">
            {past.map((s) => (
              <Row key={s.id} s={s} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
