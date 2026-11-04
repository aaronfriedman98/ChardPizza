"use client";

import { useEffect } from "react";

/** Admin crash screen: keeps the nav, offers a retry, and shows a short code to report. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center space-y-4">
      <div className="text-4xl">🔥</div>
      <h1 className="text-xl font-bold">Something broke on this screen</h1>
      <p className="text-sm text-ink/60">Nothing was lost. Try again, and if it keeps happening, send Claude the code below and what you tapped.</p>
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
