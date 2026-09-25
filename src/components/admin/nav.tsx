"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/admin", label: "Dashboard", icon: "◫" },
  { href: "/admin/service", label: "Service Board", icon: "▦" },
  { href: "/admin/kitchen", label: "Kitchen", icon: "♨" },
  { href: "/admin/handoff", label: "Handoff", icon: "✋" },
  { href: "/admin/delivery", label: "Delivery", icon: "➜" },
  { href: "/admin/orders", label: "Orders", icon: "☰" },
  { href: "/admin/services", label: "Services", icon: "▤" },
  { href: "/admin/menu", label: "Menu", icon: "◉" },
  { href: "/admin/customers", label: "Customers", icon: "☺" },
  { href: "/admin/expenses", label: "Expenses", icon: "$" },
  { href: "/admin/account", label: "Account", icon: "🏦" },
  { href: "/admin/reports", label: "Reports", icon: "▥" },
  { href: "/admin/settings", label: "Settings", icon: "⚙" },
];

const MOBILE = ["/admin", "/admin/service", "/admin/kitchen", "/admin/handoff", "/admin/orders"];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden md:flex md:flex-col md:w-56 shrink-0 border-r border-line bg-white">
      <div className="px-5 py-5 border-b border-line">
        <div className="text-2xl font-black tracking-tight text-char">Char&rsquo;d</div>
        <div className="text-[11px] uppercase tracking-[0.25em] text-ember">Operations</div>
      </div>
      <ul className="flex-1 py-3">
        {NAV.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition ${
                isActive(pathname, item.href)
                  ? "bg-ember/10 text-ember border-r-2 border-ember"
                  : "text-ink/70 hover:bg-cream hover:text-ink"
              }`}
            >
              <span className="w-5 text-center text-base opacity-70">{item.icon}</span>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const items = NAV.filter((n) => MOBILE.includes(n.href));
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                isActive(pathname, item.href) ? "text-ember" : "text-ink/60"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label === "Service Board" ? "Board" : item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
