import "server-only";

import { cache } from "react";

import { requireCurrentUser, type OrgRole } from "@/lib/auth/dal";
import { requireActiveMembership } from "@/lib/org/active-org";
import { createClient } from "@/lib/supabase/server";

export type MembershipRow = {
  id: string;
  userId: string;
  role: OrgRole;
  status: "active" | "suspended";
  createdAt: string;
  isYou: boolean;
  displayName: string | null;
  email: string | null;
};

export type InvitationRow = {
  id: string;
  email: string;
  role: "admin" | "member";
  status: "pending" | "accepted" | "expired" | "revoked";
  expiresAt: string;
  createdAt: string;
};

export type OrganizationDetails = {
  id: string;
  name: string;
  accountType: "individual" | "team";
  createdAt: string;
};

export const getOrganizationDetails = cache(async (): Promise<OrganizationDetails | null> => {
  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, account_type, created_at")
    .eq("id", membership.organizationId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    accountType: data.account_type,
    createdAt: data.created_at,
  };
});

/**
 * Memberships visible under RLS.
 *
 * Owners and admins see the whole roster. Members only see their own row —
 * that is the policy, not a UI omission. Teammate names live on `profiles`,
 * which is also own-row-only, so other people appear without a display name.
 */
export const getVisibleMembers = cache(async (): Promise<MembershipRow[]> => {
  const [user, membership] = await Promise.all([
    requireCurrentUser(),
    requireActiveMembership(),
  ]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_memberships")
    .select("id, user_id, role, status, created_at")
    .eq("organization_id", membership.organizationId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => {
    const isYou = row.user_id === user.id;
    return {
      id: row.id,
      userId: row.user_id,
      role: row.role as OrgRole,
      status: row.status as "active" | "suspended",
      createdAt: row.created_at,
      isYou,
      displayName: isYou ? user.fullName : null,
      email: isYou ? user.email : null,
    };
  });
});

export const getInvitations = cache(async (): Promise<InvitationRow[]> => {
  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_invitations")
    .select("id, email, role, status, expires_at, created_at")
    .eq("organization_id", membership.organizationId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role as "admin" | "member",
    status: row.status as InvitationRow["status"],
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
});
