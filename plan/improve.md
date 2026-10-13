# MFA, authentication direction, and Cursor workflow

**Source:** client message received after the isolation/contacts foundation.  
**Status:** planning only — do not start implementation until the owner confirms the STOP items and role mapping below.  
**Rule:** extend the existing Auth, organization, membership, RLS, and contacts architecture. Do not rebuild it. Do not add Auth0, Clerk, Firebase Auth, or SMS.

This file is the inspect-first plan the client asked for before Cursor writes MFA code. Dark mode / theme toggle is a separate request and is **not** in this milestone.

---

## 1. What the client asked for (two tracks)

### Track A — product (authentication)

MFA is required for **every** TelesalesOS user, including Agents. Preferred stack:

**Passkeys → TOTP authenticator → Email OTP fallback.** No SMS at any scale.

Privileged accounts (Admin and Super Admin) may satisfy MFA only with **Passkey or TOTP**. Email OTP alone is not enough.

Also: 30-day trusted devices (server-side, not a browser flag), a recovery path that is not a homemade backup-code scheme unless we have a strong reason, and audit events for enrollment, removal, recovery, security-setting changes, and relevant auth failures.

Enforcement must live in the server/auth layer, not only in hidden UI. Tenant isolation and RLS must not get weaker.

### Track B — process (how we build)

Use Cursor as an implementation accelerator for repetitive work (UI, forms, validation, CRUD, tests, docs). Keep human time on architecture, security, RLS, review, telephony, compliance, and production decisions.

Workflow they named:

> Requirement → inspect existing architecture → Cursor implementation plan → developer review → Cursor implementation → developer code/security review → automated tests → GitHub PR → staging → acceptance

Milestones are **Task → Developer → GitHub PR → Tests → Staging Demo → Acceptance**. Small logical commits on personal branches. This MFA work is the first feature that should run that loop end to end.

They are not asking us to replace judgment with generation. They are asking us not to spend expensive hours hand-writing scaffolding the model can draft.

---

## 2. Inspect: what already exists (do not duplicate)

| Area | Current state |
| --- | --- |
| Stack | Next.js 16, TypeScript, Supabase Auth + Postgres RLS, staging project `ceyaylgqcletophrjlja`. `@supabase/supabase-js` `^2.112.4` (new enough for experimental passkeys **if** we opt in). |
| Session | `getClaims()` in `src/lib/auth/dal.ts`. Cookie JWT is never trusted via `getSession()`. |
| Proxy | `src/proxy.ts` refreshes the session. Optimistic only — not the security boundary. |
| Protected routes | `(app)` layout + every page/action calls DAL. `requireActiveMembership()` also calls `requireMfaSatisfied()`. |
| Orgs / membership | `organizations`, `organization_memberships` (`owner` / `admin` / `member`), invitations, `platform_admins`. |
| Isolation | Proven on contacts (7/7). RLS keyed to **membership**, not AAL. Isolation scripts must keep passing. |
| MFA today | TOTP enroll + challenge for users with `mfa_required = true`. Routes `/mfa/enroll`, `/mfa/challenge`. Secrets stay in Auth. |
| Who is required today | `private.compute_mfa_required()`: **org owner, org admin, or platform admin**. **Members (Agents) are not required.** |
| Settings → Security | **Does not exist.** Settings is Profile / Organization / Members. |
| Factor management | Enroll + verify only. No Settings UI to list/remove factors. Unenroll of leftover unverified factors only. |
| Email / SMTP | **Not configured.** Signup and any Email OTP are blocked on client SMTP. Documented in `docs/smtp-request.md`. |
| Audit | `security_audit_logs` already allows `mfa.enrolled`, `mfa.removed`, `mfa.recovery`, plus session events. Enrollment already calls `record_security_audit_event`. Removal/recovery RPCs are unused. Org `audit_logs` is a separate tenant-scoped trail (contacts, membership). |
| Trusted devices | **None.** |
| Passkeys | **None.** Browser client is created without `auth.experimental.passkey`. |
| Tests | Node scripts against staging (`scripts/isolation-contacts.mjs`, `mfa-isolation.mjs`, etc.). No Jest/Playwright suite yet. |

### MFA vs isolation (do not merge these)

This was already shown to the client and must stay true:

- **MFA** is an application gate (`requireMfaSatisfied`). Required users cannot open CRM routes until the policy is satisfied.
- **Isolation** is a database rule keyed to organization membership. It holds at AAL1. A stolen password still returns `[]`.

