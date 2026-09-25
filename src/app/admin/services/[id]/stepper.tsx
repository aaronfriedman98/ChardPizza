"use client";

import Link from "next/link";

export type Step = "basics" | "menu" | "capacity" | "fulfillment" | "payment" | "review";

const STEPS: { key: Step; label: string; n: number }[] = [
  { key: "basics", label: "Basics", n: 1 },
  { key: "menu", label: "Menu", n: 2 },
  { key: "capacity", label: "Capacity", n: 3 },
  { key: "fulfillment", label: "Pickup & Delivery", n: 4 },
  { key: "payment", label: "Payment", n: 5 },
  { key: "review", label: "Review", n: 6 },
];

export function Stepper({ current, serviceId }: { current: Step; serviceId: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl bg-white border border-line p-1 -mx-1 px-1">
      {STEPS.map((s) => {
        const active = s.key === current;
        return (
          <Link
            key={s.key}
            href={`/admin/services/${serviceId}?step=${s.key}`}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
              active ? "bg-ember text-white" : "text-ink/70 hover:bg-cream"
            }`}
          >
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${active ? "bg-white/20" : "bg-ink/10"}`}>{s.n}</span>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function NextStepLink({ serviceId, next, label }: { serviceId: string; next: Step; label?: string }) {
  return (
    <Link href={`/admin/services/${serviceId}?step=${next}`} className="btn-ghost text-sm">
      {label ?? "Next step →"}
    </Link>
  );
}
