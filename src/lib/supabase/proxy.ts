import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Prefixes that never require a session. Everything else is gated. */
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/recover-mfa",
  "/verify-email",
  "/auth-error",
  "/auth/callback",
  "/auth/confirm",
  "/invite",
  // Website / Typeform webhooks — auth is the query secret, not a session.
  "/api/inbound",
  // Stripe billing webhooks — verified by Stripe-Signature header.
  "/api/stripe",
];

/** Signed-in users are bounced away from these — they have nothing to offer. */
const SIGNED_IN_REDIRECTS = ["/login", "/signup", "/forgot-password", "/verify-email"];

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;

  // Redirects below are an optimistic filter, not the security boundary. They
  // keep signed-out users from loading protected shells, but every page and
  // action still verifies the session through the DAL, because the proxy can be
  // bypassed and does not run on Server Action POSTs to already-rendered pages.
  if (!isSignedIn && !matches(pathname, PUBLIC_PREFIXES) && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Preserve the destination, but only as a path — never a full URL, which
    // would let a crafted link redirect through us to another origin.
    if (pathname !== "/dashboard") {
      url.searchParams.set("next", pathname);
    }
    return copyCookies(NextResponse.redirect(url), supabaseResponse);
  }

  // /reset-password is deliberately absent from this list: a user who followed a
  // recovery link is signed in by the time they reach it.
  if (isSignedIn && matches(pathname, SIGNED_IN_REDIRECTS)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return copyCookies(NextResponse.redirect(url), supabaseResponse);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}

/**
 * Carries refreshed auth cookies onto a redirect. Dropping them logs the user
 * out at the moment their token rotates.
 */
function copyCookies(response: NextResponse, source: NextResponse): NextResponse {
  source.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  return response;
}
