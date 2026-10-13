import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Platform admin, or active owner/admin of a team organization — TOTP only.
 * Being a member of one org does not unlock Email OTP if another team is run.
 */
export const isMfaPrivileged = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("user_is_mfa_privileged");

  if (error) {
    console.error("user_is_mfa_privileged failed", error.message);
    return true;
  }

  return data === true;
});
