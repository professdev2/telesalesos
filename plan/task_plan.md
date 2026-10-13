# TelesalesOS — First 2 Weeks Task Plan (solo)

**Sprint:** Foundation (Phase 0 Discovery + Phase 1 Implementation)  
**Staffing:** One developer. Not a two-person 70-hour week.  
**Calendar:** 10 working days. Keep scope tight.  
**Goal:** A secure multi-tenant SaaS foundation ready for CRM.  
**Not this sprint:** CRM, Telnyx, QuoteCoach, billing, AI, production launch.

Do not expand scope without written owner approval.

**Work priority (if time is tight, cut from the bottom)**

```
Security
>
Authentication
>
Dashboard
>
Organization
>
Invitation
```

Git recovery and Supabase verification come first because nothing else is trustworthy without them.  
Invite copy-link can slip **after** the isolation test. Do not spend Days 8–9 chasing email or invite edge cases.

---

## Client communication checkpoints

Send a short message at each gate. Clarity over length. No novels.

| When | Send | Meaning |
| --- | --- | --- |
| After Day 2 | Foundation audit completed. | Git restored, Supabase/migrations/trigger checked, 1–2 page assessment |
| After Day 5 | Authentication milestone completed. | Signup/login/logout/protected routes work |
| After Day 7 | Application shell completed. | Login → dashboard with sidebar and org context |
| After Day 10 | Sprint completion report. | Demo path, Org A ↛ Org B proof, remaining risks, Phase 2 estimate |

Suggested one-liners (expand only if asked):

- Day 2: “Foundation audit completed. Staging vs production noted; signup trigger [passed/failed]; written assessment attached (short).”
- Day 5: “Authentication milestone completed. Users can sign up, log in, and reach protected routes.”
- Day 7: “Application shell completed. Login opens the dashboard with org context. CRM pages are placeholders.”
- Day 10: “Sprint completion report. Foundation demo is ready; isolation test [passed/failed]; next-phase estimate attached.”  

---

## 1. Must finish vs nice to have

### Must finish

1. **Git recovery** — without this, there is no professional workflow
2. **Supabase verification** — migrations + signup trigger; without this the foundation is unknown
3. Signup, login, logout, callback, password reset
4. Protected routes (proxy + server DAL)
5. Dashboard shell (sidebar, header, org context) — right after auth
6. Profile and organization settings
7. Members list
8. **Minimum security test** (2–3 hours): Organization A user cannot access Organization B data  
9. Short client-facing report + next-phase estimate (1–2 pages each, not a novel)  
10. Invitations as **create + copyable secure link + accept** — **lowest product priority**; skip or defer if it delays D10-03

### Nice to have (only if must-finish is done)

- Email provider for invites
- Wiring that test into CI
- Full RLS / pgTAP suite
- Local `supabase start` / `config.toml`
- `can()` helper on every screen
- Long architecture playbook rewrite
- Last-owner-delete *fix* (document first; fix only if it blocks demo)

If time slips: **drop CI first**, then invite email / invite accept.  
**Do not drop** Git restore, Supabase verification, login, the shell, or the Org A / Org B isolation test.

---

## 2. Sprint outcome (demo)

By Day 10, show this path:

```
Signup → Auth trigger → Profile + org + membership
     → Login → Dashboard shell
     → Profile / org settings
     → Members (+ convert to team + copy invite link, if time)
```

Unauthenticated users cannot open `(app)` routes. The DAL is the real check; proxy redirects are only the first layer.

Also prove, once:

```
Organization A user  cannot access  Organization B data
```

That is the biggest SaaS risk. A full test suite is not required. This one scenario is.

---

## 3. Current starting point

| Area | Status |
| --- | --- |
| Database | One migration, 8 public tables, RLS, signup trigger |
| App | Next.js + `@supabase/ssr` + unused `server.ts` |
| Routes | Only `/` |
| Git | **Blocker:** `.git` is missing — restore before any feature work |

Auth files today: `src/lib/supabase/{client,server,proxy}.ts`, `src/proxy.ts`.

---

## 4. Ten-day execution order

One person. Sequential. Each block has a **client-visible deliverable**.

### Days 1–2 — Foundation verification

**Deliver:** Technical Assessment (1–2 pages, not a novel).  
**Client message:** “Foundation audit completed.”

