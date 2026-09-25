"use client";

import { useState, useTransition } from "react";
import type { MessageTemplate } from "@/lib/messages";
import { Switch } from "@/components/ui/switch";
import { saveTemplate } from "@/app/admin/orders/message-actions";

const PLACEHOLDERS = "{{first_name}} {{name}} {{order_number}} {{pickup_time}} {{items}} {{total}} {{payment_instructions}} {{pickup_address}} {{order_link}} {{business_name}} {{eta_minutes}}";

export function TemplatesEditor({ templates }: { templates: MessageTemplate[] }) {
  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-ink/60">
        The Message button on an order card opens WhatsApp with one of these filled in. Placeholders: <span className="font-mono text-xs">{PLACEHOLDERS}</span>
      </p>
      {templates.map((t) => (
        <TemplateRow key={t.key} template={t} />
      ))}
    </div>
  );
}

function TemplateRow({ template: t }: { template: MessageTemplate }) {
  const [name, setName] = useState(t.name);
  const [body, setBody] = useState(t.body);
  const [subject, setSubject] = useState(t.subject ?? "");
  const [active, setActive] = useState(t.is_active);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = name !== t.name || body !== t.body || subject !== (t.subject ?? "") || active !== t.is_active;

  return (
    <section className={`card space-y-2 ${active ? "" : "opacity-70"}`}>
      <div className="flex items-center justify-between gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} className="font-bold outline-none focus:text-ember" aria-label="Template name" />
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-ink/60">{t.channel}</span>
          <Switch checked={active} onChange={setActive} label={`${t.name} active`} />
        </div>
      </div>
      {t.channel === "email" && <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input text-sm" placeholder="Email subject" />}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={t.channel === "email" ? 4 : 3} className="input text-sm" />
      <div className="flex items-center gap-3">
        <button
          disabled={!dirty || pending}
          className="btn-primary py-1.5 text-sm"
          onClick={() =>
            startTransition(async () => {
              const r = await saveTemplate({ key: t.key, name, body, subject: t.channel === "email" ? subject : null, is_active: active });
              setMsg(r.error ?? r.ok ?? null);
              setTimeout(() => setMsg(null), 2000);
            })
          }
        >
          Save
        </button>
        {msg && <span className="text-sm text-ink/60">{msg}</span>}
      </div>
    </section>
  );
}