Do **not** put `aal = 'aal2'` into RLS as the tenant boundary. Email-OTP and trusted-device sessions will often remain AAL1 at the JWT. If RLS required AAL2, Agents on the approved fallback would lose their own data — or we would be forced to mint fake AAL2, which we must not do.

---

## 3. Map their language onto this schema

The eight-role product model is **not** in the database. Do not invent Manager / Super Admin rows in this milestone. Use the mapping below unless the owner says otherwise.

| Client term | In this codebase | MFA policy this plan uses |
| --- | --- | --- |
| Agent | `organization_memberships.role = 'member'` | MFA required. Email OTP **may** satisfy (until they enroll TOTP/passkey). |
| Manager | **No role.** Closest existing role is org `admin`. | Treat as **privileged** if we ever add it. Until then, do not create a Manager role. |
| Admin | org `admin` | Privileged: Passkey **or** TOTP. Email OTP must not satisfy. |
| Owner (not named by client, but more powerful than Admin in our schema) | org `owner` | **Privileged**, same as Admin. Confirm with the client. Owners can rename orgs, invite, convert to team. Email OTP must not satisfy. |
| Super Admin | `platform_admins` | Privileged: Passkey or TOTP. Email OTP must not satisfy. |

**Confirm with the client before coding:** “In the current product, organization **owners** have more power than org admins. We will treat owners as privileged (Passkey/TOTP only), same as Admin and Super Admin. Managers do not exist yet; we will not add a role in this milestone.”

---

## 4. STOP items and architecture conflicts

These are the places the master prompt said to stop and report rather than improvise.

### 4.1 Passkeys — do not implement in the first PRs

Supabase documents **Passkeys as experimental / beta** (dashboard: Authentication → Passkeys; client must set `auth.experimental.passkey: true`). The API may change without notice. RP ID is permanent: changing it invalidates every enrolled passkey.

Two different features exist:

1. **Passwordless passkeys** (`registerPasskey` / `signInWithPasskey`) — this is the “open TelesalesOS → Face ID → Dashboard” experience they want.
2. **WebAuthn as an MFA factor** (`auth.mfa.enroll({ factorType: 'webauthn' })`) — second factor after password, raises AAL2.

Neither is in our app. Enabling (1) on staging is a product decision, not a coding afternoon: HTTPS origins, stable RP ID for staging **and** a separate decision for production, Safari/Chrome/Windows Hello matrix, account picker UX, recovery when the only factor is a lost laptop.

**Recommendation:** ship TOTP + (after SMTP) Email OTP + trusted devices on the **existing** Auth stack. Write a one-page passkey options memo (effort, risk, no extra vendor cost — it is native Supabase, but experimental). Implement passkeys only after the owner replies in writing.

Do **not** introduce another identity provider to get passkeys sooner.

### 4.2 Email OTP is not a native Supabase MFA factor

GoTrue MFA factor types in play: **TOTP**, **phone**, **webauthn**. Phone is SMS/WhatsApp — **forbidden**. There is no `factorType: 'email'`.

Email OTP in Supabase is a **sign-in method** (`signInWithOtp` / magic link), not AAL2.

So “Password → Email code → Dashboard” **cannot** be done by flipping a dashboard toggle. It requires a **small, server-side second step we own**, sitting on top of an AAL1 password session:

- After password login, Agents/members without TOTP land on `/mfa/email`.
- Server generates a short-lived code, stores **only a hash**, sends the code through the approved SMTP path (Supabase Auth SMTP or a transactional provider configured in the Auth dashboard — not a custom mailer in the Next app).
- Verify in a server action. On success, record a server-side “email MFA satisfied for this session” row (or bind it to the refresh-token family). Cookie/localStorage alone is not enough.
- JWT `aal` stays `aal1`. Privileged roles never take this path.

This is an extension of our gate (`requireMfaSatisfied`), **not** a second auth provider. If the owner rejects any custom second step, the only SMTP-based alternative is passwordless email login (no password), which **does not** match the written Agent fallback. Ask before building.

### 4.3 SMTP is a hard blocker for Email OTP and recovery mail

Until staging SMTP is configured, **Milestone B (Email OTP) and Milestone D (email-based recovery) cannot be demoed**. TOTP-for-everyone, Settings → Security, privileged enforcement, and trusted-device **schema** can proceed.

