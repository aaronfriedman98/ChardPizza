"use client";

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        checked ? "bg-ember" : "bg-ink/20"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

/** Hidden input companion so a Switch can post inside a plain <form>. */
export function SwitchField({
  name,
  defaultChecked,
  label,
  hint,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <SwitchFieldInner name={name} defaultChecked={defaultChecked} label={label} hint={hint} />
  );
}

import { useState } from "react";
function SwitchFieldInner({
  name,
  defaultChecked,
  label,
  hint,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
  hint?: string;
}) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <div className="font-medium">{label}</div>
        {hint && <div className="text-sm text-ink/60">{hint}</div>}
      </div>
      <input type="hidden" name={name} value={on ? "on" : "off"} />
      <Switch checked={on} onChange={setOn} label={label} />
    </div>
  );
}
