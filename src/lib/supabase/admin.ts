import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service client that bypasses Row Level Security. Server only.
 * Used for public pages, checkout, and housekeeping where no admin is signed in.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key || key.startsWith("paste-")) {
    throw new Error("SUPABASE_SECRET_KEY is not set in .env.local");
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