Do not build a workaround mailer. Same rule as Phase 2.

### 4.4 “MFA required for every user” changes a database function

Today members skip MFA. Making Agents required means changing `private.compute_mfa_required()` (and the comment on `user_requires_mfa`) so **every user with an active membership, plus platform admins**, is `mfa_required = true`.

That is a policy change, not a rebuild. Existing invited members will be sent to enroll/challenge on next login. Isolation test users are owners and already required — isolation scripts stay valid.

### 4.5 Trusted devices cannot lower Auth AAL

Supabase has no “remember this computer for 30 days” flag. A trusted device is **our** signed, hashed, httpOnly cookie checked on the server, with a row we can revoke.

It may skip the **app** MFA challenge for Agents (and only if policy allows). It must **not**:

- live only in `localStorage`;
- be a boolean the client sends;
- skip MFA for privileged users (or we offer trust only after TOTP/passkey, still force step-up on security actions);
- survive password change, email change, factor change, recovery, or expiry.

Sensitive actions (Security settings, factor removal, recovery, later billing) always re-challenge, trusted device or not.

---

## 5. Security model we will keep

1. Organization is taken from the session, never from the form.
2. Isolation tests (`node scripts/isolation-contacts.mjs --no-seed` and the edit/detail variants) remain the standing gate after any auth or policy change.
3. Never log or put in `metadata`: TOTP secrets, OTP codes, session tokens, recovery secrets, cookies.
4. `security_audit_logs` already forbids those JSON keys. Keep that check; extend the action enum if we add events.
5. No SMS provider. No second IdP.
6. No custom backup-code table in v1.
7. Service-role key stays server-only. Isolation tests continue to use the user JWT, not the admin key.

---

## 6. Target experience (after all milestones)

| Actor | Flow |
| --- | --- |
| New Agent | Signup → verify email (SMTP) → create/join org → MFA step (Email OTP allowed) → dashboard → prompt to enroll TOTP (passkey later). |
| Returning Agent with TOTP | Password → TOTP (or trusted device if valid) → dashboard. |
| Returning Agent, no TOTP | Password → Email OTP → dashboard. Prompt to enroll TOTP. |
| Privileged (owner / admin / platform admin) | Password → TOTP (passkey later). Email OTP **rejected** even if a code is guessed in the UI. |
| Returning passkey user (later, if approved) | Passkey / Face ID / Touch ID / Windows Hello → dashboard. |
| Lost phone | Recovery (Milestone D) → audit `mfa.recovery` → re-enroll. No backup codes. |

Keep copy non-technical: “We sent a code to your email” / “Open your authenticator app.”

---

## 7. Milestone plan (PRs, not one dump)

Work on a dedicated branch off current `feat/foundation-sprint` (or `main` once that lands). **One PR per milestone.** Logical commits. Developers use their own GitHub accounts. Do not commit `.env.local`.

Hours are engineering time at ~7h/day, not calendar promises. SMTP wait is not our delay.

### Milestone 0 — Alignment (this document)

**Developer:** tech lead. **PR:** none. **Acceptance:** owner answers the four questions in §11.

Deliverable: this plan + a short client reply (draft in §12).

Passkey verdict is already in §4.1: **experimental, defer.**

---

### Milestone A — TOTP for everyone + Settings → Security

**Depends on:** nothing from the client except confirmation of role mapping.  
**SMTP:** not required.  
**Estimate:** 2–3 days.

**Task**

1. Inspect (already done). Confirm TOTP is enabled in the staging dashboard (Authentication → Multi-Factor → TOTP).
2. Change `private.compute_mfa_required` so every active member (including `member`) and every platform admin is required. Refresh existing `user_security_settings` rows via the existing trigger/RPC — do not write `mfa_required` from the app.
3. Extend `requireMfaSatisfied` / `pathAfterPasswordLogin` so **all** signed-in app users hit enroll/challenge. Remove the “if not required, skip” path except for the brief window of a user with no membership (`/no-organization`).
4. Add **Settings → Security** (`/settings/security`):
   - list verified TOTP factors (id + friendly name only; never secret);
   - enroll additional authenticator;
   - remove a factor **only if** another verified TOTP (or later passkey) remains, **or** after a verified TOTP challenge (step-up);
   - privileged users cannot remove their last TOTP.
