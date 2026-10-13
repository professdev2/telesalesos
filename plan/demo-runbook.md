# Demo runbook — tenant isolation

Self-contained. Everything needed to reproduce the demo is here; no chat history required.

**Environment:** staging (`ceyaylgqcletophrjlja`). Never production.
**Total time:** ~10 minutes to run, ~25 minutes with the client.

---

## ⚠ Do these before the call — not part of the demo

- [ ] **Revoke any leaked GitHub PATs.** If tokens were ever pasted into chat or docs, treat them as compromised. GitHub → Settings → Developer settings → Personal access tokens → Delete. Then issue one new classic PAT with `repo` **and** `workflow` scope (the missing `workflow` scope is what rejected the earlier pushes), and clear the old entry from Windows Credential Manager.
- [ ] **Commit the `feat/foundation-sprint` changes.** You commit manually. Uncommitted: the contacts migration, `src/lib/contacts/`, `src/components/contacts/`, the `/contacts` page, `src/lib/nav.ts`, `scripts/`, and the four documents. Confirm `git status` shows no `.env.local`.
- [ ] Note: `main` is protected — pull request plus 2 passing checks. Push `feat/foundation-sprint` and open a PR; do not push `main` directly.

Verified 10 Sep: `.env.local` is gitignored and untracked. It holds passwords, TOTP secrets, and keys — never commit it, never screen-share it.

---

## 0. Facts you may need out loud

| | |
| --- | --- |
| Org A | Isolation Org A — `b00174b6-bb5d-4856-bfcf-a0bf9868f01b` — owner `isolation.a.d10@gmail.com` — contact **Alice A** |
| Org B | Isolation Org B — `552bf447-1115-4808-9a2c-d3de4511a25e` — owner `isolation.b.d10@gmail.com` — contact **Bob B** |

Passwords and TOTP secrets are in `.env.local` (gitignored). Both owners have MFA enrolled, so login needs a 6-digit code.

`D104 Verify Org` / `admin@gmail.com` is **not** used as either tenant. Do not sign in as it during the demo.

---

## 1. Setup (before the client joins)

```
cd C:\tele
npm run dev
```

Open two browsers, or one normal window plus one private window — **A and B must not share a session**. Label them in your head: left = A, right = B.

Sanity check the whole proof before anyone is watching:

```
node scripts/isolation-contacts.mjs --no-seed
```

Expect `ALL CHECKS PASSED — 7 total`. If anything fails, **stop and fix it before the call.** Do not demo a partial pass.

If the contacts are missing, drop `--no-seed` — the script recreates Alice A and Bob B as their own owners, then runs all seven checks. Re-running with the seed on is safe: existing contacts are detected and skipped, not duplicated.

---

## 2. Logging in (either account)

1. `localhost:3000/login`
2. Email and password from `.env.local`
3. You land on `/mfa/challenge` — this is the MFA enforcement, and it is expected
4. Get a code:

```
node scripts/mfa-isolation.mjs code
```

It prints a code for both accounts and the seconds remaining. If under ~5 seconds, wait for the next one.

5. Enter the code → you land on `/dashboard`

---

## 3. Dry run — do this twice before the call

### Shot 1 — B has a real record

Browser B → `/contacts`. Shows **Bob B**.

### Shot 2 — A does not see it

Browser A → `/contacts`. Shows **Alice A** only. No Bob B.

Say: this is not a hidden button. The record was never sent to this browser.

### Shot 3 — the read test

```
node scripts/isolation-contacts.mjs --no-seed
```

Point at these lines:

```
PASS  A queries Org B's contacts          []  (200)
PASS  B sees Bob B                        Bob B (200)
```

Empty array is the pass condition. Not an error page — nothing to return.

### Shot 4 — the write test

Same output, further down:

```
PASS  A inserts a contact into Org B
      403 ... "Cannot write a contact into an organization you are not an active member of"
PASS  Org B after the attack contains no Fake Bob
      Bob B
```

Then reload Browser B's `/contacts` live. Still only Bob B.

