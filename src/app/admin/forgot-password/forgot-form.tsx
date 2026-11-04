"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "../login/actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="card space-y-4">
      <p className="text-sm text-ink/60">We&rsquo;ll email you a link. It signs you in and takes you straight to setting a new password.</p>
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" autoComplete="email" required className="input" />
      </label>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">{state.ok}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Sending..." : "Email me a reset link"}
      </button>
    </form>
  );
}
