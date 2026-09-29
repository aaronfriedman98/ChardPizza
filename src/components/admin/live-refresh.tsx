"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps an operations page current: re-renders server data when orders or the
 * service change (Supabase realtime), and every `intervalMs` so timers tick.
 * Renders a small presence dot so it is obvious when live updates are connected.
 */
export function LiveRefresh({ serviceId, intervalMs = 30000 }: { serviceId?: string; intervalMs?: number }) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // Refreshing inside a transition keeps the current screen on show while the
    // new data loads, so a live update never blanks or blinks the board.
    const pull = () => startTransition(() => router.refresh());
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(pull, 400);
    };
    const filter = serviceId ? `service_id=eq.${serviceId}` : undefined;
    const channel = supabase
      .channel(`ops:${serviceId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", ...(filter ? { filter } : {}) }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "services" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_time_slots" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_waste" }, refresh)
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    // Only poll while the tab is in front; a background tab refreshing is wasted work.
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") pull();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") pull();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router, serviceId, intervalMs]);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-ink/50"
      title={pending ? "Updating…" : connected ? "Live updates on" : "Connecting…"}
    >
      <span className={`h-2 w-2 rounded-full transition-colors ${pending ? "bg-ember animate-pulse" : connected ? "bg-green-500" : "bg-ink/30"}`} />
      {pending ? "Updating" : connected ? "Live" : "Connecting"}
    </span>
  );
}
