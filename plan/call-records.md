# Call records — Phase 3, slice 2

**Status:** implemented locally. Isolation PASS on staging. Awaiting your go-ahead to commit, push, and open a PR.  
**Depends on:** contacts isolation (PASS), leads isolation (PASS), MFA gate on `(app)` routes.  
**Rule:** copy the contacts / leads tenancy pattern. Do not invent a second authorization model.

This slice logs **manual attempt history**. It is not a dialer. It is not Telnyx. It is not recordings.

A call record answers: *who did this organization try to reach, when, and what happened on that attempt?* Live voice, click-to-dial, webhooks, and audio files are Phase 4, after this table exists.

---

## Out of scope (this slice)

- Telnyx, SIP, click-to-dial, inbound numbers, STIR/SHAKEN.
- Recordings, voicemail audio, transcription, retention policies.
- Auto-filled duration from a carrier; auto-advance of lead status.
- Campaigns, lists, bulk import, power-dial queues.
- Assignments, Manager role, eight-role model, per-record ACL.
- TCPA / DNC automation (a `dnc` outcome is a label only).
- Passkeys, MFA, recovery, branding, or production cutover.
- Configurable outcome lists.

---

## 1. Delivery process (GitHub → CI → staging)

Same loop as leads. Work stays local until you say to commit and push.

1. **Branch:** continue on `feat/foundation-sprint` unless you ask for a new branch. Author is nicolas. No Cursor co-author trailer.
2. **Inspect** leads: `supabase/migrations/20260915200000_leads.sql`, `src/lib/leads/*`, `scripts/isolation-leads.mjs`, `docs/isolation-test-leads.md`. Reuse `requireActiveMembership`, `private.is_active_member`, `private.write_audit_log`, `NativeSelect`.
3. **Implement** in small commits when approved.
4. **Open a GitHub PR into `main`** when you instruct. Name the migration, isolation script, and evidence doc. Security implications: new tenant table + RLS.
5. **CI must be green** (`npm run lint`, `npm run build`, `npx tsc --noEmit`) before merge. Isolation scripts stay local / staging (passwords in `.env.local`).
6. **Human review of the migration and RLS** before merge.
7. **Apply the migration to TelesalesOS Staging** (`ceyaylgqcletophrjlja`) only. Do not apply to the unused production Supabase project.
8. **Staging demo** on `https://telesalesos.vercel.app` (or the PR Preview). Preview and Production still share Staging Auth — say so in the PR.
9. **Evidence** in `docs/isolation-test-call-records.md`. Link it from the PR.
10. **Acceptance** on staging only. No production go-live. No automatic promote.

Rollback: revert the PR; the migration is additive. Withdrawing the table from staging is a separate, reviewed down-migration.

---

## 2. What the product is (honest naming)

The sidebar already has **Calls**. This slice **replaces** the Coming Soon page at `/calls`. The page copy must not promise a dialer.

| Surface | What the user should read |
| --- | --- |
| Nav | Calls (no “Soon”) |
| Page title | Calls |
| Description | Logged attempts for this organization. Live dialing is a later phase. |
| Dashboard | Contacts, leads, and call records are live. Campaigns are still a placeholder. |

Database table name: **`public.call_records`**, not `calls`. When Telnyx arrives it can own a different table (or extra columns) without colliding with this history log.

Campaigns, Training, QuoteCoach, and Billing stay placeholders.

---

## 3. Data model

Table `public.call_records`, tenant-scoped like `public.leads`.

| Column | Purpose |
| --- | --- |
| `id` | uuid |
| `organization_id` | owning tenant; never accepted from the client |
| `contact_id` | required FK to `public.contacts(id)` **`ON DELETE RESTRICT`** |
| `lead_id` | optional FK to `public.leads(id)` **`ON DELETE RESTRICT`** |
| `outcome` | fixed attempt result (default `no_answer`; list below) |
| `notes` | optional, length-capped like leads (2000) |
| `occurred_at` | when the attempt happened (default `now()`) |
| `duration_seconds` | optional integer, 0–14400 (manual; not from a carrier) |
| `created_by` | `auth.users` id, `ON DELETE SET NULL` |
| `created_at` / `updated_at` | |

No `recording_url`, no Telnyx id, no phone-number column. The number lives on the contact.

**Same-organization rules (trigger, not only the app):**

1. `contact_id` must belong to this `organization_id`.
2. If `lead_id` is set, that lead must belong to this `organization_id`.
3. If `lead_id` is set, `lead.contact_id` must equal this row’s `contact_id`. You cannot attach a call to Lead X and Contact Y if they are different people.
4. Updating a row cannot move `organization_id`, cannot retarget another org’s contact or lead, and cannot break rule 3.

**Why contact is required and lead is optional.** An agent can log an attempt against a person who is not yet an opportunity. From a lead page, both ids are filled. From `/calls`, the agent picks a contact, then optionally a lead that already points at that contact.

