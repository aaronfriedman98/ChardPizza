"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function signIn(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: "That email and password did not match." };

  const next = parsed.data.next?.startsWith("/admin") ? parsed.data.next : "/admin";
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

const resetSchema = z.object({ email: z.string().trim().email() });

/** Emails a one-time link that signs the admin in and lands on Account to set a new password. */
export async function requestPasswordReset(_prev: { error?: string; ok?: string } | undefined, formData: FormData) {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter the email you sign in with." };

  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/admin/auth/confirm?next=/admin/settings/account?reset=1`,
  });
  // Same answer whether or not the email exists, so the form can't be used to probe for admins.
  if (error && !/not found|invalid/i.test(error.message)) {
    return { error: /rate|seconds/i.test(error.message) ? "Too many tries. Wait a minute and try again." : error.message };
  }
  return { ok: "If that email has an admin account, a reset link is on its way. Open it on this device." };
}
