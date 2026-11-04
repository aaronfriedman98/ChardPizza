"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm({ next, linkFailed }: { next?: string; linkFailed?: boolean }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="card space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" autoComplete="email" required className="input" />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="input" />
      </label>
      {linkFailed && !state?.error && <p className="text-sm text-red-700">That reset link expired or was opened on a different device. Ask for a new one.</p>}
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Signing in..." : "Sign in"}
      </button>
      <Link href="/admin/forgot-password" className="block text-center text-sm text-ink/60 hover:text-ink">
        Forgot password?
      </Link>
    </form>
  );
}
