import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Landing spot for emailed auth links (password reset). Trades the link for a session, then moves on. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const rawNext = searchParams.get("next") ?? "/admin";
  const next = rawNext.startsWith("/admin") ? rawNext : "/admin";
  const supabase = await createClient();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error("missing code") };

  if (error) return NextResponse.redirect(`${origin}/admin/login?error=link`);
  return NextResponse.redirect(`${origin}${next}`);
}
