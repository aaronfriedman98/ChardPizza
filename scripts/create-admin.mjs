// Creates an admin login. Usage: node scripts/create-admin.mjs <email> "<Display Name>"
// Prints a temporary password once. Uses the secret key from .env.local (server side only).
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const [email, displayName] = process.argv.slice(2);
if (!email || !displayName) {
  console.error('Usage: node scripts/create-admin.mjs <email> "<Display Name>"');
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const password = randomBytes(9).toString("base64url");
const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name: displayName },
});
if (error) {
  console.error("Could not create auth user:", error.message);
  process.exit(1);
}

const { error: profileError } = await supabase
  .from("admin_users")
  .upsert({ id: data.user.id, email, display_name: displayName, role: "owner", is_partner: true });
if (profileError) {
  console.error("Auth user created but admin profile failed:", profileError.message);
  process.exit(1);
}

console.log(`Admin created: ${displayName} <${email}>`);
console.log(`Temporary password: ${password}`);
