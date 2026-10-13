# Campaigns — Phase 3, slice 3

**Status:** implemented locally. Isolation PASS on staging (11/11). Awaiting your walkthrough, then go-ahead to commit, push, and open a PR.  
**Depends on:** contacts, leads, and call-records isolation (PASS). MFA gate on `(app)` routes.  
**Rule:** copy the contacts / leads / call-records tenancy pattern. Do not invent a second authorization model.  
**Follow-up:** campaigns now carry a **purpose** (`sales` or `recruiting`). See `plan/campaigns-sales-recruiting.md`.

A campaign is a **named list of contacts in one organization**. It is the work list behind outbound activity. It is not a dialer, not Telnyx, and not a bulk importer.

---

## Out of scope (this slice)

- Telnyx, click-to-dial, power-dial, progressive dial, recordings.
- CSV / bulk import, purchased lists, DNC scrubbing.
- Auto-create of leads or call records when a contact is added.
- Assignments, queues, Manager role, eight-role model.
- Cadences, scheduled send times, email/SMS in the campaign.
- Configurable status lists.

---

## 1. Delivery process (GitHub → CI → staging)

Same loop as call records. Work stays local until you say to commit and push.

1. Continue on `feat/foundation-sprint`. Author is nicolas. No Cursor co-author trailer.
2. Inspect `public.leads` and `public.call_records` migrations. Reuse `requireActiveMembership`, `private.is_active_member`, `private.write_audit_log`, `NativeSelect`.
3. Implement in small commits when approved.
4. Open a GitHub PR into `main` when you instruct. Name the migration, isolation script, and evidence doc. Security: two new tenant tables + RLS.
5. CI green (`npm run lint`, `npm run build`, `npx tsc --noEmit`) before merge.
6. Human review of the migration and RLS before merge.
7. Apply to TelesalesOS Staging (`ceyaylgqcletophrjlja`) only.
8. Staging demo on `https://telesalesos.vercel.app` (or Preview). Preview and Production share Staging Auth — say so in the PR.
9. Evidence in `docs/isolation-test-campaigns.md`.
10. Acceptance on staging only. No production go-live.

---

## 2. Six product decisions (locked)

1. **A campaign belongs to the active organization. Contacts on it are optional at create.** You can save an empty list, then add people. Every contact must already exist in this org.
2. **Four fixed statuses:** `draft`, `active`, `paused`, `completed`. Default `draft`. Not the twelve lead stages.
3. **Membership is a junction table** `campaign_contacts`. The contact and the campaign must share `organization_id`. Duplicate (campaign, contact) is rejected.
4. **The product archives a campaign. It does not hard-delete it from the UI.** You **may remove a contact from a campaign** (that only unlinks the list row). There is no Delete Campaign button.
5. **`ON DELETE RESTRICT` on the contact.** A contact that is on any campaign (including an archived campaign) cannot be hard-deleted. Same idea as leads and call records.
6. **Adding a contact to a campaign does not create a lead or a call record.** Agents still log attempts and update lead status themselves.

---

## 3. Data model

### `public.campaigns`

| Column | Purpose |
| --- | --- |
| `id` | uuid |
| `organization_id` | owning tenant; never accepted from the client |
| `name` | 2–120 characters |
| `status` | `draft` (default), `active`, `paused`, `completed` |
| `notes` | optional, 2000 cap |
| `archived_at` | null = on the default list |
| `created_by` | `auth.users` id, `ON DELETE SET NULL` |
| `created_at` / `updated_at` | |

Indexes: `(organization_id, created_at DESC)`.

RLS: `ENABLE` + `FORCE`. SELECT / INSERT / UPDATE / DELETE require `private.is_active_member(organization_id)`. Guard `private.campaigns_guard_organization()`: membership, no org move. No grants to `anon`.

Audit: `campaign.created` / `campaign.updated` / `campaign.archived` / `campaign.deleted`. Metadata `{ campaign_id }` only.

### `public.campaign_contacts`

| Column | Purpose |
| --- | --- |
| `id` | uuid |
| `organization_id` | same tenant as the campaign; never trusted from the client |
| `campaign_id` | FK to `campaigns(id)` **`ON DELETE CASCADE`** (removing a campaign row in SQL drops its membership; the UI does not offer that) |
| `contact_id` | FK to `contacts(id)` **`ON DELETE RESTRICT`** |
| `created_by` | `auth.users` id, `ON DELETE SET NULL` |
| `created_at` | |

Unique `(campaign_id, contact_id)`.

Guard `private.campaign_contacts_guard_organization()`:

- caller is an active member of `NEW.organization_id`;
- campaign exists and `campaign.organization_id = NEW.organization_id`;
- contact exists and `contact.organization_id = NEW.organization_id`;
- `UPDATE` cannot change `organization_id`, `campaign_id`, or `contact_id` (remove + add instead).

