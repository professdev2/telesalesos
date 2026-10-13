# TelesalesOS — Next Plan (Phase 2)

**Sprint:** Secure CRM foundation (after the 2-week account sprint)  
**Staffing:** One developer  
**Calendar:** **10 working days is the target, not a hard promise.** Stretch to 15 only if the contacts UI slips.  
**What to tell the client:** focused foundation, not “the CRM.”  
**Not this sprint:** Telnyx, a dialer, QuoteCoach, training, billing, AI, 8-role model, production launch, marketing homepage.

The previous sprint shipped the account system. This plan does **not** start the dialer. A phone with no contacts and no working signup looks unfinished and is harder to isolate.

---

## How to talk to the client

Do **not** say: “I'm going to build the CRM in the next two weeks.” That is too broad.

Say:

> For Phase 2, I recommend we keep the scope focused on completing the secure CRM foundation: reliable signup, MFA enforcement, contacts with tenant-scoped RLS, and proof that one organization cannot access another organization's contacts. Once that is verified, we can move into the sales workflow and then telephony without rebuilding the foundation.

That follows how this product should be built:

| Phase | Foundation | This sprint? |
| --- | --- | --- |
| **1** | Identity + tenancy | Done (account sprint) |
| **2** | CRM data foundation | **This plan** |
| **3** | Sales workflow foundation (leads, call **records**) | Next — not committed |
| **4** | Telephony (Telnyx, recordings) | After Phase 3 |
| **5** | AI / compliance automation | After telephony is real |

**Do not promise a dialer in the next two weeks.** Once Telnyx enters, complexity jumps considerably. Phase 3 is sales workflow, **not** live voice — not “contacts are done, give me the dialer by Friday.”

### Definition of success

Phase 2 is successful when:

1. A new agency owner can create an account.
2. The organization boundary is enforced.
3. An owner can securely manage contacts.
4. A second organization cannot access those contacts.
5. The implementation pattern can be reused for leads, calls, and future modules.

Item 1 is blocked if the client has not supplied SMTP. That does not fail the rest of the definition; it must be stated in the report.

### Milestones to communicate (these are the real commitments)

| Day | Milestone | Meaning |
| --- | --- | --- |
| **Day 2** | Signup works | A new user can confirm email **if SMTP credentials are in staging**. If they are not, signup is blocked on the client, not on development. |
| **Day 4** | MFA enrollment and enforcement flow completed for required users | TOTP enroll + gate for `mfa_required`, or a signed exception is on file. Not “MFA works” in the compliance sense. |
| **Day 8** | Contacts works | Create / list / edit in the signed-in org. |
| **Day 10** | Isolation evidence + report | Org A cannot read Org B contacts; short Phase 2 report. |

Ten days is the **target** for that sequence. Do not let “10 days” be read as a guarantee that every circumstance still finishes on Day 10.

---

## Incoming state (do not redo)

- Branch: `feat/foundation-sprint` (merge/PR before this sprint if not already on `main`)
- Staging verified; one account migration; signup trigger works
- Auth, dashboard shell, profile, org, members, convert-to-team, copy-invite
- Isolation **pass** on account tables (dedicated Isolation Org A/B)
- Demo login: `admin@gmail.com` (owner of D104 Verify Org, still **individual**)
- Isolation users exist only for security tests — do not use them in client demos
- Built-in Supabase mailer is rate-limited; new form signups fail until **client SMTP** is configured

**Do not convert D104 / admin’s org** unless the client asks. Conversion is one-way.

---

## SMTP is a client dependency, not Day-1 coding

The plan already states: **SMTP credentials are a client deliverable.**

Do **not** make SMTP the first thing you personally spend substantial development time on if the client has not supplied credentials. Do not invent a mailer, a fake inbox, or SQL “signups” as a substitute for the demo.

**Workflow:**

