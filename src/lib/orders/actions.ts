"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/dal";
import { toFieldErrors, type AuthFormState } from "@/lib/auth/validation";
import { checkboxFromForm } from "@/lib/contacts/validation";
import { orderSchema, orderUpdateSchema } from "@/lib/orders/validation";
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
    return "That company, contact, or lead is not in your organization.";
  }
  if (message.includes("Order company does not exist")) {
    return "That company is no longer available.";
  }
  if (message.includes("Order contact does not exist")) {
    return "That contact is no longer available.";
  }
  if (message.includes("Order lead does not exist")) {
    return "That lead is no longer available.";
  }
  if (message.includes("match the lead company")) {
    return "Order company must match the lead company.";
  }
  return message;
}

function requirePowerbridge() {
  return requireActiveMembership().then((membership) => {
    if (!membership.powerbridgeEnabled) {
      return {
        ok: false as const,
        state: failure("Orders are only available for PowerBridge orgs."),
      };
    }
    return { ok: true as const, membership };
  });
}

function moneyOrNull(value: string | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(value: number | undefined): number | null {
  return value == null ? null : value;
}

function orderPayload(data: {
  companyId: string;
  leadId?: string;
  contactId?: string;
  orderDate: string;
  vertical?: string;
  imo?: string;
  leadType?: string;
  ageRange?: string;
  leadProvider?: string;
  quantity?: number;
  costPerRecord?: string;
  extraFreeLeads?: number;
  states?: string;
  invoiceNumber?: string;
  collected?: string;
  ourCost?: string;
  paymentMethod?: string;
  paymentStatus?: "pending" | "paid" | "partial" | "refunded";
  paymentTerms?: string;
  paidProvider: boolean;
  deliveryStatus?: "pending" | "delivered" | "partial" | "cancelled";
  deliveryDate?: string;
  notes?: string;
}) {
  return {
    company_id: data.companyId,
    lead_id: data.leadId ?? null,
    contact_id: data.contactId ?? null,
    order_date: data.orderDate,
    vertical: data.vertical ?? null,
    imo: data.imo ?? null,
    lead_type: data.leadType ?? null,
    age_range: data.ageRange ?? null,
    lead_provider: data.leadProvider ?? null,
    quantity: intOrNull(data.quantity),
    cost_per_record: moneyOrNull(data.costPerRecord),
    extra_free_leads: intOrNull(data.extraFreeLeads),
    states: data.states ?? null,
    invoice_number: data.invoiceNumber ?? null,
    collected: moneyOrNull(data.collected),
    our_cost: moneyOrNull(data.ourCost),
    payment_method: data.paymentMethod ?? null,
    payment_status: data.paymentStatus ?? null,
    payment_terms: data.paymentTerms ?? null,
    paid_provider: data.paidProvider,
    delivery_status: data.deliveryStatus ?? null,
    delivery_date: data.deliveryDate ?? null,
    notes: data.notes ?? null,
  };
}

function parseOrderFields(formData: FormData) {
  return {
    companyId: textField(formData, "companyId"),
    leadId: textField(formData, "leadId"),
    contactId: textField(formData, "contactId"),
    orderDate: textField(formData, "orderDate"),
    vertical: textField(formData, "vertical"),
    imo: textField(formData, "imo"),
    leadType: textField(formData, "leadType"),
    ageRange: textField(formData, "ageRange"),
    leadProvider: textField(formData, "leadProvider"),
    quantity: textField(formData, "quantity"),
    costPerRecord: textField(formData, "costPerRecord"),
    extraFreeLeads: textField(formData, "extraFreeLeads"),
    states: textField(formData, "states"),
    invoiceNumber: textField(formData, "invoiceNumber"),
    collected: textField(formData, "collected"),
    ourCost: textField(formData, "ourCost"),
    paymentMethod: textField(formData, "paymentMethod"),
    paymentStatus: textField(formData, "paymentStatus"),
    paymentTerms: textField(formData, "paymentTerms"),
    paidProvider: checkboxFromForm(formData, "paidProvider"),
    deliveryStatus: textField(formData, "deliveryStatus"),
    deliveryDate: textField(formData, "deliveryDate"),
    notes: textField(formData, "notes"),
  };
}

function revalidateOrderPaths(companyId: string, leadId?: string | null) {
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  revalidatePath("/orders");
  if (leadId) {
    revalidatePath(`/leads/${leadId}`);
  }
  revalidatePath("/leads");
}

export async function createOrderAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = orderSchema.safeParse(parseOrderFields(formData));
  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const gate = await requirePowerbridge();
  if (!gate.ok) return gate.state;

  const [user] = await Promise.all([requireCurrentUser()]);
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("id", parsed.data.companyId)
    .eq("organization_id", gate.membership.organizationId)
    .maybeSingle();
  if (!company) {
    return failure("Choose a company from this organization.");
  }

  if (parsed.data.contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, company_id")
      .eq("id", parsed.data.contactId)
      .eq("organization_id", gate.membership.organizationId)
      .maybeSingle();
    if (!contact) {
      return failure("Choose a contact from this organization.");
    }
    if (contact.company_id !== parsed.data.companyId) {
      return failure("Choose a contact that belongs to this company.");
    }
  }

  if (parsed.data.leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("id, company_id, purpose")
      .eq("id", parsed.data.leadId)
      .eq("organization_id", gate.membership.organizationId)
      .maybeSingle();
    if (!lead) {
      return failure("That lead is no longer available.");
    }
    if (lead.purpose !== "powerbridge") {
      return failure("Orders can only be linked to PowerBridge leads.");
    }
    if (lead.company_id && lead.company_id !== parsed.data.companyId) {
      return failure("Order company must match the lead company.");
    }
  }

  const { error } = await supabase.from("orders").insert({
    organization_id: gate.membership.organizationId,
    ...orderPayload(parsed.data),
    created_by: user.id,
  });

  if (error) {
    return failure(mapWriteError(error.message));
  }

  revalidateOrderPaths(parsed.data.companyId, parsed.data.leadId);
  return { status: "success", message: "Order added." };
}

