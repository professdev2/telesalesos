"use server";

import { revalidatePath } from "next/cache";

import { toFieldErrors, type AuthFormState } from "@/lib/auth/validation";
import { requireActiveMembership } from "@/lib/org/active-org";
import { createClient } from "@/lib/supabase/server";
import { addContactTagSchema, removeContactTagSchema } from "@/lib/tags/validation";

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

function revalidateContactPaths(contactId: string) {
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
  revalidatePath("/campaigns");
}

async function resolveTagId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  name: string,
): Promise<{ ok: true; tagId: string } | { ok: false; message: string }> {
  const normalized = name.trim();
  const { data: existing } = await supabase
    .from("tags")
    .select("id, name")
    .eq("organization_id", organizationId)
    .ilike("name", normalized)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, tagId: existing.id as string };
  }

  const { data: created, error } = await supabase
    .from("tags")
    .insert({ organization_id: organizationId, name: normalized })
    .select("id")
    .maybeSingle();

  if (error || !created) {
    if (error?.message?.toLowerCase().includes("duplicate")) {
      const { data: again } = await supabase
        .from("tags")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("name", normalized)
        .limit(1)
        .maybeSingle();
      if (again?.id) return { ok: true, tagId: again.id as string };
    }
    return { ok: false, message: error?.message ?? "Could not create tag." };
  }
  return { ok: true, tagId: created.id as string };
}

export async function addContactTagAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = addContactTagSchema.safeParse({
    contactId: textField(formData, "contactId"),
    name: textField(formData, "name") ?? textField(formData, "tagName"),
  });
  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", parsed.data.contactId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!contact) {
    return failure("That contact is no longer available.");
  }

  const tag = await resolveTagId(supabase, membership.organizationId, parsed.data.name);
  if (!tag.ok) return failure(tag.message);

  const { error } = await supabase.from("contact_tags").upsert(
    {
      organization_id: membership.organizationId,
      contact_id: parsed.data.contactId,
      tag_id: tag.tagId,
    },
    { onConflict: "contact_id,tag_id", ignoreDuplicates: true },
  );

  if (error) {
    return failure(error.message);
  }

  revalidateContactPaths(parsed.data.contactId);
  // Also refresh any open campaign detail the user came from.
  const campaignId = textField(formData, "campaignId");
  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}`);
  }

  return { status: "success", message: "Tag added." };
}

export async function removeContactTagAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = removeContactTagSchema.safeParse({
    contactId: textField(formData, "contactId"),
    tagId: textField(formData, "tagId"),
  });
  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { error } = await supabase
    .from("contact_tags")
    .delete()
    .eq("organization_id", membership.organizationId)
    .eq("contact_id", parsed.data.contactId)
    .eq("tag_id", parsed.data.tagId);

  if (error) {
    return failure(error.message);
  }

  revalidateContactPaths(parsed.data.contactId);
  const campaignId = textField(formData, "campaignId");
  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}`);
  }

  return { status: "success", message: "Tag removed." };
}
