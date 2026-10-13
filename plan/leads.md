# Leads — first CRM workflow slice

**Status:** approved. Implementation in progress.  
**Depends on:** contacts isolation (PASS 7/7), MFA gate on `(app)` routes.  
**Rule:** copy the contacts tenancy pattern. Do not invent a second authorization model.

This is Phase 3, slice 1 only: a lead that belongs to one organization and one contact. It is not the CRM.

---

## Out of scope (this slice)

- Configurable pipelines, custom labels, kanban.
- Assignments, queues, skills, Manager role, eight-role model.
- Campaigns, lists, bulk import.
- Telnyx, live calls, recordings, dispositions as telephony.
- Passkeys, MFA changes, recovery-cookie tightening.
- Production cutover to a separate Supabase project.

---

## 1. Delivery process (GitHub → CI → staging)

Do not push straight to `main` and treat Vercel as the review. This slice follows the same loop as MFA, with CI as a merge gate.

1. **Branch** from current `main` (personal branch, e.g. `feat/leads-foundation`).
2. **Inspect** contacts: `supabase/migrations/20260910190000_contacts.sql`, `src/lib/contacts/*`, `scripts/isolation-contacts.mjs`, `docs/isolation-test-contacts.md`. Reuse helpers (`requireActiveMembership`, `hasAtLeastRole` only if a role check is actually needed, `private.is_active_member`, `private.write_audit_log`).
3. **Implement** in small commits. Author is the developer (nicolas). No Cursor co-author trailer.
4. **Open a GitHub PR into `main`.** Fill `.github/pull_request_template.md`. Name the migration, isolation script, and evidence doc. Security implications: new tenant table + RLS.
5. **CI must be green** (`.github/workflows/ci.yml`: `npm run lint`, `npm run build`, `npx tsc --noEmit`) before merge. Isolation scripts talk to staging and stay **local / staging**, not in GitHub Actions (they need isolation passwords from `.env.local`).
6. **Human review of the migration and RLS** before merge. UI and Zod may be drafted; policies, `organization_id` sourcing, and the contact-org guard are owned by the reviewer.
7. **Apply the migration to TelesalesOS Staging** (`ceyaylgqcletophrjlja`) after the PR is approved, or as a linked `supabase db push` that is recorded in the PR. Do not apply to the unused production Supabase project.
8. **Staging demo** on `https://telesalesos.vercel.app` (or the Preview URL for the PR). Preview and Production currently share Staging Auth — say so in the PR. Do not treat a Preview deploy as a second database.
9. **Evidence** written to `docs/isolation-test-leads.md` (same shape as contacts). Link it from the PR.
10. **Acceptance** on staging only. No production go-live as part of this slice. No automatic promote.

Rollback: revert the PR; the migration is additive. If the table must be withdrawn from staging, that is a separate, reviewed down-migration — not a silent `DROP` during the demo.

---

## 2. Data model (first slice)

Table `public.leads`, tenant-scoped like `public.contacts`.

| Column | Purpose |
| --- | --- |
| `id` | uuid |
| `organization_id` | owning tenant; never accepted from the client |
| `contact_id` | required FK to `public.contacts(id)` |
| `status` | Canonical playbook stage (default `new`; list below) |
| `notes` | optional, length-capped like contacts |
| `archived_at` | null = open; set = archived (see §4) |
| `created_by` | `auth.users` id, `ON DELETE SET NULL` |
| `created_at` / `updated_at` | |

**Contact must be in the same organization.** A trigger rejects a `contact_id` whose `contacts.organization_id` is not this lead’s `organization_id`. Updating a lead cannot move it to another org or point it at another org’s contact.

Canonical stages: `new`, `attempted`, `contacted`,
`appointment_scheduled`, `quoted`, `application_started`, `submitted`,
`approved`, `placed`, `not_interested`, `unreachable`, and `dnc`. Agencies
cannot customize this list in the first slice.

Indexes: `(organization_id, created_at DESC)` and `(organization_id, contact_id)` where not archived (or the same indexes without a partial clause if simpler).

