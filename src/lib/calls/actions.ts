"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/dal";
import { toFieldErrors, type AuthFormState } from "@/lib/auth/validation";
import { callRecordSchema, callRecordUpdateSchema } from "@/lib/calls/validation";
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
  if (message.includes("same organization") || message.includes("not an active member")) {
    return "That contact or lead is not in your organization.";
  }
  if (message.includes("same contact")) {
    return "That lead belongs to a different contact.";
  }
  if (message.includes("Call record contact does not exist")) {
    return "That contact is no longer available. Pick another.";
  }
  if (message.includes("Call record lead does not exist")) {
    return "That lead is no longer available. Pick another.";
  }
  if (message.includes("cannot change contact")) {
    return "A logged attempt stays attached to the original contact.";
  }
  return message;
}

function revalidateCallSurfaces(contactId: string, leadId?: string, recordId?: string) {
  revalidatePath("/calls");
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  if (leadId) {
    revalidatePath("/leads");
    revalidatePath(`/leads/${leadId}`);
  }
  if (recordId) {
    revalidatePath(`/calls/${recordId}`);
  }
}

/**
 * Logs an attempt in the caller's active organization. A posted organization
 * id is ignored. Lead status is not changed.
 */
export async function createCallRecordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = callRecordSchema.safeParse({
    contactId: textField(formData, "contactId"),
    leadId: textField(formData, "leadId"),
    outcome: textField(formData, "outcome") ?? "no_answer",
    notes: textField(formData, "notes"),
    occurredAt: textField(formData, "occurredAt"),
    durationSeconds: textField(formData, "durationSeconds"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const [user, membership] = await Promise.all([
    requireCurrentUser(),
    requireActiveMembership(),
  ]);

  const supabase = await createClient();
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", parsed.data.contactId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (!contact) {
    return failure("Choose a contact from this organization.");
  }

  if (parsed.data.leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("id, contact_id")
      .eq("id", parsed.data.leadId)
      .eq("organization_id", membership.organizationId)
      .maybeSingle();

    if (!lead || lead.contact_id !== parsed.data.contactId) {
      return failure("Choose a lead that belongs to this contact.");
    }
  }

  const { error } = await supabase.from("call_records").insert({
    organization_id: membership.organizationId,
    contact_id: parsed.data.contactId,
    lead_id: parsed.data.leadId ?? null,
    outcome: parsed.data.outcome,
    notes: parsed.data.notes ?? null,
    occurred_at: parsed.data.occurredAt ?? new Date().toISOString(),
    duration_seconds: parsed.data.durationSeconds ?? null,
    created_by: user.id,
  });

  if (error) {
    return failure(mapWriteError(error.message));
  }

  revalidateCallSurfaces(parsed.data.contactId, parsed.data.leadId);
  return { status: "success", message: "Attempt logged." };
}

export async function updateCallRecordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = callRecordUpdateSchema.safeParse({
    id: textField(formData, "callRecordId"),
    leadId: textField(formData, "leadId"),
    outcome: textField(formData, "outcome"),
    notes: textField(formData, "notes"),
    occurredAt: textField(formData, "occurredAt"),
    durationSeconds: textField(formData, "durationSeconds"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("call_records")
    .select("id, contact_id")
    .eq("id", parsed.data.id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (!existing) {
    return failure("This attempt no longer exists.");
  }

  if (parsed.data.leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("id, contact_id")
      .eq("id", parsed.data.leadId)
      .eq("organization_id", membership.organizationId)
      .maybeSingle();

    if (!lead || lead.contact_id !== existing.contact_id) {
      return failure("Choose a lead that belongs to this contact.");
    }
  }

  const { data, error } = await supabase
    .from("call_records")
    .update({
      lead_id: parsed.data.leadId ?? null,
      outcome: parsed.data.outcome,
      notes: parsed.data.notes ?? null,
      occurred_at: parsed.data.occurredAt ?? new Date().toISOString(),
      duration_seconds: parsed.data.durationSeconds ?? null,
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", membership.organizationId)
    .select("id");

  if (error) {
    return failure(mapWriteError(error.message));
  }

  if (!data?.length) {
    return failure("This attempt no longer exists.");
  }

  revalidateCallSurfaces(existing.contact_id, parsed.data.leadId, parsed.data.id);
  return { status: "success", message: "Attempt updated." };
}
