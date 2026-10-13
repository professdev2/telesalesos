import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUser, type OrgRole } from "@/lib/auth/dal";
import { requireMfaSatisfied } from "@/lib/auth/mfa";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_ORG_COOKIE = "telesalesos.active_org";

export type Membership = {
  organizationId: string;
  organizationName: string;
  accountType: "individual" | "team";
  role: OrgRole;
  powerbridgeEnabled: boolean;
};

type MembershipRow = {
  organization_id: string;
  role: OrgRole;
  organizations: {
    name: string;
    account_type: "individual" | "team";
    powerbridge_enabled: boolean | null;
  } | null;
};

/**
 * Every active membership for the caller, oldest first.
 *
 * Row-level security scopes this to the caller — the query does not filter by
 * user beyond the session, so a policy regression would show up here as extra
 * organizations rather than silently succeeding.
 */
export const getMemberships = cache(async (): Promise<Membership[]> => {
  const user = await getSessionUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("organization_id, role, organizations(name, account_type, powerbridge_enabled)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return (data as unknown as MembershipRow[]).map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organizations?.name ?? "Untitled organization",
    accountType: row.organizations?.account_type ?? "individual",
    role: row.role,
    powerbridgeEnabled: row.organizations?.powerbridge_enabled === true,
  }));
});

/**
 * The organization the caller is currently working in.
 *
 * The cookie only ever selects among organizations the caller already belongs
 * to. An unknown or tampered value is discarded rather than honoured, so
 * editing the cookie cannot reach another tenant — the worst it can do is pick
 * a different organization of your own.
 */
export const getActiveMembership = cache(async (): Promise<Membership | null> => {
  const memberships = await getMemberships();
  if (memberships.length === 0) return null;

  const requested = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const match = memberships.find((m) => m.organizationId === requested);

  return match ?? memberships[0];
});

/**
 * Gate for every organization-scoped page.
 *
 * A signed-in user with no active membership means the signup trigger failed
 * partway or an owner suspended them. Either way there is nothing to show.
 */
export async function requireActiveMembership(): Promise<Membership> {
  const membership = await getActiveMembership();

  if (!membership) {
    redirect("/no-organization");
  }

  await requireMfaSatisfied();

  return membership;
}
