"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasAtLeastRole, requireCurrentUser } from "@/lib/auth/dal";
import { requireMfaSatisfied } from "@/lib/auth/mfa";
import type { AuthFormState } from "@/lib/auth/validation";
import { countActiveSeats, getOrgBilling } from "@/lib/billing/queries";
import {
  createBillingPortalSession,
  createCheckoutSession,
  ensureStripeCustomer,
  syncOrgSeatQuantity,
} from "@/lib/billing/service";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { requireActiveMembership } from "@/lib/org/active-org";

function failure(message: string): AuthFormState {
  return { status: "error", message };
}

export async function startCheckoutAction(): Promise<AuthFormState> {
  if (!isStripeConfigured()) {
    return failure("Stripe is not configured on this environment.");
  }

  await requireMfaSatisfied();
  const [user, membership] = await Promise.all([
    requireCurrentUser(),
    requireActiveMembership(),
  ]);

  if (!hasAtLeastRole(membership.role, "admin")) {
    return failure("Only owners and admins can manage billing.");
  }

  const billing = await getOrgBilling(membership.organizationId);
  if (!billing) {
    return failure("Organization not found.");
  }

  if (
    billing.billingStatus === "active" ||
    billing.billingStatus === "trialing"
  ) {
    return failure("This organization already has an active subscription.");
  }

  let url: string;
  try {
    const seats = Math.max(1, await countActiveSeats(membership.organizationId));
    const customerId = await ensureStripeCustomer({
      organizationId: membership.organizationId,
      organizationName: membership.organizationName,
      existingCustomerId: billing.stripeCustomerId,
      email: user.email,
    });

    url = await createCheckoutSession({
      organizationId: membership.organizationId,
      organizationName: membership.organizationName,
      customerId,
      seatQuantity: seats,
    });
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : "Could not start checkout.",
    );
  }

  redirect(url);
}

export async function openBillingPortalAction(): Promise<AuthFormState> {
  if (!isStripeConfigured()) {
    return failure("Stripe is not configured on this environment.");
  }

  await requireMfaSatisfied();
  const membership = await requireActiveMembership();

  if (!hasAtLeastRole(membership.role, "admin")) {
    return failure("Only owners and admins can manage billing.");
  }

  const billing = await getOrgBilling(membership.organizationId);
  if (!billing?.stripeCustomerId) {
    return failure("No Stripe customer yet. Start a subscription first.");
  }

  let url: string;
  try {
    url = await createBillingPortalSession({
      customerId: billing.stripeCustomerId,
    });
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : "Could not open billing portal.",
    );
  }

  redirect(url);
}

/** Call after membership changes that affect active seat count. */
export async function syncBillingSeatsForOrg(
  organizationId: string,
): Promise<void> {
  if (!isStripeConfigured()) return;
  try {
    const seats = await countActiveSeats(organizationId);
    await syncOrgSeatQuantity(organizationId, seats);
    revalidatePath("/billing");
  } catch {
    // Seat sync must not block invite accept.
  }
}