RLS: `ENABLE` + `FORCE ROW LEVEL SECURITY`. SELECT / INSERT / UPDATE / DELETE all require `private.is_active_member(organization_id)`. INSERT/UPDATE `WITH CHECK` the same. Second barrier: `private.leads_guard_organization()` on INSERT/UPDATE (membership + no org move + contact same-org). No grants to `anon`.

Audit: SECURITY DEFINER trigger into `public.audit_logs` with `lead.created` / `lead.updated` / `lead.archived` / `lead.deleted`. Metadata is `{ lead_id }` only — no contact name, email, or notes.

Application: `organization_id` comes from `requireActiveMembership()`. Forms never include it. `requireActiveMembership` already runs the MFA gate.

---

## 3. Acceptance (beyond CRUD)

The slice is not done when list/create/edit exist. All of the following must be true.

**Workflow**

- A lead is created only against a contact that already exists in the **active** organization. Creating a lead with no contact, or with a contact id from another org, fails.
- Status is one of the twelve canonical playbook stages. Invalid status is rejected by the database and by Zod.
- Default list shows **non-archived** leads for the active org only. Search does not escape the org.
- Detail at `/leads/[id]`: missing id and **other-org id** both 404 (same response — no membership oracle).
- Changing status or notes does not change `organization_id` or `contact_id`’s org.

**Tenancy**

- Org A’s JWT cannot `SELECT` Org B’s leads (`[]`, not an error that confirms existence).
- Org A cannot `INSERT` a lead with Org B’s `organization_id` (rejected **and** no row).
- Org A cannot attach a lead to Org B’s contact even if they send their own `organization_id`.
- Signed-out / `anon` cannot read or write leads.

**Auth gate**

- `(app)` leads routes still go through `requireActiveMembership()` (MFA + membership). Isolation REST checks may use AAL1 JWTs; RLS must still hold. Do not key RLS on `aal2`.

**Audit**

- Create, status change, and archive write `audit_logs` rows with `lead_id` only.

**UI honesty**

- `/leads` is no longer “Coming soon.”
- Campaigns, Calls, QuoteCoach, Billing, Training stay placeholders.

---

## 4. Archive, not permanent delete (product)

**Decision:** the product **archives**. It does not hard-delete leads from the UI.

A lead is a workflow record (including placed and closed-out history). Copying contacts’ `DELETE` into the Leads UI would erase that history and leave audit rows pointing at nothing, which contacts already accepted as a trade-off we do not want to repeat here.

- **Archive** sets `archived_at = now()` (and audit `lead.archived`). Default list hides it.
- **No recycle-bin or restore UI** in this slice. Restore can wait.
- **No hard-delete button** on `/leads`.

`DELETE` RLS stays, matching contacts, so:

- isolation / validation scripts can remove **their own seed rows** in the same org;
- a future admin tool can hard-delete without a schema change.

Scripts must not leave “Fake Bob” style attack rows behind. Product users never see that path.

### Contact deletion when leads exist

`leads.contact_id` references `contacts(id)` with **`ON DELETE RESTRICT`**.

A contact that has **any** lead — open or archived — cannot be hard-deleted. Archive does not free the contact: the row still points at it so opportunity history stays attached to a real person.

What the product does:

- Contacts without leads still hard-delete, as they do today.
- Contacts with leads: delete is rejected. The UI shows a plain error (not a 500). The contact remains.
- There is no “delete contact and its leads” and no cascade. Isolation scripts that tear down seed data must **delete leads first**, then contacts.

This is the only contacts behavior change in this slice.

---

## 5. Temporary permissions (until the eight-role model)

The database still has `owner` / `admin` / `member` plus `platform_admins`. There is no Manager, Agent license, or per-record ACL. Do not invent one for leads.

**Temporary rule (this slice):** any **active member** of the organization may list, create, update (status/notes), and archive leads in that organization — the same bar contacts use today.

| Actor | Leads in an org they belong to | Leads in an org they do not belong to |
| --- | --- | --- |
| `member` (Agent) | yes | no (RLS) |
| `admin` | yes (same as member, not a wider CRM role) | no |
| `owner` | yes (same as member) | no |
| Platform admin **without** membership in that org | no | no |
| Signed out | no | no |

Not in this slice: “only the creator can edit,” assignment, owner-only archive, or hiding leads from members.

