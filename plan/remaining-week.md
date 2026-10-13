# Remaining work — capacity change and sequence

**Date:** 19 September 2026  
**Branch:** `feat/foundation-sprint`  
**Environment:** TelesalesOS Staging only (`ceyaylgqcletophrjlja`). No production go-live in this plan.  
**Capacity (standing):** two people × 10 hours = **20 hours per day**, **100 hours per five-day week**. This is not a one-week exception. Every remaining slice uses this rhythm until the client changes it in writing.  
**This week (locked):** Training steps 4–5, then Google login. Full calendar through completion: `docs/TelesalesOS-Full-Project-Plan.md`.

---

## 1. How hours change

| | Previous written week (`plan/task2.md`, 14–18 Sep) | Previous actual pairing | Client request (this plan) |
| --- | --- | --- | --- |
| People | One developer | Two people | Two people (each at full day) |
| Hours per person per day | 7 | 5 | **10** |
| Combined hours per day | 7 | **10** | **20** |
| Working days | 5 | 5 | 5 |
| Combined hours per week | **35** | **50** | **100** |

The client’s request is not “one person works 10 hours instead of two people.” It is: **each** of the two people works **10 hours per day**. Combined that is **20 hours per day** and **100 hours in a five-day week**. That is **double** the previous pairing (10h/day) and almost **triple** the original written week (35h).

A 10-hour day is not 10 hours of new product. Each person keeps a test and notes block. Suggested split **per person**:

| Block | Time | Use |
| --- | --- | --- |
| 1 | 4h | Main task |
| — | 1h | Break |
| 2 | 3h | Continue main task or the paired second stream |
| 3 | 1h | Manual test of what that person shipped |
| 4 | 1h | Notes, isolation re-run when the data layer moved, handoff |

Two people in parallel only when the work does not share the same files. Training UI is one stream. Google login is the other stream **after** Training 4–5 are on the branch and the hosted Training screens are no longer the placeholder.

---

## 2. What the previous plans said (and what actually happened)

### Previous written week (`plan/task2.md`)

- Phase 2 contacts only: edit, search, paging, audit, contact detail.
- **Not that week:** leads, calls, campaigns, telephony, production.
- Success: contacts CRUD + isolation 7/7; SMTP or a second written reminder.

### What shipped beyond that week (already on Staging / the branch)

Contacts, leads, call records, campaigns, MFA (TOTP for required users, Email OTP for agents, trusted devices, authenticator recovery). Training **steps 1–3** are on GitHub:

| Step | Commit | What it is |
| --- | --- | --- |
| 1 | `7624fd6` | Schema, RLS, isolation 11/11, plan/evidence |
| 2–3 | `c67d463` | Vimeo validation, write-access rules, tenant-scoped queries and actions |

Hosted `https://telesalesos.vercel.app/training` currently shows **“Not built yet”** because steps 4–5 are **not** on the branch. The Staging database already has the training tables and walkthrough courses.

### Previous identity plan (`plan/improve.md` and the 16 Sep chat)

`plan/improve.md` still says MFA for **every** user (passkeys later). The **16 Sep** agreement with Jake is different and is what Google login must implement:

- **Agents** (standalone independents and agency members): MFA **optional**. Google or password is enough. Recommend MFA; do not block them.
- **Agency owners and admins:** MFA **required**. Authenticator stays. **Google does not skip TOTP.**
- Any Google account.
- Independent agents: Google signup → **own workspace**.
- People joining an agency: **invite only** — do not create a second empty org.
- Email-and-password stays; Google is the alternative (HighLevel-style).
- Google Cloud / OAuth admin must be a **client-owned** mailbox (telesalesos.com). **Do not use Powerbridge as the admin over it.**

Google login has **no plan file and no code** yet. The previous message to Jake was: short plan, then estimate. This document is that plan, now sized to the 100-hour week.

---

## 3. Current plan — must complete first

### A. Training step 4 — catalog and course UI