| ID | Task | Done when |
| --- | --- | --- |
| D1-01 | Restore Git (clone remote, copy `.env.local`, no PAT in URL). Branch `feat/foundation-sprint`. | `git log` works |
| D1-02 | Confirm which Supabase project `.env.local` uses (staging vs production). Prefer staging. | Written in assessment |
| D1-03 | `npx supabase migration list` (after login/link) — is `20260903204352` on remote? | Local vs remote table |
| D1-04 | Signup trigger test: one real user; confirm `profiles`, `organizations`, `organization_memberships`, `user_security_settings` | Pass/fail with notes |
| D1-05 | `.env.example` (names only). Skip local Docker unless verification is blocked. | Clone can see required vars |
| D1-06 | Technical Assessment: env, migrations, trigger result, top risks | 1–2 pages, not a novel. Send Day 2 checkpoint. |

**Do not start UI until D1-04 is recorded.** If the trigger fails, that is the sprint until it works.

---

### Days 3–5 — Authentication

**Deliver:** Working user access. After Day 5: **login works**.  
**Client message:** “Authentication milestone completed.”

| ID | Task | Done when |
| --- | --- | --- |
| D3-01 | Route groups: `(auth)`, `(app)`, `auth/callback`. Add `error.tsx`, `not-found.tsx`. | Compiles |
| D3-02 | DAL: `requireUser()` (React `cache`). Use on every `(app)` page. | No app page skips it |
| D3-03 | Server actions: signup (metadata `full_name`, `organization_name`, `account_type`), login, logout | Staging works |
| D3-04 | `/login`, `/signup` UI (existing shadcn) | Loading + errors |
| D3-05 | `/auth/callback`: `code` exchange **and** recovery `token_hash` | Confirm + reset land |
| D3-06 | Forgot / reset password pages | Email + new password |
| D3-07 | Proxy: unauthenticated → `/login`; copy cookies onto any redirect | No random logouts |

Keep Day 5 thin: if password reset slips, finish it on Day 6 morning — **do not delay the shell**.

---

### Days 6–7 — Application shell (moved earlier)

**Deliver:** Login → Dashboard. Client perception: this looks like a product.  
**Client message:** “Application shell completed.”

| ID | Task | Done when |
| --- | --- | --- |
| D6-01 | Active org: cookie + **server membership check**. One helper. | Layout uses it |
| D6-02 | `(app)` layout: sidebar, header, user menu, org name | Usable, not pixel-perfect |
| D6-03 | Dashboard home: user + org + role. Empty CRM copy is OK. | Not the Next.js starter |
| D6-04 | Placeholder nav: Contacts, Leads, Calls, Campaigns, Training, QuoteCoach, Billing → “Coming soon” | No fake records |

This block comes **immediately after auth**, not after settings.

---

### Days 8–9 — Organization features (invites last)

**Deliver:** Profile, org, members. Invite is optional if isolation test would slip.  
**No client checkpoint** until Day 10 unless they ask.

| ID | Task | Done when |
| --- | --- | --- |
| D8-01 | Settings → Profile: view/update `full_name` | Own row only |
| D8-02 | Settings → Organization: view; update `name` only | Cannot edit `account_type` in UI |
| D8-03 | Settings → Members: list | RLS respected |
| D8-04 | Convert individual → team (`convert_organization_to_team`) before invite | Button + RPC; one-way |
| D8-05 | Create invitation: hash token, store row, **copy link** `/invite/[token]` | Owner/admin can copy URL |
| D8-06 | `/invite/[token]` → sign in/up → `accept_organization_invitation` | Email must match invite |

**Do not** wire Resend/Postmark this sprint unless Days 8–9 finish early.  
**Do not** use `inviteUserByEmail` as the primary path (it creates a second personal org via the signup trigger).

If Day 9 is tight: ship members list + convert-to-team. **Leave invites.** Isolation test on Day 10 outranks invite accept. Prefer a working copy-link over a half-built mailer; prefer no invite over a broken one.

---

### Day 10 — Testing, security pass, documentation

**Deliver:** Smoke test + isolation proof + short sprint report.  
**Client message:** “Sprint completion report.”

| ID | Task | Est. | Done when |
| --- | --- | --- | --- |
| D10-01 | Staging smoke: signup → dashboard → profile → org → members | 1h | Checklist + screenshots |
| D10-02 | Security pass: no secrets in git; DAL on app pages; invite tokens never stored raw | 0.5h | Notes in risk report |
| D10-03 | **Minimum security test (must finish):** two users, two orgs. User A’s session cannot `select` B’s `organizations`, `organization_memberships`, `profiles` of B, or `audit_logs`. Fail if any row leaks. Script or documented SQL/API steps is enough — **not CI**. | 2–3h | Written pass/fail with evidence |
| D10-04 | Sprint report: architecture notes, remaining risks, Phase 2 estimate | ≤2h | **Short.** Same length as Day 2 assessment. Send Day 10 checkpoint. |

