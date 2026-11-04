import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SEEN_COOKIE = "chard_admin_seen";
const IDLE_LIMIT_MS = 21 * 24 * 60 * 60 * 1000;
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

/** Refreshes the Supabase session cookie and guards /admin routes. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Do not add logic between createServerClient and getUser(); it can cause random logouts.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Stay signed in as long as the admin is opened at least once every 3 weeks.
  if (user) {
    const seen = Number(request.cookies.get(SEEN_COOKIE)?.value);
    if (seen && Date.now() - seen > IDLE_LIMIT_MS) {
      await supabase.auth.signOut({ scope: "local" });
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      const out = NextResponse.redirect(url);
      response.cookies.getAll().forEach((c) => out.cookies.set(c));
      out.cookies.delete(SEEN_COOKIE);
      return out;
    }
    // Re-save the login cookies from the server on every visit. Safari cuts cookies written by
    // page scripts (the browser client's token refresh) to 7 days; server-set ones keep the full life.
    request.cookies.getAll().forEach((c) => {
      if (c.name.startsWith("sb-") && !response.cookies.get(c.name)) {
        response.cookies.set(c.name, c.value, { path: "/", sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: COOKIE_MAX_AGE });
      }
    });
    response.cookies.set(SEEN_COOKIE, String(Date.now()), { path: "/", sameSite: "lax", httpOnly: true, secure: request.nextUrl.protocol === "https:", maxAge: COOKIE_MAX_AGE });
  }

  const isAdminRoute = pathname.startsWith("/admin");
  const isLogin = pathname === "/admin/login";
  // Signed-out pages: sign in, ask for a reset link, and the link's landing route.
  const isPublic = isLogin || pathname === "/admin/forgot-password" || pathname.startsWith("/admin/auth/");

  if (isAdminRoute && !isPublic && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (isLogin && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Admin pages should never be indexed.
  response.headers.set("x-robots-tag", "noindex");
  return response;
}
