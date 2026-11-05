"use client";

import { useEffect } from "react";

/** Admin crash screen: keeps the nav, offers a retry, and shows a short code to report. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // A page loaded before a deploy calls actions the new server no longer knows. One reload fixes it;
  // do that automatically (once) instead of showing a crash screen.
  const stale = /was not found on the server|Failed to find Server Action/i.test(error.message);
  useEffect(() => {
    console.error(error);
    if (!stale) return;
    try {
      if (sessionStorage.getItem("chard-reloaded") === "1") return;
      sessionStorage.setItem("chard-reloaded", "1");
    } catch {}
    window.location.reload();
  }, [error, stale]);
  useEffect(() => {
    const t = setTimeout(() => { try { sessionStorage.removeItem("chard-reloaded"); } catch {} }, 10000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mx-auto max-w-md py-16 text-center space-y-4">
      <div className="text-4xl">🔥</div>
      <h1 className="text-xl font-bold">{stale ? "The app was just updated" : "Something broke on this screen"}</h1>
      <p className="text-sm text-ink/60">
        {stale ? "Reloading to pick up the new version…" : "Nothing was lost. Try again, and if it keeps happening, send Claude the code below and what you tapped."}
      </p>
      <div className="flex justify-center gap-2">
        <button className="btn-primary" onClick={reset}>
          Try again
        </button>
        <button className="btn-ghost border border-line" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </div>
      <p className="font-mono text-xs text-ink/40">{error.digest ?? error.message.slice(0, 120)}</p>
    </div>
  );
}
