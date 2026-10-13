"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/dal";
import { toFieldErrors, type AuthFormState } from "@/lib/auth/validation";
import {
  checkboxFromForm,
  contactSchema,
  contactUpdateSchema,
} from "@/lib/contacts/validation";
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
  if (message.includes("same organization") || message.includes("Contact company")) {
    return "That company is not in your organization.";
  }
  if (message.includes("Contact company does not exist")) {
    return "That company is no longer available. Pick another.";
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

function contactPayload(data: {
  fullName: string;
  email?: string;
  phone?: string;
  phoneSecondary?: string;
  dateOfBirth?: string;
  gender?: string;
  timezone?: string;
  bestTimeToCall?: string;
  leadSource?: string;
  dnc: boolean;
  smsConsent: boolean;
  emailConsent: boolean;
  notes?: string;
}) {
  return {
    full_name: data.fullName,
    email: data.email ?? null,
    phone: data.phone ?? null,
    phone_secondary: data.phoneSecondary ?? null,
    date_of_birth: data.dateOfBirth ?? null,
    gender: data.gender ?? null,
    timezone: data.timezone ?? null,
    best_time_to_call: data.bestTimeToCall ?? null,
    lead_source: data.leadSource ?? null,
    dnc: data.dnc,
    sms_consent: data.smsConsent,
    email_consent: data.emailConsent,
    notes: data.notes ?? null,
  };
}

function parseContactFields(formData: FormData) {
  return {
    fullName: textField(formData, "fullName"),
    companyId: textField(formData, "companyId"),
    email: textField(formData, "email"),
    phone: textField(formData, "phone"),
    phoneSecondary: textField(formData, "phoneSecondary"),
    dateOfBirth: textField(formData, "dateOfBirth"),
    gender: textField(formData, "gender"),
    timezone: textField(formData, "timezone"),
    bestTimeToCall: textField(formData, "bestTimeToCall"),
    leadSource: textField(formData, "leadSource"),
    dnc: checkboxFromForm(formData, "dnc"),
    smsConsent: checkboxFromForm(formData, "smsConsent"),
    emailConsent: checkboxFromForm(formData, "emailConsent"),
    notes: textField(formData, "notes"),
  };
}

export async function createContactAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = contactSchema.safeParse(parseContactFields(formData));

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const [user, membership] = await Promise.all([
    requireCurrentUser(),
    requireActiveMembership(),
  ]);

  const supabase = await createClient();
  const company = await resolveCompanyId(
    supabase,
    membership.organizationId,
    parsed.data.companyId,
    membership.powerbridgeEnabled,
  );
  if (!company.ok) return company.state;

  const { error } = await supabase.from("contacts").insert({
    organization_id: membership.organizationId,
    company_id: company.companyId,
    ...contactPayload(parsed.data),
    created_by: user.id,
  });

  if (error) {
    return failure(mapWriteError(error.message));
  }

  revalidatePath("/contacts");
  if (company.companyId) {
    revalidatePath(`/companies/${company.companyId}`);
    revalidatePath("/companies");
  }
  return { status: "success", message: `${parsed.data.fullName} added.` };
}

export async function updateContactAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = contactUpdateSchema.safeParse({
    id: textField(formData, "contactId"),
    ...parseContactFields(formData),
  });

  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const membership = await requireActiveMembership();
  const supabase = await createClient();
  const company = await resolveCompanyId(
    supabase,
    membership.organizationId,
    parsed.data.companyId,
    membership.powerbridgeEnabled,
  );
  if (!company.ok) return company.state;

  const { data, error } = await supabase
    .from("contacts")
    .update({
      company_id: company.companyId,
      ...contactPayload(parsed.data),
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", membership.organizationId)
    .select("id");

  if (error) {
    return failure(mapWriteError(error.message));
  }

  if (!data || data.length === 0) {
    return failure("That contact no longer exists in this organization.");
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${parsed.data.id}`);
  revalidatePath("/companies");
  if (company.companyId) {
    revalidatePath(`/companies/${company.companyId}`);
  }
  return { status: "success", message: `${parsed.data.fullName} updated.` };
}

export async function deleteContactAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const contactId = formData.get("contactId");
  if (typeof contactId !== "string") {
    return failure("This contact reference is invalid. Reload the page.");
  }

  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", contactId)
    .eq("organization_id", membership.organizationId);

  if (error) {
    if (
      error.code === "23503" ||
      /leads_contact_id|call_records_contact_id|campaign_contacts_contact_id|foreign key/i.test(
        error.message,
      )
    ) {
      return failure(
        "This contact has leads, call records, or campaigns, so it cannot be deleted. History stays attached to the contact.",
      );
    }
    return failure(error.message);
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/companies");

  if (formData.get("redirectTo") === "/contacts") {
    redirect("/contacts");
  }

  return { status: "success", message: "Contact deleted." };
}
