# Outbound dialer, coaching, and number reputation

**Date:** 22 September 2026  
**Status:** client-confirmed intent (Jake, 22 Sep chat). **Not** started. **Not** this week’s Training / Google backlog.  
**Reference product:** [EmberDial](https://emberdial.com/) — outbound dialer with power/predictive modes, scripts, live coaching guidance, call review, and **number reputation**.  
**Depends on:** live voice foundation in `plan/telnyx.md` (click-to-call / WebRTC, webhooks → existing `call_records`, tenant-scoped numbers). Contacts, leads, campaigns, and call records already exist.

---

## What Jake asked for (22 Sep)

1. Build outbound dialing **as well** (power / predictive in the product path).
2. Use EmberDial as the **shape** of the product: dialer **plus** built-in coaching (not dialing alone).
3. Monitor **spam-likely** / reputation on outbound numbers — confirm we know that problem and plan for it.

This is **not** QuoteCoach (`plan/quotecoach.md`). QuoteCoach is quotes/premiums. Dialer coaching is scripts, live guidance, call review, and supervisor feedback on **calls**.

---

## Out of the first dialer slices

- Cloning EmberDial feature-for-feature in one pass.
- Predictive math that dials without capacity/risk controls.
- Guaranteeing “not spam-likely” (carriers and analytics vendors change labels; we **monitor and rotate**, we do not promise clean CID forever).
- SMS blasting / 10DLC as a dialer substitute.
- Production traffic before `plan/production.md`.
- TCPA/DNC legal sign-off (see `plan/ai-compliance.md`) — tooling can check lists; compliance claim needs client legal.

---

## Client deliverables

| Item | Who | Notes |
| --- | --- | --- |
| Telnyx (or chosen) account under **client** entity | Client | Same as `plan/telnyx.md` |
| Pool of outbound numbers / DIDs | Client | Enough to rotate when reputation drops |
| Written dialing policy (hours, DNC source, consent rules) | Client | Required before predictive |
| EmberDial walkthrough notes (must-have vs later) | Us + Jake | One short call to mark priorities |
| Spam / reputation data source | Client or us | Vendor TBD (e.g. carrier analytics / Free Caller Registry–class feeds) — pick in the reputation slice |

---

## Build order (progressive)

Same order already stated to Jake. Each step stays on Staging, RLS + isolation, CRM write-back to existing call records / leads.

| Step | Name | What ships | Done when |
| --- | --- | --- | --- |
| D0 | Voice foundation | `plan/telnyx.md` — click-to-call or softphone, webhook → `call_records`, number per org | Org A cannot use Org B’s number or hear Org B recordings |
| D1 | Progressive dialer | Agent available → next lead from campaign/queue → one live call at a time → disposition → next | Queue + agent state + disposition loop on Staging |
| D2 | Power dialer | Multiple lines / overlapping connect attempts per agent rules Jake confirms | Written capacity rules; no orphan calls without CRM rows |
| D3 | Predictive dialer | Pace by answer-rate / agent idle with **abandon / risk caps** | Caps configurable; isolation still holds |
| D4 | Coaching (EmberDial-shaped) | Scripts on screen; after-call review; supervisor notes. Live “next line” guidance only after recordings/transcripts exist | Coaching data tenant-scoped; Org A cannot read Org B reviews |
| D5 | Number reputation / spam-likely | Ingest reputation for each org DID; surface spam-likely; alert + rotate / pause dialing on bad numbers | Daily (or webhook) check; audit when a number is paused |

Do **not** start D2–D5 because the week has spare hours. D0–D1 first.

---

## CRM coupling (non-negotiable)

Every dial path must:

- Pull work from **campaigns / leads / contacts** already in TelesalesOS (no parallel shadow lead DB).
- Write **call records** (and update lead/contact status) under the active `organization_id`.
- Respect membership + RLS the same way isolation scripts already prove for call records.

If a dialer feature needs a new table (`dialer_queues`, `agent_presence`, `number_reputation_snapshots`), it gets `organization_id`, FORCE RLS, and an isolation script before UI.

---

## Spam-likely monitoring (answer to Jake)

**Yes — familiar.** Carriers and analytics flag outbound CIDs as spam-likely / scam-likely; that kills answer rate. EmberDial’s “number reputation” is the same class of problem.

**Plan (D5):**

1. Store each org’s outbound numbers as first-class rows (tenant-scoped).
2. Poll or webhook a reputation provider for **spam-likely** (and related) flags.
3. Show status on the number pool UI; block or warn before dial when flagged.
4. Support **rotation**: pause flagged DID, promote a clean DID, log who/when.
5. Never claim “always clean CID” in sales copy — monitoring + rotation only.

Exact vendor is chosen when D0 exists and Jake picks budget; do not hard-code a vendor in schema until then.

---

## Coaching vs QuoteCoach vs Training

| Product area | Plan | Role |
| --- | --- | --- |
| Training library (Vimeo) | `plan/training.md` | Pre-call enablement content |
| QuoteCoach | `plan/quotecoach.md` | Quote records / premiums |
| Dialer coaching | this file (D4) | On-call / after-call coaching tied to live dialing |

EmberDial bundles dialer + coaching. TelesalesOS can too, but Training and QuoteCoach stay separate modules.

---

## Estimate posture (do not over-promise)

- D0 alone is a multi-day Staging slice after Google/Training are stable.
- D1–D3 are each their own week-scale slices at 100h/week capacity once voice works — exact days after D0 demo.
- D4–D5 need transcripts/reputation vendor choices; size after EmberDial priority call with Jake.

Do **not** tell Jake “predictive dialer next Friday.”

---

## Reply posture (when continuing the chat)

- Confirm dialer is on the roadmap **after** voice foundation.
- EmberDial = reference for dialer + coaching + number reputation, not a clone deadline.
- Spam-likely: yes; monitor + rotate numbers; vendor chosen with him.
- Keep current week on Training + Google unless he reorders in writing.
