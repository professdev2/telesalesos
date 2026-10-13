# Staging maintenance log

Operations performed on the staging database that are **not** normal application behaviour. Each entry exists so that a later reader does not mistake a maintenance action for something the product does by itself.

Production has no equivalent process. Nothing here should be repeated against real tenant data.

---

## 11 September 2026 — removal of test-generated contact audit rows

**What:** deleted 70 rows from `public.audit_logs`.

**Why:** the `contacts` audit trigger shipped the same day, and the validation scripts (`contacts-paging-check`, `contacts-audit-check`, `contacts-detail-check`) create, edit, and delete throwaway contacts as part of proving the trigger works. Those writes each produce a genuine audit event. The rows were correct; they were simply artifacts of testing, and a client walkthrough of staging was scheduled for the following day. The motivation was presentation, not correctness.

**Predicate — deliberately the narrowest that would do the job:**

```sql
delete from public.audit_logs
where organization_id = 'b00174b6-bb5d-4856-bfcf-a0bf9868f01b'  -- Isolation Org A only
  and action like 'contact.%'                                    -- contact events only
  and created_at >= date_trunc('day', now());                    -- today's validation window only
```

Organization and membership events could not be reached by this predicate: they are neither `contact.*` nor created that day.

**Verified afterwards:**

| Check | Result |
| --- | --- |
| Contact audit rows remaining | 0 |
| Other audit rows preserved | 3 |
| Distinct actions remaining | `membership.created` |
| Contacts | `Isolation Org A: Alice A`, `Isolation Org B: Bob B` |

The three surviving rows are the original membership events from when the isolation tenants were created on 8 September. They are part of the isolation evidence and were left untouched.

An earlier pass the same day removed 63 orphaned rows using a different predicate (contact events whose contact no longer existed). That predicate could not reach the rows above, because Alice A still exists — hence the second, date-scoped pass.

**This is not normal audit behaviour.** `audit_logs` has no DELETE policy for clients by design, and this required the elevated database role. Once real tenant activity exists, "the audit log looks noisy" must be answered with filtering or a retention policy, never with deletion. Deleting from an append-only table destroys the property that makes it worth having.

**Avoiding a repeat:** the validation scripts clean up the contacts they create, but cannot clean their own audit rows, because a normal user has no permission to. Run them *after* a demo rather than before.
