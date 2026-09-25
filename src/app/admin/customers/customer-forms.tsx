"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { formatPhone } from "@/lib/format";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { lookupCustomers, mergeCustomers, updateCustomer, type CustomerHit } from "./actions";

export function CustomerForm({ customer }: { customer: { id: string; full_name: string; phone: string; email: string | null; notes: string | null } }) {
  const [state, action] = useActionState(updateCustomer.bind(null, customer.id), undefined);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-bold">Details</h2>
      <label className="block">
        <span className="label">Name</span>
        <input name="full_name" defaultValue={customer.full_name} className="input" required />
      </label>
      <label className="block">
        <span className="label">Phone</span>
        <input name="phone" defaultValue={formatPhone(customer.phone)} className="input" required />
      </label>
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" defaultValue={customer.email ?? ""} className="input" />
      </label>
      <label className="block">
        <span className="label">Internal notes</span>
        <textarea name="notes" defaultValue={customer.notes ?? ""} rows={3} className="input" placeholder="e.g. always well done, lives around the corner" />
      </label>
      <div className="flex items-center gap-3">
        <SubmitButton>Save</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function MergeForm({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (q.trim().length < 3) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => setHits((await lookupCustomers(q)).filter((h) => h.id !== customerId)), 250);
    return () => clearTimeout(t);
  }, [q, customerId]);

  return (
    <section className="card space-y-2">
      <h2 className="font-bold">Merge a duplicate into this record</h2>
      <p className="text-xs text-ink/60">If the same person exists twice (different phone or a typo), pick the duplicate. Its orders move here and it is removed.</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the duplicate by name or phone" className="input" />
      {hits.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          {hits.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>
                <b>{h.full_name}</b> · {formatPhone(h.phone)} · {h.order_count} orders
              </span>
              <button
                disabled={pending}
                className="btn-ghost border border-line text-xs"
                onClick={() => {
                  if (!confirm(`Merge ${h.full_name} into ${customerName}? This cannot be undone.`)) return;
                  startTransition(async () => {
                    const r = await mergeCustomers(customerId, h.id);
                    setMsg(r);
                    setHits([]);
                    setQ("");
                  });
                }}
              >
                Merge
              </button>
            </li>
          ))}
        </ul>
      )}
      <FormMessage state={msg ?? undefined} />
    </section>
  );
}
