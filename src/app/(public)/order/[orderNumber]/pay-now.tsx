"use client";

import { useState, useTransition } from "react";
import { resumeCardPayment } from "../actions";

export function PayNow({ orderNumber, token }: { orderNumber: string; token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3 space-y-2">
      <button
        className="btn-amber w-full sm:w-auto px-7"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await resumeCardPayment(orderNumber, token);
            if (r?.error) setError(r.error);
          })
        }
      >
        {pending ? "Opening secure payment…" : "Pay now"}
      </button>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
