"use client";

import { BusyButton } from "@/components/admin/feedback";
import { signOut } from "./login/actions";

export function SignOutButton() {
  return (
    <BusyButton className="btn-ghost text-sm" onAction={async () => void (await signOut())}>
      Sign out
    </BusyButton>
  );
}