**This slice does not change lead status.** Logging `connected` does not move a lead from `new` to `attempted`. The agent updates the lead separately. Auto-advance is later work and needs an explicit product rule.

Indexes: `(organization_id, occurred_at DESC)`, `(organization_id, contact_id)`, `(organization_id, lead_id)` where `lead_id` is not null.

RLS: `ENABLE` + `FORCE ROW LEVEL SECURITY`. SELECT / INSERT / UPDATE / DELETE require `private.is_active_member(organization_id)`. INSERT/UPDATE `WITH CHECK` the same. Second barrier: `private.call_records_guard_organization()` on INSERT/UPDATE. No grants to `anon`.

Audit: SECURITY DEFINER trigger into `public.audit_logs` with `call_record.created` / `call_record.updated` / `call_record.deleted`. Metadata is `{ call_record_id }` only — no names, notes, or phone numbers.

Application: `organization_id` comes from `requireActiveMembership()`. Forms never include it.

---

## 4. Canonical outcomes (not lead stages)

Lead status is where the **opportunity** sits. Call outcome is what happened on **this attempt**. Do not reuse the twelve playbook stages here.

| Value | Label |
| --- | --- |
| `connected` | Connected |
| `no_answer` | No answer |
| `voicemail` | Voicemail |
| `busy` | Busy |
| `wrong_number` | Wrong number |
| `disconnected` | Disconnected |
| `callback_requested` | Callback requested |
| `not_interested` | Not interested |
| `dnc` | DNC |

Default on create: `no_answer`. Invalid values are rejected by CHECK and by Zod. Agencies cannot customize this list in this slice.

`dnc` on a call record does **not** block future calls and does **not** flip the lead to `dnc`. It is a label on that attempt only.

---

## 5. Acceptance (beyond CRUD)

**Workflow**

- A call record is created only against a contact in the **active** organization.
- Optional `lead_id` must be a lead in that org whose `contact_id` matches.
- Outcome is one of the nine values above.
- Default `/calls` list is this org only, newest `occurred_at` first. Search does not escape the org.
- Detail at `/calls/[id]`: missing id and **other-org id** both 404 (same response).
- Edit may change outcome, notes, `occurred_at`, `duration_seconds`, and may set/clear `lead_id` only if the contact still matches. It cannot change `organization_id` or `contact_id`.

**Tenancy**

- Org A’s JWT cannot `SELECT` Org B’s call records (`[]`).
- Org A cannot `INSERT` with Org B’s `organization_id` (rejected **and** no row).
- Org A cannot attach a call to Org B’s contact or lead, even with Org A’s `organization_id`.
- Signed-out / `anon` cannot read or write.

**Auth gate**

- `(app)` call routes still go through `requireActiveMembership()`. Isolation REST checks may use AAL1 JWTs; RLS must still hold. Do not key RLS on `aal2`.

**Audit**

- Create, update, and script-only delete write `audit_logs` with `call_record_id` only.

**UI honesty**

- `/calls` is no longer “Coming soon.” Copy states these are logged attempts, not live dials.
- Campaigns, Training, QuoteCoach, Billing stay placeholders.
- Native `<select>` uses `NativeSelect` (explicit background + option text). No `bg-transparent` on option lists.

---

## 6. No delete in the product UI

**Decision:** the product **does not hard-delete** call records from the UI. It also **does not archive** them in this slice.

A call record is an event. Hiding it behind archive would invent a second “open vs closed” concept that leads already own. Erasing it from the UI would drop history that compliance later expects to keep.

- Create and edit (outcome, notes, when, duration, optional lead) are the product verbs.
- **No Delete button. No Archive button** on `/calls`.
- Mistakes are corrected by editing.

`DELETE` RLS stays, matching contacts/leads, so isolation scripts can remove **their own seed rows**. Product users never see that path.

### Contact and lead deletion when call records exist

`contact_id` and `lead_id` use **`ON DELETE RESTRICT`**.

- A contact with any call record cannot be hard-deleted (same as contacts with leads).
- A lead with any call record cannot be hard-deleted. The Leads UI already has no hard-delete; isolation scripts must **delete call records first**, then leads, then contacts.
- Contact delete error copy must mention leads **or** call records, not only leads.

There is no “delete contact and its calls” and no cascade.

---

## 7. Temporary permissions (until the eight-role model)

Same bar as contacts and leads: any **active member** of the organization may list, create, and update call records in that organization.

| Actor | Records in an org they belong to | Records in an org they do not belong to |
| --- | --- | --- |
| `member` | yes | no (RLS) |
| `admin` | yes (same as member) | no |
| `owner` | yes (same as member) | no |
| Platform admin **without** membership in that org | no | no |
| Signed out | no | no |

Not in this slice: “only the creator can edit,” assignment, or hiding teammates’ attempts. `hasAtLeastRole` is **not** required on these actions.

---

## 8. UI surfaces

