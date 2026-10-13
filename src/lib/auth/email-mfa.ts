import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";

import { getSessionUser } from "@/lib/auth/dal";
import { sendEmailMfaCode } from "@/lib/mail/email-mfa";
import { createClient } from "@/lib/supabase/server";

export const EMAIL_MFA_COOKIE = "__Host-tos-ems";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function pepper(): string {
  return (
    process.env.EMAIL_MFA_PEPPER?.trim() ||
    process.env.RESEND_API_KEY?.trim() ||
    ""
  );
}

function hashValue(userId: string, value: string): string {
  return createHash("sha256")
    .update(`${userId}:${value}:${pepper()}`)
    .digest("hex");
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export async function requestEmailMfaCode(): Promise<{
  ok: boolean;
  message: string;
}> {
  const user = await getSessionUser();
  if (!user?.email) {
    return { ok: false, message: "Sign in again, then request a new code." };
  }

  if (!pepper()) {
    return {
      ok: false,
      message: "Email codes cannot be sent (RESEND_API_KEY is not set on the server).",
    };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_email_mfa_challenge", {
    p_code_hash: hashValue(user.id, code),
  });

  if (error) {
    const detail = error.message.toLowerCase();
    if (detail.includes("wait")) {
      return { ok: false, message: "Wait a minute before requesting another code." };
    }
    if (detail.includes("not available")) {
      return { ok: false, message: "This account must use an authenticator app." };
    }
    console.error("request_email_mfa_challenge failed", error.message);
    return { ok: false, message: "Could not start email verification. Try again." };
  }

  const mail = await sendEmailMfaCode(user.email, code);
  if (!mail.sent) {
    if (mail.error === "missing_key") {
      return {
        ok: false,
        message: "Email codes cannot be sent (RESEND_API_KEY is not set on the server).",
      };
    }
    return {
      ok: false,
      message: "The email provider rejected the send. Try again shortly.",
    };
  }

  return { ok: true, message: "We sent a 6-digit code to your email." };
}

export async function verifyEmailMfaCode(code: string): Promise<boolean> {
  const user = await getSessionUser();
  if (!user || !pepper()) return false;

  const normalized = code.replace(/\s+/g, "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_email_mfa_challenge", {
    p_code_hash: hashValue(user.id, normalized),
  });

  if (error) {
    console.error("verify_email_mfa_challenge failed", error.message);
    return false;
  }

  return data === true;
}

export async function issueEmailMfaSession(): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;

  const token = randomBytes(32).toString("base64url");
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_email_mfa_session", {
    p_marker_hash: hashValue(user.id, token),
  });

  if (error) {
    console.error("issue_email_mfa_session failed", error.message);
    return;
  }

  (await cookies()).set(EMAIL_MFA_COOKIE, token, cookieOptions());
}

export const hasValidEmailMfaSession = cache(async (): Promise<boolean> => {
  const token = (await cookies()).get(EMAIL_MFA_COOKIE)?.value;
  if (!token) return false;

  const user = await getSessionUser();
  if (!user) return false;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("touch_email_mfa_session", {
    p_marker_hash: hashValue(user.id, token),
  });

  if (error) {
    console.error("touch_email_mfa_session failed", error.message);
    return false;
  }

  return data === true;
});

export async function clearEmailMfaCookie(): Promise<void> {
  (await cookies()).set(EMAIL_MFA_COOKIE, "", {
    ...cookieOptions(),
    maxAge: 0,
  });
}
