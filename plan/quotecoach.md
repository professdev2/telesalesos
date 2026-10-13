# QuoteCoach

**Status:** nav **Soon**. Placeholder page. No tables.  
**Starts after:** Training UI + Google login (current week), unless the client reorders in writing.  
**Depends on:** contacts/leads existing (done). Not on live Telnyx.

---

## Out of scope until approved

A real quoting engine, carrier integrations, PDF generation, e-sign, AI recommendations.

---

## First slice (proposed — confirm)

1. Tenant-scoped **quote records** linked to a lead or contact (`organization_id` from session).
2. Manual fields the client names (product, premium, status). Archive, no delete UI.
3. Isolation script (same pattern as campaigns).
4. Remove **Soon** only when list + create + detail exist.

---

## Not QuoteCoach

Training, Billing, the dialer. Do not store card numbers here.

**Dialer coaching is not QuoteCoach.** Jake’s EmberDial-shaped coaching (scripts, live guidance, call review) belongs in `plan/dialer.md`, tied to live calls — not to quote rows.

---

## Done when

Org A cannot read Org B quotes. Owners/Admins write; members: confirm with the client (default: read-only like Training agency library, or match leads).
