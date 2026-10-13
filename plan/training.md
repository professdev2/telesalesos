# Training — first library slice (Vimeo)

**Status:** schema, RLS, and isolation proof applied on Staging (11/11 PASS). Server layer and UI follow.  
**Depends on:** contacts, leads, call records, campaigns isolation (PASS). MFA gate on `(app)` routes.  
**Rule:** copy the existing tenancy pattern. Do not invent a second authorization model.

This slice is a **library**: watch a Vimeo lesson and open resource **links**. It is not the Academy mock (quizzes, certificates, due dates, resume, manager/pod view).

An agency can use **TelesalesOS catalog content**, **their own lessons**, or **both**. Playback is **Vimeo embed only**.

---

## Out of scope (this slice)

- YouTube, Mux, direct MP4/WebM upload, transcoding, TelesalesOS-hosted video files.
- Quizzes, scores, certificates, expiry, PDFs of certificates.
- Mark complete, resume, % progress, required tracks, due dates, prerequisites.
- Manager / pod completion dashboard.
- SCORM, live classes, transcripts as a product feature.
- Google SSO (separate identity slice).
- Telnyx, QuoteCoach, Billing.

---

## 1. Delivery process (GitHub → CI → staging)

Same loop as campaigns. No code until this plan is approved. No commit or push until you say so.

1. Continue on `feat/foundation-sprint`. Author is nicolas. No Cursor co-author trailer.
2. Reuse `requireActiveMembership`, `private.is_active_member`, `private.is_platform_admin`, `private.write_audit_log`.
3. Implement only after approval.
4. PR into `main` when you instruct. Name the migration, isolation script, and evidence doc. Security: catalog tables + mixed platform/tenant RLS.
5. CI green (`npm run lint`, `npm run build`, `npx tsc --noEmit`) before merge.
6. Human review of RLS (especially platform SELECT vs agency write) before merge.
7. Apply to TelesalesOS Staging (`ceyaylgqcletophrjlja`) only.
8. Staging demo on `https://telesalesos.vercel.app` (or Preview). Preview and Production share Staging Auth — say so in the PR.
9. Evidence in `docs/isolation-test-training.md`.
10. Acceptance on staging only. No production go-live.

---

## 2. Product decisions (locked unless you change them)

1. **Vimeo embed only.** Store a Vimeo URL; the player is `https://player.vimeo.com/video/{id}`. YouTube and raw file URLs are rejected.
2. **Two libraries.** Platform catalog (TelesalesOS) and per-agency lessons. An agency may use ours, theirs, or both.
3. **Resources are links in this slice.** Title + `https` URL. No Supabase Storage, no file upload UI.
4. **No progress tracking.** Opening a lesson does not write completion. No quiz, no certificate.
5. **The product archives.** No hard-delete control on Training.
6. **Iframe allowlist.** Only a parsed numeric Vimeo id is used as the embed `src`. Never put the raw form string into an iframe.

---

## 3. Ownership model (platform vs agency)

Two visibilities. Exactly one applies to each course.

| | Platform catalog | Agency library |
| --- | --- | --- |
| Who owns it | TelesalesOS (no tenant) | One `organization_id` |
| Who can **see** it | Any signed-in user who is an **active member of at least one org** (after the MFA gate on `(app)` routes) | Active members of **that** org only |
| Who can **create / edit / archive** | **`platform_admins` only** (`nicolas@powerbridge.io` provisioned on Staging for the walkthrough) | Active **Owners/Admins** of that org (temporary until the eight-role model) |
| Who cannot write | Ordinary owners/admins/members, including isolation users | Other orgs; platform admins **without** membership in that org |
| Appears in UI as | “TelesalesOS” / Platform | “Your organization” |

Independent / standalone agents: they are an organization like any other. They **see** the platform catalog and may add **their** lessons under their org. They cannot edit platform rows.

Invited agency members: see platform + that agency’s library. They do not see another agency’s library.

`organization_id` is null on platform rows and required on agency rows. Forms never send it as authority: agency writes use `requireActiveMembership()`. Platform writes use `private.is_platform_admin()` and set `organization_id` to null in the action, ignoring any posted org id.

