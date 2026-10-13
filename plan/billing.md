# Billing

**Status:** first slice in progress (test mode).  
**Price (client locked):** $125 / seat / month · seat = every active member · 3-day trial.  
**Starts after:** Stripe test keys in env + Product/Price created.  
**Client block:** Stripe account under the **client’s** legal entity.

---

## Out of scope until approved

- Charging real cards / live mode.
- Storing PAN/CVC in Postgres.
- Hard lockout of CRM on failed payment (soft banners only in v1).
- Agency-to-agent commission ledgers.

---

## First slice (implemented)

1. Org billing columns + service_role writes.
2. Checkout Session (quantity = active seats, trial 3 days).
3. Customer Portal.
4. Signed webhooks sync status/quantity.
5. Seat sync on invite accept.
6. `/billing` page for Owner/Admin.

## Env

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Done when

Checkout in Stripe test mode updates Staging org status. No production charges.
