"use client";

import { useTransition } from "react";
import { duplicateService } from "./actions";

export function DuplicateButton({ id, className = "btn-ghost text-sm" }: { id: string; className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      title="Copy this service into a new draft for next week"
      onClick={() =>
        startTransition(async () => {
          const r = await duplicateService(id);
          if (r?.error) alert(r.error);
        })
      }
    >
      {pending ? "Copying..." : "Duplicate"}
    </button>
  );
}