**Still local (uncommitted):** `src/app/(app)/training/page.tsx`, `src/app/(app)/training/courses/[id]/page.tsx`, `src/components/training/training-forms.tsx`.

**Done when:**

- Two libraries on `/training`: **TelesalesOS** (platform) and the active org.
- Create/edit/archive only for platform admins (platform catalog) and Owners/Admins (agency library).
- Members see copy that they cannot manage content; no write forms.
- YouTube URLs still rejected (server already does this).
- Isolation: agency A cannot see agency B courses. Re-run `node scripts/isolation-training.mjs`.
- Commit as nicolas, no Cursor trailer. Push `feat/foundation-sprint`.

**Not in step 4:** lesson player, resource links page, removing **Soon** from the nav.

### B. Training step 5 — lesson page and switch-on

**Still local:** `src/app/(app)/training/lessons/[id]/page.tsx`, `src/lib/nav.ts`, `src/app/(app)/dashboard/page.tsx`.

**Done when:**

- Lesson page: Vimeo iframe from numeric id only; `encrypted-media` on `allow` (playback on DRM titles).
- Resource links listed above the add form; HTTPS only; new tab; provider owns access.
- Training nav has **no Soon**. QuoteCoach and Billing stay Soon.
- Archive hides from default lists; historical URL still opens; **no Delete**.
- Human walkthrough on `https://telesalesos.vercel.app` (same Staging Auth): platform course, agency course, member read-only, YouTube reject.
- Isolation 11/11 still green.

**Out of Training (unchanged):** quizzes, certificates, progress, file upload, YouTube, Telnyx, Billing.

After step 5, Production will show the real library again. Until then the placeholder is expected.

### C. Google login (starts only after Training 4–5 are accepted)

Implement from `plan/google-login.md` (already written). Do not invent a second auth product.

| ID | Work | Done when |
| --- | --- | --- |
| G-01 | Client Google Cloud project + OAuth client. Admin: **telesalesos.com** (or other client-owned domain), **not** Powerbridge | Credentials in Staging Auth providers; never committed |
| G-02 | Supabase Google provider on Staging; authorized redirect URLs for localhost and `telesalesos.vercel.app` | “Continue with Google” on login and signup |
| G-03 | Standalone: first Google sign-in creates **one** personal org (same as password signup) | No second empty org |
| G-04 | Invite: Google with the invited email **joins** the agency; does not create a parallel org | Isolation: cannot see another agency |
| G-05 | Existing password user can **link** Google with the same email | One Auth user, not a duplicate |
| G-06 | MFA: owners/admins still **must** complete TOTP after Google; agents are **not** blocked if they have no factor | Matches 16 Sep agreement |
| G-07 | Isolation + walkthrough: two Google accounts, two orgs; invite path; privileged MFA still required | Written evidence; Staging only |

**Blocked on the client, not on hours:** Google Cloud admin mailbox and OAuth consent app. Until G-01 arrives, Google coding cannot finish; surplus hours go to G-02 prep (UI + session linking against a Staging test client) and to the password-reset MFA fix below — not to Telnyx.

**Out of Google this week:** passkeys, SMS, Auth0/Clerk, production custom domain cutover, eight-role model.

---

## 4. Adjacent fix (ship with Training, do not wait for Google)

Forgot-password is broken for anyone with a verified authenticator. A recovery link is AAL1; Supabase refuses `updateUser` until AAL2. Jake and kenji both hit: *“AAL2 session is required to update email or password when MFA is enabled.”*

A local fix exists (authenticator code on `/reset-password` before the password update). It is **not committed**. Include it in the Training 4–5 push so hosted login is usable.

Workaround until it is live: **I can’t use my authenticator** (wipes TOTP; user re-enrolls).

---

## 5. Suggested week at 20h/day (100h)

Calendar: **Monday 21 Sep – Friday 25 Sep 2026** (adjust if the client names other dates). Hours are **combined** (two people).

