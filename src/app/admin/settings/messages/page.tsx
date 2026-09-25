import { requireAdmin } from "@/lib/auth";
import type { MessageTemplate } from "@/lib/messages";
import { TemplatesEditor } from "./templates-editor";

export const metadata = { title: "Messages | Char'd Pizza" };

export default async function MessagesSettingsPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("notification_templates").select("*").order("sort_order");
  return <TemplatesEditor templates={(data ?? []) as MessageTemplate[]} />;
}
