"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";

/**
 * Feedback for admin actions: a top progress bar, buttons that show they are working,
 * and toasts. Nothing here blanks the screen — the old content stays put until the
 * new content is ready, so the page never blinks.
 */

// ---------------------------------------------------------------------------
// A tiny global "something is in flight" store. Server components can't hold
// context, so this is a module-level counter any client component can bump.
// ---------------------------------------------------------------------------
let busyCount = 0;
const busyListeners = new Set<(n: number) => void>();
function emitBusy() {
  for (const fn of busyListeners) fn(busyCount);
}
export function beginBusy() {
  busyCount += 1;
  emitBusy();
}
export function endBusy() {
  busyCount = Math.max(0, busyCount - 1);
  emitBusy();
}
function subscribeBusy(fn: (n: number) => void) {
  busyListeners.add(fn);
  fn(busyCount);
  return () => void busyListeners.delete(fn);
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
type Toast = { id: number; text: string; tone: "ok" | "error" };
let toastSeq = 0;
const toastListeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];
function emitToasts() {
  for (const fn of toastListeners) fn(toasts);
}
export function toast(text: string, tone: "ok" | "error" = "ok") {
  const t = { id: ++toastSeq, text, tone };
  toasts = [...toasts, t];
  emitToasts();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emitToasts();
  }, tone === "error" ? 6000 : 3000);
}

export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    toastListeners.add(setList);
    setList(toasts);
    return () => void toastListeners.delete(setList);
  }, []);
  if (list.length === 0) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.tone === "error" ? "toast-error" : ""}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top progress bar: rises while anything is in flight, finishes when it settles.
// ---------------------------------------------------------------------------
export function AdminProgress() {
  const [busy, setBusy] = useState(0);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeBusy(setBusy), []);

  useEffect(() => {
    if (busy > 0) {
      if (hide.current) clearTimeout(hide.current);
      setVisible(true);
      setWidth(12);
      // Creep toward 90% so it always looks like progress, never completion.
      timer.current = setInterval(() => setWidth((w) => (w < 90 ? w + (90 - w) * 0.14 : w)), 180);
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }
    if (timer.current) clearInterval(timer.current);
    setWidth(100);
    hide.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 320);
    return () => {
      if (hide.current) clearTimeout(hide.current);
    };
  }, [busy]);

  return <div className="admin-progress" data-on={visible ? "true" : "false"} style={{ width: `${width}%` }} aria-hidden="true" />;
}

/** Marks the app busy for as long as a route transition is running. */
function LinkBusy() {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) return;
    beginBusy();
    return endBusy;
  }, [pending]);
  return pending ? <Spinner className="nav-spinner" /> : null;
}

/** A nav link that shows a spinner on itself while the next page loads. */
export function BusyLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={className} prefetch>
      {children}
      <LinkBusy />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`spinner ${className}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Button that runs a server action and shows that it is working.
// The label keeps its place, so nothing jumps.
// ---------------------------------------------------------------------------
export function BusyButton({
  onAction,
  children,
  className = "",
  confirm,
  disabled,
  title,
  success,
  type = "button",
  "aria-label": ariaLabel,
}: {
  onAction: () => Promise<{ error?: string; ok?: string } | void>;
  children: ReactNode;
  className?: string;
  /** Ask before running. */
  confirm?: string;
  disabled?: boolean;
  title?: string;
  /** Toast shown when the action comes back clean. */
  success?: string;
  type?: "button" | "submit";
  "aria-label"?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function click() {
    if (confirm && !window.confirm(confirm)) return;
    beginBusy();
    startTransition(async () => {
      try {
        const r = await onAction();
        if (r && "error" in r && r.error) {
          toast(r.error, "error");
        } else {
          setDone(true);
          setTimeout(() => setDone(false), 900);
          if (success) toast(success);
        }
      } catch {
        toast("That didn't go through. Try again.", "error");
      } finally {
        endBusy();
      }
    });
  }

  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      aria-busy={pending}
      disabled={disabled || pending}
      onClick={click}
      className={`busy-btn ${className} ${done ? "busy-done" : ""}`}
    >
      <span className="busy-label">{children}</span>
      {pending && <Spinner className="busy-spinner" />}
    </button>
  );
}

/** Submit button for plain <form action={serverAction}> usage. */
export function BusySubmit({ children, className = "btn-primary", pending }: { children: ReactNode; className?: string; pending: boolean }) {
  useEffect(() => {
    if (!pending) return;
    beginBusy();
    return endBusy;
  }, [pending]);
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`busy-btn ${className}`}>
      <span className="busy-label">{children}</span>
      {pending && <Spinner className="busy-spinner" />}
    </button>
  );
}

/**
 * Fades page content back in after a route change, so a new screen arrives
 * rather than snapping. Keyed on the path.
 */
export function PageFade({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-fade">
      {children}
    </div>
  );
}

/**
 * Drop-in for React's useTransition that also lights the top progress bar for
 * the life of the transition. Every admin action uses this.
 */
export function useBusyTransition(): [boolean, (fn: () => void | Promise<void>) => void] {
  const [pending, start] = useTransition();
  const startBusy = useCallback(
    (fn: () => void | Promise<void>) => {
      beginBusy();
      start(async () => {
        try {
          await fn();
        } finally {
          endBusy();
        }
      });
    },
    [start],
  );
  return [pending, startBusy];
}
