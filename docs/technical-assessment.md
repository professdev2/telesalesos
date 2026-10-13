# TelesalesOS — Phase 0 Technical Assessment

**Date:** 2026-09-08
**Branch:** `feat/foundation-sprint` (from `origin/main` @ `3055a28`)  
**Scope:** Foundation audit only — Git recovery, environment, migrations, signup trigger
**Status:** Complete. Cleared to begin authentication development.

---

## 1. Summary

The foundation is sound. The database is further along than the application.

The account system (organizations, memberships, RLS, signup automation) is applied and working on staging. The application layer is still a starter template with no authentication screens. That is the gap the next phase closes.

One blocker was found and resolved: `.env.local` pointed at a Supabase project reference that does not exist.

---

## 2. Git recovery

| Item | Result |
| --- | --- |
| Problem found | Working copy had lost its `.git` directory — no history, branches, or remote |
| Recovery | Re-attached `https://github.com/Legacy-Producers-Group/telesalesos.git` |
| History | Restored through `3055a28` — *Rename product to TelesalesOS (#4)* |
| Working branch | `feat/foundation-sprint` |
| Remote credentials | Token removed from the remote URL; using Git Credential Manager |
| `.env.local` | Preserved and confirmed gitignored |

**Action required:** the GitHub personal access token previously embedded in the clone URL should be revoked. It appeared in shell history and in `.git/config`.

---

## 3. Environment

| Item | Value |
| --- | --- |
| Project | TelesalesOS Staging |
| Project ref | `ceyaylgqcletophrjlja` |
| URL | `https://ceyaylgqcletophrjlja.supabase.co` |
| DNS | Resolves |
| Auth health endpoint | HTTP 200 |
| Local dev target | Staging (per `DEVELOPMENT.md`) |

### Blocker found and fixed

`.env.local` contained project ref `ceyalyqclctophirljia`, which returned **NXDOMAIN** — the host does not exist. The correct staging ref is `ceyaylgqcletophrjlja`. The two strings are similar enough that the error was not obvious; it presented as a network failure rather than a configuration mistake.

Had this not been caught during discovery, the authentication phase would have been built against an unreachable API.

### Environment gaps

- No production project reference is recorded anywhere in the repository.
- There is no documented promotion path from staging to production.
- CI uses a placeholder Supabase URL, so it never exercises a real database.

---

## 4. Migrations

| Local | Remote | Timestamp (UTC) |
| --- | --- | --- |
| `20260903204352` | `20260903204352` | 2026-09-03 20:43:52 |

Verified with `supabase migration list` against the linked staging project. Local and remote match. There is exactly one migration, `multi_tenant_account_system.sql`, roughly 2,000 lines.

### What it creates

Eight tables in `public`, all with row-level security enabled and forced:

`profiles`, `organizations`, `organization_memberships`, `organization_invitations`, `audit_logs`, `platform_admins`, `user_security_settings`, `security_audit_logs`

Plus a `private` schema holding `SECURITY DEFINER` helpers used by RLS policies, and public RPCs for organization lifecycle operations (`create_organization`, `convert_organization_to_team`, `leave_organization`, `transfer_organization_ownership`, `accept_organization_invitation`).

CRM tables (`contacts`, `leads`, `calls`, `campaigns`) do not exist. Confirmed by REST probe returning 404 for those names while the eight account tables returned 401 — the expected response for an existing table protected by RLS.

---

## 5. Signup trigger verification

A real signup was performed against staging with metadata `full_name`, `organization_name`, and `account_type`.

| Expected row | Result | Value observed |
| --- | --- | --- |
| `profiles` | Created | `full_name` populated from metadata |
| `organizations` | Created | Name from metadata; `account_type` = `individual` |
| `organization_memberships` | Created | `role` = `owner`, `status` = `active` |
| `user_security_settings` | Created | `mfa_required` = `true` |

**Result: pass.** The `on_auth_user_created` trigger correctly creates all four rows in a single transaction.

Two observations that affect the authentication build:

**Email confirmation is enabled.** The signup response contained `confirmation_sent_at` and no session. Users will not be logged in immediately after signing up, so the auth callback route must handle the confirmation link before anyone can reach the dashboard.

**`mfa_required` resolves to `true` for new users.** This is correct behavior, not a defect. Every signup creates an organization where the user is the owner, and the MFA-refresh trigger marks owners and admins as requiring MFA. Nothing in the application enforces this yet. It is a flag, not a gate.

---

## 6. Risks

Ordered by likelihood of causing rework.

**Individual organizations cannot invite members.** Every signup produces an organization with `account_type = 'individual'`. Three separate mechanisms — an insert trigger, an RLS policy, and a membership-count trigger — block invitations on individual organizations. The members screen must expose `convert_organization_to_team()` before any invite flow will function. Conversion is owner-only and cannot be reversed.

**Email delivery is rate-limited and will block testing.** The project uses Supabase's built-in email service, which caps sends at a handful per hour. A second signup attempt within the hour was rejected with `429 over_email_send_rate_limit`. Since email confirmation is required to sign in, this makes signup fail intermittently for anyone testing or demoing. Configuring custom SMTP is a prerequisite for the client demo, not a later concern.

**Invitations cannot be delivered.** The database stores only a token hash and the acceptance RPC expects a raw token, but no email provider exists in the project. The sprint plan ships a copyable link instead; email is deferred.

**Deleting a user or organization is likely blocked.** The `enforce_membership_delete` trigger raises an exception when the last active owner's membership row is removed, and that trigger also fires on foreign-key cascades. Since every user is the sole owner of their personal organization, this should prevent user deletion and organization deletion. Not yet reproduced. Documented rather than fixed, to avoid a schema change during the foundation sprint.

**No automated tenant-isolation test exists.** Roughly thirty RLS policies protect tenant boundaries and none are covered by a test. One isolation scenario is scheduled for Day 10.

**CI does not touch a database.** The pipeline runs lint, build, and typecheck against a placeholder Supabase URL. A broken migration or a leaking policy would pass green.

**Role model will not stretch to the product roadmap.** The schema defines three roles as a text constraint (`owner`, `admin`, `member`) with role names embedded directly in policy definitions. The product specification requires eight roles plus teams, skills, and state licensing. Not a sprint concern, but every screen built now should route permission checks through a helper rather than comparing role strings inline, so the eventual refactor does not touch the UI.

---

## 7. Application state

| Area | Status |
| --- | --- |
| Routes | One (`/`), the unmodified starter page |
| Authentication UI | None |
| Route protection | None — session refresh runs, but no redirect and no server-side check |
| Supabase client wiring | Correct and current (`@supabase/ssr`, `getAll`/`setAll` cookies, Next 16 `proxy.ts`) |
| UI components | Six shadcn primitives, exactly the set a login form needs |
| Generated database types | None |

The Supabase integration is correct but unused. `server.ts` is imported by nothing.

---

## 8. Cleared to proceed

All Phase 0 exit criteria are met:

- Git history recovered and a feature branch is active
- Staging project identified and reachable
- Local and remote migrations match
- Signup trigger verified against the real database

Authentication development (Days 3–5) can begin.

---

## 9. Next phase

**Days 3–5 — Authentication.** Route groups, server actions for signup/login/logout, the auth callback handling both confirmation and password recovery, password reset, a server-side data access layer, and route protection.

**Deliverable:** a user can sign up, confirm, log in, reach a protected route, and log out.
