-- Org SaaS billing (Stripe). Column writes go through service_role only;
-- authenticated still has UPDATE (name) only.

ALTER TABLE public.organizations
  ADD COLUMN stripe_customer_id text
    CONSTRAINT organizations_stripe_customer_id_length
      CHECK (stripe_customer_id IS NULL OR length(stripe_customer_id) <= 255),
  ADD COLUMN stripe_subscription_id text
    CONSTRAINT organizations_stripe_subscription_id_length
      CHECK (stripe_subscription_id IS NULL OR length(stripe_subscription_id) <= 255),
  ADD COLUMN billing_status text NOT NULL DEFAULT 'none'
    CONSTRAINT organizations_billing_status_valid
      CHECK (
        billing_status IN (
          'none',
          'trialing',
          'active',
          'past_due',
          'canceled',
          'unpaid',
          'incomplete',
          'incomplete_expired',
          'paused'
        )
      ),
  ADD COLUMN seat_quantity integer NOT NULL DEFAULT 0
    CONSTRAINT organizations_seat_quantity_nonneg CHECK (seat_quantity >= 0),
  ADD COLUMN trial_ends_at timestamptz,
  ADD COLUMN current_period_end timestamptz,
  ADD COLUMN billing_updated_at timestamptz;

COMMENT ON COLUMN public.organizations.stripe_customer_id IS
  'Stripe Customer id (cus_…). Written by billing server actions / webhooks via service_role.';
COMMENT ON COLUMN public.organizations.stripe_subscription_id IS
  'Stripe Subscription id (sub_…).';
COMMENT ON COLUMN public.organizations.billing_status IS
  'Mirror of Stripe subscription status, or none when never subscribed.';
COMMENT ON COLUMN public.organizations.seat_quantity IS
  'Last synced billable seat count (active memberships).';

CREATE UNIQUE INDEX organizations_stripe_customer_id_uidx
  ON public.organizations (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX organizations_stripe_subscription_id_uidx
  ON public.organizations (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
