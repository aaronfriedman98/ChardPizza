"use client";

import { useEffect, useRef, useState } from "react";
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    const filter = serviceId ? `service_id=eq.${serviceId}` : undefined;
    const channel = supabase
      .channel(`ops:${serviceId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", ...(filter ? { filter } : {}) }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "services" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_time_slots" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_waste" }, refresh)
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    const tick = setInterval(() => router.refresh(), intervalMs);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(tick);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router, serviceId, intervalMs]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink/50" title={connected ? "Live updates on" : "Connecting…"}>
      <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-ink/30"}`} />
      {connected ? "Live" : "Connecting"}
    </span>
  );
}
