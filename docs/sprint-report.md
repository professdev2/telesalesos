# TelesalesOS — Sprint completion report

**Date:** 2026-09-08
**Branch:** `feat/foundation-sprint`
**Length:** short, same intent as the Day 2 assessment

## What shipped

A signed-in user can reach a dashboard with organization context, edit their profile, rename their organization, convert an individual workspace to a team, list members under RLS, and issue a copyable invitation link. CRM surfaces exist as placeholders with no records.

Authorization is three layers: optimistic redirects in `src/proxy.ts`, `getClaims()` in the DAL, and row-level security. Organization ids are never taken from the client for authorization; the active-org cookie only selects among the caller's own memberships.

## Isolation

**Pass.** Dedicated tenants Isolation Org A and Isolation Org B were created for this test. The D104 verification org was left individual and unused. User A's JWT could not `select` Org B's `organizations`, `organization_memberships`, `profiles`, or `audit_logs`. The reverse held for User B. Evidence: `docs/isolation-test.md`.

## Security pass (D10-02)

- `.env.local` remains gitignored. `.env.example` has names only.
- No service-role key is in the repository.
- App pages under `(app)` call `requireActiveMembership` or `requireCurrentUser`.
- Invitation tokens are hashed (SHA-256 hex) before insert. The raw token is returned once in the action result and is not stored.

## Remaining risks

- Built-in email is rate-limited. Signup confirmation fails after a handful of sends until custom SMTP is configured.
- MFA is flagged for owners (`mfa_required = true`) but enrollment is not built, so it is a label not a gate.
- Teammate names are not visible on the members roster because `profiles` is own-row-only. That is correct RLS, not a missing join.
- Individual → team conversion is one-way. Do not convert real client data during demos without saying so.
- Role strings (`owner` / `admin` / `member`) will not stretch to the eight-role product model. Checks go through `hasAtLeastRole` so that refactor stays out of the UI.

## Phase 2 estimate

Not a CRM build. The next phase is still foundation-hardening plus the first real domain table:

- Custom SMTP and confirmation templates that use `/auth/confirm` (token hash), so signup can be demoed.
- MFA enrollment for owners/admins, or a documented exception.
- A `contacts` table with `organization_id`, RLS copied from the account pattern, and the same DAL rule: org from session, never from the client.
- Only then: leads, calls, campaigns.

Two weeks of one developer is enough for SMTP + MFA enrollment + contacts with isolation re-tested. It is not enough for telephony.

## Client message

Sprint completion report. Foundation demo is ready; isolation test passed against dedicated orgs (D104 left untouched); next-phase estimate is in this document.
