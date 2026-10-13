import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type BillingStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export type OrgBilling = {
  organizationId: string;
  organizationName: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  billingStatus: BillingStatus;
  seatQuantity: number;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  billingUpdatedAt: string | null;
  activeSeats: number;
};

const BILLING_STATUSES: BillingStatus[] = [
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
];

export function mapBillingStatus(raw: string | null | undefined): BillingStatus {
  if (raw && (BILLING_STATUSES as string[]).includes(raw)) {
    return raw as BillingStatus;
  }
  return "none";
}

/** Active memberships = billable seats. */
export async function countActiveSeats(organizationId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("organization_memberships")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "active");

  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

export async function getOrgBilling(
  organizationId: string,
): Promise<OrgBilling | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select(
      "id, name, stripe_customer_id, stripe_subscription_id, billing_status, seat_quantity, trial_ends_at, current_period_end, billing_updated_at",
    )
    .eq("id", organizationId)
    .maybeSingle();

  if (error || !data) return null;

  const activeSeats = await countActiveSeats(organizationId);

  return {
    organizationId: data.id as string,
    organizationName: data.name as string,
    stripeCustomerId: (data.stripe_customer_id as string | null) ?? null,
    stripeSubscriptionId: (data.stripe_subscription_id as string | null) ?? null,
    billingStatus: mapBillingStatus(data.billing_status as string | null),
    seatQuantity: Number(data.seat_quantity ?? 0),
    trialEndsAt: (data.trial_ends_at as string | null) ?? null,
    currentPeriodEnd: (data.current_period_end as string | null) ?? null,
    billingUpdatedAt: (data.billing_updated_at as string | null) ?? null,
    activeSeats,
  };
}

export async function updateOrgBillingAdmin(
  organizationId: string,
  patch: {
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    billingStatus?: BillingStatus;
    seatQuantity?: number;
    trialEndsAt?: string | null;
    currentPeriodEnd?: string | null;
  },
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("SUPABASE_SECRET_KEY is required to update billing fields.");
  }

  const row: Record<string, unknown> = {
    billing_updated_at: new Date().toISOString(),
  };
  if (patch.stripeCustomerId !== undefined) {
    row.stripe_customer_id = patch.stripeCustomerId;
  }
  if (patch.stripeSubscriptionId !== undefined) {
    row.stripe_subscription_id = patch.stripeSubscriptionId;
  }
  if (patch.billingStatus !== undefined) {
    row.billing_status = patch.billingStatus;
  }
  if (patch.seatQuantity !== undefined) {
    row.seat_quantity = patch.seatQuantity;
  }
  if (patch.trialEndsAt !== undefined) {
    row.trial_ends_at = patch.trialEndsAt;
  }
  if (patch.currentPeriodEnd !== undefined) {
    row.current_period_end = patch.currentPeriodEnd;
  }

  const { error } = await admin
    .from("organizations")
    .update(row)
    .eq("id", organizationId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function findOrgIdByStripeCustomerId(
  customerId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data } = await admin
    .from("organizations")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return data?.id ? String(data.id) : null;
}

export async function findOrgIdByStripeSubscriptionId(
  subscriptionId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data } = await admin
    .from("organizations")
    .select("id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  return data?.id ? String(data.id) : null;
}
