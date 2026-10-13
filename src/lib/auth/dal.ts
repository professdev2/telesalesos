import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type OrgRole = "owner" | "admin" | "member";

export type SessionUser = {
  id: string;
  email: string | null;
  fullName: string | null;
};

export type CurrentUser = SessionUser & {
  mfaRequired: boolean;
};

/**
 * Reads the session and validates the access token.
 *
 * `getClaims()` verifies the JWT signature rather than trusting the cookie, so
 * it is safe to authorize on. `getSession()` is not — it returns whatever is in
 * the cookie without verification.
 *
 * Cached per render pass so several components can call it without repeating
 * the work.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return null;
  }

  const claims = data.claims;
  const metadata = (claims.user_metadata ?? {}) as { full_name?: string };

  return {
    id: claims.sub,
    email: claims.email ?? null,
    fullName: metadata.full_name ?? null,
  };
});

/**
 * Authorization gate for protected routes, server actions, and route handlers.
 *
 * Call this before reading data rather than relying on the proxy. The proxy
 * check is optimistic and can be bypassed; this one cannot.
 */
export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

/** Session plus the profile row and security flags. Organization-independent. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;

  const supabase = await createClient();

  const [profileResult, securityResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", sessionUser.id)
      .maybeSingle(),
    supabase
      .from("user_security_settings")
      .select("mfa_required")
      .eq("user_id", sessionUser.id)
      .maybeSingle(),
  ]);

  return {
    ...sessionUser,
    fullName: profileResult.data?.full_name ?? sessionUser.fullName,
    mfaRequired: securityResult.data?.mfa_required ?? false,
  };
});

/** Same as `getCurrentUser`, but redirects to login instead of returning null. */
export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

const ROLE_RANK: Record<OrgRole, number> = { member: 0, admin: 1, owner: 2 };

/**
 * Role comparison lives here so screens never compare role strings inline.
 *
 * The schema defines three roles, but the product roadmap calls for eight plus
 * teams and state licensing. Routing every check through this helper keeps that
 * eventual change out of the UI.
 */
export function hasAtLeastRole(role: OrgRole, minimum: OrgRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