1. **Day 1: request credentials immediately.** Resend, Postmark, or SES — staging dashboard only, never git.
2. **If they provide them → implement** (P2-01–P2-04).
3. **If they don’t → do not burn hours on a workaround.** Continue MFA and contacts. Tell the client in writing that **reliable signup is blocked on their side**.

The client should understand this is a dependency they own.

SQL-created users (pre-confirmed, no mail) are for **internal testing only**, the same way isolation users were created. They are not a demo of signup.

---

## Work priority (cut from the bottom)

```
Request SMTP (Day 1, client-owned)
>
MFA enrollment (flag becomes a gate)
>
Contacts table + RLS + DAL
>
Contacts UI (list / create / edit)
>
Isolation re-test on contacts
>
Leads (only if contacts isolation passed and time remains)
```

Implement SMTP **when credentials arrive**, even if that is mid-sprint. Until then, treat signup-as-demo as **waiting on the client**.

If time slips: **drop leads first**, then polish on the contacts list.  
**Do not drop** MFA enrollment (or a written exception), contacts RLS, or Org A ↛ Org B on `contacts`.  
**Do not drop SMTP work in favor of a workaround** — either the client delivers credentials and you wire them, or signup stays blocked and that is stated in the report.

---

## Client communication checkpoints

| When | Send | Meaning |
| --- | --- | --- |
| **Day 1** | SMTP requested. | Credentials needed for staging; signup cannot be demoed until they arrive |
| After Day 2 | Signup works **or** signup blocked on SMTP. | Either a new user confirms and reaches the dashboard, or a written note that mail is waiting on the client |
| After Day 4 | MFA enrollment and enforcement flow completed for required users. | Owners/admins can enroll TOTP and cannot skip the gate; or a signed exception is in the report |
| After Day 8 | Contacts works. | Create/list/edit in one org; no fake seed data from another tenant |
| After Day 10 | Isolation evidence + Phase 2 report. | Isolation on contacts [passed/failed]; Phase 3 is sales workflow, **not** telephony |

---

## Must finish

1. **Day-1 SMTP request** on the record. If credentials arrive: wire staging + document templates. If they do not: document the block; do not spend the sprint building a mailer.
2. **Confirmation templates** use `/auth/confirm?token_hash=…` so a laptop signup / phone inbox still works — **when SMTP exists**. See `docs/auth-setup.md`.
3. **MFA enrollment** for users with `mfa_required = true`, or a one-page exception the client signs. A flag with no enrollment is not compliance.
4. **`contacts` table** with `organization_id`, RLS forced, no client INSERT of `organization_id` that is not the session org.
5. **DAL** for contacts: org always from `requireActiveMembership()`, never from the URL or form as authority.
6. **Contacts UI** on `/contacts` — real rows, empty state, no invented people.
7. **Isolation test:** User A’s JWT cannot `select` User B’s contacts. Evidence in `docs/` (same style as `docs/isolation-test.md`).
8. Short Phase 2 report + next-phase estimate (Phase 3 = sales workflow; **no dialer promise**).

## Nice to have (only after must-finish)

- Invite **email** (copy-link already works; still needs SMTP)
- Leads table + UI (same RLS pattern as contacts) — only if Days 5–8 finish early
- Members roster showing teammate names (needs a deliberate RLS change on `profiles` or a safe view — do not “just join”)
- Public marketing homepage
- CI database / isolation job
- Last-owner-delete fix

---

## Ten-day execution order (target)

### Day 1 — Ask for SMTP; do not stall the sprint

**Deliver:** Credentials requested in writing. If they arrive the same day, start wiring.  
**Client message:** “Signup needs your SMTP. MFA and contacts proceed either way.”

| ID | Task | Done when |
| --- | --- | --- |
| P2-01 | Request SMTP (Resend, Postmark, or SES). Secrets only in staging dashboard + `.env.local`. Never git. | Email/request sent Day 1 |
| P2-01a | **If credentials exist:** configure SMTP and send a test message | Staging sends mail |
| P2-01b | **If credentials missing:** log the block; do **not** invent a mailer or SQL-signup demo | Block noted; other work continues |

