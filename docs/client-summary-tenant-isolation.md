# Tenant isolation — client summary

**Prepared:** 10 September 2026
**Environment:** Staging
**Scope:** Can a user from one organization reach another organization's records?

You asked to see tenant isolation demonstrated on real records — two organizations, where a user in Organization A cannot query Organization B's data. This is what was built and verified.

---

## Completed

| | |
| --- | --- |
| ✅ | **CRM contacts table** — the first real record type, owned by an organization |
| ✅ | **RLS tenant isolation** — the database enforces the boundary, not the interface |
| ✅ | **Ownership model in the data layer** — a record's organization comes from the signed-in session, never from the submitted form |
| ✅ | **MFA enforcement** — organization owners and admins must complete a second factor before reaching CRM screens |
| ✅ | **Cross-tenant read prevention** |
| ✅ | **Cross-tenant write prevention** |

---

## Evidence

Two dedicated organizations were used, each with its own owner and its own contact record. Every check below was run with a normal user login through the same API the application itself uses. The administrative key that bypasses these rules was never used — a test run with it would prove nothing.

| Check | Result |
| --- | --- |
| Organization A reads its own contacts | Sees only its own |
| **Organization A reads Organization B's contacts** | **No records returned** |
| Organization B reads Organization A's contacts | No records returned |
| **Organization A tries to create a contact inside Organization B** | **Rejected. No record was created.** |
| A request with no login at all | Rejected |

All seven checks passed. The full record is in the project's isolation test document, and the test is a single command that can be re-run in front of you at any time.

**Why the write test matters.** Blocking reads is only half of it. A system can hide another organization's records and still let an outsider *create* records inside it, which is a serious flaw. Both directions were tested.

---

## How the boundary is enforced

The rule lives in the database, applied to every query automatically. The application does not decide what you are allowed to see — it asks, and the database returns only your organization's rows. A modified request, a direct API call, or a bug in a future screen all hit the same rule.

Two independent safeguards prevent writing into another organization: the access rule itself, and a second check on the record before it is saved. If one is ever weakened by mistake, the other still refuses the write.

Note that MFA and isolation are deliberately separate. The isolation checks above passed even for a login that had not completed its second factor — so a stolen password alone still returns nothing. Making the data boundary depend on MFA would be weaker, not stronger.

---

## What this does not cover

Stated plainly so the result is not read as broader than it is:

- This ran on staging, not production.
- It proves isolation for **contacts**. Any other record type would need the same treatment and its own test. The pattern is reusable, but it is not automatic.
- Signup email is still waiting on your SMTP credentials. Until those arrive, account creation cannot be demonstrated end to end.
- No dialer or telephony work is included, and none is promised in this period.

---

## What this makes possible

The value here is not one table. It is a proven, repeatable pattern for keeping tenants separated, which any future record type can be built on and verified the same way, with the same one-command test.

Which modules are built next, and in what order, is a scoping conversation rather than something this work commits to.

**Needed from you:** SMTP credentials, so signup and invitations can be completed and shown.
