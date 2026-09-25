import { requireAdmin } from "@/lib/auth";
import type { AdminUser } from "@/lib/types";
import { AccountForms } from "./account-forms";

export const metadata = { title: "Account | Char'd Pizza" };

export default async function AccountPage() {
  const { supabase, admin } = await requireAdmin();
  const { data: team } = await supabase
    .from("admin_users")
    .select("id, display_name, email, role, is_partner, is_active, created_at")
    .order("created_at");

  return (
    <div className="grid gap-5 max-w-3xl lg:grid-cols-2">
      <AccountForms admin={admin} />
      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Team</h2>
        <ul className="divide-y divide-line">
          {((team ?? []) as AdminUser[]).map((u) => (
            <li key={u.id} className="py-2 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{u.display_name}</div>
                <div className="text-sm text-ink/60">{u.email}</div>
              </div>
              <span className="text-xs uppercase tracking-wide text-ink/50">{u.role}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink/50">
          Adding a partner is a one-line command for now. A proper invite screen comes with roles later.
        </p>
      </section>
    </div>
  );
}
