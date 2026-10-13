# Week plan — 14–18 September 2026

**Hours:** 7 per day, 5 days, 35 total
**Phase:** 2 — CRM data foundation
**Environment:** staging (`ceyaylgqcletophrjlja`) only

This plan is deliberately short. Days 1 and 2 are fixed. Days 3–5 have one objective each and are detailed at the end of the previous day, once the real state is known. Do not expand this file into a backlog.

---

## Where Phase 2 stands going into the week

| Success criterion | State |
| --- | --- |
| 1. A new agency owner can create an account | **Blocked** — waiting on client SMTP |
| 2. The organization boundary is enforced | Done, proven |
| 3. An owner can securely manage contacts | Partial — create, list, delete. No edit, no search |
| 4. A second organization cannot access those contacts | Done, proven (7/7) |
| 5. The pattern can be reused for later modules | Done — migration pattern + one-command test |

The week is about finishing criterion 3 without weakening 2 and 4.

---

## Daily rhythm (7 hours)

| Block | Time | Use |
| --- | --- | --- |
| 1 | 3h | Main task, uninterrupted |
| — | 1h | Break |
| 2 | 2h | Second task or finishing block 1 |
| 3 | 1h | Manual test of what was built today |
| 4 | 1h | Notes, evidence, and writing tomorrow's plan into this file |

Block 4 is not optional. It is what keeps this plan short and honest.

---

## The one standing rule

**After any change to contacts queries, policies, or the data layer, re-run:**

```
node scripts/isolation-contacts.mjs --no-seed
```

Expect `ALL CHECKS PASSED — 7 total`. A red check means stop and fix before moving on. The isolation guarantee was demonstrated to the client; silently breaking it later is far worse than never having demoed it.

This rule outranks everything else in this file, including finishing a day's task.

---

## Requests that arrive after the demo

A demo that goes well produces requests. Write each one down, confirm you have understood it, and schedule it. Do **not** add it to this week.

1. Capture it on Day 1 with the rest of the call notes.
2. Reply with what it is and when it will be considered — not with a date for delivery.
3. Anything that is not already in this plan belongs to next week at the earliest.

Absorbing a request mid-week is how a finished module becomes two unfinished ones.

---

## Day 1 — Monday 14 Sep · Close out the demo, start contact editing

**Objective:** nothing from the weekend is left dangling, and contacts can be edited.

1. **(1h) Demo close-out.** Write down what the client actually asked during the call — questions, objections, anything they assumed. Add commitments to a short list. If any answer given on the call was wrong or vague, correct it in `docs/client-summary-tenant-isolation.md` today, while it is fresh.
2. **(1h) Repository housekeeping — in this order.** Out of order, this consumes the morning:

   ```
   Revoke old PATs
   ↓
   Create new PAT (repo + workflow)
   ↓
   Clear credential cache
   ↓
   Push branch
   ↓
   Open PR, confirm CI is green
   ```

   Pushing before the cache is cleared retries the dead token and fails in a way that looks like a permissions problem. The `workflow` scope is required because the repository contains `.github/workflows/ci.yml`.
3. **(3h) Contact edit.** An update form reusing `contactSchema`. `organization_id` must never appear in the form; the update is scoped by id **and** active organization, exactly as the delete action is.
4. **(1h) Manual test** — edit as owner A, confirm the change, confirm A cannot edit Alice by guessing a Bob-shaped id.
5. **(1h)** Isolation re-run, notes, plan Day 2.

**This day is expected to overrun.** Demo close-out, repository housekeeping, and the edit flow are three unrelated kinds of work, and the first two are open-ended — a call that raised objections, or a rejected push, can take the morning on its own. If that happens, finish close-out and housekeeping, carry the edit flow into Day 2, and push search to Day 3. Do not compress the test block to protect the schedule.

**Done when:** a contact can be edited, and the seven checks still pass.

---

## Day 2 — Tuesday 15 Sep · A usable contact list

**Objective:** the list stays usable past ten records.

1. **(3h) Search.** Filter by name, email, or phone. Server-side, always scoped to the active organization. Never filter in the browser over a full fetch — that would put other rows on the wire even if RLS keeps them out.
2. **(2h) Pagination or a sensible limit,** plus honest empty and loading states.
3. **(1h) Manual test** with enough seeded rows to see paging behave. Seed as an owner, not with the service role.

**The paging rows are synthetic test data.** Generated names in the isolation organizations — never real people, never a client's book of business, never an imported list. Remove them once paging is verified, or leave them only in the isolation tenants and say so in the notes. Nothing in this product should contain a real contact until a client deliberately puts one there.
4. **(1h)** Isolation re-run, notes, plan Day 3.

**Done when:** 50 contacts are navigable, and the seven checks still pass. Search changes the query, so this re-run genuinely matters.

---

## Day 3 — Wednesday 16 Sep · Audit trail for contact changes

**Objective:** contact create, update, and delete are recorded.

**Keep this deliberately minimal.** Three events — created, updated, deleted — and nothing more. No field-level diffs, no before-and-after snapshots, no new viewer UI, no retention policy. Those are real requirements one day; today they are scope.

