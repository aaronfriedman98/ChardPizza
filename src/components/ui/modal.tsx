"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || !mounted) return null;
  // Portalled to <body> so no animated/transformed ancestor can move it. On phones it sits near the
  // top so the first field stays above the keyboard.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto px-3 pt-[max(12px,env(safe-area-inset-top))] pb-3 sm:p-6">
      <div className="fixed inset-0 bg-char/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative w-full sm:max-w-lg max-h-[calc(100dvh-24px)] overflow-y-auto rounded-2xl bg-white p-5 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost -mr-2" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
