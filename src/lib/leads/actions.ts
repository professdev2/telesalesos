"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { hasAtLeastRole, requireCurrentUser } from "@/lib/auth/dal";
import { toFieldErrors, type AuthFormState } from "@/lib/auth/validation";
import { extraFromFormData, parseFieldPack, type FieldPack } from "@/lib/crm/field-packs";
import { assertPurposeAllowed, isStatusForPurpose } from "@/lib/crm/pipelines";
import {
  coerceLeadPurpose,
  defaultStatusForPurpose,
  leadArchiveSchema,
  leadCloneSchema,
  leadDeleteSchema,
  leadSchema,
  leadStatusMoveSchema,
  leadUpdateSchema,
} from "@/lib/leads/validation";
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
    return "That contact or company is not in your organization.";
  }
  if (message.includes("Lead contact does not exist")) {
    return "That contact is no longer available. Pick another.";
  }
  if (message.includes("Lead company does not exist")) {
    return "That company is no longer available. Pick another.";
  }
  if (message.includes("leads_purpose_status_valid")) {
    return "That stage is not valid for this pipeline.";
  }
  return message;
}

async function resolveCompanyId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  companyId: string | undefined,
  powerbridgeEnabled: boolean,
): Promise<{ ok: true; companyId: string | null } | { ok: false; state: AuthFormState }> {
  if (!companyId) {
    return { ok: true, companyId: null };
  }
  if (!powerbridgeEnabled) {
    return { ok: false, state: failure("Companies are only available for PowerBridge orgs.") };
  }
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!company) {
    return { ok: false, state: failure("Choose a company from this organization.") };
  }
  return { ok: true, companyId: company.id };
}

function parseExtraOrFail(
  purpose: ReturnType<typeof coerceLeadPurpose>,
  formData: FormData,
): { ok: true; data: FieldPack } | { ok: false; state: AuthFormState } {
  const pack = parseFieldPack(purpose, extraFromFormData(formData));
  if (!pack.ok) {
    return {
      ok: false,
      state: invalid(toFieldErrors(pack.error)),
    };
  }
  return { ok: true, data: pack.data };
}

