import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import type { TrustedDevice } from "@/lib/auth/trusted-device-types";

export type { TrustedDevice };

export const TRUSTED_DEVICE_COOKIE = "__Host-tos-td";
const TRUST_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: TRUST_MAX_AGE_SECONDS,
  };
}

export function deviceLabelFromUserAgent(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const browser = ua.includes("Edg/")
    ? "Edge"
    : ua.includes("Chrome/")
      ? "Chrome"
      : ua.includes("Firefox/")
        ? "Firefox"
        : ua.includes("Safari/")
          ? "Safari"
          : "Browser";
  const os = ua.includes("Windows")
    ? "Windows"
    : ua.includes("Mac OS")
      ? "macOS"
      : ua.includes("Android")
        ? "Android"
        : ua.includes("iPhone") || ua.includes("iPad")
          ? "iOS"
          : ua.includes("Linux")
            ? "Linux"
            : "this device";
  return `${browser} on ${os}`;
}

export function wantsTrustedDevice(formData: FormData): boolean {
  const raw = formData.get("trustDevice");
  return raw === "on" || raw === "1" || raw === "true";
}

export async function issueTrustedDeviceCookie(): Promise<void> {
  const supabase = await createClient();
  const token = randomBytes(32).toString("base64url");
  const label = deviceLabelFromUserAgent((await headers()).get("user-agent"));
  const { error } = await supabase.rpc("issue_trusted_device", {
    p_token_hash: hashToken(token),
    p_label: label,
  });

  if (error) {
    console.error("issue_trusted_device failed", error.message);
    return;
  }

  (await cookies()).set(TRUSTED_DEVICE_COOKIE, token, cookieOptions());
}

export const hasValidTrustedDevice = cache(async (): Promise<boolean> => {
  const token = (await cookies()).get(TRUSTED_DEVICE_COOKIE)?.value;
  if (!token) return false;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("touch_trusted_device", {
    p_token_hash: hashToken(token),
  });

  if (error) {
    console.error("touch_trusted_device failed", error.message);
    return false;
  }

  return data === true;
});

export async function listTrustedDevices(): Promise<TrustedDevice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_trusted_devices");

  if (error || !data) {
    if (error) console.error("list_trusted_devices failed", error.message);
    return [];
  }

  return (data as Array<{
    id: string;
    label: string;
    created_at: string;
    last_used_at: string;
    expires_at: string;
  }>).map((row) => ({
    id: row.id,
    label: row.label,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
  }));
}

export async function revokeTrustedDevice(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_trusted_device", {
    p_id: id,
  });

  if (error) {
    console.error("revoke_trusted_device failed", error.message);
    return false;
  }

  if (data === true) {
    await dropCookieIfHashInvalid();
  }

  return data === true;
}

export async function revokeAllTrustedDevices(
  reason: "user" | "password_change" | "factor_change" = "user",
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_all_trusted_devices", {
    p_reason: reason,
  });

  if (error) {
    console.error("revoke_all_trusted_devices failed", error.message);
  }

  await clearTrustedDeviceCookie();
}

async function dropCookieIfHashInvalid(): Promise<void> {
  const token = (await cookies()).get(TRUSTED_DEVICE_COOKIE)?.value;
  if (!token) return;

  const supabase = await createClient();
  const { data } = await supabase.rpc("touch_trusted_device", {
    p_token_hash: hashToken(token),
  });

  if (data !== true) {
    await clearTrustedDeviceCookie();
  }
}

export async function clearTrustedDeviceCookie(): Promise<void> {
  (await cookies()).set(TRUSTED_DEVICE_COOKIE, "", {
    ...cookieOptions(),
    maxAge: 0,
  });
}
