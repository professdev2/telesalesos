# Google login — identity slice

**Status (23 Sep):** code for G-02–G-06 is built. Migration `20260923140000_google_login_mfa_policy.sql` is on Staging. The Google button stays hidden until the provider is enabled in Supabase. Blocked on G-01 (client OAuth credentials); G-07 walkthrough follows.  
**Depends on:** existing Auth (`getClaims`, DAL, MFA gate), org signup trigger, invitations.  
**Client block:** Google Cloud OAuth app owned by **telesalesos.com** (or another client domain). **Not** Powerbridge.  
**Rule:** one Auth user per person. Do not create a second empty organization on Google sign-in when an invite exists.

This is the identity slice agreed on **16 Sep 2026** with Jake. It is not Training. It is not passkeys.

---

## Out of scope (this slice)

- Passkeys, SMS, Auth0, Clerk, Firebase Auth.
- Skipping TOTP for owners/admins because they used Google.
- Eight-role model.
- Production custom domain / Google “production” OAuth client (Staging URLs only unless production plan is approved).
- Telnyx, QuoteCoach, Billing, Training v2.

---

## 1. Product decisions (locked unless the client changes them)

1. **Email-and-password stays.** Google is the alternative (HighLevel-style).
2. **Any Google account** may be used (personal Gmail or Workspace).
3. **Standalone / independent agent:** first Google sign-in creates **one** personal organization (same as password signup).
4. **Agency join:** invited people use the **invite**. Google with that email **joins** the agency. Do not create a second empty org.
5. **Existing password user:** same email can **link** Google. One `auth.users` row.
6. **Agents** (`member`, and standalone owners who are not agency admins — see mapping): MFA **optional**. Recommend it; do not block login.
7. **Agency owners and admins** (and `platform_admins`): MFA **required**. Authenticator stays. **Google does not skip TOTP.**
8. OAuth consent and Cloud admin: **client-owned** mailbox. Not `nicolas@powerbridge.io` as the Google Cloud owner.

### Role mapping (until eight roles exist)

| Jake’s language | Schema | After Google |
| --- | --- | --- |
| Agent (agency member) | `member` | MFA optional |
| Independent / standalone | Personal org **owner** of a 1-person org | MFA optional (16 Sep: “Google or password is enough”) |
| Agency owner / admin | org `owner` / `admin` on a team org | TOTP required |
| TelesalesOS platform admin | `platform_admins` | TOTP required |

If a standalone owner later converts to a team and remains owner, they become privileged and **must** enroll TOTP on next login. Document that in the UI copy.

---

## 2. Client deliverable (G-01)

Without this, the slice cannot finish:

- Google Cloud project under a **telesalesos.com** (or client) Google account.
- OAuth 2.0 Client ID (Web).
- Authorized JavaScript origins and redirect URIs for:
  - `http://localhost:3000`
  - `https://telesalesos.vercel.app`
  - Supabase Auth callback: `https://ceyaylgqcletophrjlja.supabase.co/auth/v1/callback`
- Branding: app name TelesalesOS; privacy/terms URLs if Google requires them for verification.

Credentials go in the **Supabase Staging dashboard** (Auth → Providers → Google). Never git.

---

## 3. Implementation (after G-01)

| ID | Work | Done when |
| --- | --- | --- |
| G-02 | Enable Google on Staging; `signInWithOAuth({ provider: 'google' })` from login and signup | Button reaches Google and returns to `/auth/callback` |
| G-03 | Signup trigger / org create: Google first login behaves like password signup for **new** users with no invite | One org, one membership |
| G-04 | If a **pending invite** exists for that email, accept it instead of creating an org | No second org; isolation holds |
| G-05 | Account linking: Google email matches existing user → same uid | No duplicate profile |
| G-06 | `requireMfaSatisfied` / `compute_mfa_required`: agents not blocked; owners/admins still need TOTP (or AAL2 / trusted device) **after** Google | Matches 16 Sep |
| G-07 | Isolation script + human walkthrough (two Google accounts, two orgs; invite path; admin still challenged) | Written evidence |

Forms never send `organization_id` as authority.

---

## 4. Isolation and abuse cases

- Org A Google user cannot read Org B rows (reuse existing RLS; identity must not bypass membership).
- Invite to Agency X + Google must not leave a stray personal org that still has membership.
- Email already in Org A, then Google: **link**, do not create Org C.
- Privileged user with Google and no TOTP: cannot open `(app)` CRM until enroll/challenge.

---

## 5. Definition of done

- Staging demo: password login still works; Google login works for a new standalone user; invite+Google joins one agency; owner still sees authenticator after Google.
- No secrets in git.
- Agents can reach the dashboard with Google and no authenticator.
- Owners cannot.

---

## 6. Estimate (after G-01)

With OAuth credentials in hand: **3–4 combined days** at 20h/day (pairing). Without G-01: UI can be prepared; **acceptance cannot**.
