import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { driverWeeklyOk } from "@/lib/driver";
import { LogoMark } from "@/components/brand/logo";
import { AutoRefresh } from "../../../partner/[token]/auto-refresh";
import { DriverNight } from "../../[service]/[sig]/driver-night";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deliveries | Char'd Pizza", robots: { index: false, follow: false } };

const HOUR = 60 * 60 * 1000;

// Tonight's sale while it runs, and for 6 hours after it ends so late deliveries stay put.
// Then the next one coming up.
async function currentSale() {
  const db = createAdminClient();
  const now = Date.now();
  const { data } = await db
    .from("services")
    .select("id, status, starts_at, ends_at")
    .in("status", ["scheduled", "live"])
    .gt("ends_at", new Date(now - 3 * 24 * HOUR).toISOString())
    .order("starts_at");
  const list = (data ?? []) as { id: string; status: string; starts_at: string; ends_at: string }[];
  const t = (iso: string) => new Date(iso).getTime();
  return (
    list.find((s) => s.status === "live") ??
    list.find((s) => t(s.starts_at) - 6 * HOUR <= now && t(s.ends_at) + 6 * HOUR > now) ??
    list.find((s) => t(s.ends_at) > now)
  );
}

// The driver's link that never changes: it always opens the current sale night.
export default async function DriverWeeklyPage({ params }: { params: Promise<{ sig: string }> }) {
  const { sig } = await params;
  if (!driverWeeklyOk(sig)) notFound();

  const pick = await currentSale();

  if (pick) return <DriverNight serviceId={pick.id} />;

  return (
    <main className="min-h-dvh px-4 py-10">
      <AutoRefresh />
      <div className="mx-auto max-w-md rounded-2xl border border-goldline bg-white/5 p-6 text-center text-flour2">
        <LogoMark size={56} className="mx-auto mb-3" />
        <div className="text-lg font-semibold text-flour">No sale scheduled right now</div>
        <p className="mt-1 text-sm">Keep this link. It shows the next sale&rsquo;s deliveries as soon as it&rsquo;s on the calendar.</p>
      </div>
    </main>
  );
}
