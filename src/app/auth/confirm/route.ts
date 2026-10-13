import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/safe-path";

/**
 * Landing point for Supabase email templates rewritten to use `{{ .TokenHash }}`.
 *
 * Unlike the PKCE `code` flow in `/auth/callback`, this works when the link is
 * opened on a different device than the one that requested it — the common case
 * for someone who signs up on a laptop and checks mail on a phone. Switching the
 * templates over is a dashboard change, documented in `docs/auth-setup.md`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get("next"), "/dashboard", origin);

  if (!tokenHash || !type) {
    return fail(origin, "missing_token");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return fail(origin, "otp_expired", error.message);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

/**
 * Provider messages stay in the server log. Putting them in the query string
 * would expose auth internals in browser history and referrer headers.
 */
function fail(origin: string, reason: string, detail?: string) {
  if (detail) {
    console.error(`auth/confirm ${reason}: ${detail}`);
  }
  return NextResponse.redirect(`${origin}/auth-error?reason=${reason}`);
}
