import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { pathAfterPasswordLogin } from "@/lib/auth/mfa";
import { safeRedirectPath } from "@/lib/auth/safe-path";

/**
 * Landing point for Supabase email links that use the default
 * `{{ .ConfirmationURL }}` template — signup confirmation, password recovery,
 * and magic links all arrive here with a PKCE `code`.
 *
 * The code verifier is a cookie set when the email was requested, so the link
 * must be opened in the same browser. `/auth/confirm` handles the token-hash
 * templates, which do not have that constraint.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), "/dashboard", origin);

  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");

  if (providerError) {
    const reason = searchParams.get("flow") === "oauth" ? "oauth_failed" : "link_rejected";
    return fail(origin, reason, providerError);
  }

  if (!code) {
    return fail(origin, "missing_code");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // A missing verifier means the link was opened in a different browser than
    // the one that requested it, which is a different fix for the user than an
    // expired link.
    const reason = error.message.includes("code verifier")
      ? "wrong_browser"
      : "exchange_failed";
    return fail(origin, reason, error.message);
  }

  // OAuth sign-in is AAL1 like a password login, so it takes the same route
  // through enroll/challenge. Email links keep their own `next` because the
  // recovery screens verify the authenticator themselves.
  if (searchParams.get("flow") === "oauth") {
    return NextResponse.redirect(`${origin}${await pathAfterPasswordLogin(next)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

/**
 * Provider messages stay in the server log. Putting them in the query string
 * would expose auth internals in browser history and referrer headers.
 */
function fail(origin: string, reason: string, detail?: string) {
  if (detail) {
    console.error(`auth/callback ${reason}: ${detail}`);
  }
  return NextResponse.redirect(`${origin}/auth-error?reason=${reason}`);
}
