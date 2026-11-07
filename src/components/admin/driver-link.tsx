"use client";

import { useState } from "react";

// Copy or text the driver's link for tonight. She needs no login.
export function DriverLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Tonight's deliveries (addresses, maps, and tap Delivered as you go): ${url}`;
  return (
    <div className="card flex flex-wrap items-center gap-2 py-3">
      <div className="mr-auto min-w-0">
        <div className="font-semibold">🚗 Driver link</div>
        <div className="text-xs text-ink/60">Her own page for tonight: every delivery, Waze and Google Maps, call or text, mark delivered. No login.</div>
      </div>
      <button
        type="button"
        className="rounded-lg bg-cream px-3 py-2 text-sm font-semibold hover:bg-line"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            prompt("Copy this link:", url);
          }
        }}
      >
        {copied ? "✓ Copied" : "Copy link"}
      </button>
      <a href={`sms:?&body=${encodeURIComponent(text)}`} className="rounded-lg bg-cream px-3 py-2 text-sm font-semibold hover:bg-line">
        Text it
      </a>
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="rounded-lg bg-cream px-3 py-2 text-sm font-semibold hover:bg-line">
        WhatsApp
      </a>
      <a href={url} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 text-sm font-semibold text-ember hover:underline">
        Preview
      </a>
    </div>
  );
}
