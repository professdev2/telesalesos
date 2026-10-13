import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import {
  ManageBillingButton,
  StartCheckoutButton,
} from "@/components/billing/billing-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasAtLeastRole } from "@/lib/auth/dal";
import { getOrgBilling } from "@/lib/billing/queries";
import {
  isStripeConfigured,
  SEAT_PRICE_DISPLAY_USD,
  TRIAL_DAYS,
} from "@/lib/billing/stripe";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Billing | TelesalesOS",
};

function statusLabel(status: string): string {
  switch (status) {
    case "none":
      return "Not subscribed";
    case "trialing":
      return "Trialing";
    case "active":
      return "Active";
    case "past_due":
      return "Past due";
    case "canceled":
      return "Canceled";
    case "unpaid":
      return "Unpaid";
    case "incomplete":
      return "Incomplete";
    case "incomplete_expired":
      return "Expired";
    case "paused":
      return "Paused";
    default:
      return status;
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [membership, params] = await Promise.all([
    requireActiveMembership(),
    searchParams,
  ]);
  const billing = await getOrgBilling(membership.organizationId);
  const canManage = hasAtLeastRole(membership.role, "admin");
  const configured = isStripeConfigured();
  const checkout = Array.isArray(params.checkout)
    ? params.checkout[0]
    : params.checkout;

  const seats = billing?.activeSeats ?? 1;
  const estimate = seats * SEAT_PRICE_DISPLAY_USD;
  const subscribed =
    billing?.billingStatus === "active" || billing?.billingStatus === "trialing";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description={`${membership.organizationName} — $${SEAT_PRICE_DISPLAY_USD}/seat/month · ${TRIAL_DAYS}-day trial`}
      />

      {!configured ? (
        <Alert>
          <AlertDescription>
            Stripe keys are not configured in this environment yet.
          </AlertDescription>
        </Alert>
      ) : null}

      {checkout === "success" ? (
        <Alert>
          <AlertDescription>
            Checkout completed. Status updates within a few seconds after Stripe
            sends the webhook — refresh if it still says Not subscribed.
          </AlertDescription>
        </Alert>
      ) : null}

      {checkout === "cancel" ? (
        <Alert>
          <AlertDescription>Checkout canceled. No charge was made.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-xl">
              {statusLabel(billing?.billingStatus ?? "none")}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active seats</CardDescription>
            <CardTitle className="text-xl tabular-nums">{seats}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Every active member counts as a seat.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Estimated monthly</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              ${estimate.toLocaleString("en-US")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {seats} × ${SEAT_PRICE_DISPLAY_USD}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Trial ends</CardDescription>
            <CardTitle className="text-base">
              {formatDate(billing?.trialEndsAt ?? null)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Period end: {formatDate(billing?.currentPeriodEnd ?? null)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscription</CardTitle>
          <CardDescription>
            Test mode only. Use Stripe test cards (e.g. 4242 4242 4242 4242).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManage ? (
            <p className="text-muted-foreground text-sm">
              Only owners and admins can start or manage billing for this
              organization.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {!subscribed ? <StartCheckoutButton /> : null}
              {billing?.stripeCustomerId ? <ManageBillingButton /> : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