export async function createLeadAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const purposeRaw = textField(formData, "purpose") ?? "sales";
  const purpose = coerceLeadPurpose(purposeRaw);
  const parsed = leadSchema.safeParse({
    contactId: textField(formData, "contactId"),
    companyId: textField(formData, "companyId"),
    purpose,
    status: textField(formData, "status") ?? defaultStatusForPurpose(purpose),
    disposition: textField(formData, "disposition"),
    notes: textField(formData, "notes"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const extra = parseExtraOrFail(parsed.data.purpose, formData);
  if (!extra.ok) return extra.state;

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
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, company_id")
    .eq("id", parsed.data.contactId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (!contact) {
    return failure("Choose a contact from this organization.");
  }

  // Prefer the form value; otherwise inherit the contact's company (PowerBridge).
  const requestedCompanyId =
    parsed.data.companyId ??
    (typeof contact.company_id === "string" ? contact.company_id : undefined);

  const company = await resolveCompanyId(
    supabase,
    membership.organizationId,
    requestedCompanyId,
    membership.powerbridgeEnabled,
  );
  if (!company.ok) return company.state;

  const { error } = await supabase.from("leads").insert({
    organization_id: membership.organizationId,
    contact_id: parsed.data.contactId,
    company_id: company.companyId,
    purpose: parsed.data.purpose,
    status: parsed.data.status,
    disposition: parsed.data.disposition ?? null,
    extra: extra.data,
    notes: parsed.data.notes ?? null,
    created_by: user.id,
  });

  if (error) {
    return failure(mapWriteError(error.message));
  }

  revalidatePath("/leads");
  revalidatePath("/retention");
  if (company.companyId) {
    revalidatePath(`/companies/${company.companyId}`);
  }
  return { status: "success", message: "Lead added." };
}

export async function updateLeadAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const purpose = coerceLeadPurpose(textField(formData, "purpose") ?? "sales");
  const parsed = leadUpdateSchema.safeParse({
    id: textField(formData, "leadId"),
    companyId: textField(formData, "companyId"),
    purpose,
    status: textField(formData, "status"),
    disposition: textField(formData, "disposition"),
    notes: textField(formData, "notes"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const extra = parseExtraOrFail(parsed.data.purpose, formData);
  if (!extra.ok) return extra.state;

  const membership = await requireActiveMembership();

  const purposeBlocked = assertPurposeAllowed(
    parsed.data.purpose,
    membership.powerbridgeEnabled,
  );
  if (purposeBlocked) {
    return failure(purposeBlocked);
  }

  const supabase = await createClient();
  const company = await resolveCompanyId(
    supabase,
    membership.organizationId,
    parsed.data.companyId,
    membership.powerbridgeEnabled,
  );
  if (!company.ok) return company.state;

  const { data, error } = await supabase
    .from("leads")
    .update({
      company_id: company.companyId,
      purpose: parsed.data.purpose,
      status: parsed.data.status,
      disposition: parsed.data.disposition ?? null,
      extra: extra.data,
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
    return failure("This lead no longer exists.");
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${parsed.data.id}`);
  revalidatePath("/retention");
  if (company.companyId) {
    revalidatePath(`/companies/${company.companyId}`);
  }
  revalidatePath("/companies");
  return { status: "success", message: "Lead updated." };
}

export async function moveLeadStatusAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = leadStatusMoveSchema.safeParse({
    id: textField(formData, "leadId"),
    status: textField(formData, "status"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { data: existing, error: loadError } = await supabase
    .from("leads")
    .select("id, purpose")
    .eq("id", parsed.data.id)
    .eq("organization_id", membership.organizationId)
    .is("archived_at", null)
    .maybeSingle();

  if (loadError || !existing) {
    return failure("This lead no longer exists.");
  }

  const purpose = coerceLeadPurpose(existing.purpose);
  if (!isStatusForPurpose(purpose, parsed.data.status)) {
    return failure("That stage is not valid for this pipeline.");
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .eq("organization_id", membership.organizationId)
    .is("archived_at", null)
    .select("id");

  if (error) {
    return failure(mapWriteError(error.message));
  }

  if (!data?.length) {
    return failure("This lead no longer exists.");
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${parsed.data.id}`);
  revalidatePath("/retention");
  return { status: "success", message: "Stage updated." };
}

export async function archiveLeadAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = leadArchiveSchema.safeParse({
    id: textField(formData, "leadId"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const membership = await requireActiveMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("organization_id", membership.organizationId)
    .is("archived_at", null)
    .select("id");

  if (error) {
    return failure(error.message);
  }

  if (!data?.length) {
    return failure("This lead no longer exists.");
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${parsed.data.id}`);
  revalidatePath("/retention");
  redirect("/leads");
}

/** Mark a lead as read when its detail page is opened (no-op if already viewed). */
export async function markLeadViewed(leadId: string): Promise<void> {
  const membership = await requireActiveMembership();
  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("organization_id", membership.organizationId)
    .is("viewed_at", null);

  if (!error) {
    // Page render calls this helper; revalidatePath is not allowed during render.
    after(() => {
      revalidatePath("/leads");
    });
  }
}

/**
 * Permanently remove a lead. Owner/Admin only. Linked orders keep company history
 * (`orders.lead_id` set null via FK ON DELETE SET NULL).
 */
export async function deleteLeadAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = leadDeleteSchema.safeParse({
    id: textField(formData, "leadId"),
    confirm: textField(formData, "confirm"),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const membership = await requireActiveMembership();
  if (!hasAtLeastRole(membership.role, "admin")) {
    return failure("Only owners and admins can delete leads.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", membership.organizationId)
    .select("id");

  if (error) {
    return failure(error.message);
  }

  if (!data?.length) {
    return failure("This lead no longer exists.");
  }

  revalidatePath("/leads");
  revalidatePath("/retention");
  revalidatePath("/orders");
  redirect("/leads");
}

/**
 * Clone an opportunity under the same contact/company — new deal, same account.
 * Resets stage to the pipeline default; copies notes/extra/disposition.
 */
export async function cloneLeadAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = leadCloneSchema.safeParse({
    id: textField(formData, "leadId"),
  });
  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const [user, membership] = await Promise.all([
    requireCurrentUser(),
    requireActiveMembership(),
  ]);

  const supabase = await createClient();
  const { data: source, error: loadError } = await supabase
    .from("leads")
    .select("id, contact_id, company_id, purpose, disposition, extra, notes")
    .eq("id", parsed.data.id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (loadError || !source) {
    return failure("This lead no longer exists.");
  }

  const purpose = coerceLeadPurpose(source.purpose);
  const purposeBlocked = assertPurposeAllowed(purpose, membership.powerbridgeEnabled);
  if (purposeBlocked) {
    return failure(purposeBlocked);
  }

  const { data: created, error } = await supabase
    .from("leads")
    .insert({
      organization_id: membership.organizationId,
      contact_id: source.contact_id,
      company_id: source.company_id,
      purpose,
      status: defaultStatusForPurpose(purpose),
      disposition: source.disposition,
      extra: source.extra ?? {},
      notes: source.notes,
      created_by: user.id,
    })
    .select("id")
    .maybeSingle();

  if (error || !created) {
    return failure(mapWriteError(error?.message ?? "Could not clone lead."));
  }

  revalidatePath("/leads");
  revalidatePath("/retention");
  if (source.company_id) {
    revalidatePath(`/companies/${source.company_id}`);
  }
  redirect(`/leads/${created.id}`);
}
