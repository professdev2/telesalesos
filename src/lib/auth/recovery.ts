import "server-only";

import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { clearEmailMfaCookie } from "@/lib/auth/email-mfa";
import {
  clearTrustedDeviceCookie,
  revokeAllTrustedDevices,
} from "@/lib/auth/trusted-device";

export const MFA_RECOVERY_COOKIE = "__Host-tos-mrec";

function cookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60,
  };
}

export async function markMfaRecoveryRequest(): Promise<void> {
  (await cookies()).set(MFA_RECOVERY_COOKIE, "1", cookieOptions());
}

export async function hasMfaRecoveryRequest(): Promise<boolean> {
  return (await cookies()).get(MFA_RECOVERY_COOKIE)?.value === "1";
}

export async function clearMfaRecoveryRequest(): Promise<void> {
  (await cookies()).set(MFA_RECOVERY_COOKIE, "", {
    ...cookieOptions(),
    maxAge: 0,
  });
}

export function claimsIncludeRecovery(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;
  const amr = (claims as { amr?: unknown }).amr;
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    if (entry === "recovery") return true;
    if (entry && typeof entry === "object" && "method" in entry) {
      return (entry as { method?: string }).method === "recovery";
    }
    return false;
  });
}

export async function unenrollAllTotpFactors(userId: string): Promise<{
  ok: boolean;
  message?: string;
}> {
  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      message:
        "Recovery cannot finish (SUPABASE_SECRET_KEY is not set on the server).",
    };
  }

  const listed = await admin.auth.admin.mfa.listFactors({ userId });
  if (listed.error) {
    console.error("admin listFactors failed", listed.error.message);
    return { ok: false, message: "Could not load authenticators for recovery." };
  }

  const payload = listed.data as
    | { factors?: Array<{ id: string; factor_type?: string }> }
    | { totp?: Array<{ id: string; factor_type?: string }> }
    | null;
  const factors = payload && "factors" in payload
    ? payload.factors ?? []
    : payload && "totp" in payload
      ? payload.totp ?? []
      : [];
  const totp = factors.filter((factor) => (factor.factor_type ?? "totp") === "totp");

  for (const factor of totp) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId,
    });
    if (error) {
      console.error("admin deleteFactor failed", error.message);
      return { ok: false, message: "Could not remove the authenticator." };
    }
  }

  return { ok: true };
}

export async function finishMfaRecovery(userId: string): Promise<{
  ok: boolean;
  message?: string;
}> {
  const unenrolled = await unenrollAllTotpFactors(userId);
  if (!unenrolled.ok) return unenrolled;

  const supabase = await createClient();
  await supabase.rpc("clear_email_mfa_state");
  await revokeAllTrustedDevices("factor_change");
  await clearEmailMfaCookie();
  await clearTrustedDeviceCookie();
  await clearMfaRecoveryRequest();

  const { error: auditError } = await supabase.rpc("record_security_audit_event", {
    p_action: "mfa.recovery",
    p_metadata: { method: "email" },
  });
  if (auditError) {
    console.error("mfa.recovery audit failed", auditError.message);
  }

  return { ok: true };
}