Reuse the existing audit pattern rather than inventing a second one. An audit write must never roll back the user's action — follow the approach already used for the MFA enrollment event.

### Detail (written at the end of Day 2)

`public.audit_logs` is append-only for clients: it has a SELECT policy for members and **no** INSERT policy, and `private.write_audit_log()` is not granted to `authenticated`. An application-side insert would therefore be rejected. The established pattern — used by the membership and invitation triggers — is a `SECURITY DEFINER` trigger that calls the helper.

| ID | Task | Done when |
| --- | --- | --- |
| D3-01 | Migration: `private.contacts_write_audit()`, `SECURITY DEFINER`, `SET search_path = ''` | Applied on staging |
| D3-02 | `AFTER INSERT OR UPDATE OR DELETE` row trigger on `contacts` | Three events fire |
| D3-03 | Actions `contact.created`, `contact.updated`, `contact.deleted` | Present in `audit_logs` |
| D3-04 | `GRANT EXECUTE` on the trigger function to `authenticated` | Writes succeed for a normal user |
| D3-05 | Verify A cannot read B's contact audit rows | Existing audit RLS still holds |

**Metadata is `contact_id` only.** No names, emails, or phone numbers. `audit_logs` is append-only with no retention policy defined, so copying personal data into it creates an obligation we have not designed for. The cost is that a deletion entry references a row that no longer exists — accept that for now and revisit when retention is specified.

**Out of scope, deliberately:** field-level diffs, before/after snapshots, an audit viewer UI, retention rules.

---

## Day 4 — Thursday 17 Sep · Conditional

**If the client has delivered SMTP:** configure it, verify signup end to end, confirm the confirmation link uses `NEXT_PUBLIC_SITE_URL`, then delete the test account. This unblocks success criterion 1 and takes priority over everything else.

**If SMTP has still not arrived:** contact detail view, including the `notes` field, which exists in the database but has no UI. Send a second written reminder that signup cannot be demonstrated without credentials — do not build a workaround mailer.

### Detail (written at the end of Day 3 — no-SMTP branch taken)

| ID | Task | Done when |
| --- | --- | --- |
| D4-01 | `getContactById()` scoped by id **and** active organization | A foreign id returns nothing, not an error |
| D4-02 | Route `/contacts/[id]` — full record including `notes` | Renders for an owned contact |
| D4-03 | A missing or foreign id renders `notFound()` | No detail leaks through the 404 |
| D4-04 | Edit form on the detail page covering all fields including `notes` | `notes` is finally writable |
| D4-05 | Revalidate both `/contacts` and `/contacts/[id]` after a write | List and detail stay in step |
| D4-06 | Second written SMTP reminder recorded in `docs/smtp-request.md` | Dated entry on the record |

**The 404 matters more than it looks.** A foreign contact id must be indistinguishable from a non-existent one. If a missing id 404s but a real id belonging to another organization renders an error page or a redirect, the difference confirms the record exists — a membership oracle. Both must produce the same response.

**Still out of scope:** a workaround mailer. SMTP is a client deliverable.

---

## Day 5 — Friday 18 Sep · Regression, evidence, and next week

1. Full pass: `npm run build`, `npm run lint`, `npx tsc --noEmit`, and the seven isolation checks.
2. Update `docs/sprint-report.md` with what shipped and what did not, in plain language.
3. Decide on the isolation test accounts — keep them if the pattern will be re-tested for leads, and say so in writing. Do not leave them undocumented.
4. Write next week's plan.

---

## Not this week

- **Leads, calls, campaigns.** Phase 3 begins only after contacts is genuinely finished. Starting leads with contacts half-done leaves two unfinished modules.
- **Telephony or a dialer.** No work, and no date offered.
- **Production deployment.** Staging only until the client asks and the environment is prepared.
- **A workaround mailer.** SMTP is a client deliverable.
- **Refactoring the auth or organization code.** It works and it is proven. Leave it alone.

---

## Risks

| Risk | Response |
| --- | --- |
| A good demo becomes "so when is the dialer?" | Point at the five-phase ladder. Give no date. |
| SMTP never arrives | Day 4 has a defined alternative. Do not absorb the client's dependency as your own delay. |
| Search or pagination quietly weakens the org filter | The standing rule catches it — that is why the re-run is daily, not weekly. |
| Scope creep from call feedback | Write requests down on Day 1. Schedule them next week, not into this one. |
| Seven hours becomes ten | The plan is sized for five hours of real building. If a day overruns, cut scope, not the test block. |

---

## Definition of a successful week

1. Contacts can be created, listed, searched, edited, and deleted by an owner.
2. The seven isolation checks pass on Friday exactly as they passed on Thursday 10 September.
3. Contact changes are recorded in the audit trail.
4. Either signup works end to end, or the SMTP dependency is on the record for the second time.
5. Phase 3 has not been started, and no delivery date has been given for telephony.
6. Contact ownership is enforced by server-side organization context, not form data. Every contact action — create, edit, delete, search — still derives the organization from the authenticated session. Nothing added this week accepts an organization identifier from user input.
