import "server-only";

import { cache } from "react";

import { hasAtLeastRole } from "@/lib/auth/dal";
import type { Membership } from "@/lib/org/active-org";
import { createClient } from "@/lib/supabase/server";
import type { TrainingVisibility } from "@/lib/training/validation";

export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;
  if (!userId) return false;

  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  return !error && data !== null;
});

export function canManageAgencyTraining(membership: Membership): boolean {
  return hasAtLeastRole(membership.role, "admin");
}

export async function canManageTrainingLibrary(
  visibility: TrainingVisibility,
  organizationId: string | null,
  membership: Membership,
): Promise<boolean> {
  if (visibility === "platform") {
    return isPlatformAdmin();
  }

  return (
    organizationId === membership.organizationId &&
    canManageAgencyTraining(membership)
  );
}
