# CRM pipelines + Kanban (Monday MVP)

**Date:** 25 September 2026  
**Status:** implemented on branch (migration `20260925120000_crm_pipelines_kanban.sql`).  
**Client ask (Jake, 24–25 Sep):** four pipelines — Insurance Telesales, Recruiting, PowerBridge (Jake only), Retention — with stages and Kanban. Full ChatGPT field packs are phase 2.

**Depends on:** campaigns purpose, leads foundation.

---

## Decision

- `campaigns.purpose` and `leads.purpose`: `sales` | `recruiting` | `powerbridge` | `retention`
- Labels: Insurance Telesales, Recruiting, PowerBridge, Retention
- `organizations.powerbridge_enabled` (default false) gates PowerBridge create/filter
- Lead stages are purpose-specific (DB CHECK + Zod)
- `/leads` List | Board; Board requires a purpose filter

## Enable PowerBridge for Jake (Staging)

After migration push, run once with service role / SQL editor:

```sql
UPDATE public.organizations o
SET powerbridge_enabled = true
WHERE o.id IN (
  SELECT m.organization_id
  FROM public.organization_memberships m
  JOIN auth.users u ON u.id = m.user_id
  WHERE lower(u.email) IN ('jake@jakelynn.com', 'jake@powerbridge.io')
    AND m.status = 'active'
    AND m.role = 'owner'
);
```

Adjust emails if Jake’s owner org differs.

## Out of scope (phase 2)

- Full custom fields from ChatGPT shares
- Policy object shared Sales ↔ Retention
- PowerBridge Company → Contacts → Opportunities model
- Automations / retention dashboards
- Drag-and-drop library (board uses stage select)

## Verify

- Create Insurance / Recruiting / Retention campaigns and leads
- PowerBridge hidden when `powerbridge_enabled` is false
- Board moves a lead across stages
- Isolation scripts still PASS