Say: rejected **and** nothing was created. Blocking reads alone would still allow an outsider to create records inside another organization.

**Capture all four as screenshots during the dry run** so the call has a fallback if anything misbehaves live.

---

## §3a — Demo rehearsal notes

Before the client call:

### Browser setup

Use three fixed windows:

1. Browser B — Organization B user
2. Incognito Browser A — Organization A user
3. Terminal — isolation proof commands

Do not switch sessions during the walkthrough.

Recommended:

* Complete both MFA logins before the client joins.
* Keep both `/contacts` pages open.
* Avoid showing passwords, `.env.local`, or TOTP generation unless specifically asked.

### Common friction points

**Password paste**

* Clear the password field completely before pasting.
* Verify the paste completed before submitting.

**TOTP timing**

* Check the remaining validity time before entering a code.
* If fewer than ~8 seconds remain, wait for the next code.

**Window switching**

* Keep the browser order fixed.
* Avoid unnecessary Alt+Tab during login or MFA.

---

## 4. Client walkthrough (~25 min)

| Min | Do | Point |
| --- | --- | --- |
| 0–3 | Frame it: the rule is in the database, applies to every query. The admin key that bypasses it was not used. | Scope is clear |
| 3–8 | Browser B → `/contacts` → Bob B | B has a real record |
| 8–12 | Browser A → `/contacts` → no Bob B | UI does not leak |
| 12–18 | Run the script. A reading B → `[]`. B → Bob B. | Query is blocked |
| 18–23 | Same run: A's insert into B → rejected. Reload B: still only Bob. | Write is blocked |
| 23–25 | Out of scope: SMTP signup, dialer. | Honest boundary |

**Closing line:** Organization A cannot read Organization B's contacts and cannot insert into Organization B. The database rejected both. That is the same mechanism any future record type would use.

---

## 5. Questions you should expect

**"If MFA is required, how did your script query without it?"**
MFA and isolation are separate controls. MFA is an application gate — a required user cannot reach the CRM screens until the second factor is done. Isolation is a database rule keyed to organization membership, and it holds at any assurance level, including a raw API token that never touched the UI. So a stolen password alone still returns nothing. Tying the data boundary to MFA would be weaker, not stronger.

**"Why are you generating authenticator codes from a script instead of a phone?"**
The enrollment is real — it went through the same MFA API the application's enrollment page uses, the factor is verified in Supabase, and verifying it returned a full second-factor session. The script is a standard TOTP generator, which is exactly what an authenticator app is, kept local so the demo does not depend on a phone camera. Nothing about the enforcement is simulated. To avoid the question entirely, log both accounts in before the client joins and never show that terminal.

**"Could an admin see everything?"**
There is an administrative key that bypasses these rules by design. It is server-side only, never in the browser, and was deliberately not used in any of these tests — a run with it would prove nothing.

**"Does this cover leads and calls?"**
No. It proves contacts. Any other record type needs the same treatment and its own test. The pattern is reusable, not automatic.

**"Can we see signup?"**
Not yet — that needs your SMTP credentials.

**"Is this production?"**
No. Staging.

---

## 6. Do not

- Sign in as `admin@gmail.com` / D104 as a tenant
- Use the service role key anywhere in the demo
- Disable the MFA gate for convenience
- Show `.env.local` on screen — it holds passwords, TOTP secrets, and keys
- Claim isolation for tables that do not exist yet
- Let a good result turn into a delivery date for the dialer

---

## 7. If something breaks live

| Symptom | Do |
| --- | --- |
| MFA code rejected | Rerun `node scripts/mfa-isolation.mjs code`; codes rotate every 30s |
| Login loops back to `/mfa/challenge` | Code expired mid-submit. Get a fresh one. |
| `/contacts` empty for B | Rerun the script without `--no-seed` to reseed |
| A script check FAILS | Stop the demo claim. Fall back to the dry-run screenshots and say you will confirm after the call. Do not improvise an explanation. |
| Dev server error | Restart `npm run dev`; the REST proof does not need the app running |
