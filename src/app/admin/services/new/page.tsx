import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import type { Settings } from "@/lib/types";
import { BasicsForm } from "../basics-form";

export const metadata = { title: "New service | Char'd Pizza" };

export default async function NewServicePage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("settings").select("time_zone").eq("id", true).single();
  const tz = (data as Pick<Settings, "time_zone">).time_zone;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/services" className="text-sm text-ink/60 hover:text-ink">
          ← Services
        </Link>
        <h1 className="page-title">New service</h1>
        <p className="text-sm text-ink/60">Step 1 of 6: the basics. It saves as a draft, then you pick the menu, capacity, and options.</p>
      </div>
      <BasicsForm service={null} tz={tz} />
    </div>
  );
}
