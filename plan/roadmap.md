# TelesalesOS — remaining product plans

**Date:** 19 September 2026  
**Branch:** `feat/foundation-sprint`  
**Capacity (standing, not just this week):** two people × 10h × 5 days = **20h/day**, **100h/week**. See `plan/remaining-week.md` and `docs/TelesalesOS-Full-Project-Plan.md`.  
**Rule:** copy existing tenancy (membership + RLS). Do not invent a second authorization model. Staging only until a production plan is approved.

This file is the **index**. Each remaining slice has its own plan. Do not start a later slice because the week has leftover hours.

---

## Already done (do not reopen)

| Slice | Evidence |
| --- | --- |
| Phase 1 — identity, orgs, invites, isolation on account tables | Account sprint |
| Phase 2 — contacts CRUD, search, paging, audit, detail | Isolation 7/7 |
| MFA TOTP for privileged users, Email OTP for members, trusted devices, authenticator recovery | `plan/improve.md` partially implemented; 16 Sep **changes** agent policy |
| Leads, call records, campaigns | Isolation scripts PASS |
| Sales vs recruiting campaigns (`campaigns.purpose`) | `plan/campaigns-sales-recruiting.md` — extended by `plan/crm-pipelines-kanban.md` (4 purposes + Kanban) |
| Training steps 1–3 | `7624fd6`, `c67d463` — schema, RLS, validation, actions. **UI not on the branch** |

---

## Remaining — execution order

Do **1 → 2 → 3** before anything in the later table. Later slices are planned so the client can see the whole product; they are **not** this week’s backlog.

| # | Slice | Plan file | Status |
| --- | --- | --- | --- |
| 1 | Training UI (steps 4–5) | `plan/training.md` + `plan/remaining-week.md` | Code local; not pushed |
| 2 | Password reset with authenticator (AAL2) | `plan/password-reset-mfa.md` | Fix local; not committed |
| 3 | Google login + MFA optional for agents | `plan/google-login.md` | No code. Blocked on client Google Cloud admin |
| 4 | SMTP (password signup mail) | `plan/smtp.md` | Blocked on client credentials |
| 5 | Eight-role model | `plan/roles.md` | Not started. Training/CRM still use owner/admin/member |
| 6 | Training v2 (progress, quizzes, certificates) | `plan/training-v2.md` | Not started. Out of v1 |
| 7 | QuoteCoach | `plan/quotecoach.md` | Nav **Soon**. No schema |
| 8 | Billing | `plan/billing.md` | Nav **Soon**. No schema |
| 9 | Telephony (Telnyx) — voice foundation | `plan/telnyx.md` | After call **records** (already exist). No live voice yet |
| 10 | Outbound dialer + coaching + spam-likely numbers | `plan/dialer.md` | **Jake 22 Sep:** build dialer; EmberDial as reference; monitor spam-likely. After D0 voice |
| 11 | Passkeys | `plan/passkeys.md` | After Google + TOTP are stable |
| 12 | Merge to `main` / production go-live | `plan/production.md` | Not this week |
| 13 | AI / TCPA-DNC automation | `plan/ai-compliance.md` | After telephony is real |

---

## What 100 hours does **not** mean

- It does not start Telnyx, the dialer (`plan/dialer.md`), QuoteCoach, Billing, or Training v2 in the same week as Training UI + Google.
- It does not replace client deliverables (SMTP, Google Cloud OAuth app, Telnyx account, number pool).
- It does not authorize production go-live.
- Jake’s 22 Sep dialer / EmberDial / spam-likely ask is **planned** in `plan/dialer.md`; it does **not** reorder this week unless he says so in writing.

---

## Shared delivery loop (every slice)

Same as campaigns and Training:

1. Plan approved. No code until then (except slices already implemented and waiting for commit).
2. `feat/foundation-sprint`. Author nicolas. No Cursor trailer.
3. Migration → RLS → isolation script → UI.
4. `npm run lint`, `npm run build`, `npx tsc --noEmit`.
5. Staging project `ceyaylgqcletophrjlja` only.
6. Demo on `https://telesalesos.vercel.app` (Preview/Production share Staging Auth — say so).
7. Acceptance on staging. No production until `plan/production.md`.
