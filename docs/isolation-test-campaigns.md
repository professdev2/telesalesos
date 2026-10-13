# Isolation test — CRM records (`campaigns`, `campaign_contacts`)

**Date:** 2026-09-16
**Project:** TelesalesOS Staging (`ceyaylgqcletophrjlja`)
**Result: PASS (11/11)**

A user from Organization A cannot query Organization B's campaigns, cannot insert a campaign into Organization B, cannot add Organization B's contact to Organization A's campaign, and cannot insert a membership into Organization B.

Reproduce with:

```
node scripts/isolation-campaigns.mjs
```

Also re-run:

```
node scripts/isolation-call-records.mjs
node scripts/isolation-leads.mjs --no-seed
node scripts/isolation-contacts.mjs --no-seed
```

Call records isolation remained **PASS (10/10)**. Leads isolation remained **PASS (9/9)**. Contacts isolation remained **PASS (7/7)**.

## Subjects

Dedicated isolation tenants from 8 Sep. `D104 Verify Org` / `admin@gmail.com` was **not** used.

| Tenant | Email | Organization | Org id | Seeded contact | Seeded campaign |
| --- | --- | --- | --- | --- | --- |
| A | `isolation.a.d10@gmail.com` | Isolation Org A | `b00174b6-bb5d-4856-bfcf-a0bf9868f01b` | Alice A | `isolation-campaign-A` (removed after the run) |
| B | `isolation.b.d10@gmail.com` | Isolation Org B | `552bf447-1115-4808-9a2c-d3de4511a25e` | Bob B | `isolation-campaign-B` (removed after the run) |

Passwords live only in the gitignored `.env.local`.

## Method

1. Password-grant a JWT for each user against `/auth/v1/token`.
2. Call PostgREST as that user with the **publishable** key.
3. Each campaign and membership was seeded **by its own owner**. The service role key was never read.

Pass conditions: empty array on illicit read; rejection **plus** absence of the row on write.

## Enforcement under test

`public.campaigns` and `public.campaign_contacts`, migration `20260916180000_campaigns.sql`:

- `ENABLE` and `FORCE ROW LEVEL SECURITY` on both tables.
- Policies require `private.is_active_member(organization_id)`.
- `private.campaigns_guard_organization()` refuses cross-tenant campaign writes.
- `private.campaign_contacts_guard_organization()` requires campaign and contact to share `organization_id`.
- `campaign_contacts.contact_id` is **`ON DELETE RESTRICT`**.
- No grants to `anon`.

In the application, `organization_id` is taken from the session in `src/lib/campaigns/actions.ts`.

## Results

| # | Check | Response | Verdict |
| --- | --- | --- | --- |
| 1 | A lists campaigns | `[{ isolation-campaign-A }]`, all Org A (200) | PASS |
| 2 | A: `organization_id=eq.<Org B>` | `[]` (200) | PASS |
| 3 | B lists campaigns | `[{ isolation-campaign-B }]`, all Org B (200) | PASS |
| 4 | B: `organization_id=eq.<Org A>` | `[]` (200) | PASS |
| 5 | **A `POST campaigns` with Org B `organization_id`** | `403` `42501` | PASS |
| 6 | **A `POST campaign_contacts` with A's campaign and B's contact** | `403` `42501` — "Campaign contact must belong to the same organization" | PASS |
| 7 | **A `POST campaign_contacts` into Org B** | `403` `42501` | PASS |
| 8 | B re-reads campaigns | no Fake Bob campaign | PASS |
| 9 | B re-reads memberships | Org B only | PASS |
| 10 | No JWT on `campaigns` | `401` | PASS |
| 11 | No JWT on `campaign_contacts` | `401` | PASS |

The `42501` on writes was raised by the row trigger. RLS `WITH CHECK` is also in place.

## MFA state

Isolation users are organization owners. REST checks ran on **aal1** tokens and were still blocked.

## What this does not prove

- Telnyx, power-dial, CSV import, or DNC automation.
- Isolation of Training, QuoteCoach, or Billing (still placeholders).
