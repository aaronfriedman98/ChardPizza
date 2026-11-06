"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createHash, timingSafeEqual } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

function samePassword(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function signIn(_prev: { error?: string } | undefined, formData: FormData) {
  // Simple mode: one shared password kept in Netlify (ADMIN_PASSWORD). It signs in as the owner account.
  const shared = process.env.ADMIN_PASSWORD;
  if (shared) {
    const password = String(formData.get("password") ?? "");
    if (!password || !samePassword(password.trim(), shared.trim())) {
      await new Promise((r) => setTimeout(r, 1500)); // slows down guessing
      return { error: "Wrong password." };
    }
    const db = createAdminClient();
    const { data: owner } = await db.from("admin_users").select("email").eq("is_active", true).order("created_at").limit(1).maybeSingle();
    if (!owner?.email) return { error: "No admin account found." };
    // A one-time sign-in token made on the server. Nothing is emailed.
    const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: "magiclink", email: owner.email });
    if (linkErr || !link?.properties?.hashed_token) return { error: "Couldn't sign in. Try again." };
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (error) return { error: "Couldn't sign in. Try again." };
    const raw = String(formData.get("next") ?? "");
    redirect(raw.startsWith("/admin") ? raw : "/admin");
  }

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
