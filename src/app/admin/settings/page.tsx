import { requireAdmin } from "@/lib/auth";
import type { Settings } from "@/lib/types";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings | Char'd Pizza" };

export default async function SettingsPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("settings").select("*").eq("id", true).single();
  return <SettingsForm settings={data as Settings} />;
}
