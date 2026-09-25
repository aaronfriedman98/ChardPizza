"use client";

import { useActionState } from "react";
import type { Service } from "@/lib/types";
import { isoToZonedParts } from "@/lib/time";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { createService, updateBasics } from "./actions";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/50">{hint}</span>}
    </label>
  );
}

export function BasicsForm({ service, tz, hasOrders }: { service: Service | null; tz: string; hasOrders?: boolean }) {
  const [state, action] = useActionState(service ? updateBasics : createService, undefined);
  const start = isoToZonedParts(service?.starts_at ?? null, tz);
  const end = isoToZonedParts(service?.ends_at ?? null, tz);
  const opens = isoToZonedParts(service?.ordering_opens_at ?? null, tz);
  const closes = isoToZonedParts(service?.ordering_closes_at ?? null, tz);

  return (
    <form action={action} className="card space-y-5 max-w-2xl">
      {service && <input type="hidden" name="id" value={service.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Service name" hint="Customers see this. Something like Saturday Night Pizza or Sunday Pop-Up.">
          <input name="name" defaultValue={service?.name ?? ""} className="input" placeholder="Saturday Night Pizza" required autoFocus />
        </Field>
        <Field label="Date">
          <input name="service_date" type="date" defaultValue={service?.service_date ?? ""} className="input" required />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="label">Service hours (pickup window)</legend>
        <div className="grid grid-cols-2 gap-4">
          <input name="start_time" type="time" step={300} defaultValue={start.time} className="input" required aria-label="Start time" />
          <input name="end_time" type="time" step={300} defaultValue={end.time} className="input" required aria-label="End time" />
        </div>
        {hasOrders && <p className="text-xs text-amber-700">Orders exist, so hours are locked. Block or edit individual slots instead.</p>}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="label">Ordering opens</legend>
        <div className="grid grid-cols-2 gap-4">
          <input name="opens_date" type="date" defaultValue={opens.date} className="input" aria-label="Opens date" />
          <input name="opens_time" type="time" step={300} defaultValue={opens.time} className="input" aria-label="Opens time" />
        </div>
        <p className="text-xs text-ink/50">Leave blank to open as soon as the service is published.</p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="label">Ordering closes</legend>
        <div className="grid grid-cols-2 gap-4">
          <input name="closes_date" type="date" defaultValue={closes.date} className="input" aria-label="Closes date" />
          <input name="closes_time" type="time" step={300} defaultValue={closes.time} className="input" aria-label="Closes time" />
        </div>
        <p className="text-xs text-ink/50">Leave blank to keep ordering open until the service ends. You can always close it with one tap.</p>
      </fieldset>

      <Field label="Internal notes (optional)">
        <textarea name="notes" defaultValue={service?.notes ?? ""} rows={2} className="input" />
      </Field>

      <div className="flex items-center gap-3">
        <SubmitButton>{service ? "Save basics" : "Create draft and continue"}</SubmitButton>
        <FormMessage state={state} />
      </div>
      <p className="text-xs text-ink/50">Times are in {tz.replace("_", " ")}.</p>
    </form>
  );
}
