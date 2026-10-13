"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clearEmailMfaCookie } from "@/lib/auth/email-mfa";
import { getMfaStatus, pathAfterPasswordLogin } from "@/lib/auth/mfa";
import {
  clearMfaRecoveryRequest,
  claimsIncludeRecovery,
  finishMfaRecovery,
  hasMfaRecoveryRequest,
  markMfaRecoveryRequest,
} from "@/lib/auth/recovery";
import { isInvitePath, safeRedirectPath } from "@/lib/auth/safe-path";
import { revokeAllTrustedDevices } from "@/lib/auth/trusted-device";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  toFieldErrors,
  totpCodeSchema,
  type AuthFormState,
} from "@/lib/auth/validation";

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

export async function signupAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    organizationName: formData.get("organizationName") ?? undefined,
    accountType: formData.get("accountType") ?? "individual",
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const { email, password, fullName, organizationName, accountType } = parsed.data;
  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const next = safeRedirectPath(formData.get("next"), "/dashboard");
  const invited = isInvitePath(next);

  // The database trigger reads these keys to create the profile, organization,
  // and owner membership. Invitees must not get a personal owner workspace —
  // that would make Email OTP unavailable. Role and platform-admin claims are
  // ignored by the trigger.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      data: {
        full_name: fullName,
        organization_name: invited ? null : (organizationName ?? null),
        account_type: invited ? "individual" : accountType,
        skip_workspace: invited ? "true" : "false",
      },
    },
  });

  if (error) {
    return failure(error.message);
  }

  // Supabase returns a user with an empty identities array when the address is
  // already registered, rather than an error, so that signup cannot be used to
  // enumerate accounts. Show the same confirmation message either way.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(await pathAfterPasswordLogin(next));
  }

  const verify = new URLSearchParams({ email });
  if (next !== "/dashboard") verify.set("next", next);
  redirect(`/verify-email?${verify.toString()}`);
}

export async function loginAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "email_not_confirmed") {
      return failure(
        "Confirm your email address before signing in. Check your inbox for the confirmation link.",
      );
    }
    return failure("Incorrect email or password.");
  }

  const next = safeRedirectPath(formData.get("next"), "/dashboard");
  revalidatePath("/", "layout");
  redirect(await pathAfterPasswordLogin(next));
}

/**
 * Starts Google sign-in. New users get a personal workspace from the signup
 * trigger unless their email has a pending invitation; an existing user with
 * the same verified email is linked by Supabase Auth, not duplicated.
 */
export async function googleSignInAction(formData: FormData): Promise<void> {
  const next = safeRedirectPath(formData.get("next"), "/dashboard");
  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  const callback = new URLSearchParams({ next, flow: "oauth" });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl}/auth/callback?${callback.toString()}` },
  });

  if (error || !data.url) {
    console.error("google sign-in failed", error?.message);
    redirect("/auth-error?reason=oauth_failed");
  }

  redirect(data.url);
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearEmailMfaCookie();

  revalidatePath("/", "layout");
  redirect("/login");
}

export async function forgotPasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  // A normal password-reset request must not reuse a recent authenticator-
  // recovery marker. Otherwise its recovery session could be mistaken for the
  // stronger flow while the one-hour marker is still present.
  await clearMfaRecoveryRequest();

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  // Errors here are reported as success on purpose. Distinguishing "sent" from
  // "no such account" turns this form into an account-existence oracle.
  if (error) {
    console.error("resetPasswordForEmail failed", error.message);
  }

  return {
    status: "success",
    message:
      "If an account exists for that address, a password reset link is on its way.",
  };
}

export async function requestMfaRecoveryAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  await markMfaRecoveryRequest();

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/callback?next=/recover-mfa/confirm`,
  });

  if (error) {
    console.error("mfa recovery email failed", error.message);
  }

  return {
    status: "success",
    message:
      "If an account exists for that address, a recovery link is on its way.",
  };
}

export async function resetPasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const supabase = await createClient();

  // The recovery link established a session in the callback route. Without it
  // updateUser has nobody to update, which is what stops an unauthenticated
  // POST here from changing anyone's password.
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return failure(
      "This password reset link has expired. Request a new one and try again.",
    );
  }

  // A recovery link only ever produces an AAL1 session, and Auth refuses to
  // change the password of an account that has an authenticator until the
  // session reaches AAL2. Verifying a code here is what elevates it, so the
  // reset stays usable without stripping the factor first.
  const status = await getMfaStatus();
  if (status.hasVerifiedFactor && status.aal !== "aal2") {
    const code = totpCodeSchema.safeParse({
      factorId: formData.get("factorId"),
      code: formData.get("code"),
    });

    if (!code.success) {
      return invalid(toFieldErrors(code.error));
    }

    if (!status.verifiedFactors.some((factor) => factor.id === code.data.factorId)) {
      return failure("This authenticator is not registered on the account.");
    }

    const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: code.data.factorId,
      code: code.data.code,
    });

    if (mfaError) {
      return failure("That code was not accepted. Wait for a new code and try again.");
    }

    await supabase.auth.refreshSession();
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return failure(error.message);
  }

  await revokeAllTrustedDevices("password_change");

  revalidatePath("/", "layout");
  redirect(await pathAfterPasswordLogin("/dashboard?password_updated=1"));
}

export async function completeMfaRecoveryAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") {
    return failure(
      "This recovery link has expired. Request a new one and try again.",
    );
  }

  const fromMail = claimsIncludeRecovery(claims?.claims);
  const marked = await hasMfaRecoveryRequest();
  if (!fromMail) {
    return failure(
      "Open the recovery link from your email. Request a new link if it expired.",
    );
  }
  if (!marked) {
    return failure(
      "Open the recovery link in the same browser that requested it.",
    );
  }

  const recovered = await finishMfaRecovery(userId);
  if (!recovered.ok) {
    return failure(recovered.message ?? "Could not complete recovery.");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return failure(error.message);
  }

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login?recovered=1");
}
