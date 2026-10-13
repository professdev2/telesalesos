import "server-only";

import { redirect } from "next/navigation";

import { getCurrentUser, requireSession } from "@/lib/auth/dal";
import { hasValidEmailMfaSession } from "@/lib/auth/email-mfa";
import { isMfaPrivileged } from "@/lib/auth/mfa-privilege";
import { withNextParam } from "@/lib/auth/safe-path";
import { hasValidTrustedDevice } from "@/lib/auth/trusted-device";
import { createClient } from "@/lib/supabase/server";

export type TotpFactor = {
  id: string;
  friendlyName: string;
  createdAt: string;
  updatedAt: string;
};

export type MfaStatus = {
  aal: "aal1" | "aal2" | string;
  hasVerifiedFactor: boolean;
  verifiedFactorId: string | null;
  verifiedFactors: TotpFactor[];
};

function toTotpFactor(
  factor: {
    id: string;
    friendly_name?: string;
    created_at: string;
    updated_at: string;
  },
): TotpFactor {
  return {
    id: factor.id,
    friendlyName: factor.friendly_name?.trim() || "Authenticator app",
    createdAt: factor.created_at,
    updatedAt: factor.updated_at,
  };
}

/**
 * Assurance level and verified TOTP factors for the current session.
 *
 * Secrets never leave Supabase Auth. This only reads factor ids and AAL.
 */
export async function getMfaStatus(): Promise<MfaStatus> {
  const supabase = await createClient();
  const [{ data: claimsData }, factors] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.auth.mfa.listFactors(),
  ]);

  const aal = (claimsData?.claims?.aal as string | undefined) ?? "aal1";
  const verified = (factors.data?.totp ?? []).filter((factor) => factor.status === "verified");
  const verifiedFactors = verified.map(toTotpFactor);

  return {
    aal,
    hasVerifiedFactor: verified.length > 0,
    verifiedFactorId: verified[0]?.id ?? null,
    verifiedFactors,
  };
}

/** Verified authenticator factors safe to show in Security settings. */
export async function getVerifiedTotpFactors(): Promise<TotpFactor[]> {
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();

  if (error) {
    throw new Error("Could not load your authenticators.");
  }

  return (data?.totp ?? []).map(toTotpFactor);
}

/**
 * Where a password or Google login should go next.
 *
 * Both are always AAL1. Only privileged users (platform admins and team
 * owners/admins) have MFA required; they must enroll TOTP, then reach AAL2 or
 * present a trusted-device cookie. Google never skips that step.
 */
export async function pathAfterPasswordLogin(fallback: string): Promise<string> {
  const user = await getCurrentUser();
  if (!user?.mfaRequired) return fallback;

  const status = await getMfaStatus();
  if (status.aal === "aal2") return fallback;
  if (await hasValidTrustedDevice()) return fallback;

  const privileged = await isMfaPrivileged();
  if (!privileged && (await hasValidEmailMfaSession())) return fallback;
  if (status.hasVerifiedFactor) return withNextParam("/mfa/challenge", fallback);
  if (privileged) return withNextParam("/mfa/enroll", fallback);
  return withNextParam("/mfa/email", fallback);
}

/**
 * Gate for organization-scoped pages and actions.
 *
 * A flag with no enrollment is not compliance — required users cannot reach
 * `/contacts` (or any other `(app)` route) unless they have AAL2, a hashed
 * trusted-device cookie, or (members only) a hashed Email OTP session cookie.
 */
export async function requireMfaSatisfied(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.mfaRequired) return;

  const status = await getMfaStatus();
  if (status.aal === "aal2") return;
  if (await hasValidTrustedDevice()) return;

  const privileged = await isMfaPrivileged();
  if (!privileged && (await hasValidEmailMfaSession())) return;
  if (status.hasVerifiedFactor) {
    redirect("/mfa/challenge");
  }
  if (privileged) {
    redirect("/mfa/enroll");
  }
  redirect("/mfa/email");
}

/**
 * Discard leftover unverified TOTP factors and enroll a fresh one.
 *
 * The QR and secret are only returned once. Refreshing this page must not
 * accumulate dead factors.
 */
export async function startTotpEnrollment(): Promise<{
  factorId: string;
  qrCode: string | null;
  secret: string | null;
  uri: string | null;
}> {
  await requireSession();
  const supabase = await createClient();
  const listed = await supabase.auth.mfa.listFactors();

  // `totp` / `phone` are verified factors only. Unverified leftovers from a
  // previous enroll attempt sit on `all` and still occupy the friendly name.
  const pending = (listed.data?.all ?? []).filter((factor) => factor.status !== "verified");
  for (const factor of pending) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const friendlyName = `Authenticator ${new Date().toISOString().slice(11, 19)}`;
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
  });

  if (error || !data) {
    throw new Error(error?.message ?? "Could not start authenticator enrollment.");
  }

  return {
    factorId: data.id,
    qrCode: toQrSrc(data.totp.qr_code),
    secret: data.totp.secret ?? null,
    uri: data.totp.uri ?? null,
  };
}

function toQrSrc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("data:") || raw.startsWith("http")) return raw;
  return `data:image/svg+xml;utf-8,${raw}`;
}