Do **not** skip D10-03 to write a longer report. Skip CI wiring if needed. Skip remaining invite work if D10-03 is not done.

---

## 5. Target file layout

```
src/app/
  (auth)/
    layout.tsx
    login/page.tsx
    signup/page.tsx
    forgot-password/page.tsx
    reset-password/page.tsx
  (app)/
    layout.tsx              # sidebar shell
    dashboard/page.tsx
    settings/profile/page.tsx
    settings/organization/page.tsx
    settings/members/page.tsx
    contacts/page.tsx      # placeholder
    leads/page.tsx
    calls/page.tsx
    campaigns/page.tsx
    training/page.tsx
    quotecoach/page.tsx
    billing/page.tsx
  auth/callback/route.ts
  invite/[token]/page.tsx  # Days 8–9
  error.tsx
  not-found.tsx

src/lib/
  supabase/                 # clients + types if generated
  auth/actions.ts
  auth/dal.ts
  org/active-org.ts
```

---

## 6. Technical decisions (this sprint)

| Topic | Decision |
| --- | --- |
| Roles | Keep `owner` / `admin` / `member`. No 8-role migration. |
| Active org | Cookie + server verify |
| Proxy | Optimistic only; DAL required |
| Invites | Secure link only. Last in the product stack. Email later. Can slip after D10-03. |
| Docs | Short. 1–2 pages per checkpoint. Clients prefer clarity. |
| Individual orgs | Convert to team before invite (existing DB rule) |
| Schema | No redesign unless trigger/RLS is proven broken |
| Local Supabase | Optional; cloud staging is enough for Days 1–10 |
| Isolation test | One critical scenario, 2–3 hours, Day 10. CI optional. |

**Minimum security test (D10-03)** — not a suite. Create two users (two orgs). As user A (authenticated client or user JWT, **not** service role):

- `select` from `organizations` where `id` = B’s org → 0 rows  
- `select` from `organization_memberships` for B’s org → 0 rows  
- `select` from `audit_logs` for B’s org → 0 rows  

If any row returns, stop feature work and fix RLS / DAL before the client demo.

---

## 7. Known risks

1. Restore `.git` before coding.
2. Do not develop against production.
3. Signup trigger is unproven until D1-04.
4. Last-owner delete may block user/org delete — document, do not rabbit-hole.
5. Proxy redirects must copy Supabase cookies.
6. GitHub PAT was previously in a clone URL — revoke; use `gh auth login`.
7. Invitation edge cases (expiry, email mismatch) — handle via existing RPC errors, not a new subsystem.

---

## 8. Git / commits

Never push to `main`. Prefer 3–4 PRs if the diff grows:

1. `chore`: git/env/assessment notes (no secrets)
2. `feat`: auth + protected routes
3. `feat`: dashboard shell
4. `feat`: settings + invite link
5. `docs`: Day 10 report

---

## 9. End-of-sprint checklist

### Product

- [ ] Git recovered; work on a branch, not a detached folder
- [ ] Supabase verified (migrations + signup trigger)
- [ ] Signup creates profile + org + owner membership
- [ ] Login / logout
- [ ] Password reset (or listed as slip with ETA)
- [ ] Login → dashboard shell
- [ ] Profile + organization name
- [ ] Members list
- [ ] Convert to team + copy invite link + accept (or explicitly deferred)
- [ ] **Org A cannot read Org B** (minimum security test, evidence attached)
- [ ] Placeholder nav only — no CRM

### Docs (keep short — 1–2 pages each, not a novel)

- [ ] Technical Assessment (Days 1–2) + sent “Foundation audit completed.”
- [ ] Day 5: sent “Authentication milestone completed.”
- [ ] Day 7: sent “Application shell completed.”
- [ ] Sprint completion report (architecture, remaining risks, Phase 2 estimate) + sent “Sprint completion report.”

---

## 10. After this sprint (not committed)

CRM foundation comes next. Do not create `contacts` / `leads` tables until the shell and auth path are stable.

Typical Phase 2 (revised after Day 10 evidence): **3–5 weeks**, not 2.

---

## 11. Daily rule

1. Work the current day’s IDs only.
2. If blocked on Supabase access, stop and get access — do not guess prod vs staging.
3. End of Day 5: login works. End of Day 7: dashboard exists. End of Day 10: report exists.
4. If something must slip: **CI first**, then invites. Never slip Git recovery, Supabase verification, login, the shell, or the Org A / Org B test.  
5. After Days 2, 5, 7, and 10: send the client checkpoint. Do not wait until Day 10 to communicate.