5. Wire `mfa.removed` through `record_security_audit_event`. Enrollment already writes `mfa.enrolled`.
6. Challenge UI: if multiple TOTPs exist, pick a verified factor (existing code uses the first). Keep it simple.
7. Do not add Email OTP or trusted devices in this PR.

**Tests (scripts, same style as isolation — do not delete existing ones)**

- Member (Agent) without TOTP cannot open `/contacts` (redirect enroll).
- Member with TOTP at AAL1 cannot open `/contacts` (redirect challenge).
- Member at AAL2 can open `/contacts`.
- Owner/admin still required (regression).
- Isolation 7/7 still pass (AAL1 JWT still cannot read the other org).
- Unenroll last TOTP as owner is rejected.
- `mfa.enrolled` / `mfa.removed` rows appear without secrets in metadata.

**Staging demo:** invite or use a member user; show enroll QR; show Security page; show Agent cannot skip.

**Acceptance:** MFA required for members; Security page works; isolation green.

---

### Milestone B — Email OTP fallback (Agents only)

**Depends on:** staging SMTP + Milestone A.  
**Estimate:** 2–3 days after SMTP.

**Task**

1. Design tables in `private` (not client-writable):

   - `private.email_mfa_challenges` — `user_id`, `code_hash`, `expires_at`, `attempts`, `consumed_at`.
   - `private.email_mfa_sessions` — `user_id`, `session_marker`, `satisfied_at`, `expires_at` (tied to the Auth session / refresh token id if available, else a server-issued random marker in an httpOnly cookie).

2. Server actions: request code (rate-limit), verify code. Codes hashed (HMAC or SHA-256 of code + user id + server pepper in env, not in git). TTL ~10 minutes, lock after N attempts.

3. Delivery: configure Supabase SMTP (client credentials). Prefer sending through Auth/SMTP already used for confirmation, or the same provider. **No SMS. No app-owned SMTP stack.**

4. Gate logic in `requireMfaSatisfied` (server only):

   ```
   if privileged (owner | admin | platform_admin):
     require Auth AAL2 from TOTP (later: WebAuthn)
     ignore email_mfa_sessions
   else (member):
     allow if AAL2 OR valid email_mfa_session OR (Milestone C) valid trusted device
   ```

5. UI: `/mfa/email` for members without TOTP. Privileged users hitting that URL redirect to `/mfa/enroll` or `/mfa/challenge`. Do not “hide the link” as the only control — the action must reject privileged users.

6. After dashboard: banner “Add an authenticator app for faster sign-in” linking to Security.

7. Audit: new allowed actions if needed, e.g. `mfa.email_challenge` / `mfa.email_verified` — **no code in metadata**. Failed verify: increment + optional `mfa.challenge_failed` after threshold (avoid log flooding).

**Tests**

- Agent: password → email OTP → contacts.
- Agent: wrong code rejected; privileged: email verify action returns forbidden even with a valid code issued to them (do not issue in the first place).
- Admin/owner with only email path: cannot reach `(app)` routes.
- Admin with TOTP: AAL2 still works.
- Isolation still 7/7.
- Rate limit / expired code.

**Staging demo:** Agent path with a real inbox. Admin account shown failing Email OTP as sole MFA.

**Acceptance:** written policy matches behavior; SMTP used; no SMS.

---

### Milestone C — Trust this device for 30 days

**Depends on:** Milestone A. Can overlap B if SMTP is late, but UX copy should mention Email OTP only after B.  
**Estimate:** 2 days.

**Architecture**

Table `private.trusted_devices`:

| Column | Purpose |
| --- | --- |
| `id` | uuid |
| `user_id` | owner of the trust |
| `token_hash` | hash of the cookie secret |
| `expires_at` | `created_at + 30 days` |
| `created_at` / `last_used_at` | |
| `label` | coarse UA (e.g. “Chrome on Windows”), not a fingerprint we pretend is unique |
| `revoked_at` | |

Cookie: httpOnly, Secure, SameSite=Lax, `__Host-` if possible, random 256-bit value. Server hashes before compare. Client cannot set “trusted=true”.

**Issue trust only after a successful strong or allowed MFA step** (TOTP, later passkey, or Email OTP for members). Checkbox on the challenge form.

**Revoke all of a user’s device rows when:**

- password change (Auth hook or post-reset action);
- email change;
- TOTP enroll/verify/unenroll;
- recovery;
- “sign out all devices” (already an audit action — implement the actual revoke here).

