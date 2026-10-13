import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Auth admin client. Unenroll during recovery cannot use the user JWT (AAL1).
 * The secret never goes to the browser. Prefer SUPABASE_SECRET_KEY; accept the
 * legacy service_role name.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
