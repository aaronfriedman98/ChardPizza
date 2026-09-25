"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import type { DeliveryZone } from "@/lib/types";
import { centsToDollarsInput, formatCents } from "@/lib/format";
import { Switch, SwitchField } from "@/components/ui/switch";
import { Modal } from "@/components/ui/modal";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { deleteZone, reorderZones, saveZone, setZoneActive } from "../actions";

export function ZonesEditor({ zones }: { zones: DeliveryZone[] }) {
  const [editing, setEditing] = useState<DeliveryZone | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function move(index: number, dir: -1 | 1) {
    const next = [...zones];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    startTransition(async () => {
      const r = await reorderZones(next.map((z) => z.id));
      if (r.error) setMessage(r.error);
    });
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink/60">
          Zones a customer can pick when delivery is on for a service. Fee is added to the order automatically.
        </p>
        <button className="btn-primary shrink-0" onClick={() => setEditing("new")}>
          + Add zone
        </button>
      </div>

      {message && (
        <p className="text-sm rounded-xl bg-red-50 text-red-700 px-3 py-2" onClick={() => setMessage(null)}>
          {message}
        </p>
      )}

      <div className="card divide-y divide-line p-0">
        {zones.length === 0 && <p className="p-5 text-ink/60">No zones yet.</p>}
        {zones.map((z, i) => (
          <div key={z.id} className={`flex items-center gap-3 p-4 ${z.is_active ? "" : "opacity-60"}`}>
            <div className="flex flex-col text-ink/40">
              <button onClick={() => move(i, -1)} disabled={pending || i === 0} className="leading-none px-1 disabled:opacity-30" aria-label="Move up">▲</button>
              <button onClick={() => move(i, 1)} disabled={pending || i === zones.length - 1} className="leading-none px-1 disabled:opacity-30" aria-label="Move down">▼</button>
            </div>
            <button className="flex-1 text-left min-w-0" onClick={() => setEditing(z)}>
              <div className="font-semibold">
                {z.name} <span className="text-ember ml-1">{formatCents(z.fee_cents)}</span>
              </div>
              {z.description && <div className="text-sm text-ink/60 truncate">{z.description}</div>}
            </button>
            <Switch
              checked={z.is_active}
              label={`${z.name} active`}
              onChange={(v) =>
                startTransition(async () => {
                  const r = await setZoneActive(z.id, v);
                  if (r.error) setMessage(r.error);
                })
              }
            />
          </div>
        ))}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add zone" : "Edit zone"}>
        {editing !== null && (
          <ZoneForm
            zone={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
            onError={setMessage}
          />
        )}
      </Modal>
    </div>
  );
}

function ZoneForm({ zone, onDone, onError }: { zone: DeliveryZone | null; onDone: () => void; onError: (m: string) => void }) {
  const [state, action] = useActionState(saveZone, undefined);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={zone?.id ?? ""} />
      <label className="block">
        <span className="label">Zone name</span>
        <input name="name" defaultValue={zone?.name ?? ""} className="input" required autoFocus />
      </label>
      <label className="block">
        <span className="label">Delivery fee ($)</span>
        <input name="fee" inputMode="decimal" defaultValue={zone ? centsToDollarsInput(zone.fee_cents) : ""} className="input" placeholder="5.00" />
      </label>
      <label className="block">
        <span className="label">Description (optional)</span>
        <input name="description" defaultValue={zone?.description ?? ""} className="input" placeholder="e.g. Between 9 Mile and 12 Mile" />
      </label>
      <SwitchField name="is_active" defaultChecked={zone?.is_active ?? true} label="Active" hint="Inactive zones are hidden from customers." />
      <FormMessage state={state} />
      <div className="flex items-center justify-between gap-3 pt-2">
        {zone ? (
          <button
            type="button"
            disabled={pending}
            className="btn-ghost text-red-700"
            onClick={() => {
              if (!confirm(`Delete ${zone.name}?`)) return;
              startTransition(async () => {
                const r = await deleteZone(zone.id);
                if (r.error) onError(r.error);
                onDone();
              });
            }}
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <SubmitButton>{zone ? "Save" : "Add zone"}</SubmitButton>
      </div>
    </form>
  );
}
