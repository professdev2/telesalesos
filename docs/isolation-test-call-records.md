# Isolation test — CRM records (`call_records`)

**Date:** 2026-09-16
**Project:** TelesalesOS Staging (`ceyaylgqcletophrjlja`)
**Result: PASS (10/10)**

This extends the leads isolation test (`docs/isolation-test-leads.md`) to manual attempt history. A user from Organization A cannot query Organization B's call records, cannot insert a call record into Organization B, cannot attach a call record to Organization B's contact, and cannot attach a call record to Organization B's lead.

Reproduce with:

```
node scripts/isolation-call-records.mjs
```

Also re-run:

```
node scripts/isolation-leads.mjs --no-seed
node scripts/isolation-contacts.mjs --no-seed
```

Leads isolation remained **PASS (9/9)**. Contacts isolation remained **PASS (7/7)**.

## Subjects

The dedicated isolation tenants from 8 Sep. `D104 Verify Org` / `admin@gmail.com` was **not** used as either tenant.

| Tenant | Email | Organization | Org id | Seeded contact | Seeded notes |
| --- | --- | --- | --- | --- | --- |
| A | `isolation.a.d10@gmail.com` | Isolation Org A | `b00174b6-bb5d-4856-bfcf-a0bf9868f01b` | Alice A | `isolation-call-A` (removed after the run) |
| B | `isolation.b.d10@gmail.com` | Isolation Org B | `552bf447-1115-4808-9a2c-d3de4511a25e` | Bob B | `isolation-call-B` (removed after the run) |

Passwords live only in the gitignored `.env.local`.

## Method

1. Password-grant a JWT for each user against `/auth/v1/token`.
2. Call PostgREST as that user (`Authorization: Bearer <access_token>` plus the **publishable** key) — the same privilege the browser has.
3. Each call record was seeded **by its own owner** through that session, against that owner's contact and lead. The service role key was never read.

Pass conditions: an empty array on illicit read, and on write a rejection **plus** the absence of the row.

## Enforcement under test

`public.call_records`, migration `20260916140000_call_records.sql`:

- `ENABLE` and `FORCE ROW LEVEL SECURITY`.
- SELECT / INSERT / UPDATE / DELETE policies require `private.is_active_member(organization_id)`, with `WITH CHECK` on the write paths.
- `private.call_records_guard_organization()` re-checks membership, refuses org and contact moves, requires the contact to belong to the same organization, and requires an optional lead to belong to the same organization **and** the same contact.
- `contact_id` and `lead_id` reference their parents **`ON DELETE RESTRICT`**.
- No grants to `anon`; `authenticated` reaches the table only through RLS.

In the application, `organization_id` is taken from the session in `src/lib/calls/actions.ts` and is never read from the submitted form.

## Results

| # | Check | Response | Verdict |
| --- | --- | --- | --- |
| 1 | A: `GET call_records?select=id,notes,organization_id,contact_id` | `[{ isolation-call-A }]`, all rows Org A (200) | PASS |
| 2 | A: `GET call_records?organization_id=eq.<Org B>` | `[]` (200) | PASS |
| 3 | B: `GET call_records?select=id,notes,organization_id` | `[{ isolation-call-B }]`, all rows Org B (200) | PASS |
| 4 | B: `GET call_records?organization_id=eq.<Org A>` (reverse) | `[]` (200) | PASS |
| 5 | **A: `POST call_records` with Org B `organization_id` and Org B `contact_id`** | `403` `42501` — "Cannot write a call record into an organization you are not an active member of" | PASS |
| 6 | **A: `POST call_records` with Org A `organization_id` and Org B `contact_id`** | `403` `42501` — "Call record contact must belong to the same organization" | PASS |
| 7 | **A: `POST call_records` with Org A `organization_id`, Org A `contact_id`, Org B `lead_id`** | `403` `42501` — "Call record lead must belong to the same organization" | PASS |
| 8 | B re-reads after the attacks | `[{ isolation-call-B }]` — no Fake Bob call | PASS |
| 9 | A re-reads after the attacks | `[{ isolation-call-A }]` — no Fake Bob call | PASS |
| 10 | No JWT (publishable key only) | `401` `42501` — permission denied for `anon` | PASS |

Checks 5–9 are the important set. Read isolation alone would still allow writing into the other tenant or attaching the other tenant's contact or lead.

The `42501` on checks 5–7 was raised by the row trigger, which runs before the insert policy's `WITH CHECK` is evaluated. Both barriers are in place; the trigger spoke first.

## MFA state of the demo accounts

Both isolation users are organization owners. The REST checks ran on **aal1** password-grant tokens and were still blocked. MFA and tenant isolation remain separate controls:

- **MFA** is an application gate.
- **RLS** keys off active membership, not assurance level.

## What this does not prove

- Live telephony, Telnyx, recordings, or click-to-dial.
- That a `dnc` outcome blocks later attempts or changes lead status.
- Isolation of campaigns or any table that does not exist yet.
