"use client";

import { useActionState } from "react";
import type { Settings } from "@/lib/types";
import { formatPhone } from "@/lib/format";
import { SwitchField } from "@/components/ui/switch";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { updateSettings } from "./actions";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {hint && <p className="text-sm text-ink/60">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/50">{hint}</span>}
    </label>
  );
}

export function SettingsForm({ settings: s }: { settings: Settings }) {
  const [state, action] = useActionState(updateSettings, undefined);

  return (
    <form action={action} className="space-y-5 max-w-3xl">
      <Section title="Business">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name">
            <input name="business_name" defaultValue={s.business_name} className="input" required />
          </Field>
          <Field label="Business email">
            <input name="business_email" type="email" defaultValue={s.business_email ?? ""} className="input" />
          </Field>
          <Field label="Business phone" hint="Used for Zelle and, if switched on below, shown on the public site.">
            <input name="business_phone" type="tel" defaultValue={formatPhone(s.business_phone)} className="input" />
          </Field>
          <Field label="Time zone" hint="All service times are entered and shown in this zone.">
            <input name="time_zone" defaultValue={s.time_zone} className="input" />
          </Field>
        </div>
        <SwitchField
          name="show_phone_publicly"
          defaultChecked={s.show_phone_publicly}
          label="Show phone on public site"
          hint="Off keeps your number off the website. Customers still get it in order confirmations if you choose."
        />
        <Field label="About (public site)" hint="A short paragraph for the website. Optional.">
          <textarea name="about_text" defaultValue={s.about_text ?? ""} rows={3} className="input" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp group link">
            <input name="whatsapp_url" type="url" defaultValue={s.whatsapp_url ?? ""} className="input" />
          </Field>
          <Field label="Instagram link">
            <input name="instagram_url" type="url" defaultValue={s.instagram_url ?? ""} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="Pickup">
        <Field label="Pickup address">
          <input name="pickup_address" defaultValue={s.pickup_address ?? ""} className="input" />
        </Field>
        <Field label="Pickup instructions" hint="Shown on the confirmation screen and in the confirmation email.">
          <textarea name="pickup_instructions" defaultValue={s.pickup_instructions ?? ""} rows={2} className="input" />
        </Field>
      </Section>

      <Section title="Zelle" hint="Shown to customers who choose Zelle. Write it exactly as they should read it.">
        <textarea name="zelle_instructions" defaultValue={s.zelle_instructions ?? ""} rows={3} className="input" />
      </Section>

      <Section title="Service defaults" hint="Starting values for new services. Each service can override them.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Default slot length (minutes)">
            <input name="default_slot_minutes" type="number" min={5} max={120} defaultValue={s.default_slot_minutes} className="input" />
          </Field>
          <Field label="Default pizzas per slot">
            <input name="default_slot_capacity" type="number" min={0} max={500} defaultValue={s.default_slot_capacity} className="input" />
          </Field>
        </div>
        <SwitchField
          name="special_instructions_enabled"
          defaultChecked={s.special_instructions_enabled}
          label="Allow special instructions on orders"
          hint="Customers get an optional note field at checkout."
        />
      </Section>

      <Section title="Alerts during service" hint="When the service board starts flagging an order.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Behind: warning (min)">
            <input name="late_warning_minutes" type="number" min={0} max={240} defaultValue={s.late_warning_minutes} className="input" />
          </Field>
          <Field label="Behind: critical (min)">
            <input name="late_critical_minutes" type="number" min={0} max={240} defaultValue={s.late_critical_minutes} className="input" />
          </Field>
          <Field label="Ready, not picked up (min)">
            <input name="ready_uncollected_minutes" type="number" min={0} max={240} defaultValue={s.ready_uncollected_minutes} className="input" />
          </Field>
        </div>
      </Section>

      <Section
        title="Public messages"
        hint="What the website says in each state. {{service_date}} and {{opens_at}} are filled in automatically."
      >
        <Field label="No service scheduled">
          <input name="msg_no_service" defaultValue={s.msg_no_service} className="input" />
        </Field>
        <Field label="Upcoming, ordering not open yet">
          <input name="msg_upcoming" defaultValue={s.msg_upcoming} className="input" />
        </Field>
        <Field label="Paused">
          <input name="msg_paused" defaultValue={s.msg_paused} className="input" />
        </Field>
        <Field label="Sold out">
          <input name="msg_sold_out" defaultValue={s.msg_sold_out} className="input" />
        </Field>
        <Field label="Closed">
          <input name="msg_closed" defaultValue={s.msg_closed} className="input" />
        </Field>
      </Section>

      <div className="sticky bottom-20 md:bottom-4 flex items-center gap-3 rounded-2xl bg-white/95 backdrop-blur border border-line p-3 shadow-lg">
        <SubmitButton>Save settings</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