### Days 1–2 — Signup works (when mail exists)

**Deliver:** A stranger can create an account and confirm by email **if SMTP is live**.  
**Client message:** “Signup works” **or** “Signup is waiting on SMTP from you.”

| ID | Task | Done when |
| --- | --- | --- |
| P2-02 | Auth → URL Configuration: Site URL + redirect URLs for `/auth/callback` and `/auth/confirm` | Links land in this app |
| P2-03 | Email templates: confirm signup + reset password use `token_hash` + `/auth/confirm` | Phone inbox works (needs SMTP) |
| P2-04 | One **new** signup (not admin@, not isolation users) confirms and reaches `/dashboard` | Written pass — **skipped until SMTP** |
| P2-05 | Update `.env.example` with `NEXT_PUBLIC_SITE_URL` only (no keys) | Clone still safe |

If SMTP is still missing at end of Day 2: **do not slip MFA.** Report the dependency and start Days 3–4.

### Days 3–4 — MFA enrollment and enforcement

**Deliver:** Owners/admins who require MFA can enroll (TOTP) and cannot reach CRM without it.  
**Client message:** “MFA enrollment and enforcement flow completed for required users.” Do not say “MFA works” — that overclaims for a compliance-minded client.

| ID | Task | Done when |
| --- | --- | --- |
| P2-06 | Enroll/verify/unlist TOTP via Supabase Auth MFA APIs. Secrets stay in Auth, not `user_security_settings`. | Owner can enroll |
| P2-07 | After login, if `mfa_required` and no verified factor → `/mfa/enroll` (cannot reach CRM) | Flag is enforced |
| P2-08 | AAL / `aal2` check on `(app)` for required users | Skipping enroll does not open `/contacts` |
| P2-09 | If the client refuses MFA this phase: one-page exception in `docs/` and **do not** claim HIPAA/TCPA | Exception filed |

If SMTP arrives during Days 3–4, wire it in a short interruption, then return to MFA. Do not abandon MFA for mailer debugging.

### Days 5–8 — Contacts works (first CRM table)

**Deliver:** `/contacts` is a real page.  
**Client message:** “Contacts works.”

| ID | Task | Done when |
| --- | --- | --- |
| P2-10 | Migration `contacts`: `id`, `organization_id`, display fields (name, phone, email as **data**, not Auth), timestamps. RLS enabled **and** forced. | Applied on staging |
| P2-11 | Policies: `private.is_active_member(organization_id)` for SELECT; INSERT/UPDATE/DELETE only for active members; `organization_id` must match caller’s org (trigger or WITH CHECK). | No cross-tenant insert |
| P2-12 | `src/lib/contacts/` queries + actions go through DAL + `requireActiveMembership()` | No org id from the client as authority |
| P2-13 | `/contacts`: list, empty state, create, edit, delete. Remove `comingSoon` on that nav item only. | No fake rows |
| P2-14 | Dashboard “Pipeline” card can mention contact count for **this** org only | Count is RLS-scoped |

Do **not** add `leads` in the same migration unless Days 5–8 finish early.

### Days 9–10 — Isolation evidence + report

**Deliver:** Proof + short report.  
**Client message:** “Isolation evidence + Phase 2 report.” Next is Phase 3 (sales workflow), **not** a dialer.

| ID | Task | Done when |
| --- | --- | --- |
| P2-15 | Two users, two orgs (reuse Isolation A/B **or** new dedicated pair). User A JWT `select` on `contacts` for B’s org → **0 rows**. Same for `GET /rest/v1/contacts?organization_id=eq.<B>`. | Pass/fail written |
| P2-16 | Confirm D104 / `admin@gmail.com` org still individual unless the client converted it | No surprise conversion |
| P2-17 | Security pass: no secrets in git; contacts never use service role in the browser | Notes in report |
| P2-18 | Phase 2 report (1–2 pages): what shipped, SMTP status, isolation evidence, next = Phase 3 sales workflow (not telephony) | Same length as Day 10 report |

