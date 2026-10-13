# Isolation test — CRM records (`contacts`)

**Date:** 2026-09-10
**Project:** TelesalesOS Staging (`ceyaylgqcletophrjlja`)
**Result: PASS (7/7)**

This extends the 8 Sep account-table test (`docs/isolation-test.md`) to a real CRM record type. The client asked to see that "a user from Organization A cannot query Organization B's records" — contacts are the first record type, and the same pattern is what leads and call records will use.

Reproduce with:

```
node scripts/isolation-contacts.mjs
```

## Subjects

The dedicated isolation tenants from 8 Sep. `D104 Verify Org` / `admin@gmail.com` was **not** used as either tenant, and holds no contacts.

| Tenant | Email | Organization | Org id | Seeded contact |
| --- | --- | --- | --- | --- |
| A | `isolation.a.d10@gmail.com` | Isolation Org A | `b00174b6-bb5d-4856-bfcf-a0bf9868f01b` | Alice A |
| B | `isolation.b.d10@gmail.com` | Isolation Org B | `552bf447-1115-4808-9a2c-d3de4511a25e` | Bob B |

Passwords were rotated on 10 Sep and live only in the gitignored `.env.local`. Both accounts are disposable; delete them after the sprint.

## Method

1. Password-grant a JWT for each user against `/auth/v1/token`.
2. Call PostgREST as that user (`Authorization: Bearer <access_token>` plus the **publishable** key) — the same privilege the browser has.
3. Each contact was seeded **by its own owner** through that session. The service role key was never read; a service-role query bypasses RLS and would prove nothing.

Pass conditions: an empty array on read, and on write a rejection **plus** the absence of the row.

## Enforcement under test

`public.contacts`, migration `20260910190000_contacts.sql`:

- `ENABLE` and `FORCE ROW LEVEL SECURITY` (confirmed against the live database: `relrowsecurity` and `relforcerowsecurity` both true).
- SELECT / INSERT / UPDATE / DELETE policies all require `private.is_active_member(organization_id)`, with `WITH CHECK` on the write paths so a forged `organization_id` cannot be written.
- A second, independent barrier: the `contacts_guard_organization` row trigger re-checks membership on INSERT and UPDATE and refuses to move a contact between organizations. If a policy is ever loosened by mistake, the write path still fails closed.
- No grants to `anon`; `authenticated` reaches the table only through RLS.

In the application, `organization_id` is taken from the session membership in `src/lib/contacts/actions.ts` and is never read from the submitted form.

## Results

| # | Check | Response | Verdict |
| --- | --- | --- | --- |
| 1 | A: `GET contacts?select=id,full_name,organization_id` | `[{ Alice A }]`, all rows Org A (200) | PASS |
| 2 | A: `GET contacts?organization_id=eq.<Org B>` | `[]` (200) | PASS |
| 3 | B: `GET contacts?select=id,full_name,organization_id` | `[{ Bob B }]`, all rows Org B (200) | PASS |
| 4 | B: `GET contacts?organization_id=eq.<Org A>` (reverse) | `[]` (200) | PASS |
| 5 | **A: `POST contacts` `{"full_name":"Fake Bob","organization_id":"<Org B>"}`** | `403` `42501` — "Cannot write a contact into an organization you are not an active member of" | PASS |
| 6 | B re-reads after the attack | `[{ Bob B }]` — no Fake Bob | PASS |
| 7 | No JWT (publishable key only) | `401` `42501` — permission denied for `anon` | PASS |

Checks 5 and 6 are the important pair. Read isolation alone would still allow "A cannot read B's contacts, but A can create contacts inside B," which is a serious tenant-isolation failure. The write was rejected **and** left no row.

The `42501` on check 5 was raised by the row trigger, which runs before the insert policy's `WITH CHECK` is evaluated. Both barriers are in place; the trigger is simply the one that spoke first.

## MFA state of the demo accounts

Both isolation users are organization owners, so `compute_mfa_required()` marks them as required. TOTP was enrolled and verified for both on 10 Sep through the same GoTrue MFA API the app uses; verification returned an **aal2** session in each case. Codes are generated locally with `node scripts/mfa-isolation.mjs code`.

Note the assurance level in the table above: the REST checks ran on **aal1** password-grant tokens and were still blocked. That is correct and worth stating plainly if asked — MFA and tenant isolation are two separate controls:

- **MFA** is an application gate. `requireMfaSatisfied()` keeps a required user out of the CRM routes until the session reaches aal2.
- **RLS** is the data boundary. It keys off active membership, not assurance level, so it holds at *any* assurance level — including a raw API token that never touched the UI.

An attacker with a valid password-grant token and no second factor still gets `[]`. Making the boundary depend on MFA would be weaker, not stronger.

## What this does not prove

- Isolation of leads, calls, or any table that does not exist yet. The pattern is reusable, but each new table needs its own policies and its own test.
- Anything about production. This ran on staging only.
- Invite-token secrecy or service-role handling — see the 8 Sep test for scope on those.
- UI-level behaviour is a consequence of RLS here, not a separate control. The boundary is the database.
