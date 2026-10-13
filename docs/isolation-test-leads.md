# Isolation test — CRM records (`leads`)

**Date:** 2026-09-15
**Project:** TelesalesOS Staging (`ceyaylgqcletophrjlja`)
**Result: PASS (9/9)**

This extends the contacts isolation test (`docs/isolation-test-contacts.md`) to the first sales-workflow record type. A user from Organization A cannot query Organization B's leads, cannot insert a lead into Organization B, and cannot attach a lead to Organization B's contact.

Reproduce with:

```
node scripts/isolation-leads.mjs
```

Also re-run:

```
node scripts/isolation-contacts.mjs --no-seed
```

Contacts isolation remained **PASS (7/7)** after this migration.

## Subjects

The dedicated isolation tenants from 8 Sep. `D104 Verify Org` / `admin@gmail.com` was **not** used as either tenant.

| Tenant | Email | Organization | Org id | Seeded contact | Seeded lead notes |
| --- | --- | --- | --- | --- | --- |
| A | `isolation.a.d10@gmail.com` | Isolation Org A | `b00174b6-bb5d-4856-bfcf-a0bf9868f01b` | Alice A | `isolation-lead-A` (removed after the run) |
| B | `isolation.b.d10@gmail.com` | Isolation Org B | `552bf447-1115-4808-9a2c-d3de4511a25e` | Bob B | `isolation-lead-B` (removed after the run) |

Passwords live only in the gitignored `.env.local`.

## Method

1. Password-grant a JWT for each user against `/auth/v1/token`.
2. Call PostgREST as that user (`Authorization: Bearer <access_token>` plus the **publishable** key) — the same privilege the browser has.
3. Each lead was seeded **by its own owner** through that session, against that owner's contact. The service role key was never read.

Pass conditions: an empty array on illicit read, and on write a rejection **plus** the absence of the row.

## Enforcement under test

`public.leads`, migration `20260915200000_leads.sql`:

- `ENABLE` and `FORCE ROW LEVEL SECURITY`.
- SELECT / INSERT / UPDATE / DELETE policies require `private.is_active_member(organization_id)`, with `WITH CHECK` on the write paths.
- `private.leads_guard_organization()` re-checks membership, refuses org moves, and requires the contact to belong to the same organization.
- `contact_id` references `contacts(id)` **`ON DELETE RESTRICT`**.
- No grants to `anon`; `authenticated` reaches the table only through RLS.

In the application, `organization_id` is taken from the session in `src/lib/leads/actions.ts` and is never read from the submitted form.

## Results

| # | Check | Response | Verdict |
| --- | --- | --- | --- |
| 1 | A: `GET leads?select=id,notes,organization_id,contact_id` | `[{ isolation-lead-A }]`, all rows Org A (200) | PASS |
| 2 | A: `GET leads?organization_id=eq.<Org B>` | `[]` (200) | PASS |
| 3 | B: `GET leads?select=id,notes,organization_id` | `[{ isolation-lead-B }]`, all rows Org B (200) | PASS |
| 4 | B: `GET leads?organization_id=eq.<Org A>` (reverse) | `[]` (200) | PASS |
| 5 | **A: `POST leads` with Org B `organization_id` and Org B `contact_id`** | `403` `42501` — "Cannot write a lead into an organization you are not an active member of" | PASS |
| 6 | **A: `POST leads` with Org A `organization_id` and Org B `contact_id`** | `403` `42501` — "Lead contact must belong to the same organization" | PASS |
| 7 | B re-reads after the attacks | `[{ isolation-lead-B }]` — no Fake Bob lead | PASS |
| 8 | A re-reads after the contact attack | `[{ isolation-lead-A }]` — no Fake Bob lead | PASS |
| 9 | No JWT (publishable key only) | `401` `42501` — permission denied for `anon` | PASS |

Checks 5–8 are the important set. Read isolation alone would still allow writing into the other tenant or attaching the other tenant's contact.

The `42501` on checks 5 and 6 was raised by the row trigger, which runs before the insert policy's `WITH CHECK` is evaluated. Both barriers are in place; the trigger spoke first.

## MFA state of the demo accounts

Both isolation users are organization owners. The REST checks ran on **aal1** password-grant tokens and were still blocked. MFA and tenant isolation remain separate controls:

- **MFA** is an application gate.
- **RLS** keys off active membership, not assurance level.

## What this does not prove

- Isolation of calls, campaigns, or any table that does not exist yet.
- Anything about production. This ran on staging only.
- UI-level behaviour is a consequence of RLS here, not a separate control. The staging walkthrough in `plan/leads.md` §6.3 covers the UI.
