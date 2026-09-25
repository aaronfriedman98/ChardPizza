"use client";

import { useState, useTransition } from "react";
import { addNote } from "../actions";

export function NoteForm({ orderId }: { orderId: string }) {
  const [body, setBody] = useState("");
  const [customerFacing, setCustomerFacing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await addNote(orderId, { body, is_customer_facing: customerFacing });
          if (r.error) setError(r.error);
          else setBody("");
        });
      }}
    >
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} className="input" placeholder="Add a note, e.g. paid cash to Aaron, wants well done" />
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-ink/60">
          <input type="checkbox" checked={customerFacing} onChange={(e) => setCustomerFacing(e.target.checked)} className="accent-[var(--ember)]" />
          Customer can see this
        </label>
        <button className="btn-primary py-1.5 text-sm" disabled={pending || !body.trim()}>
          {pending ? "Saving..." : "Add note"}
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </form>
  );
}
