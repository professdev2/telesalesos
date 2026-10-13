# Telephony (Telnyx)

**Status:** not started. Call **records** (disposition, duration, notes) already exist — that is **not** live voice.  
**Starts after:** Training UI + Google login are not a hard technical dependency, but **do not** pull Telnyx into the 100-hour week to fill hours.  
**Previous written rule:** do not promise a dialer as “next Friday.” Phase 4 in `next_plan.md`.  
**After this file (D0):** outbound progressive → power → predictive, coaching, and spam-likely number monitoring live in `plan/dialer.md` (Jake confirmed 22 Sep; EmberDial as reference).

---

## Out of this first voice slice

- Recording retention policy UI (need a legal hold/retention number from the client).
- SMS blasting, TCPA automation (see `plan/ai-compliance.md`).
- BYO carrier other than Telnyx.
- Power / predictive pacing, live coaching UI, spam-likely dashboards — those are **D1+** in `plan/dialer.md`, not D0.

---

## Client deliverables

- Telnyx account under the **client** entity.
- API key in Staging env only.
- Numbers, 10DLC / branding if SMS is in scope (SMS is **not** in the first voice slice unless they insist in writing).

---

## First slice (proposed — confirm) — dialer step D0

1. Click-to-call or WebRTC from a lead/contact, tenant-scoped.
2. Webhook → call record row already in the CRM (do not create a parallel “Telnyx calls” table that bypasses RLS).
3. Isolation: Org A cannot dial using Org B’s number or see Org B recordings.
4. No recording download that ignores membership.

---

## Done when

Two orgs, two numbers, isolation script + human call. Staging only. No production traffic until `plan/production.md`.  
Then continue with `plan/dialer.md` (progressive → power → predictive, coaching, reputation).