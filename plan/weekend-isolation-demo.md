# Weekend isolation demo — detailed plan

**Client request:** Demonstrate tenant isolation this weekend — two organizations; a user from Organization A cannot query Organization B’s records.

**Calendar:** Thursday 10 Sep → demo Saturday/Sunday 12–13 Sep 2026  
**Staffing:** One developer  
**Environment:** Staging only (`ceyaylgqcletophrjlja`). Not production.  
**Not this weekend:** SMTP signup, Telnyx, dialer, leads, calls, HIPAA/TCPA claims.

---

## 1. What the client asked for

> two separate organizations where a user from Organization A cannot query Organization B’s records

| Phrase | Meaning |
| --- | --- |
| two separate organizations | Two tenants with no shared membership |
| a user from Organization A | Authenticated as A (JWT / browser), not service role |
| cannot query | SELECT / REST returns **0 rows**, not a hidden button |
| Organization B’s records | Data that belongs to B |

They want to **see** isolation, not only read `docs/isolation-test.md`.

---

## 2. What is already done (do not redo)

Account-table isolation **passed** on 8 Sep (`docs/isolation-test.md`):

- Isolation Org A / Isolation Org B (not `admin@gmail.com`)
- User A JWT cannot read Org B’s `organizations`, memberships, profiles, audit_logs
- Reverse also PASS

**Gap:** `/contacts` is still Coming Soon. There is no CRM `contacts` table. A weekend demo that only repeats the 8 Sep checks can look like “we isolated empty org tables.” The client said **records**. The first record type is **contacts**.

---

## 3. Definition of success (weekend)

All of these must be true in a live walkthrough:

1. Two orgs exist (Isolation A and Isolation B). Not D104 / `admin@gmail.com`.
2. Org B has at least **one contact** visible when logged in as B.
3. User A’s JWT: `GET /rest/v1/contacts?organization_id=eq.<B>` → **`[]`**.
4. Logged in as A, `/contacts` does not show B’s person.
5. **Insert attack:** User A `POST`s a contact with `"organization_id": "<Org B>"` → **rejected**. No new row in B.
6. You can say: **RLS is the boundary; the UI is not.** Reads *and* writes.

Read isolation is only half the story. A pass that only proves `A JWT → contacts B → []` can still hide:

```
User A cannot read B's contacts
but
User A can create contacts inside B
```

That is a serious tenant-isolation failure. The insert attack is **required proof**, not optional.

---

## 4. Four execution parts

### Part 1 — Thursday: table that can be isolated

**Goal:** `contacts` exists on staging with forced RLS.

| ID | Task | Done when |
| --- | --- | --- |
| W-01 | Migration `contacts`: `id`, `organization_id` (FK), `full_name`, `phone`, `email` (CRM data, not `auth.users`), timestamps | Applied on staging |
| W-02 | `ENABLE` + **`FORCE` ROW LEVEL SECURITY** | `FORCE` confirmed |
| W-03 | SELECT: `private.is_active_member(organization_id)` | A cannot SELECT B |
| W-04 | INSERT/UPDATE/DELETE: active member; `WITH CHECK` / trigger so `organization_id` cannot be set to another org | Cross-tenant insert fails |
| W-05 | No grants to `anon`; `authenticated` only through RLS | REST without JWT fails closed |

Do not add leads in the same migration.

### Part 2 — Friday: UI, seed, proof

**Goal:** A human can create a contact; isolation is written down.

| ID | Task | Done when |
| --- | --- | --- |
| W-06 | `src/lib/contacts/` queries and actions: `requireActiveMembership()` + `requireMfaSatisfied()`; org id never taken from the form as authority | DAL only |
| W-07 | `/contacts`: list, empty state, create. Remove `comingSoon` on Contacts only | Real rows, no invented people |
| W-08 | Seed as each owner (not service role): Org A “Alice A”, Org B “Bob B” | Two rows, two orgs |
| W-09 | **Read isolation:** password-grant JWT; PostgREST; empty array = pass | A GET B’s contacts → `[]`; B sees Bob |
| W-09a | **Insert attack:** A `POST /rest/v1/contacts` with B’s `organization_id` and body `{ "full_name": "Fake Bob", "organization_id": "<Org B>" }` | Rejected (401/403 or PostgREST error). B’s list still only Bob. No Fake Bob. |
| W-10 | Confirm D104 / `admin@gmail.com` was not used as A or B | Dedicated tenants |
| W-11 | Write both read and insert results in `docs/isolation-test-contacts.md` | Evidence for the call |

**MFA:** Isolation users are owners, so `mfa_required` is true. REST tests use password-grant JWTs. For a UI demo, enroll TOTP on those two accounts Friday, or use two accounts you already enrolled. Do not disable the MFA gate for the demo.

If Friday night slips: keep **table + REST read + insert attack**. Drop edit/delete polish and dashboard count. **Do not drop** RLS, the GET `[]` test, or the insert attack.

### Part 3 — Saturday morning: dry run

Walk the script twice: REST once, UI once. Screenshots:

