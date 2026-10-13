"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser, requireCurrentUser } from "@/lib/auth/dal";
import {
  issueEmailMfaSession,
  requestEmailMfaCode,
  verifyEmailMfaCode,
} from "@/lib/auth/email-mfa";
import { getMfaStatus, getVerifiedTotpFactors } from "@/lib/auth/mfa";
import { isMfaPrivileged } from "@/lib/auth/mfa-privilege";
import {
  issueTrustedDeviceCookie,
  revokeAllTrustedDevices,
  revokeTrustedDevice,
  wantsTrustedDevice,
} from "@/lib/auth/trusted-device";
import { requireActiveMembership } from "@/lib/org/active-org";
import { safeRedirectPath } from "@/lib/auth/safe-path";
import {
  emailOtpSchema,
  totpCodeSchema,
  toFieldErrors,
  type AuthFormState,
} from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

function invalid(fieldErrors: Record<string, string[]>): AuthFormState {
  return {
    status: "error",
    message: "Please correct the highlighted fields.",
    fieldErrors,
  };
}

function failure(message: string): AuthFormState {
  return { status: "error", message };
}

async function verifyTotp(factorId: string, code: string): Promise<AuthFormState | null> {
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });

  if (error) {
    return failure("That code was not accepted. Wait for a new code and try again.");
  }

  await supabase.auth.refreshSession();
  return null;
}

export async function verifyTotpEnrollmentAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await getCurrentUser();
  if (!user?.mfaRequired) {
    redirect("/dashboard");
  }

  const parsed = totpCodeSchema.safeParse({
    factorId: formData.get("factorId"),
    code: formData.get("code"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const failed = await verifyTotp(parsed.data.factorId, parsed.data.code);
  if (failed) return failed;

  await revokeAllTrustedDevices("factor_change");

  const supabase = await createClient();
  const { error: auditError } = await supabase.rpc("record_security_audit_event", {
    p_action: "mfa.enrolled",
    p_metadata: {},
  });
  if (auditError) {
    // Enrollment already succeeded in Auth. Do not roll it back for an audit miss.
  }

  if (wantsTrustedDevice(formData)) {
    await issueTrustedDeviceCookie();
  }

  revalidatePath("/", "layout");
  if (formData.get("returnTo") === "/settings/security") {
    redirect("/settings/security");
  }
  redirect(safeRedirectPath(formData.get("next"), "/dashboard"));
}

export async function verifyTotpChallengeAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await getCurrentUser();
  if (!user?.mfaRequired) {
    redirect("/dashboard");
  }

  const parsed = totpCodeSchema.safeParse({
    factorId: formData.get("factorId"),
    code: formData.get("code"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const status = await getMfaStatus();
  if (
    !status.verifiedFactors.some(
      (factor) => factor.id === parsed.data.factorId,
    )
  ) {
    return failure("This authenticator is not registered on the account. Enroll again.");
  }

  const failed = await verifyTotp(parsed.data.factorId, parsed.data.code);
  if (failed) return failed;

  if (wantsTrustedDevice(formData)) {
    await issueTrustedDeviceCookie();
  }

  revalidatePath("/", "layout");
  redirect(safeRedirectPath(formData.get("next"), "/dashboard"));
}

export async function requestEmailMfaAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  void formData;
  const user = await getCurrentUser();
  if (!user?.mfaRequired) {
    redirect("/dashboard");
  }
  if (await isMfaPrivileged()) {
    redirect("/mfa/enroll");
  }
  const totp = await getMfaStatus();
  if (totp.hasVerifiedFactor) {
    redirect("/mfa/challenge");
  }

  const result = await requestEmailMfaCode();
  return result.ok
    ? { status: "success", message: result.message }
    : failure(result.message);
}

export async function verifyEmailMfaAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await getCurrentUser();
  if (!user?.mfaRequired) {
    redirect("/dashboard");
  }
  if (await isMfaPrivileged()) {
    redirect("/mfa/enroll");
  }
  const totp = await getMfaStatus();
  if (totp.hasVerifiedFactor) {
    redirect("/mfa/challenge");
  }

  const parsed = emailOtpSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const ok = await verifyEmailMfaCode(parsed.data.code);
  if (!ok) {
    return failure("That code was not accepted. Request a new one if it has expired.");
  }

  await issueEmailMfaSession();
  if (wantsTrustedDevice(formData)) {
    await issueTrustedDeviceCookie();
  }

  revalidatePath("/", "layout");
  redirect(safeRedirectPath(formData.get("next"), "/dashboard"));
}

/**
 * Removes one verified authenticator owned by the current user.
 *
 * The app layout requires AAL2 before this action can be reached, and the
 * action repeats that check. Privileged users can never remove their final
 * strong factor. A member who removes their final factor is sent to Email OTP
 * because every active member is MFA-required.
 */
export async function removeTotpFactorAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const factorId = formData.get("factorId");
  if (typeof factorId !== "string" || factorId.length < 16) {
    return failure("This authenticator reference is invalid. Reload the page.");
  }

  await requireCurrentUser();
  const status = await getMfaStatus();
  if (status.aal !== "aal2") {
    redirect("/mfa/challenge");
  }

  const factors = await getVerifiedTotpFactors();
  if (!factors.some((factor) => factor.id === factorId)) {
    return failure("This authenticator is not registered on your account.");
  }

  const privileged = await isMfaPrivileged();
  if (privileged && factors.length <= 1) {
    return failure(
      "Owners and admins must keep at least one authenticator. Add another before removing this one.",
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    return failure("Could not remove that authenticator. Please try again.");
  }

  await supabase.rpc("record_security_audit_event", {
    p_action: "mfa.removed",
    p_metadata: { factor_type: "totp" },
  });

  await revokeAllTrustedDevices("factor_change");

  revalidatePath("/", "layout");
  revalidatePath("/settings/security");

  if (factors.length <= 1) {
    redirect(privileged ? "/mfa/enroll" : "/mfa/email");
  }

  return { status: "success", message: "Authenticator removed." };
}

export async function revokeTrustedDeviceAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  await requireActiveMembership();
  const status = await getMfaStatus();
  if (status.aal !== "aal2") {
    redirect("/mfa/challenge");
  }

  const id = formData.get("deviceId");
  if (typeof id !== "string" || id.length < 16) {
    return failure("This device reference is invalid. Reload the page.");
  }

  const ok = await revokeTrustedDevice(id);
  if (!ok) {
    return failure("Could not revoke that device. It may already be signed out.");
  }

  revalidatePath("/settings/security");
  return { status: "success", message: "This device will need an authenticator code next time." };
}

export async function revokeAllTrustedDevicesAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  void formData;
  await requireActiveMembership();
  const status = await getMfaStatus();
  if (status.aal !== "aal2") {
    redirect("/mfa/challenge");
  }

  await revokeAllTrustedDevices("user");
  revalidatePath("/settings/security");
  return { status: "success", message: "All trusted devices have been signed out." };
}