A lesson belongs to one course. A lesson cannot move from platform → agency or between orgs. Resources belong to one lesson and inherit that lesson’s ownership; they cannot be re-parented across libraries.

---

## 4. Resource storage decision

**This slice: links only, stored as text on `training_resources`.**

| Allowed | Not allowed |
| --- | --- |
| `https://` URL, length-capped (2048) | `http://`, `javascript:`, data URIs |
| Title 1–120 characters | Uploading a file into Supabase Storage |
| Optional sort order | Hosting the video file ourselves |

Vimeo is the **player**, not the resource list. A resource is a script, chart, or PDF **already hosted elsewhere** (Google Drive, Vimeo files tab, agency site). The app stores the URL and opens it in a new tab (`rel="noopener noreferrer"`).

TelesalesOS does not grant access to an external resource. Its visibility,
sharing settings, authentication, link expiry, and download permissions remain
controlled by the external provider and the account that owns the resource.
Course editors must configure those permissions at that provider. A link being
visible in TelesalesOS does not guarantee that every viewer can open it.

**Later (not this slice):** optional upload to a bucket with per-org prefixes and signed GET URLs. That is a storage design, not a rename of this table. Do not add a bucket “while we are here.”

---

## 5. Archive behavior

Same product verb as leads and campaigns.

- **Archive** sets `archived_at = now()` on a **course** or a **lesson**. Audit `training_course.archived` / `training_lesson.archived`.
- Default `/training` lists **non-archived** platform courses plus **non-archived** courses for the active org.
- Inside a course, default lesson list hides archived lessons. Resources on an archived lesson stay in the database so history is not silently dropped.
- **No Delete button** on Training. **No Restore UI** in this slice (same as campaigns: URL still works for a member who has the id, or they see it from a direct link; default catalog hides it).
- Archiving a **platform** course hides it for every org’s default catalog. Archiving an **agency** course hides it only for that org.
- `DELETE` RLS remains so isolation scripts can remove **their own seed rows**. Product users never see that path.

Courses are not attached to contacts, so contact delete does not change.

---

## 6. Data model

### `public.training_courses`

| Column | Purpose |
| --- | --- |
| `id` | uuid |
| `visibility` | `platform` or `organization` |
| `organization_id` | null iff platform; else owning tenant |
| `name` | 2–120 characters |
| `description` | optional, 2000 cap |
| `archived_at` | null = on the default catalog |
| `created_by` | `auth.users`, `ON DELETE SET NULL` |
| `created_at` / `updated_at` | |

CHECK: `(visibility = 'platform' AND organization_id IS NULL) OR (visibility = 'organization' AND organization_id IS NOT NULL)`.

### `public.training_lessons`

| Column | Purpose |
| --- | --- |
| `id` | uuid |
| `course_id` | FK to `training_courses(id)` **`ON DELETE RESTRICT`** (do not cascade-erase lessons from the UI path) |
| `title` | 2–120 characters |
| `vimeo_video_id` | digits only (parsed from the pasted URL) |
| `sort_order` | integer, default 0 |
| `archived_at` | |
| `created_by` / timestamps | |

The pasted URL is validated in the app (Zod) and reduced to `vimeo_video_id`. The database stores the id, not an arbitrary iframe string. CHECK: `vimeo_video_id ~ '^[0-9]+$'`.

Updating a lesson cannot point `course_id` at a course with different visibility or `organization_id`.

### `public.training_resources`

| Column | Purpose |
| --- | --- |
| `id` | uuid |
| `lesson_id` | FK to `training_lessons(id)` **`ON DELETE RESTRICT`** |
| `title` | 1–120 characters |
| `url` | `https` URL, length ≤ 2048 |
| `sort_order` | integer, default 0 |
| `created_by` / `created_at` | |

CHECK: `url` like `https://%` and not like `https://javascript%` (app Zod is the real parser; CHECK is a backstop).

Indexes: courses `(visibility, organization_id)`; lessons `(course_id, sort_order)`; resources `(lesson_id, sort_order)`.

