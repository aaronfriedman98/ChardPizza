"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchToOfflinePayment } from "../actions";

// Shown under "Pay now" while a card payment is pending: lets the customer finish the order without a card.
export function SwitchPay({ orderNumber, token, zelle, cash, delivery }: { orderNumber: string; token: string; zelle: boolean; cash: boolean; delivery?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!zelle && !cash) return null;
  const go = (method: "zelle" | "cash") =>
    start(async () => {
      setError(null);
      const r = await switchToOfflinePayment(orderNumber, token, method);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  return (
    <div className="mt-4 border-t border-flour/10 pt-3">
      <p className="text-sm text-flour/70">Card not working? Finish your order another way:</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {zelle && (
          <button disabled={pending} onClick={() => go("zelle")} className="border border-goldline px-4 py-2 text-sm font-semibold text-flour hover:border-gold disabled:opacity-50">
            Pay with Zelle instead
          </button>
        )}
        {cash && (
          <button disabled={pending} onClick={() => go("cash")} className="border border-goldline px-4 py-2 text-sm font-semibold text-flour hover:border-gold disabled:opacity-50">
            {delivery ? "Cash on delivery instead" : "Cash at pickup instead"}
          </button>
        )}
      </div>
      {pending && <p className="mt-2 text-sm text-flour/60">Saving…</p>}
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    </div>
  );
}
