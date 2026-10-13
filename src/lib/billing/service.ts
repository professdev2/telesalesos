import "server-only";

import type Stripe from "stripe";

import {
  findOrgIdByStripeCustomerId,
  findOrgIdByStripeSubscriptionId,
  mapBillingStatus,
  updateOrgBillingAdmin,
  type BillingStatus,
} from "@/lib/billing/queries";
import { getStripe, getStripePriceId, TRIAL_DAYS } from "@/lib/billing/stripe";
import { getSiteUrl } from "@/lib/site-url";

function unixToIso(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

export function subscriptionToBillingPatch(sub: Stripe.Subscription): {
  stripeSubscriptionId: string;
  billingStatus: BillingStatus;
  seatQuantity: number;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
} {
  const item = sub.items.data[0];
  const quantity = item?.quantity ?? 0;
  return {
    stripeSubscriptionId: sub.id,
    billingStatus: mapBillingStatus(sub.status),
    seatQuantity: quantity,
    trialEndsAt: unixToIso(sub.trial_end),
    currentPeriodEnd: unixToIso(sub.current_period_end),
  };
}

export async function ensureStripeCustomer(opts: {
  organizationId: string;
  organizationName: string;
  existingCustomerId: string | null;
  email: string | null;
}): Promise<string> {
  const stripe = getStripe();
  if (opts.existingCustomerId) {
    return opts.existingCustomerId;
  }

  const customer = await stripe.customers.create({
    name: opts.organizationName,
    email: opts.email ?? undefined,
    metadata: { organization_id: opts.organizationId },
  });

  await updateOrgBillingAdmin(opts.organizationId, {
    stripeCustomerId: customer.id,
  });

  return customer.id;
}

export async function createCheckoutSession(opts: {
  organizationId: string;
  organizationName: string;
  customerId: string;
  seatQuantity: number;
}): Promise<string> {
  const stripe = getStripe();
  const siteUrl = await getSiteUrl();
  const quantity = Math.max(1, opts.seatQuantity);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: opts.customerId,
    client_reference_id: opts.organizationId,
    line_items: [
      {
        price: getStripePriceId(),
        quantity,
      },
    ],
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: { organization_id: opts.organizationId },
    },
    metadata: { organization_id: opts.organizationId },
    success_url: `${siteUrl}/billing?checkout=success`,
    cancel_url: `${siteUrl}/billing?checkout=cancel`,
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new Error("Stripe Checkout did not return a URL.");
  }
  return session.url;
}

export async function createBillingPortalSession(opts: {
  customerId: string;
}): Promise<string> {
  const stripe = getStripe();
  const siteUrl = await getSiteUrl();
  const session = await stripe.billingPortal.sessions.create({
    customer: opts.customerId,
    return_url: `${siteUrl}/billing`,
  });
  return session.url;
}

export async function syncSubscriptionQuantity(opts: {
  subscriptionId: string;
  seatQuantity: number;
}): Promise<void> {
  const stripe = getStripe();
  const quantity = Math.max(1, opts.seatQuantity);
  const sub = await stripe.subscriptions.retrieve(opts.subscriptionId);
  const itemId = sub.items.data[0]?.id;
  if (!itemId) {
    throw new Error("Subscription has no line items.");
  }

  await stripe.subscriptions.update(opts.subscriptionId, {
    items: [{ id: itemId, quantity }],
    proration_behavior: "create_prorations",
    metadata: sub.metadata,
  });
}

/** Best-effort: update Stripe quantity when active seats change. */
export async function syncOrgSeatQuantity(
  organizationId: string,
  seatQuantity: number,
): Promise<void> {
  const { getOrgBilling } = await import("@/lib/billing/queries");
  const billing = await getOrgBilling(organizationId);
  if (!billing?.stripeSubscriptionId) return;
  if (
    billing.billingStatus === "canceled" ||
    billing.billingStatus === "none" ||
    billing.billingStatus === "incomplete_expired"
  ) {
    return;
  }

  await syncSubscriptionQuantity({
    subscriptionId: billing.stripeSubscriptionId,
    seatQuantity,
  });

  await updateOrgBillingAdmin(organizationId, {
    seatQuantity: Math.max(1, seatQuantity),
  });
}

export async function applySubscriptionToOrg(
  organizationId: string,
  sub: Stripe.Subscription,
  customerId?: string | null,
): Promise<void> {
  const patch = subscriptionToBillingPatch(sub);
  await updateOrgBillingAdmin(organizationId, {
    ...patch,
    ...(customerId ? { stripeCustomerId: customerId } : {}),
  });
}

export async function resolveOrganizationIdFromStripe(opts: {
  organizationId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}): Promise<string | null> {
  if (opts.organizationId) return opts.organizationId;
  if (opts.subscriptionId) {
    const bySub = await findOrgIdByStripeSubscriptionId(opts.subscriptionId);
    if (bySub) return bySub;
  }
  if (opts.customerId) {
    return findOrgIdByStripeCustomerId(opts.customerId);
  }
  return null;
}
