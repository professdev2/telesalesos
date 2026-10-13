# Campaigns — sales and recruiting purpose

**Date:** 23 September 2026  
**Status:** implemented on `feat/foundation-sprint`. Migration applied to Staging (`ceyaylgqcletophrjlja`).  
**Client ask (Jake, 22 Sep):** CRM for selling **and** recruiting. Recruiting is a different kind of campaign on the same CRM, not a second product.  
**Depends on:** `plan/campaigns.md` (tables, RLS, isolation 11/11).

**Follow-up:** four purposes (Insurance Telesales, Recruiting, PowerBridge, Retention) plus Kanban — see `plan/crm-pipelines-kanban.md`.

---

## Decision

`public.campaigns.purpose` is a fixed value: originally `sales` or `recruiting`. Default `sales`. Later widened — see `plan/crm-pipelines-kanban.md`.

Everything else stays the same: contacts, leads, call records, `campaign_contacts`, archive-not-delete, and membership + RLS tenancy. Purpose is a label and a filter. It does not change who can read or write a row.

---

## Out of scope

- A separate recruiting schema, nav item, or pipeline.
- Recruiting-specific lead stages. Leads keep the playbook stages.
- Dialer / Telnyx (`plan/dialer.md`).
- CSV import, DNC scrubbing.
- Auto-creating leads or call records when a contact joins a campaign.

---

## What changed

| Layer | Change |
| --- | --- |
| Migration | `20260923120000_campaign_purpose.sql`: `purpose text NOT NULL DEFAULT 'sales'`, CHECK `sales`/`recruiting`, index `(organization_id, purpose)` |
| Validation | `CAMPAIGN_PURPOSES`, labels, `purpose` on create/update schemas |
| Actions | Insert and update write `purpose` |
| Queries | `purpose` selected and mapped; `getCampaignPage(term, page, purpose)` filters when set |
| UI | Purpose select on create/detail forms; purpose shown on rows and the detail page; All / Sales / Recruiting filter on `/campaigns` that keeps search and paging |

---

## Tenancy

No RLS change. Policies and the org guard still key on `organization_id`. Purpose is an ordinary column on a row the caller can already see. Re-run `node scripts/isolation-campaigns.mjs --no-seed` after the migration; it must stay PASS.

---

## Done when

- In one org on Staging, create one **Sales** and one **Recruiting** campaign.
- The **Sales** and **Recruiting** filters each show only their own campaigns. **All** shows both.
- Search and paging keep the active filter.
- Contacts can be added to either kind.
- Archive hides either kind from the default list.
- Campaign isolation still PASS.
