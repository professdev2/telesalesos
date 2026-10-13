# Detailed execution plan — CRM pipelines details by Monday 28 Sep 2026

**Owner:** Nicolas  
**Environment:** TelesalesOS Staging only (`ceyaylgqcletophrjlja`)  
**Depends on:** `plan/crm-pipelines-kanban.md` (skeleton **done**)  
**Client sources:** Jake ChatGPT (4 pipelines + Retention)  
**Commit rule:** provide commit text; do not commit unless asked  

---

## 0. Goal (what “done by Monday” means)

Jake can demo on Staging:

1. **All 4 pipelines** selectable (PowerBridge hidden unless org flag on)  
2. **Fuller default stages** per pipeline + Kanban moves  
3. **Disposition** separate from stage  
4. **Core fields** per pipeline on lead detail (seeded subset, not full ChatGPT)  
5. **Retention work queues** (pending / payment / at risk)  
6. Extra **contact** fields needed for telesales  

**Not** Monday: Policy table, Companies, automations, admin custom fields, full ChatGPT lists, drag-and-drop library.

---

## 1. Current baseline (already shipped)

| Capability | Where |
| --- | --- |
| Purposes `sales` / `recruiting` / `powerbridge` / `retention` | campaigns + leads |
| Labels Insurance Telesales / Recruiting / PowerBridge / Retention | `src/lib/crm/pipelines.ts` |
| PowerBridge gate | `organizations.powerbridge_enabled` |
| Short stages + Closed column + List/Board | `/leads` |
| Lead fields today | contact, purpose, status, notes only |
| Contacts today | full_name, email, phone, notes |

---

## 2. Work packages (implement in order)

### D-01 — Expand stages (Sat morning)

**Migration** `supabase/migrations/20260926XXXXXX_crm_stages_disposition_extra.sql` (combined with D-02/D-03 if one migration is cleaner).

Update `leads_purpose_status_valid` CHECK + `src/lib/crm/pipelines.ts`.

| Purpose | Board stages (Monday target) | Closed |
| --- | --- | --- |
| **sales** | new → attempted → contacted → appointment_scheduled → needs_analysis → quoted → application_started → submitted → pending_carrier → approved → placed → nurture | not_interested, unreachable, dnc, declined, chargeback |
| **recruiting** | new → attempted → contacted → interview_scheduled → interviewed → qualified → pre_licensing → exam_scheduled → licensed → contracting_started → contracting_pending → contracted → training → ready_to_sell → active | not_interested, lost, inactive |
| **retention** | pending → requirements_needed → issued → payment_monitoring → payment_failed → grace_period → conservation → payment_arranged → reinstatement_pending → saved → lapsed | cancelled, unable_to_save |
| **powerbridge** | target → prospecting → contacted → qualified → discovery → sample_sent → pricing_sent → proposal → negotiation → verbal_commit → won → active → upsell → nurture | lost |

- Map any removed/renamed statuses in an `UPDATE` before adding the new CHECK.  
- Defaults stay: sales/recruiting `new`; retention `pending`; powerbridge `target`.  
- Board UI: if columns &gt; ~10, allow horizontal scroll (already); optional “compact” later — not required.

**Files:** `pipelines.ts`, migration, lead forms already driven by `statusesForPurpose` / `boardStagesForPurpose`.

---

### D-02 — Disposition (Sat)

**Schema**

```text
leads.disposition text NULL
  -- validated in app per purpose; optional CHECK or jsonb later
```

**Enums (seed in `src/lib/crm/dispositions.ts`)**

| Purpose | Dispositions (examples) |
| --- | --- |
| sales | no_answer, callback, not_interested, already_covered, cant_afford, uninsurable, sold, bad_lead, wrong_number, deceased |
| recruiting | not_interested, not_qualified, no_show, ghosted, failed_exam, declined_offer |
| retention | no_answer, left_vm, sms_sent, spoke_with_client, updating_banking, payment_promised, carrier_called, saved, reinstated, wants_cancellation, unable_to_reach |
| powerbridge | no_answer, not_a_fit, nurture, closed_lost_reason |