| Day | Combined | Stream A | Stream B | Done when |
| --- | --- | --- | --- | --- |
| Mon | 20h | Training step 4: catalog + course UI, isolation, commit/push | Pair on the same UI only if files are split (forms vs pages). Otherwise review + password-reset commit | Training lists and course pages on Staging; placeholder still on lesson/nav |
| Tue | 20h | Training step 5: lesson player, resources, nav, dashboard, hosted walkthrough | Password-reset AAL2 if not already on GitHub; regression: contacts/leads/calls/campaigns isolation `--no-seed` | Training **Soon** gone; Vimeo + archive + member read-only pass on vercel.app |
| Wed | 20h | Google plan file + login/signup buttons + callback wiring | Client G-01 chase; Staging provider config; MFA-after-Google for owners | Plan approved; Google button reaches Auth (or documented G-01 block) |
| Thu | 20h | G-03, G-04, G-05 (standalone vs invite vs link) | Isolation script for Google identity paths; privileged TOTP still required | Two-org Google isolation written |
| Fri | 20h | G-06 walkthrough; fix gaps | Build/lint/tsc; sprint note; what did not ship | Google accepted on Staging **or** G-01 still blocked in writing |

If G-01 has not arrived by Wednesday, **do not** fill Thursday–Friday with Telnyx, QuoteCoach, or Training v2 (quizzes). Use the time on password-reset coverage, Google UI against a Staging test client, and isolation. Extra hours are not a reason to start a third product.

---

## 6. Exact differences from the previous plan

| Topic | Previous | Current |
| --- | --- | --- |
| Weekly hours | 35 written / 50 actual pairing | **100** (2 × 10h × 5 days) |
| Daily combined hours | 7 written / 10 actual | **20** |
| Hours per person | 7 or 5 | **10** |
| This week’s product | Contacts finish; Training/Google not in `task2.md` | **Training 4–5, then Google login** |
| Training | Listed as Enablement / later; Google called out of scope in `plan/training.md` | Training library **must** finish (UI + nav). Google is the **next** slice, not the same commit |
| MFA for agents | `improve.md`: required for every user | **Optional** for agents (16 Sep). Required for owners/admins; Google does not skip TOTP |
| Google Cloud admin | Not specified | **Client domain** (telesalesos.com). Not Powerbridge |
| Phase 3 (leads/calls/campaigns) | “Not this week” in `task2.md` | Already shipped earlier; do not reopen |
| Telnyx / dialer | No date | Still **no date**. 100 hours does not pull telephony in |
| Signup SMTP | Client deliverable | Still blocked if credentials are missing. Google does not replace SMTP for password signup |
| Production go-live | Not this week | Still not this week |

---

## 7. Definition of a successful week

1. Training steps 4 and 5 are on `feat/foundation-sprint` as nicolas (no Cursor trailer). Hosted Training is the real library, not “Not built yet.”
2. Training isolation 11/11 still passes. Members cannot write. Agencies cannot see each other’s courses.
3. Forgot-password works for MFA accounts (authenticator code on the reset form), or the gap is still documented if it missed the push.
4. Google login is **accepted on Staging**, **or** G-01 is on the record as the client block and the app is otherwise ready.
5. Owners/admins still need TOTP after Google. Agents are not forced to enroll to use Google or password.
6. No Telnyx, no quizzes/certificates, no production cutover.

---

## 8. Risks

| Risk | Response |
| --- | --- |
| 100 hours becomes “do everything” | Sequence is Training 4 → Training 5 → Google. Stop adding modules. |
| Two people edit the same files | One stream owns Training UI; the other reviews or owns Google **after** Training is pushed. |
| G-01 never arrives | Google cannot complete. Write it as a client block. Do not fake a provider. |
| Hosted site looks unfinished until step 5 | Expected. Tell the client the placeholder is the split commit, not a lost feature. |
| 10-hour days skip isolation | Isolation re-run still outranks finishing a day’s task. |
| MFA optional for agents vs current `mfa_required` on every member | Google slice must change the gate to match 16 Sep. Do not leave “TOTP for everyone” in place if Google ships. |