---

## Demo path (end of Phase 2)

```
(If SMTP live) New signup → email confirm
     → (MFA enroll if required) → dashboard
     → Contacts: create one person → list shows them
     → Isolation: Org A cannot read Org B contacts
```

If SMTP is still missing: demo **login as `admin@gmail.com`**, MFA (if in scope), contacts, and isolation. State clearly that **new-user signup was not demoed because mail credentials were not supplied.**

Unauthenticated users still cannot open `(app)` routes. Contacts are empty until the user adds them — **no seed contacts from another tenant**.

---

## Technical decisions (this phase)

| Topic | Decision |
| --- | --- |
| SMTP | Client deliverable. Request Day 1. Implement only with real credentials. No workaround sprint. |
| Org on contacts | Always from session membership. Form may display it; it is not the source of truth. |
| Roles | Keep `owner` / `admin` / `member`. No 8-role migration. |
| Email on contact | A contact email is CRM data, not `auth.users`. |
| Invites | Copy-link stays. Do not block this sprint on Resend for invites. |
| Isolation | JWT + PostgREST, **not** service role. Empty array = pass. |
| Homepage | Optional later. Do not spend Days 1–8 on marketing. |
| Telnyx / QuoteCoach | Phase 4+. Contacts (Phase 2) → leads and call records (Phase 3) → live voice (Phase 4). |

---

## Known risks

1. SMTP credentials are a **client deliverable**. Without them, P2-04 cannot pass. That is a client delay, not a missed Day-2 coding task. Do not fake signup with SQL for the **client** demo.
2. MFA UX can eat Days 3–4. Prefer a working TOTP enroll over a custom SMS design.
3. Changing `profiles` RLS so members see teammate names is a **new security design**, not a UI bug. Leave it unless the client prioritizes it over contacts.
4. Isolation A/B still exist on staging. Prefer them for P2-15; do not log into them in a sales demo.
5. GitHub PAT from the old clone URL should already be revoked.
6. A 10-day target will be read as a promise if you only quote the number. Always pair it with the four milestones and the SMTP dependency.

---

## After this sprint (not committed)

Reuse the contacts pattern. Do not skip ahead to a phone.

| Phase | What | Typical size |
| --- | --- | --- |
| **3 — Sales workflow foundation** | Leads (same RLS/DAL as contacts); call **records** as data (disposition, duration); still no live Telnyx | **3–5 weeks**, not 2 |
| **4 — Telephony** | Telnyx voice, recording, retention | After call records exist |
| **5 — AI / compliance automation** | QuoteCoach, training, billing, eight roles, TCPA/DNC automation | After telephony is real |

**Do not promise a dialer in the next two weeks.** Do not start live telephony the week contacts land.

---

## End-of-sprint checklist

- [ ] SMTP requested on Day 1; either wired **or** explicitly blocked on the client (no silent workaround)
- [ ] New user confirms email and reaches the dashboard **or** report states signup was blocked on SMTP
- [ ] MFA enrollment and enforcement flow completed for required users **or** exception document exists
- [ ] `contacts` on staging with RLS forced
- [ ] `/contacts` create / list / edit / empty state
- [ ] Org A cannot read Org B contacts (evidence attached)
- [ ] No Telnyx, no fake CRM, no secrets in git
- [ ] Phase 2 report sent; next phase framed as sales workflow (Phase 3), not telephony

---

## Daily rule

1. Work the current IDs only.  
2. Day 1: request SMTP. If missing, **stop inventing mail** — continue MFA/contacts and tell the client.  
3. Communicate milestones, not a blanket two-week CRM: **Day 2 signup; Day 4 MFA enrollment and enforcement for required users; Day 8 contacts; Day 10 isolation + report.**  
4. If something must slip: **leads first**, then invite email. Never slip contacts RLS, the contacts isolation test, or an honest SMTP status.  
5. Never promise a dialer as the next Friday after contacts.
