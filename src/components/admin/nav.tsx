"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BusyLink } from "@/components/admin/feedback";

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
  { href: "/admin/guide", label: "How-to guide", icon: "?" },
];

/** The four that matter mid-service get their own tab; everything else lives under More. */
const MOBILE = ["/admin", "/admin/service", "/admin/kitchen", "/admin/handoff"];

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
            <BusyLink
              href={item.href}
              className={`nav-link-admin flex items-center gap-3 px-5 py-2.5 text-sm font-medium ${
                isActive(pathname, item.href)
                  ? "bg-ember/10 text-ember border-r-2 border-ember"
                  : "text-ink/70 hover:bg-cream hover:text-ink"
              }`}
            >
              <span className="w-5 text-center text-base opacity-70">{item.icon}</span>
              {item.label}
            </BusyLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const tabs = NAV.filter((n) => MOBILE.includes(n.href));
  const rest = NAV.filter((n) => !MOBILE.includes(n.href));
  const restActive = rest.some((n) => isActive(pathname, n.href));

  // Close the sheet once a link inside it has navigated.
  useEffect(() => setMore(false), [pathname]);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [more]);

  const tabClass = (active: boolean) =>
    `nav-link-admin relative flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-ember" : "text-ink/60"}`;

  return (
    <>
      {more && (
        <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="All pages">
          <div className="absolute inset-0 bg-char/50" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 pb-[calc(76px+env(safe-area-inset-bottom))] shadow-xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15" />
            <ul className="grid grid-cols-3 gap-2">
              {rest.map((item) => (
                <li key={item.href}>
                  <BusyLink
                    href={item.href}
                    className={`nav-link-admin flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-xs font-medium ${
                      isActive(pathname, item.href) ? "border-ember bg-ember/10 text-ember" : "border-line text-ink/80"
                    }`}
                  >
                    <span className="text-xl leading-none">{item.icon}</span>
                    {item.label === "Service Board" ? "Board" : item.label}
                  </BusyLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-line bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-5">
          {tabs.map((item) => (
            <li key={item.href}>
              <BusyLink href={item.href} className={tabClass(isActive(pathname, item.href) && !more)}>
                <span className="text-lg leading-none">{item.icon}</span>
                {item.label === "Service Board" ? "Board" : item.label}
              </BusyLink>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setMore((v) => !v)} className={tabClass(more || restActive)} aria-expanded={more}>
              <span className="text-lg leading-none">{more ? "✕" : "•••"}</span>
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