RLS same membership pattern. Audit: `campaign_contact.added` / `campaign_contact.removed`. Metadata `{ campaign_id, campaign_contact_id }` only — no names.

Application: `organization_id` from `requireActiveMembership()`. Forms never include it.

---

## 4. Acceptance (beyond CRUD)

- Create a campaign with a name; empty contact list is valid.
- Add only contacts from the active org. Another org's contact id fails, and no row is written.
- Default `/campaigns` list is non-archived campaigns in this org.
- `/campaigns/[id]`: missing id and other-org id both 404.
- Archive hides it from the default list. Membership rows stay so RESTRICT still applies.
- Remove-from-campaign unlinks; the contact remains.
- Adding a member does not insert into `leads` or `call_records`.

**Tenancy:** Org A cannot SELECT Org B campaigns or memberships (`[]`). Org A cannot INSERT a campaign or a membership into Org B. Org A cannot put Org B's contact on Org A's campaign. Signed-out / `anon` cannot read or write.

**Auth gate:** `(app)` routes still use `requireActiveMembership()`. Isolation REST may use AAL1; RLS must still hold.

**UI honesty:** `/campaigns` is no longer Coming Soon. Copy does not claim a dialer. Training, QuoteCoach, Billing stay Soon. Dropdowns use `NativeSelect`.

---

## 5. Temporary permissions

Any **active member** of the organization may list, create, update, archive campaigns, and add/remove contacts on those campaigns. Other orgs: no. Platform admin without membership: no. `hasAtLeastRole` is not required.

---

## 6. UI surfaces

| Route | Behavior |
| --- | --- |
| `/campaigns` | List + create (name, status, notes). Empty copy if none. |
| `/campaigns/[id]` | Edit name/status/notes. Archive. Contact list. Add contact (`NativeSelect` of org contacts not already on the list). Remove from campaign. |
| `/contacts/[id]` | Card: campaigns this person is on (name + status, link). Delete copy mentions campaigns. |
| Dashboard | Campaigns are live; Training / QuoteCoach / Billing still placeholders. |

---

## 7. Demo evidence

### 7.1 `scripts/isolation-campaigns.mjs`

Publishable key + password-grant JWTs. Isolation Org A/B.

| # | Check | Pass |
| --- | --- | --- |
| 1 | A lists campaigns | only A's seed |
| 2 | A filters `organization_id=eq.<Org B>` | `[]` |
| 3 | B lists campaigns | only B's seed |
| 4 | B filters Org A | `[]` |
| 5 | A `POST` campaign with Org B `organization_id` | rejected, no row |
| 6 | A `POST` `campaign_contacts` with A's campaign and B's `contact_id` | rejected, no row |
| 7 | A `POST` `campaign_contacts` with B's `organization_id` / B's campaign | rejected, no row |
| 8 | B re-reads campaigns and memberships | no attack rows |
| 9 | No JWT on `campaigns` | `401` |
| 10 | No JWT on `campaign_contacts` | `401` |

Cleanup: delete `campaign_contacts` then `campaigns` (seed contacts kept).

Also re-run contacts, leads (`--no-seed` as today), and call-records isolation.

### 7.2 `docs/isolation-test-campaigns.md`

Same shape as call records.

### 7.3 Staging walkthrough

1. Sidebar: Campaigns has no Soon. Training / QuoteCoach / Billing still do.
2. Create a campaign **Q3 list**, status Draft. It appears after reload.
3. Open it. Add a contact from this org. Reload: still listed.
4. Outcome dropdowns / status select: every option readable on dark theme.
5. Remove the contact from the campaign. Contact still exists under Contacts.
6. Archive the campaign. Default list hides it.
7. A contact that is on a campaign cannot be deleted (error visible). Same after the campaign is archived if they were still linked; if already removed, delete may succeed unless leads/calls remain.
8. `/campaigns/<other-org-id>` is the same 404 as a nonsense id.
9. Adding the contact did not create a new lead or call by itself.

---

## 8. Implementation order

1. This plan.
2. Migration: tables, CHECKs, RLS, FORCE, guards, audit.
3. Apply to Staging.
4. Isolation script + evidence.
5. Zod / DAL / actions / pages.
6. Contact delete copy; dashboard; nav.
7. Lint, tsc, build; four isolation suites.
8. You confirm → commit as nicolas → push → PR → CI → staging demo.

---

## 9. Definition of done

- PR merged to `main` with green CI and a reviewed migration.
- Staging has both tables; isolation doc PASS.
- Contacts 7/7, leads 9/9, call records 10/10 still PASS.
- No campaign hard-delete in the UI; members can be unlinked.
- Other orgs cannot read or write.
- Telnyx / Training / QuoteCoach / Billing untouched.
