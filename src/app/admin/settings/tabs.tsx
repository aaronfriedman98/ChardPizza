"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/settings", label: "General" },
  { href: "/admin/settings/zones", label: "Delivery Zones" },
  { href: "/admin/settings/account", label: "Account & Team" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-white border border-line p-1 w-fit max-w-full">
      {TABS.map((t) => {
        const active = t.href === "/admin/settings" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
              active ? "bg-ember text-white" : "text-ink/70 hover:bg-cream"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
