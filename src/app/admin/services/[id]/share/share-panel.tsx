"use client";

import { useState } from "react";
import { Spinner, beginBusy, endBusy, toast } from "@/components/admin/feedback";

type Job = "flyer-copy" | "flyer-download" | "share" | null;

export function SharePanel({ serviceId, initialMessage, orderUrl }: { serviceId: string; initialMessage: string; orderUrl: string }) {
  const [message, setMessage] = useState(initialMessage);
  const [job, setJob] = useState<Job>(null);
  const [loaded, setLoaded] = useState(false);
  const flyerUrl = `/flyer/${serviceId}`;
  const canShareFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied.`);
    } catch {
      toast("Could not copy. Select the text and copy it manually.", "error");
    }
  }

  async function withJob(name: Exclude<Job, null>, fn: () => Promise<void>) {
    setJob(name);
    beginBusy();
    try {
      await fn();
    } finally {
      endBusy();
      setJob(null);
    }
  }

  async function fetchFlyer(): Promise<Blob> {
    const res = await fetch(`${flyerUrl}?t=${Date.now()}`);
    if (!res.ok) throw new Error("Flyer failed to render");
    return res.blob();
  }

  const copyFlyer = () =>
    withJob("flyer-copy", async () => {
      try {
        // Safari needs the ClipboardItem built synchronously with a promise inside.
        await navigator.clipboard.write([new ClipboardItem({ "image/png": fetchFlyer() })]);
        toast("Flyer copied. Paste it into WhatsApp.");
      } catch {
        toast("Your browser would not copy the image. Use Download instead.", "error");
      }
    });

  const downloadFlyer = () =>
    withJob("flyer-download", async () => {
      try {
        const blob = await fetchFlyer();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "chard-pizza-flyer.png";
        a.click();
        URL.revokeObjectURL(a.href);
      } catch {
        toast("Flyer failed to render.", "error");
      }
    });

  const shareBoth = () =>
    withJob("share", async () => {
      try {
        const blob = await fetchFlyer();
        const file = new File([blob], "chard-pizza-flyer.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: message });
        else await navigator.share({ text: message });
      } catch {
        /* user cancelled or unsupported */
      }
    });

  const waLink = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const busyLabel = (name: Job, text: string) => (
    <>
      <span className="busy-label">{text}</span>
      {job === name && <Spinner className="busy-spinner" />}
    </>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2 max-w-5xl">
      <div className="space-y-5">
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">WhatsApp message</h2>
            <button className="text-sm text-ink/60 hover:text-ink" onClick={() => setMessage(initialMessage)}>
              Reset
            </button>
          </div>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={15} className="input font-mono text-sm leading-relaxed" />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => copy(message, "Message")}>
              Copy message
            </button>
            <a href={waLink} target="_blank" rel="noopener" className="btn-ghost border border-line">
              Open in WhatsApp
            </a>
            {canShareFiles && (
              <button className="btn-ghost border border-line busy-btn" aria-busy={job === "share"} onClick={shareBoth} disabled={job !== null}>
                {busyLabel("share", "Share message + flyer…")}
              </button>
            )}
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="text-lg font-bold">Order link</h2>
          <div className="flex items-center gap-2">
            <input readOnly value={orderUrl} onFocus={(e) => e.currentTarget.select()} className="input font-mono text-sm flex-1 min-w-0" aria-label="Order link" />
            <button className="btn-primary shrink-0" onClick={() => copy(orderUrl, "Order link")}>
              Copy link
            </button>
          </div>
          <p className="text-xs text-ink/50">Already in the message and on the flyer as a QR code. Copy it on its own for a group bio or a reply.</p>
        </section>
      </div>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Flyer</h2>
        <div className="relative overflow-hidden rounded-xl border border-line bg-char" style={{ aspectRatio: "1080 / 1350" }}>
          {!loaded && <div className="skeleton absolute inset-0" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={flyerUrl}
            alt="Flyer preview"
            onLoad={() => setLoaded(true)}
            className={`h-full w-full transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary busy-btn" aria-busy={job === "flyer-copy"} onClick={copyFlyer} disabled={job !== null}>
            {busyLabel("flyer-copy", "Copy flyer")}
          </button>
          <button className="btn-ghost border border-line busy-btn" aria-busy={job === "flyer-download"} onClick={downloadFlyer} disabled={job !== null}>
            {busyLabel("flyer-download", "Download PNG")}
          </button>
        </div>
        <p className="text-xs text-ink/50">Built fresh from tonight’s menu, prices, and pickup/delivery every time. Shows up to 3 pies, then “+ more”, and a sides line if you have any.</p>
      </section>
    </div>
  );
}
