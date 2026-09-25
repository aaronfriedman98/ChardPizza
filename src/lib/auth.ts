import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AdminUser } from "@/lib/types";

/** For server actions and pages: returns the signed-in admin or redirects to login. */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: admin } = await supabase.from("admin_users").select("*").eq("id", user.id).maybeSingle();
  if (!admin || !admin.is_active) redirect("/admin/login");
  return { supabase, admin: admin as AdminUser };
}