**Re-challenge always for:** Security settings mutations, factor removal, recovery, future billing/admin. Read-only Security page may still require a recent AAL2 for privileged users.

**Tests**

- Valid cookie skips challenge for Agent inside 30 days.
- Tampered cookie ignored.
- Expired row ignored.
- After password change, old cookie fails.
- Privileged: decide in §11 — **proposal: privileged may trust a device after TOTP, but Security mutations still need a fresh TOTP.** Document whichever the owner picks.

**Staging demo:** check the box, refresh, no code; revoke from Security; code required again.

**Acceptance:** written security model in this file still matches the code; no localStorage boolean.

---

### Milestone D — Account recovery

**Depends on:** SMTP + A. Backup codes: **out of scope unless the owner later approves.**  
**Estimate:** 1.5–2 days.

**Proposal (no custom backup codes)**

1. User on `/login` chooses “I can’t use my authenticator.”
2. Send a **recovery email** (same SMTP) with a single-use, short-lived link (`token_hash` pattern already used for signup/reset in `docs/auth-setup.md`).
3. After the link, user must set or confirm password (existing reset flow if we can reuse it).
4. Server (service role / Auth admin API, never from the browser) unenrolls TOTP factors and revokes trusted devices and email-MFA sessions.
5. Write `mfa.recovery` with `{ method: 'email' }` only.
6. Next login: treat as no factor — Agent may Email OTP; privileged must enroll TOTP before `(app)`.

Admin-assisted recovery (ops using `platform_admins`) can be a later add; do not build an ops portal in this milestone.

**Tests**

- Recovery unenrolls factors and writes audit.
- Privileged user after recovery cannot enter CRM until TOTP re-enroll.
- Other org’s security_audit_logs still invisible (RLS on `security_audit_logs` — add an isolation check if missing).
- Replaying the recovery link fails.

**Acceptance:** lost-phone path works without backup codes; events are auditable.

---

### Milestone E — Passkeys (only after written approval)

**Depends on:** owner accepts experimental API + stable RP ID for staging (and a freeze rule for production).  
**Estimate:** 3+ days including browser matrix. **Not started in this cycle.**

If approved later:

- Opt-in experimental client flag **only** in the browser client that calls passkey APIs; keep server client conservative if possible.
- Enroll from Settings → Security after email confirmation.
- Privileged: passkey **or** TOTP satisfies AAL2 / passwordless session.
- Agent: passkey preferred; Email OTP remains fallback.
- Document RP ID, origins, and “never change RP ID” in `docs/auth-setup.md`.
- Tests: enroll, sign-in, privileged without TOTP but with passkey, isolation unchanged.

If the owner says no to experimental: keep TOTP + Email OTP indefinitely. That still meets “do not rebuild Auth.”

---

## 8. Cursor workflow for this milestone (and after)

Follow this on **every** MFA PR. Refine after Milestone A.

1. **Requirement** — this file plus the owner’s answers in §11.
2. **Inspect** — search existing `src/lib/auth`, `src/app/(auth)/mfa`, migrations, `scripts/isolation-*.mjs` before adding files. If a helper exists (`hasAtLeastRole`, `record_security_audit_event`, `requireMfaSatisfied`), extend it.
3. **Plan in the PR body** — short: files to touch, what not to touch, test commands.
4. **Human review of the plan** — tech lead. Especially anything that touches RLS, `compute_mfa_required`, or cookies.
5. **Implementation** — Cursor may draft UI, Zod schemas, Security page, script scaffolding. Human writes or tightly reviews: migrations, gate logic, hashing, cookie flags, privileged vs member branching.
6. **Review** — read the diff for: org id from the client, secrets in logs, localStorage trust, SMS, new IdP, duplicate membership tables.
7. **Tests** — new scripts + existing isolation. Then `npm run lint`, `npx tsc --noEmit`, `npm run build`.
8. **PR** — GitHub, attributable author, small commits.
9. **Staging demo** — not production. No automatic prod deploy.
10. **Acceptance** — client or internal owner checks the demo script for that milestone only.

**Cursor should generate:** forms, Settings UI, validation, page wiring, test script structure, docs updates.

**Humans must own:** MFA policy in SQL, AAL vs app-level satisfaction, trusted-device crypto, recovery unenroll via admin API, RLS, isolation regressions, passkey go/no-go.

**Do not:** wait until the end of the milestone to commit; commit secrets; push `main`; weaken isolation tests to make MFA tests green.

---