- UI: select on lead create/detail; small select on Kanban card (optional).  
- **Never** use disposition as a Kanban column.  
- Server: validate disposition ∈ purpose list or null.

---

### D-03 — Core field packs via `leads.extra` jsonb (Sun)

**Schema**

```text
leads.extra jsonb NOT NULL DEFAULT '{}'::jsonb
  CONSTRAINT leads_extra_is_object CHECK (jsonb_typeof(extra) = 'object')
```

**Why jsonb for Monday:** one migration; per-purpose keys; no 40 columns; easy to replace with field registry later.

**Zod:** `src/lib/crm/field-packs.ts` — per-purpose schema; strip unknown keys; coerce numbers/dates.

**UI:** `LeadDetailForm` + create form section “Pipeline fields” that switches on `purpose`.

#### Sales pack keys

| Key | Type | Label |
| --- | --- | --- |
| coverage_amount | number | Coverage amount requested |
| monthly_budget | number | Monthly budget |
| tobacco | enum y/n/unknown | Tobacco |
| recommended_carrier | string | Recommended carrier |
| quote_amount | number | Quote amount |
| monthly_premium | number | Monthly premium |
| carrier | string | Carrier |
| product | string | Product |
| face_amount | number | Face amount |
| application_number | string | Application number |
| policy_number | string | Policy number |
| application_status | string | Application status |
| assigned_agent | string | Assigned agent |
| next_follow_up | date ISO | Next follow-up |

#### Recruiting pack keys

| Key | Type |
| --- | --- |
| recruit_source, recruiter | string |
| licensed | y/n/unknown |
| resident_state | string (2) |
| npn | string |
| life_licensed, health_licensed | y/n/unknown |
| exam_passed | y/n/unknown |
| contracting_status | string |
| training_completed, ready_to_sell | y/n/unknown |
| first_sale_date | date |

#### PowerBridge pack keys

| Key | Type |
| --- | --- |
| company_name, job_title | string |
| vertical | select (final_expense, life, medicare, mortgage, other, … short list) |
| product_service | select / multi as comma string for Monday |
| monthly_volume | number |
| target_cpl, quoted_cpl | number |
| estimated_monthly_revenue | number |
| probability | number 0–100 |
| expected_close_date | date |

#### Retention pack keys

| Key | Type |
| --- | --- |
| carrier, product, policy_number | string |
| premium | number |
| policy_status | string |
| draft_day | number 1–28 |
| last_failed_payment | date |
| days_past_due | number |
| grace_end | date |
| retention_owner | string |
| next_follow_up | date |
| save_outcome | string |

**Security:** still tenant-scoped via lead RLS; do not store raw bank/card in `extra`.

---

### D-04 — Contact extensions (Sun)

**Migration on `contacts`:**

| Column | Type |
| --- | --- |
| date_of_birth | date null |
| gender | text null (check male/female/other/unknown or free text ≤40) |
| phone_secondary | text null ≤40 |
| timezone | text null ≤64 |
| best_time_to_call | text null ≤120 |
| lead_source | text null ≤120 |
| dnc | boolean not null default false |
| sms_consent | boolean not null default false |
| email_consent | boolean not null default false |

**Files:** contacts validation, forms, detail page, queries/actions.  
**Isolation:** re-run contacts isolation after migration.

---

### D-05 — Retention queues (Sun evening / Mon morning)

**Route:** `/retention` (app nav link: Retention)  
**Data:** `getLeadsForBoard('retention')` + filter helpers on `status` + `extra`.

**Queue chips (query params `?queue=`):**

| Queue | Rule (Monday heuristic) |
| --- | --- |
| pending | status in pending, requirements_needed |
| payment | status in payment_monitoring, payment_failed, grace_period, payment_arranged |
| at_risk | status in at_risk, conservation, reinstatement_pending OR days_past_due ≥ 1 |
| lapsed | status in lapsed, cancelled, unable_to_save |
| all | all retention non-archived |

Table columns: Contact | Carrier | Premium | Status | Days past due | Grace end | Next follow-up | Open  