| Route | Behavior |
| --- | --- |
| `/calls` | List + add form. Contact picker (this org). Optional lead picker filtered to that contact’s open (non-archived) leads. Outcome via `NativeSelect`. Notes, when, optional duration. |
| `/calls/[id]` | Detail + edit. Shows contact name (link) and lead name (link, if set). |
| `/leads/[id]` | Extra card: attempts for this lead, newest first, plus a short “Log attempt” form pre-filled with this lead and its contact. |
| `/contacts/[id]` | Extra card: attempts for this contact (read list + link to log on `/calls` or a small form). Delete copy updated for RESTRICT. |
| Dashboard | One-line copy that call records are live. |

Empty states: if the org has no contacts, the add form says to add a contact first and does not submit. If the contact has no leads, `lead_id` stays empty (valid).

Pagination matches leads (capped page size). Search is by contact name / notes, org-scoped.

---

## 9. Demo evidence

Ship three artifacts, not a screenshot of `/calls` alone.

### 9.1 Automated isolation — `scripts/isolation-call-records.mjs`

Mirror `scripts/isolation-leads.mjs`: password-grant JWTs for Isolation Org A and B, PostgREST with the **publishable** key, no service role for the RLS claims.

| # | Check | Pass |
| --- | --- | --- |
| 1 | A lists call records | only A’s seed row |
| 2 | A filters `organization_id=eq.<Org B>` | `[]` |
| 3 | B lists call records | only B’s seed row |
| 4 | B filters `organization_id=eq.<Org A>` | `[]` |
| 5 | A `POST` with Org B `organization_id` and/or Org B `contact_id` | rejected (`403`/`42501`) |
| 6 | B re-reads after the attack | no extra row |
| 7 | No JWT | `401` |
| 8 | A `POST` with A’s `organization_id` and B’s `lead_id` | rejected, no row |

Also re-run `node scripts/isolation-contacts.mjs --no-seed` and `node scripts/isolation-leads.mjs --no-seed`.

Scripts must delete call records before leads before contacts.

### 9.2 Written record — `docs/isolation-test-call-records.md`

Same sections as leads: date, staging project ref, Isolation Org A/B (not D104), method, enforcement, results table, MFA note (RLS holds at AAL1), “what this does not prove” (does not prove Telnyx, recordings, or DNC enforcement).

### 9.3 Staging walkthrough (human)

On staging, as a **member** of a team org. Pass only if every criterion holds.

**Setup**

1. Sidebar: **Calls** has no “Soon” marker. Campaigns, Training, QuoteCoach, Billing still do.
2. `/calls` is a real list. Copy does not claim a dialer or recordings.
3. Outcome dropdown: every option is readable on the dark theme (not white-on-white).

**Create**

4. Contact picker lists only this org. No contacts → form tells you to add a contact first.
5. Log an attempt against a contact, outcome **No answer**. It appears on the list with that contact’s name. Reload: it is still there.
6. The create form has no organization field.
7. From a lead detail page, log **Connected**. The attempt appears on that lead. The lead **status does not change by itself**.

**Update**

8. Open the record. Change outcome to Voicemail, edit notes, save, reload: both persist.

**No delete**

9. There is no Delete or Archive control on Calls.

**Tenancy**

10. `/calls/<id-of-another-org-record>` is the same 404 as a nonsense id.
11. Search never lists another org’s records.

**RESTRICT**

12. Contact with a call record cannot be deleted; error is visible; contact remains. Same after the related lead is archived.

Record in the PR: script command + exit, link to the evidence doc, notes for items 5, 7, 8, 10, and 12, and that Preview/Production share Staging.

---

## 10. Implementation order (when accepted)

1. Migration: table, CHECK, RLS, FORCE, guard, audit trigger.
2. Apply to Staging.
3. Isolation script + evidence draft **before** polishing UI.
4. Zod / DAL / actions; pages `/calls`, `/calls/[id]`; cards on lead and contact; remove Coming Soon; `NativeSelect` only.
5. Update contact-delete error copy; dashboard copy.
6. `npm run lint`, `npx tsc --noEmit`, `npm run build`; contacts + leads + call-records isolation.
7. You confirm → commit as nicolas → push → PR → CI → review → staging demo.

---

## 11. Definition of done

- PR merged to `main` with green CI and a reviewed migration.
- Staging has `call_records`; isolation doc records PASS.
- Contacts and leads isolation still PASS.
- Product has no call-record delete/archive control.
- Any active member of the org can use the slice; other orgs cannot.
- Campaigns / Telnyx / roles / recordings untouched.
- Logging a call does not mutate lead status.

---

## 12. Decisions to confirm (please read)

These are the product calls baked into this draft. Object before implementation if any should change.

1. **Contact required, lead optional** (with matching-contact guard).
2. **Nine fixed outcomes**, not the twelve lead stages.
3. **No auto-update of lead status** when a call is logged.
4. **Edit allowed, no Delete/Archive in the UI.**
5. **`/calls` stays named Calls**, with honest “logged attempts” copy, table named `call_records`.
6. **RESTRICT** on contact and lead, so history cannot vanish when a person or opportunity is removed.

Nothing is committed or pushed until you say so.