When the eight-role model lands, tighten policies in a dedicated migration. Until then, `hasAtLeastRole` is **not** required on lead actions; membership + RLS is the boundary.

---

## 6. Demo evidence (same bar as contacts)

Ship three artifacts, not a screenshot of `/leads` alone.

### 6.1 Automated isolation — `scripts/isolation-leads.mjs`

Mirror `scripts/isolation-contacts.mjs`: password-grant JWTs for Isolation Org A and B, PostgREST with the **publishable** key, no service role for the checks that claim RLS.

Minimum checks (extend if the contact-FK guard needs its own row):

| # | Check | Pass |
| --- | --- | --- |
| 1 | A lists leads | only A’s seed lead |
| 2 | A filters `organization_id=eq.<Org B>` | `[]` |
| 3 | B lists leads | only B’s seed lead |
| 4 | B filters `organization_id=eq.<Org A>` | `[]` |
| 5 | A `POST` lead with Org B `organization_id` (and/or Org B `contact_id`) | rejected (`403`/`42501`) |
| 6 | B re-reads after the attack | no extra row |
| 7 | No JWT | `401` |

Pass conditions: empty array on illicit read; rejection **plus** absence of the row on illicit write.

Also re-run `node scripts/isolation-contacts.mjs --no-seed` so contacts isolation is not regressed.

### 6.2 Written record — `docs/isolation-test-leads.md`

Same sections as `docs/isolation-test-contacts.md`: date, staging project ref, subjects (Isolation Org A/B emails and org ids — **not** D104 / `admin@gmail.com`), method, enforcement (migration name, FORCE RLS, trigger), results table, MFA note (RLS holds at AAL1), “what this does not prove.”

### 6.3 Staging walkthrough (human)

On staging, as a **member** of a team org (not only an owner). Pass only if every UI criterion below holds — not merely that the pages render.

**Setup**

1. Sidebar: **Leads** has no “Soon” marker. Calls, Campaigns, Training, QuoteCoach, and Billing still do.
2. `/leads` is a real list, not “Coming soon.”
3. With no leads: empty copy tells you to add one. The add form is visible.

**Create**

4. Contact picker lists only contacts from the **active** organization. If the org has no contacts, the form says to add a contact first and does not submit a lead.
5. Create a lead against a contact. It appears on the list with that contact’s name and status **New**. Reload: it is still there (not client-only state).
6. The create form has no organization field.

**Update status**

7. Open the lead. Change status New → Attempted → Contacted → Quoted → Placed. Save and reload after each change: the new status is shown.
8. Notes can be saved and survive reload.

**Archive**

9. The control is labeled **Archive**, not Delete. After archive, the default `/leads` list no longer includes it.
10. There is no hard-delete control on Leads.

**Tenancy in the UI**

11. `/leads/<id-of-another-org-lead>` shows the same 404 as a nonsense id (“Page not found”), never the other org’s contact name or status.
12. Search (if used) never lists another organization’s leads.

**Contact delete interaction**

13. On that contact’s page, **Delete contact** fails with a visible error while the lead exists (including after the lead is archived). The contact is still on `/contacts`.

Record in the PR: script command + exit, link to `docs/isolation-test-leads.md`, screenshots or notes for items 5, 7, 9, 11, and 13, and that Preview/Production still share Staging.

---

## 7. Implementation order (when accepted)

1. Migration: table, RLS, FORCE, guards, audit trigger.
2. Apply to Staging.
3. Isolation script + evidence draft (seed + 7 checks) **before** polishing UI.
4. DAL/actions/validation/pages (`/leads`, `/leads/[id]`), archive action, replace Coming Soon.
5. `npm run lint`, `npx tsc --noEmit`, `npm run build`; both isolation scripts.
6. PR → CI → review → merge → staging demo → acceptance.

---

## 8. Definition of done

- PR merged to `main` with green CI and a reviewed migration.
- Staging has the table; `docs/isolation-test-leads.md` records PASS on the isolation matrix.
- Contacts isolation still PASS.
- Product archives; no hard-delete in the Leads UI.
- Any active member of the org can use the slice; other orgs cannot.
- Campaigns / calls / roles / Telnyx untouched.
