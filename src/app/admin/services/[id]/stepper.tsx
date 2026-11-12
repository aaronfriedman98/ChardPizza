"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type MouseEvent } from "react";
import { beginBusy, endBusy } from "@/components/admin/feedback";

export type Step = "basics" | "menu" | "capacity" | "fulfillment" | "payment" | "review";

const STEPS: { key: Step; label: string; n: number }[] = [
  { key: "basics", label: "Basics", n: 1 },
  { key: "menu", label: "Menu", n: 2 },
  { key: "capacity", label: "Capacity", n: 3 },
  { key: "fulfillment", label: "Pickup & Delivery", n: 4 },
  { key: "payment", label: "Payment", n: 5 },
  { key: "review", label: "Review", n: 6 },
];

// The step on screen registers how to save itself while it has unsaved changes, so Next,
// the step tabs and Publish all save it first instead of dropping what you picked.
let pendingSave: (() => Promise<boolean>) | null = null;

export function useUnsavedStep(dirty: boolean, save: () => Promise<boolean>) {
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    if (!dirty) return;
    pendingSave = () => saveRef.current();
    // Closing the tab or reloading still asks first.
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      pendingSave = null;
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);
}

/** Saves the step on screen if it has changes. false = the save failed, so stay put. */
export async function saveCurrentStep(): Promise<boolean> {
  if (!pendingSave) return true;
  beginBusy();
  try {
    return await pendingSave();
  } finally {
    endBusy();
  }
}

function useSaveThenGo() {
  const router = useRouter();
  return (e: MouseEvent, href: string) => {
    if (!pendingSave) return; // nothing unsaved: plain link
    e.preventDefault();
    void saveCurrentStep().then((ok) => ok && router.push(href));
  };
}

export function Stepper({ current, serviceId }: { current: Step; serviceId: string }) {
  const go = useSaveThenGo();
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl bg-white border border-line p-1 -mx-1 px-1">
      {STEPS.map((s) => {
        const active = s.key === current;
        const href = `/admin/services/${serviceId}?step=${s.key}`;
        return (
          <Link
            key={s.key}
            href={href}
            onClick={(e) => go(e, href)}
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

/** Next always keeps what you picked: with changes it reads "Save & next" and saves first. */
export function NextStepLink({ serviceId, next, label, dirty = false }: { serviceId: string; next: Step; label?: string; dirty?: boolean }) {
  const go = useSaveThenGo();
  const href = `/admin/services/${serviceId}?step=${next}`;
  const base = label ?? "Next step →";
  const text = dirty ? `Save & ${base.charAt(0).toLowerCase()}${base.slice(1)}` : base;
  return (
    <Link href={href} onClick={(e) => go(e, href)} className={dirty ? "btn-primary text-sm" : "btn-ghost text-sm"}>
      {text}
    </Link>
  );
}