Audit metadata is ids only (`course_id`, `lesson_id`, `resource_id`). No titles,
Vimeo ids, or resource URLs are recorded. Agency events use the existing
organization-scoped `audit_logs`. Platform events cannot use that table because
its `organization_id` is required; they use a small
`training_platform_audit_logs` table readable only by platform admins. Do not
invent a fake tenant for platform content.

---

## 7. RLS rules

`ENABLE` + `FORCE ROW LEVEL SECURITY` on all three tables. No grants to `anon`.

**Helpers (reuse, do not duplicate tenancy logic):**

- `private.is_active_member(organization_id)`
- `private.is_platform_admin()` (existing; not derived from user metadata)

**SELECT (authenticated):**

- Course: `visibility = 'platform'` **or** `private.is_active_member(organization_id)`.
- Lesson: parent course is selectable under that rule.
- Resource: parent lesson’s course is selectable under that rule.

Platform rows are therefore visible to every tenant member. They are **not** visible to `anon`. A platform admin with **no** org membership is still gated by the app MFA/membership layout for `/training`; RLS may allow SELECT on platform rows for `authenticated` + `is_platform_admin()` so catalog maintenance works. Agency rows stay hidden without membership.

**INSERT / UPDATE / DELETE (authenticated):**

- **Platform course / its lessons / its resources:** `private.is_platform_admin()` only. `WITH CHECK` the same. Ordinary JWTs cannot set `visibility = 'platform'`.
- **Agency course / its lessons / its resources:** `private.has_org_role(organization_id, ARRAY['owner', 'admin'])` on the **course’s** org. `WITH CHECK` the same. Ordinary members retain SELECT access but cannot create, edit, archive, or delete. Posted `organization_id` for a new agency course is ignored in the action (session org is used).

**Guards (triggers, second barrier):**

- `private.training_courses_guard()`: platform writes require `is_platform_admin()`; agency writes require Owner/Admin via `has_org_role`; `UPDATE` cannot change `visibility` or `organization_id`; CHECK pair still holds.
- `private.training_lessons_guard()`: course exists; writer allowed for that course; cannot move to another course that differs in visibility/org.
- `private.training_resources_guard()`: lesson exists; writer allowed for that lesson’s course; cannot change `lesson_id` to another library.

`auth.uid() IS NULL` (service role / trusted SQL) bypasses the guard, same as leads.

Isolation REST uses AAL1 password-grant JWTs. **Do not key RLS on `aal2`.**

---

## 8. Application layer

- `(app)` `/training` routes call `requireActiveMembership()` (MFA + membership) as today.
- Agency create/update/archive: `organization_id` from session only, and the active membership must be Owner/Admin. Members get read-only Training.
- Platform create/update/archive: refuse unless `is_platform_admin()`; never copy the active org onto the row.
- Zod: Vimeo URL must match `vimeo.com/{id}` or `player.vimeo.com/video/{id}` (optional query string stripped). Resource URL must parse as `https:`.
- Embed: `<iframe src="https://player.vimeo.com/video/{id}">` only.
- `NativeSelect` if any dropdowns appear. No `bg-transparent` option lists.

---

## 9. UI surfaces

| Route | Behavior |
| --- | --- |
| `/training` | Two lists: **TelesalesOS** (non-archived platform courses) and **Your organization** (non-archived agency courses). Empty copy if none. Agency Owners/Admins get “Add course” on the org list only. Members are read-only. Platform admins also get add on the platform list. |
| `/training/courses/[id]` | Course title, lessons in `sort_order`. Add/edit/archive lesson if the caller may write that library. |
| `/training/lessons/[id]` | Title, Vimeo iframe, resource links. Missing id, other-org agency lesson, and nonsense id all **404** the same way. Platform lessons 200 for any member. |
| Dashboard | Training is live as a library. QuoteCoach / Billing still Soon. Copy must not claim quizzes or certificates. |

Sidebar: **Training** has no “Soon” marker. QuoteCoach and Billing still do.

---

## 10. Isolation evidence

