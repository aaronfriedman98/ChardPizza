"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Pulls fresh numbers every 30 seconds while the page is open.
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30000);
    const onShow = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [router]);
  return null;
}
