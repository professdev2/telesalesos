"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentUser, hasAtLeastRole } from "@/lib/auth/dal";
import { requireMfaSatisfied } from "@/lib/auth/mfa";
import {
  inviteSchema,
  organizationNameSchema,
  profileSchema,
  toFieldErrors,
  type AuthFormState,
} from "@/lib/auth/validation";
import {
  ACTIVE_ORG_COOKIE,
  getMemberships,
  requireActiveMembership,
} from "@/lib/org/active-org";
import {
  generateInvitationToken,
  hashInvitationToken,
  INVITE_TTL_MS,
} from "@/lib/org/invitation-token";
import { getSiteUrl } from "@/lib/site-url";
import { sendInvitationEmail } from "@/lib/mail/invitation";
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

async function persistActiveOrg(organizationId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * Switches the active organization.
 *
 * Membership is confirmed before the cookie is written, so an arbitrary id
 * posted to this action is rejected rather than stored. `getActiveMembership`
 * re-checks on every read too — this is defence in depth, not the only check.
 */
export async function switchOrganizationAction(formData: FormData): Promise<void> {
  await requireMfaSatisfied();
  const organizationId = formData.get("organizationId");

  if (typeof organizationId !== "string") return;

  const memberships = await getMemberships();
  if (!memberships.some((m) => m.organizationId === organizationId)) {
    return;
  }

  await persistActiveOrg(organizationId);
  revalidatePath("/", "layout");
}

export async function updateProfileAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = profileSchema.safeParse({ fullName: formData.get("fullName") });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const user = await requireCurrentUser();
  await requireMfaSatisfied();
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName })
    .eq("id", user.id);

  if (error) {
    return failure(error.message);
  }

  await supabase.auth.updateUser({ data: { full_name: parsed.data.fullName } });

  revalidatePath("/", "layout");
  return { status: "success", message: "Profile updated." };
}

export async function updateOrganizationNameAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = organizationNameSchema.safeParse({ name: formData.get("name") });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const membership = await requireActiveMembership();

  if (!hasAtLeastRole(membership.role, "admin")) {
    return failure("Only owners and admins can rename this organization.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name })
    .eq("id", membership.organizationId);

  if (error) {
    return failure(error.message);
  }

  revalidatePath("/", "layout");
  return { status: "success", message: "Organization name updated." };
}

/**
 * Owner-only individual → team. There is no reverse path in the schema.
 */
export async function convertOrganizationToTeamAction(
  _prevState: AuthFormState,
  _formData: FormData,
): Promise<AuthFormState> {
  void _prevState;
  void _formData;
  const membership = await requireActiveMembership();

  if (membership.role !== "owner") {
    return failure("Only the owner can convert this organization to a team.");
  }

  if (membership.accountType === "team") {
    return { status: "success", message: "This organization is already a team." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("convert_organization_to_team", {
    p_organization_id: membership.organizationId,
  });

  if (error) {
    return failure(error.message);
  }

  revalidatePath("/", "layout");
  return { status: "success", message: "This organization is now a team. You can invite people." };
}

export async function createInvitationAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const [user, membership] = await Promise.all([
    requireCurrentUser(),
    requireActiveMembership(),
  ]);

  if (!hasAtLeastRole(membership.role, "admin")) {
    return failure("Only owners and admins can invite people.");
  }

  if (membership.accountType !== "team") {
    return failure("Convert this organization to a team before sending invitations.");
  }

  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const supabase = await createClient();

  const { error } = await supabase.from("organization_invitations").insert({
    organization_id: membership.organizationId,
    email: parsed.data.email,
    role: parsed.data.role,
    status: "pending",
    invited_by: user.id,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  });

  if (error) {
    if (error.code === "23505") {
      return failure("A pending invitation already exists for that email.");
    }
    return failure(error.message);
  }

  const siteUrl = await getSiteUrl();
  const inviteUrl = `${siteUrl}/invite/${token}`;
  const mail = await sendInvitationEmail({
    to: parsed.data.email,
    organizationName: membership.organizationName,
    inviteUrl,
    role: parsed.data.role,
  });

  revalidatePath("/settings/members");

  if (mail.sent) {
    return {
      status: "success",
      message:
        "Invitation emailed. They must open the link, sign in as that address, and click Join organization. Copy the link if they need it again.",
      inviteUrl,
    };
  }

  if (mail.error === "missing_key") {
    return {
      status: "success",
      message:
        "Invitation created but email was not sent (RESEND_API_KEY is not set on the server). Copy the link and send it yourself.",
      inviteUrl,
    };
  }

  return {
    status: "success",
    message:
      "Invitation created but the email provider rejected the send. Copy the link and send it yourself.",
    inviteUrl,
  };
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const invitationId = formData.get("invitationId");
  if (typeof invitationId !== "string") return;

  const membership = await requireActiveMembership();

  if (!hasAtLeastRole(membership.role, "admin")) {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("organization_invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("organization_id", membership.organizationId)
    .eq("status", "pending");

  revalidatePath("/settings/members");
}

export async function deleteInvitationAction(formData: FormData): Promise<void> {
  const invitationId = formData.get("invitationId");
  if (typeof invitationId !== "string") return;

  const membership = await requireActiveMembership();

  if (!hasAtLeastRole(membership.role, "admin")) {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("organization_invitations")
    .delete()
    .eq("id", invitationId)
    .eq("organization_id", membership.organizationId)
    .in("status", ["revoked", "expired", "accepted"]);

  revalidatePath("/settings/members");
}

export async function acceptInvitationAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = formData.get("token");
  if (typeof token !== "string" || token.length < 16) {
    return failure("This invitation link is incomplete.");
  }

  await requireCurrentUser();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("accept_organization_invitation", {
    p_token: token,
  });

  if (error) {
    return failure(error.message);
  }

  const organizationId =
    data && typeof data === "object" && "organization_id" in data
      ? String((data as { organization_id: string }).organization_id)
      : null;

  if (organizationId) {
    await persistActiveOrg(organizationId);
    const { syncBillingSeatsForOrg } = await import("@/lib/billing/actions");
    await syncBillingSeatsForOrg(organizationId);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
