import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import {
  applySubscriptionToOrg,
  resolveOrganizationIdFromStripe,
} from "@/lib/billing/service";
import { getStripe } from "@/lib/billing/stripe";
import { updateOrgBillingAdmin } from "@/lib/billing/queries";

export const runtime = "nodejs";

function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  if ("deleted" in customer && customer.deleted) return null;
  return customer.id;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const organizationId =
    session.metadata?.organization_id ||
    session.client_reference_id ||
    null;
  const customerId = customerIdOf(session.customer);
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!organizationId || !subscriptionId) return;

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  await applySubscriptionToOrg(organizationId, sub, customerId);
}

async function handleSubscriptionEvent(sub: Stripe.Subscription) {
  const customerId = customerIdOf(sub.customer);
  const organizationId = await resolveOrganizationIdFromStripe({
    organizationId: sub.metadata?.organization_id ?? null,
    customerId,
    subscriptionId: sub.id,
  });
  if (!organizationId) return;

  await applySubscriptionToOrg(organizationId, sub, customerId);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const customerId = customerIdOf(sub.customer);
  const organizationId = await resolveOrganizationIdFromStripe({
    organizationId: sub.metadata?.organization_id ?? null,
    customerId,
    subscriptionId: sub.id,
  });
  if (!organizationId) return;

  await updateOrgBillingAdmin(organizationId, {
    billingStatus: "canceled",
    stripeSubscriptionId: sub.id,
    trialEndsAt: null,
    ...(customerId ? { stripeCustomerId: customerId } : {}),
  });
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionEvent(
          event.data.object as Stripe.Subscription,
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await handleSubscriptionEvent(sub);
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("[stripe webhook]", error);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
