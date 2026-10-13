# AI and compliance automation

**Status:** not started. Phase 5 in `next_plan.md`: after telephony is real.  
**Do not** schedule in the 100-hour week.

---

## Possible later slices (confirm)

- QuoteCoach AI suggestions (after `plan/quotecoach.md` has real quote rows).
- Call transcription / live coaching (needs recordings from `plan/telnyx.md`; product path is `plan/dialer.md` D4 — EmberDial-shaped).
- **Spam-likely / number reputation** monitoring and DID rotation (`plan/dialer.md` D5) — operational, not a TCPA substitute.
- TCPA / DNC checks before dial or SMS (needs a DNC data source and a written policy).
- Training recommendations (after `plan/training-v2.md` progress).

---

## Rules

- No model API keys in git.
- Prompts must not send another org’s rows. Isolation applies to **what is retrieved**, not only to the UI.
- Do not claim TCPA-compliant dialing until legal review.

---

## Done when (per sub-slice)

Written scope, tenant-scoped logs, isolation test that Org A’s prompts cannot include Org B’s PII.
