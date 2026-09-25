"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "btn-primary" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Saving..." : children}
    </button>
  );
}

export function FormMessage({ state }: { state?: { error?: string; ok?: string } }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p className={`text-sm rounded-xl px-3 py-2 ${state.error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
      {state.error ?? state.ok}
    </p>
  );
}
