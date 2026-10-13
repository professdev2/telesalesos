# Authentication setup

What the application expects from the Supabase project. Everything here is
dashboard configuration — none of it lives in the repository.

## Routes

| Path | Purpose |
| --- | --- |
| `/login` | Password sign-in |
| `/signup` | Account creation; the database trigger builds the organization |
| `/verify-email` | Shown after signup while the confirmation email is pending |
| `/forgot-password` | Requests a recovery link |
| `/reset-password` | Sets a new password; requires the session from a recovery link |
| `/auth-error` | Explains a link that failed to verify |
| `/auth/callback` | Route handler for `{{ .ConfirmationURL }}` links (PKCE `code`) |
| `/auth/confirm` | Route handler for `{{ .TokenHash }}` links (`verifyOtp`) |

`/dashboard` and every other application route require a session.

## Required dashboard configuration

### Authentication → URL Configuration

Set **Site URL** to the canonical public origin for this Supabase project.

While Preview and Production share **TelesalesOS Staging**, Site URL must be:

```
https://telesalesos.vercel.app
```

Add every used origin to **Redirect URLs** (a missing entry is silently replaced
with Site URL):

```
http://localhost:3000/auth/callback
http://localhost:3000/auth/confirm
https://telesalesos.vercel.app/auth/callback
https://telesalesos.vercel.app/auth/confirm
https://telesalesos-powerbridge-io.vercel.app/auth/callback
https://telesalesos-powerbridge-io.vercel.app/auth/confirm
```

If the dashboard allows a wildcard, also add:

```
https://*-powerbridge-io.vercel.app/auth/callback
https://*-powerbridge-io.vercel.app/auth/confirm
```

Preview deployment hostnames change on every deploy. Wildcard (or an explicit
list) is required if confirmation mail must open on a Preview URL. Prefer
`NEXT_PUBLIC_SITE_URL=https://telesalesos.vercel.app` so links stay canonical.

When Production later uses a **separate** Supabase project, that project gets
its own Site URL (`https://telesalesos.vercel.app`) and the staging project
keeps localhost + Preview. Do not point two live products at one Auth Site URL
without listing both Redirect URLs.

See `docs/vercel-environments.md`.

A redirect URL that is not on this list is silently replaced with the Site URL,
which sends users to the wrong page instead of raising an error.

### Authentication → Providers → Email

- **Confirm email** is currently **on**. Signup returns no session, so new users
  land on `/verify-email` rather than the dashboard. The application handles both
  cases; leave it on.
- **Minimum password length** should be set to 12 to match
  `src/lib/auth/validation.ts`. Supabase enforces its own rule regardless of the
  client schema, and a mismatch surfaces as a confusing provider error.

### Authentication → Email Templates (recommended change)

The default templates use `{{ .ConfirmationURL }}`, which produces a PKCE `code`
link. Those links only work in the browser that requested them, because the code
verifier is a cookie. A user who signs up on a laptop and opens the email on a
phone gets an error.

Switching the templates to token hashes removes that constraint. In **Confirm
signup**, replace the link with:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard">
  Confirm your email
</a>
```

And in **Reset password**:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">
  Reset your password
</a>
```

`/auth/callback` stays in place either way, so the change can be made and rolled
back without a deployment.

### MFA (Milestone A)

Every user with an active organization membership, plus platform admins, has
`mfa_required = true` (role-derived). Privileged users (owner, admin, or
platform admin on any org) enroll TOTP through Supabase Auth MFA APIs and
require AAL2 (or a trusted-device cookie) before `(app)` routes. Members may
satisfy the same gate with a hashed Email OTP session (JWT stays AAL1). Factor
secrets stay in Auth; Email OTP hashes stay in `private` tables.

Enable TOTP under **Authentication → Multi-Factor → TOTP**. If that provider is
off, enrollment pages will fail and privileged users cannot reach the dashboard.

Users manage verified factors at `/settings/security`. Owners and admins cannot
remove their final authenticator. A member who removes their final factor after
an AAL2 check is sent to `/mfa/email`.

### Authenticator recovery (Milestone D)

Sign-in and the TOTP challenge include **I can't use my authenticator**. That
sends the same Auth recovery mail as password reset, with `next=/recover-mfa/confirm`.
After the link, the user sets a new password. The server then unenrolls TOTP
(Auth admin API), revokes trusted devices, and clears Email OTP sessions. The
audit action is `mfa.recovery` with `{ method: "email" }` only.

The Reset password template must not hardcode `next=/reset-password` if you want
recovery to land on the recover page. Prefer:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">
  Reset your password
</a>
```

Forgot-password still uses `next=/reset-password`. Authenticator recovery uses
`next=/recover-mfa/confirm` via `redirectTo`. Completing recovery requires both
the emailed link (Auth recovery session) and the same browser that requested
the link. Submitting the recover form alone cannot remove TOTP. Starting a
normal Forgot-password request clears the authenticator-recovery marker, so a
later password-reset link cannot accidentally enter the factor-removal flow.

The app needs `SUPABASE_SECRET_KEY` on the server to unenroll factors. Without
it, recovery stops before the password change.

Owners and admins must enroll TOTP again before CRM routes. Members may use
Email OTP.


The built-in email service is capped at a small number of messages per hour and
is explicitly not for production. The cap is low enough to interrupt testing: a
second signup within the hour returns
`429 over_email_send_rate_limit`, and signup fails.

Configure a real provider under **Project Settings → Authentication → SMTP
Settings** before demoing signup to anyone or running more than a couple of test
accounts. Until then, expect signup to fail intermittently.

## How authorization is enforced

Three layers, in increasing order of trust:

1. **`src/proxy.ts`** redirects signed-out requests away from protected paths.
   This is optimistic only. It does not run on Server Action POSTs to
   already-rendered pages, so it is not a security boundary.
2. **`src/lib/auth/dal.ts`** verifies the session on every page, action, and route
   handler through `getClaims()`, which validates the JWT signature rather than
   trusting the cookie. `getSession()` is not used anywhere, deliberately.
3. **Row-level security** in the database decides what each query returns. The
   organization is always derived from the session, never accepted from the
   client.

Removing any one layer should not expose another tenant's data. That property is
what the Day 10 isolation test checks.

## Local development

```bash
cp .env.example .env.local   # fill in the staging URL and publishable key
npm run dev
```

Point local development at staging, never production. See `DEVELOPMENT.md`.
