"use client";

import { useState } from "react";

export function SharePanel({ serviceId, initialMessage, orderUrl }: { serviceId: string; initialMessage: string; orderUrl: string }) {
  const [message, setMessage] = useState(initialMessage);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const flyerUrl = `/flyer/${serviceId}`;
  const canShareFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  function flash(text: string) {
    setStatus(text);
    setTimeout(() => setStatus(null), 2500);
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message);
      flash("Message copied.");
    } catch {
      flash("Could not copy. Select the text and copy it manually.");
    }
  }

  async function fetchFlyer(): Promise<Blob> {
    const res = await fetch(`${flyerUrl}?t=${Date.now()}`);
    if (!res.ok) throw new Error("Flyer failed to render");
    return res.blob();
  }

  async function copyFlyer() {
    setBusy(true);
    try {
      const blob = await fetchFlyer();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("Flyer copied. Paste it into WhatsApp.");
    } catch {
      flash("Your browser would not copy the image. Use Download instead.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadFlyer() {
    setBusy(true);
    try {
      const blob = await fetchFlyer();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "chard-pizza-flyer.png";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      flash("Flyer failed to render.");
    } finally {
      setBusy(false);
    }
  }

  async function shareBoth() {
    setBusy(true);
    try {
      const blob = await fetchFlyer();
      const file = new File([blob], "chard-pizza-flyer.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: message });
      } else {
        await navigator.share({ text: message });
      }
    } catch {
      /* user cancelled or unsupported */
    } finally {
      setBusy(false);
    }
  }

  const waLink = `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <div className="grid gap-5 lg:grid-cols-2 max-w-5xl">
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Message</h2>
          <button className="text-sm text-ink/60 hover:text-ink" onClick={() => setMessage(initialMessage)}>
            Reset
          </button>
        </div>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={14} className="input font-mono text-sm leading-relaxed" />
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={copyText}>
            Copy message
          </button>
          <a href={waLink} target="_blank" rel="noopener" className="btn-ghost border border-line">
            Open in WhatsApp
          </a>
          {canShareFiles && (
            <button className="btn-ghost border border-line" onClick={shareBoth} disabled={busy}>
              Share message + flyer…
            </button>
          )}
        </div>
        <p className="text-xs text-ink/50">
          Order link in the message: <span className="font-mono">{orderUrl}</span>
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Flyer</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={flyerUrl} alt="Flyer preview" className="w-full rounded-xl border border-line bg-char" />
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={copyFlyer} disabled={busy}>
            {busy ? "Working..." : "Copy flyer"}
          </button>
          <button className="btn-ghost border border-line" onClick={downloadFlyer} disabled={busy}>
            Download PNG
          </button>
        </div>
        <p className="text-xs text-ink/50">Regenerates from the current menu and prices every time you open this page.</p>
      </section>

      {status && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-char px-4 py-2 text-sm text-white shadow-lg">{status}</div>
      )}
    </div>
  );
}