Link each row to `/leads/[id]`. Keep Kanban at `/leads?purpose=retention&view=board`.

---

### D-06 — Staging demo + client note (Mon)

**Demo script (~10 min)**

1. Org without PowerBridge: campaigns/leads show 3 purposes only.  
2. Jake org: PowerBridge visible.  
3. Create one lead per pipeline; show pack fields.  
4. Board: move Insurance lead across 2–3 stages; set disposition.  
5. `/retention`: open Payment or At risk queue.  
6. Contact: set DOB / DNC / consent.

**Client note:** what’s live vs Policy/Companies/automations next.

---

## 3. Day-by-day schedule

| When | Tasks | Exit criteria |
| --- | --- | --- |
| **Fri 25 (remaining)** | Push/commit Kanban MVP if not on hosted branch; smoke 4 pipelines on Staging | Hosted `/leads` Board works |
| **Sat 26** | D-01 + D-02 migration; update pipelines/dispositions; push Staging; board still moves | New stages + disposition on detail |
| **Sun 27 AM** | D-03 field packs UI + actions | Each purpose shows its pack |
| **Sun 27 PM** | D-04 contacts; D-05 `/retention` queues | Contact fields save; queues list leads |
| **Mon 28 AM** | Lint/build; isolation campaigns + leads (+ contacts if touched); fix bugs | All green |
| **Mon 28 PM** | D-06 walkthrough; send Jake update | Demo ready |

Buffer: if Sunday slips, **cut** PowerBridge pack depth and Retention queue chips first; keep sales/recruiting packs + disposition + stages.

---

## 4. File touch list (expected)

| Area | Files |
| --- | --- |
| Migration | `supabase/migrations/20260926*_crm_details_monday.sql` |
| Pipelines | `src/lib/crm/pipelines.ts`, new `dispositions.ts`, `field-packs.ts` |
| Leads | validation, actions, queries, lead-form, lead-detail-form, lead-kanban-board |
| Contacts | migration cols, validation, forms, queries, actions, detail page |
| Retention | `src/app/(app)/retention/page.tsx`, nav in app-shell |
| Plans | this file; short note in `plan/roadmap.md` |

---

## 5. Testing checklist

- [ ] `npx tsc --noEmit`  
- [ ] `npm run lint` / `npm run build`  
- [ ] `npx supabase db push --linked`  
- [ ] `node scripts/isolation-campaigns.mjs`  
- [ ] `node scripts/isolation-leads.mjs`  
- [ ] `node scripts/isolation-contacts.mjs` (after D-04)  
- [ ] Manual: 4 purposes, PowerBridge hidden on non-Jake org  
- [ ] Manual: board move + disposition  
- [ ] Manual: each field pack saves and reloads  
- [ ] Manual: `/retention` queues  

---

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| Stage CHECK migration fails on existing rows | `UPDATE` map before new CHECK; keep old statuses in Closed if needed |
| Board too wide with many columns | Horizontal scroll; Closed collapsed |
| jsonb validation sprawl | Strict Zod per purpose; reject unknown keys |
| Scope creep to full ChatGPT | Stick to §2 packs; log “phase 2” for rest |
| Google/SMTP still open | Do not block CRM Monday on Auth; park Auth separately |

---

## 7. After Monday (do not start until D-06 signed off)

1. `policies` first-class + Sales→Retention handoff  
2. PowerBridge `companies`  
3. Full field registry (admin)  
4. Payment/grace automations  
5. Retention KPI dashboard  

---

## 8. Definition of done (gate)

- [x] D-01…D-05 implemented; migration `20260926120000_crm_monday_details.sql` on Staging (25 Sep)  
- [x] Isolation campaigns/leads/contacts PASS after push  
- [ ] Jake walkthrough (D-06 human demo)  
- [ ] Commit text prepared (no auto-commit)

**Suggested commit message (when asked):**

```
Add CRM pipeline details for Monday demo

Expand stages, add lead dispositions and per-pipeline field packs,
extend contacts for telesales, and add retention work queues.
```
