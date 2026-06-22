import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { TRUST_COOKIE, verifyTrustToken } from "@/lib/mfa-trust";

/** Routes that an unauthenticated visitor is allowed to reach. */
const PUBLIC_ROUTES = ["/login", "/auth"];

/** True when this browser holds a valid, unexpired trust cookie for the user. */
async function isTrustedDevice(
  request: NextRequest,
  uid: string,
): Promise<boolean> {
  const token = request.cookies.get(TRUST_COOKIE)?.value;
  const secret = process.env.MFA_TRUST_SECRET;
  if (!token || !secret) return false;
  return verifyTrustToken(token, uid, secret);
}

/**
 * Refreshes the Supabase auth session on every request and redirects
 * unauthenticated users to /login for any non-public route.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run logic between client creation and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // API routes enforce their own auth and return JSON (401) rather than being
  // redirected to an HTML login page.
  if (pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  const isPublic = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // MFA gate: a verified factor makes a password-only session aal1 with a
  // nextLevel of aal2. Force it through /mfa before any protected page — unless
  // this device is trusted. Public routes (e.g. /auth/signout) are never
  // trapped, so the user always has a way out.
  if (user) {
    const { data: aal } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const mfaPending =
      aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2";
    const trusted = mfaPending && (await isTrustedDevice(request, user.id));

    if (mfaPending && !trusted && !isPublic && pathname !== "/mfa") {
      const url = request.nextUrl.clone();
      url.pathname = "/mfa";
      return NextResponse.redirect(url);
    }
    if ((!mfaPending || trusted) && pathname === "/mfa") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  // Signed-in users shouldn't sit on the login page.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