## 9. Test matrix (keep isolation)

| ID | Case | Milestone |
| --- | --- | --- |
| T1 | TOTP enroll | A (exists; extend to members) |
| T2 | TOTP challenge | A |
| T3 | Agent Email OTP fallback | B |
| T4 | Admin/owner strong MFA (TOTP) | A |
| T5 | Admin rejected when only email MFA available | B |
| T6 | Signed-out cannot open protected routes | already true; keep |
| T7 | Trusted device skips challenge | C |
| T8 | Trusted device expired | C |
| T9 | Trust revoked on password / factor change | C |
| T10 | Recovery authorized + audited | D |
| T11 | Org A cannot read Org B contacts | every PR |
| T12 | Org A cannot read Org B `security_audit_logs` | A or D |

Existing `scripts/isolation-contacts.mjs --no-seed` (7/7) is mandatory on every milestone. Add `scripts/mfa-policy-check.mjs` (and later email/trust/recovery scripts) rather than folding MFA into the isolation file.

---

## 10. Out of scope (this program)

- Dark mode toggle (separate client request).
- SMS / Twilio Verify / WhatsApp OTP.
- Auth0, Clerk, Firebase, WorkOS, etc.
- Eight-role model, Manager role, teams/skills/licensing.
- Custom backup codes.
- Production deploy.
- Telnyx, dialer, QuoteCoach, billing, training.
- Making RLS depend on AAL.
- Replacing contacts, orgs, or the signup trigger.

---

## 11. Questions that block coding (ask once)

1. Confirm owners are privileged (Passkey/TOTP only), same as Admin / Super Admin.  
2. Confirm we **defer passkeys** until you accept Supabase’s experimental API, and we ship TOTP + Email OTP first.  
3. Confirm Email OTP as a **server-side second step** on an AAL1 session is acceptable (not a new vendor; not native AAL2).  
4. Privileged trusted devices: after TOTP, may they skip the daily TOTP prompt for 30 days, with step-up on Security changes — or must privileged users enter TOTP every session?

SMTP credentials remain the blocker for 1, 3 (Email OTP), and recovery mail. TOTP-for-everyone does not wait on SMTP.

---

## 12. Draft reply to the client

> We’re not rebuilding authentication, organizations, or isolation. We’ll extend what’s already in staging.
>
> **Passkeys:** Supabase’s passkey API is still experimental (explicit client opt-in, API may change). We will not put that in the production architecture without your go-ahead, and we will not add another auth vendor. TOTP (authenticator apps) and then Email OTP (after SMTP) can ship first. Passkeys when you approve that risk.
>
> **TOTP:** Already used for owners/admins. Next change is to require it for every user, including Agents, and add Settings → Security for enrollment and removal.
>
> **Email OTP:** Supabase does not offer email as a native second factor (only TOTP, phone/SMS, and WebAuthn). SMS is off the table. We’ll add a server-checked email code for Agents/members only, delivered through your SMTP. Admin, owner, and Super Admin cannot complete login with email alone.
>
> **Trusted devices:** 30-day trust as a server-side token (httpOnly cookie + hashed row), revoked on password/email/MFA/recovery changes — not a flag in the browser.
>
> **Recovery:** Email-based reset and factor clear, with audit events. No homemade backup codes unless we later agree that’s necessary.
>
> **SMTP:** Email OTP and recovery email wait on the staging mail credentials we’ve already requested.
>
> We’ll run this as small PRs (TOTP-for-everyone → Email OTP → trusted devices → recovery), each with tests, a staging demo, and acceptance. Isolation stays the standing regression: Organization A still cannot read Organization B.
>
> Please confirm the four items in the plan (owners as privileged, defer passkeys, email as a server second step, privileged trusted-device rule). Then we start Milestone A.

---

## 13. Definition of done for the whole program

1. Every user is required to complete MFA before CRM routes.  
2. Agents may use Email OTP; privileged users may not.  
3. TOTP enroll / verify / remove works in Settings → Security.  
4. Trusted device is server-side, 30 days, with documented revoke rules.  
5. Recovery exists, is audited, and does not use backup codes.  
6. No SMS, no second IdP, no passkeys in production until approved.  
7. Isolation scripts still pass. No secrets in logs or git.  
8. Each slice had a PR, tests, staging demo, and acceptance.  
9. Production was not auto-deployed.

Until §11 is answered, the next action is the client reply — not a branch of MFA code.
