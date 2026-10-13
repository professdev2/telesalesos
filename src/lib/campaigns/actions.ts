"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/dal";
import { toFieldErrors, type AuthFormState } from "@/lib/auth/validation";
import {
  assertPurposeAllowed,
  campaignArchiveSchema,
  campaignContactSchema,
  campaignSchema,
  campaignUpdateSchema,
} from "@/lib/campaigns/validation";
import { requireActiveMembership } from "@/lib/org/active-org";
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

function textField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

function mapWriteError(message: string): string {
  if (message.includes("not an active member")) {
    return "That campaign is not in your organization.";
  }
  if (message.includes("same organization")) {
    return "That contact is not in your organization.";
  }
  if (message.includes("does not exist")) {
    return "That contact or campaign is no longer available.";
  }
  if (/duplicate|unique/i.test(message)) {
    return "That contact is already on this campaign.";
  }
  return message;
}

function revalidateCampaign(campaignId: string, contactId?: string) {
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  if (contactId) {
    revalidatePath("/contacts");
    revalidatePath(`/contacts/${contactId}`);
  }
}

export async function createCampaignAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = campaignSchema.safeParse({
    name: textField(formData, "name"),
    status: textField(formData, "status") ?? "draft",
    purpose: textField(formData, "purpose") ?? "sales",
    notes: textField(formData, "notes"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const [user, membership] = await Promise.all([
    requireCurrentUser(),
    requireActiveMembership(),
  ]);

  const purposeBlocked = assertPurposeAllowed(
    parsed.data.purpose,
    membership.powerbridgeEnabled,
  );
  if (purposeBlocked) {
    return failure(purposeBlocked);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").insert({
    organization_id: membership.organizationId,
    name: parsed.data.name,
    status: parsed.data.status,
    purpose: parsed.data.purpose,
    notes: parsed.data.notes ?? null,
    created_by: user.id,
  });

  if (error) {
    return failure(mapWriteError(error.message));
  }

  revalidatePath("/campaigns");
  return { status: "success", message: "Campaign added." };
}

export async function updateCampaignAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = campaignUpdateSchema.safeParse({
    id: textField(formData, "campaignId"),
    name: textField(formData, "name"),
    status: textField(formData, "status"),
    purpose: textField(formData, "purpose"),
    notes: textField(formData, "notes"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const membership = await requireActiveMembership();

  const purposeBlocked = assertPurposeAllowed(
    parsed.data.purpose,
    membership.powerbridgeEnabled,
  );
  if (purposeBlocked) {
    return failure(purposeBlocked);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update({
      name: parsed.data.name,
      status: parsed.data.status,
      purpose: parsed.data.purpose,
      notes: parsed.data.notes ?? null,
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", membership.organizationId)
    .is("archived_at", null)
    .select("id");

  if (error) {
    return failure(mapWriteError(error.message));
  }
  if (!data?.length) {
    return failure("This campaign no longer exists.");
  }

  revalidateCampaign(parsed.data.id);
  return { status: "success", message: "Campaign updated." };
}

export async function archiveCampaignAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = campaignArchiveSchema.safeParse({
    id: textField(formData, "campaignId"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const membership = await requireActiveMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("organization_id", membership.organizationId)
    .is("archived_at", null)
    .select("id");

  if (error) {
    return failure(error.message);
  }
  if (!data?.length) {
    return failure("This campaign no longer exists.");
  }

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${parsed.data.id}`);
  redirect("/campaigns");
}

export async function addCampaignContactAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = campaignContactSchema.safeParse({
    campaignId: textField(formData, "campaignId"),
    contactId: textField(formData, "contactId"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const [user, membership] = await Promise.all([
    requireCurrentUser(),
    requireActiveMembership(),
  ]);

  const supabase = await createClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", parsed.data.campaignId)
    .eq("organization_id", membership.organizationId)
    .is("archived_at", null)
    .maybeSingle();

  if (!campaign) {
    return failure("This campaign no longer exists.");
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", parsed.data.contactId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (!contact) {
    return failure("Choose a contact from this organization.");
  }

  const { error } = await supabase.from("campaign_contacts").insert({
    organization_id: membership.organizationId,
    campaign_id: parsed.data.campaignId,
    contact_id: parsed.data.contactId,
    created_by: user.id,
  });

  if (error) {
    return failure(mapWriteError(error.message));
  }

  revalidateCampaign(parsed.data.campaignId, parsed.data.contactId);
  return { status: "success", message: "Contact added to the campaign." };
}

export async function removeCampaignContactAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = campaignContactSchema.safeParse({
    campaignId: textField(formData, "campaignId"),
    contactId: textField(formData, "contactId"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const membership = await requireActiveMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaign_contacts")
    .delete()
    .eq("campaign_id", parsed.data.campaignId)
    .eq("contact_id", parsed.data.contactId)
    .eq("organization_id", membership.organizationId)
    .select("id");

  if (error) {
    return failure(mapWriteError(error.message));
  }
  if (!data?.length) {
    return failure("That contact is not on this campaign.");
  }

  revalidateCampaign(parsed.data.campaignId, parsed.data.contactId);
  return { status: "success", message: "Contact removed from the campaign." };
}