- B’s `/contacts` showing Bob B
- A’s `/contacts` **not** showing Bob B
- REST: A’s token + `organization_id=eq.<B>` → `[]`
- REST: A’s `POST` with B’s org id → rejected; B still has only Bob B

### Part 4 — Saturday/Sunday: client session (~25 minutes)

| Min | You do | They should conclude |
| --- | --- | --- |
| 0–3 | Isolation is RLS + JWT, not CSS. Service role is not in the browser. | Scope is clear |
| 3–8 | Browser B: `/contacts` shows **Bob B** | B has a real record |
| 8–12 | Browser A: `/contacts` does not list Bob B | UI does not leak |
| 12–18 | User A JWT `GET /rest/v1/contacts?organization_id=eq.<OrgB>` → `[]`. User B JWT → `[{ Bob B }]` | Query is blocked |
| 18–23 | **Insert attack:** A `POST` `{ "full_name": "Fake Bob", "organization_id": "<Org B>" }` → rejected. Reload B’s list: still only Bob | Write is blocked |
| 23–25 | SMTP and dialer are out of scope | Honest boundary |

**Pass line:** Organization A cannot read Organization B’s contacts, and cannot insert a contact into Organization B. The database rejected both. That is the same mechanism leads and call records must use later.

---

## 5. Isolation method (repeatable)

Do not use the service role.

1. `POST /auth/v1/token` with Isolation A email/password → `access_token`.
2. `GET {SUPABASE_URL}/rest/v1/contacts?select=id,full_name,organization_id` with `Authorization: Bearer <A>` and the **publishable** key.
3. Expect only A’s rows.
4. `GET .../contacts?organization_id=eq.<OrgB>` as A → `[]`.
5. Repeat as B (B sees Bob).
6. **Insert attack (required):** as A, `POST /rest/v1/contacts` with the publishable key:

```json
{
  "full_name": "Fake Bob",
  "organization_id": "<Org B uuid>"
}
```

Expected: request fails (`401` / `403` / PostgREST RLS error). Then as B, `GET contacts` still has **only** Bob — no Fake Bob.

Empty array on GET = pass. Failed POST + no extra row = pass. A 403 is acceptable on write; a **201 with a row in B is a fail**.

Write results in `docs/isolation-test-contacts.md`. Do not rewrite the 8 Sep account test.

Existing isolation tenants (from `docs/isolation-test.md`):

| Tenant | Email | Organization |
| --- | --- | --- |
| A | `isolation.a.d10@gmail.com` | Isolation Org A |
| B | `isolation.b.d10@gmail.com` | Isolation Org B |

---

## 6. How to talk to the client (send before the call)

> This weekend I will demonstrate tenant isolation on staging with two dedicated organizations. A user authenticated as Organization A will query Organization B’s contact records using the same API the app uses — pass is zero rows, not a hidden button — and will attempt to insert a contact into Organization B’s id, which must be rejected. Account-level isolation already passed; this session adds CRM records (`contacts`) under the same RLS pattern. Signup email is still waiting on your SMTP. We are not showing a dialer.

---

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Client thinks “records” means calls/leads | Contacts are the first record type; same pattern later |
| Isolation users blocked by MFA in the UI | Enroll Friday, or REST-first demo |
| SMTP still missing | Do not demo signup |
| Using `admin@` as Org A | Keep Isolation A/B |
| Showing a service-role query that can see both orgs | Never |
| Time slip on UI | REST read + insert attack still satisfy the weekend |
| Insert appears to succeed (201) | Stop the demo claim; fix WITH CHECK / trigger before the call |

---

## 8. After the weekend (not the call)

- Finish contacts edit/delete, dashboard count, sprint evidence.
- Phase 3 is **leads + call records**, not Telnyx.
- Do not let a successful isolation demo become “dialer by Friday.”

---

## 9. Friday-night checklist

- [x] `contacts` on staging, RLS forced
- [x] Org from session in DAL
- [x] `/contacts` create + list (or REST-only fallback stated)
- [x] Seeded contact in Org B
- [x] User A JWT → `[]` on B’s contacts (written)
- [x] User B JWT → sees B’s contact
- [x] Insert attack: A POST with B’s `organization_id` rejected; Fake Bob does not exist in B
- [x] MFA does not block the live UI path (or REST-only path agreed)
- [x] `admin@gmail.com` / D104 not used as a tenant
- [x] No secrets in git
- [ ] Client message sent: what will and will not be shown

Parts 1 and 2 completed 10 Sep — a day early. Evidence: `docs/isolation-test-contacts.md`.

| Step | State | Command |
| --- | --- | --- |
| Contacts table + RLS | done | migration `20260910190000_contacts.sql` |
| DAL + UI | done | `/contacts` |
| REST isolation proof | done, 7/7 | `node scripts/isolation-contacts.mjs` |
| MFA enrollment for demo accounts | done, both aal2 | `node scripts/mfa-isolation.mjs enroll` |
| Dry run screenshots | next | Part 3 |
| Client walkthrough | after | Part 4 |

During the demo, get a login code with `node scripts/mfa-isolation.mjs code`. No phone required.
