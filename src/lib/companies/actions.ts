"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/dal";
import { toFieldErrors, type AuthFormState } from "@/lib/auth/validation";
import {
  companySchema,
  companyUpdateSchema,
} from "@/lib/companies/validation";
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

function requirePowerbridge() {
  return requireActiveMembership().then((membership) => {
    if (!membership.powerbridgeEnabled) {
      return { ok: false as const, state: failure("Companies are only available for PowerBridge orgs.") };
    }
    return { ok: true as const, membership };
  });
}

function companyPayload(data: {
  name: string;
  website?: string;
  imo?: string;
  state?: string;
  priority?: "hot" | "warm" | "cold";
  notes?: string;
}) {
  return {
    name: data.name,
    website: data.website ?? null,
    imo: data.imo ?? null,
    state: data.state ?? null,
    priority: data.priority ?? null,
    notes: data.notes ?? null,
  };
}

function parseCompanyFields(formData: FormData) {
  return {
    name: textField(formData, "name"),
    website: textField(formData, "website"),
    imo: textField(formData, "imo"),
    state: textField(formData, "state"),
    priority: textField(formData, "priority"),
    notes: textField(formData, "notes"),
  };
}

export async function createCompanyAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = companySchema.safeParse(parseCompanyFields(formData));
  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const gate = await requirePowerbridge();
  if (!gate.ok) return gate.state;

  const [user] = await Promise.all([requireCurrentUser()]);
  const supabase = await createClient();
  const { error } = await supabase.from("companies").insert({
    organization_id: gate.membership.organizationId,
    ...companyPayload(parsed.data),
    created_by: user.id,
  });

  if (error) {
    return failure(error.message);
  }

  revalidatePath("/companies");
  revalidatePath("/leads");
  return { status: "success", message: `${parsed.data.name} added.` };
}

export async function updateCompanyAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = companyUpdateSchema.safeParse({
    id: textField(formData, "companyId"),
    ...parseCompanyFields(formData),
  });
  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const gate = await requirePowerbridge();
  if (!gate.ok) return gate.state;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update(companyPayload(parsed.data))
    .eq("id", parsed.data.id)
    .eq("organization_id", gate.membership.organizationId)
    .select("id");

  if (error) {
    return failure(error.message);
  }
  if (!data?.length) {
    return failure("That company is no longer available.");
  }

  revalidatePath("/companies");
  revalidatePath(`/companies/${parsed.data.id}`);
  revalidatePath("/leads");
  return { status: "success", message: "Company saved." };
}

export async function deleteCompanyAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const id = textField(formData, "companyId");
  if (!id) {
    return failure("Missing company.");
  }

  const gate = await requirePowerbridge();
  if (!gate.ok) return gate.state;

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .delete()
    .eq("id", id)
    .eq("organization_id", gate.membership.organizationId);

  if (error) {
    return failure(error.message);
  }

  revalidatePath("/companies");
  revalidatePath("/leads");
  redirect("/companies");
}
