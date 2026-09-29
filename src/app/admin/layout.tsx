import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SideNav, BottomNav } from "@/components/admin/nav";
import { AdminProgress, PageFade, Toasts } from "@/components/admin/feedback";
import { SignOutButton } from "./sign-out-button";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The login page renders inside this layout too; it has no user yet.
  if (!user) return <>{children}</>;

  const { data: admin } = await supabase
    .from("admin_users")
    .select("display_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!admin || !admin.is_active) {
    await supabase.auth.signOut();
    redirect("/admin/login");
  }

  return (
    <div className="min-h-dvh flex bg-cream">
      <AdminProgress />
      <Toasts />
      <SideNav />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between gap-4 px-4 md:px-6 h-14 border-b border-line bg-white">
          <Link href="/admin" className="md:hidden text-xl font-black text-char">
            Char&rsquo;d
          </Link>
          <div className="hidden md:block text-sm text-ink/60">Signed in as {admin.display_name}</div>
          <SignOutButton />
        </header>
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6">
          <PageFade>{children}</PageFade>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