`scripts/isolation-training.mjs` — publishable key + password-grant JWTs for Isolation Org A/B. No service role for the checks that claim RLS.

| # | Check | Pass |
| --- | --- | --- |
| 1 | A lists organization courses | only A’s seed (no B) |
| 2 | A filters `organization_id=eq.<Org B>` | `[]` |
| 3 | B lists organization courses | only B’s seed |
| 4 | A `POST` agency course with Org B `organization_id` | rejected, no row |
| 5 | A `POST` course `visibility=platform` | rejected, no row |
| 6 | A `POST` lesson/resource onto B’s course | rejected, no row |
| 7 | B re-reads after attacks | no extra rows |
| 8 | No JWT on `training_courses` | `401` |
| 9 | If a platform course exists: A and B both SELECT it | same platform id; still no write |

Also re-run contacts, leads, call-records, and campaigns isolation.

Written record: `docs/isolation-test-training.md`. What this does **not** prove: quizzes, certificates, Storage, or Google SSO.

Cleanup: delete resources, then lessons, then isolation-seeded **agency** courses. Do not delete platform catalog rows from the isolation script unless the script created them (it should not).

---

## 11. Staging acceptance checklist

On staging (or local against Staging Auth), as a **member** of a team org unless noted. Pass only if every line holds.

**Setup**

1. Sidebar: **Training** has no Soon. QuoteCoach and Billing still do.
2. `/training` is a real catalog, not “Coming soon.” Copy does not mention quizzes or certificates.
3. Two sections are visible: platform / TelesalesOS, and this organization.

**Vimeo**

4. Add an **agency** course, then a lesson with a Vimeo URL. After save and reload, the lesson page plays via `player.vimeo.com` (not a blank iframe, not YouTube).
5. Pasting a non-Vimeo URL is rejected with a visible error. No row.
6. Resource: add an `https` link with a title. It appears on the lesson. Reload: still there. Click opens a new tab.

**Libraries**

7. An agency lesson created in org A does not appear when you switch to org B (or sign in as Isolation B).
8. A platform course (added by a platform admin) appears for **both** orgs’ members on `/training`.
9. A non-platform-admin cannot create or edit a platform course (control hidden or action refused). Isolation A’s JWT cannot insert `visibility=platform`.
9a. An agency member can watch its org's lessons but cannot create, edit, archive, or remove agency content. An Owner/Admin can.

**Archive**

10. Archive an agency course. It leaves that org’s default catalog. Lesson URLs for members of that org still resolve (archived copy), or 404 if we choose “hide detail too” — **this plan: detail still loads for a member of that org, with archived copy, and no edit/add.** Confirm one behavior: **detail still loads; default list hides.**
11. No Delete control on courses, lessons, or resources.

**Tenancy in the UI**

12. `/training/lessons/<id-of-other-org-agency-lesson>` is the same 404 as a nonsense id (no title, no Vimeo, no resource URLs).
13. Dropdowns (if any) stay readable on the dark theme.

**Regression**

14. Contacts, Leads, Calls, Campaigns still work. Isolation suites still PASS.

Record in the PR: script command + exit, link to `docs/isolation-test-training.md`, notes for items 4, 7, 8, 10, and 12.

---

## 12. Implementation order (only after approval)

1. This plan accepted.
2. Migration: tables, CHECKs, RLS, FORCE, guards, audit.
3. Apply to Staging.
4. Isolation script + evidence (agency isolation + platform-write rejection).
5. Zod / DAL / actions / pages; Vimeo id parser; iframe allowlist.
6. Nav + dashboard copy.
7. Lint, tsc, build; five isolation suites.
8. You walk the checklist → commit as nicolas → push when you instruct.

---

## 13. Definition of done

- Plan approved; then PR merged with green CI and reviewed RLS.
- Staging has the tables; isolation doc PASS; prior CRM isolation still PASS.
- Vimeo-only playback; resources are https links; no Storage bucket.
- Platform catalog writable only by platform admins; agency catalog tenant-scoped.
- No quizzes, certificates, or progress rows.
- QuoteCoach / Billing / Telnyx / Google SSO untouched.