export async function updateOrderAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = orderUpdateSchema.safeParse({
    id: textField(formData, "orderId"),
    ...parseOrderFields(formData),
  });
  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const gate = await requirePowerbridge();
  if (!gate.ok) return gate.state;

  const supabase = await createClient();

  if (parsed.data.contactId) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, company_id")
      .eq("id", parsed.data.contactId)
      .eq("organization_id", gate.membership.organizationId)
      .maybeSingle();
    if (!contact) {
      return failure("Choose a contact from this organization.");
    }
    if (contact.company_id !== parsed.data.companyId) {
      return failure("Choose a contact that belongs to this company.");
    }
  }

  const { data, error } = await supabase
    .from("orders")
    .update(orderPayload(parsed.data))
    .eq("id", parsed.data.id)
    .eq("organization_id", gate.membership.organizationId)
    .select("id, company_id, lead_id");

  if (error) {
    return failure(mapWriteError(error.message));
  }
  if (!data?.length) {
    return failure("That order is no longer available.");
  }

  const companyId = data[0].company_id as string;
  const leadId = data[0].lead_id as string | null;
  revalidateOrderPaths(companyId, leadId ?? parsed.data.leadId);
  revalidatePath(`/orders/${parsed.data.id}`);
  revalidatePath(`/orders/${parsed.data.id}`, "page");
  return { status: "success", message: "Order saved." };
}

/** Copy buyer/product fields into a new order for reorders; reset payment & delivery. */
export async function duplicateOrderAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const id = textField(formData, "orderId");
  if (!id) {
    return failure("Missing order.");
  }

  const gate = await requirePowerbridge();
  if (!gate.ok) return gate.state;

  const user = await requireCurrentUser();
  const supabase = await createClient();

  const { data: source, error: loadError } = await supabase
    .from("orders")
    .select(
      "id, company_id, lead_id, contact_id, vertical, imo, lead_type, age_range, lead_provider, quantity, cost_per_record, extra_free_leads, states, our_cost, payment_method, payment_terms, notes",
    )
    .eq("id", id)
    .eq("organization_id", gate.membership.organizationId)
    .maybeSingle();

  if (loadError || !source) {
    return failure("That order is no longer available.");
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: created, error } = await supabase
    .from("orders")
    .insert({
      organization_id: gate.membership.organizationId,
      company_id: source.company_id,
      lead_id: source.lead_id,
      contact_id: source.contact_id,
      order_date: today,
      vertical: source.vertical,
      imo: source.imo,
      lead_type: source.lead_type,
      age_range: source.age_range,
      lead_provider: source.lead_provider,
      quantity: source.quantity,
      cost_per_record: source.cost_per_record,
      extra_free_leads: source.extra_free_leads,
      states: source.states,
      our_cost: source.our_cost,
      payment_method: source.payment_method,
      payment_terms: source.payment_terms,
      notes: source.notes,
      collected: null,
      payment_status: "pending",
      paid_provider: false,
      delivery_status: "pending",
      delivery_date: null,
      created_by: user.id,
    })
    .select("id, company_id, lead_id")
    .maybeSingle();

  if (error || !created) {
    return failure(mapWriteError(error?.message ?? "Could not duplicate order."));
  }

  revalidateOrderPaths(created.company_id as string, created.lead_id as string | null);
  redirect(`/orders/${created.id}`);
}

export async function deleteOrderAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const id = textField(formData, "orderId");
  const companyId = textField(formData, "companyId");
  const leadId = textField(formData, "leadId");
  if (!id) {
    return failure("Missing order.");
  }

  const gate = await requirePowerbridge();
  if (!gate.ok) return gate.state;

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .delete()
    .eq("id", id)
    .eq("organization_id", gate.membership.organizationId);

  if (error) {
    return failure(error.message);
  }

  if (companyId) {
    revalidateOrderPaths(companyId, leadId);
  } else {
    revalidatePath("/orders");
    revalidatePath("/companies");
  }
  redirect(companyId ? `/companies/${companyId}` : "/orders");
}
