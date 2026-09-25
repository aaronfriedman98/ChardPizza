"use client";

import { useActionState } from "react";
import type { AdminUser } from "@/lib/types";
import { FormMessage, SubmitButton } from "@/components/ui/form-status";
import { changePassword, updateDisplayName } from "../actions";

export function AccountForms({ admin }: { admin: AdminUser }) {
  const [nameState, nameAction] = useActionState(updateDisplayName, undefined);
  const [pwState, pwAction] = useActionState(changePassword, undefined);

  return (
    <div className="space-y-5">
      <form action={nameAction} className="card space-y-4">
        <h2 className="text-lg font-bold">Your name</h2>
        <label className="block">
          <span className="label">Shown in the admin and audit history</span>
          <input name="display_name" defaultValue={admin.display_name} className="input" required />
        </label>
        <div className="flex items-center gap-3">
          <SubmitButton>Save</SubmitButton>
          <FormMessage state={nameState} />
        </div>
      </form>

      <form action={pwAction} className="card space-y-4">
        <h2 className="text-lg font-bold">Change password</h2>
        <label className="block">
          <span className="label">New password</span>
          <input name="password" type="password" autoComplete="new-password" minLength={8} className="input" required />
        </label>
        <label className="block">
          <span className="label">Confirm new password</span>
          <input name="confirm" type="password" autoComplete="new-password" minLength={8} className="input" required />
        </label>
        <div className="flex items-center gap-3">
          <SubmitButton>Update password</SubmitButton>
          <FormMessage state={pwState} />
        </div>
      </form>
    </div>
  );
}
