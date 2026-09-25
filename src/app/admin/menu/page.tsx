import { requireAdmin } from "@/lib/auth";
import type { MenuItem } from "@/lib/types";
import { MenuEditor } from "./menu-editor";

export const metadata = { title: "Menu | Char'd Pizza" };

export default async function MenuPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("menu_items").select("*").order("sort_order").order("name");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Menu library</h1>
        <p className="text-sm text-ink/60">
          Every item you might ever sell. Each service picks which of these to offer and can override the price for that night.
        </p>
      </div>
      <MenuEditor items={(data ?? []) as MenuItem[]} />
    </div>
  );
}
