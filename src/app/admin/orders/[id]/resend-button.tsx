"use client";

import { useState, useTransition } from "react";
import { resendConfirmationEmail } from "../message-actions";

export function ResendButton({ orderId, email }: { orderId: string; email: string | null }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (!email) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <button
        disabled={pending}
        className="text-xs text-ember hover:underline disabled:opacity-50"
        onClick={() =>
          startTransition(async () => {
            const r = await resendConfirmationEmail(orderId);
            setMsg(r.error ?? r.ok ?? null);
          })
        }
      >
        {pending ? "Sending..." : "Resend confirmation email"}
      </button>
      {msg && <span className="text-xs text-ink/60">{msg}</span>}
    </span>
  );
}
