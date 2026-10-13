# SMTP request (Phase 2, Day 1)

**Status:** requested twice — still waiting on the client.  
**Owner:** client (credentials). Implementation is blocked until they arrive.  
**Do not:** invent a mailer, use a personal inbox as production SMTP, or demo signup via SQL.

New form signups on staging currently fail with `email rate limit exceeded` because the project still uses Supabase’s built-in mailer.

## Message to send the client

> Signup on staging is blocked on email delivery. Supabase’s built-in mailer is rate-limited and is not suitable for demos or real users.
>
> Please send SMTP credentials for **staging** (Resend, Postmark, or Amazon SES). We will configure them only in the Supabase dashboard and local `.env.local` — never in git.
>
> Until those credentials arrive, we will continue MFA enrollment/enforcement and contacts. Reliable new-user signup cannot be demoed until mail works. That is a dependency on your side, not a development delay.

## Second reminder — 11 September 2026

Credentials have still not arrived. Contacts work continued in the meantime, so this is not blocking development — but it is blocking one of the phase's success criteria, and that needs to be visible rather than absorbed quietly.

> Following up on SMTP credentials for staging. Signup still cannot be demonstrated end to end without them, so "a new agency owner can create an account" remains the one outstanding item in this phase. Everything else has continued — contact records, search, editing, the audit trail, and the tenant-isolation proof are all complete.
>
> To be explicit about the trade-off: we are not building a temporary mail workaround. It would be throwaway work, and it would put a non-production mail path in front of real confirmation links. The moment credentials arrive this is a short configuration task, not a development one.

If credentials have still not arrived by the end of the following week, raise it as a schedule item on a call rather than in writing — a third written reminder tends to be read as routine.

## What we need

One of:

- **Resend** (preferred for this stack): SMTP host, port, username, password, and a from-address you own (e.g. `noreply@yourdomain.com`).
- **Postmark** or **SES:** the same four SMTP fields plus a verified from-address.

Also confirm:

- The from-address domain is verified at the provider.
- We may use it on the **TelesalesOS Staging** project (`ceyaylgqcletophrjlja`) only.

## Exact Resend → Supabase SMTP values

Configure this in **Supabase → TelesalesOS Staging → Project Settings → Authentication → SMTP**.
Do **not** put these values in Vercel or in `NEXT_PUBLIC_*`.

### In Resend

1. Add and verify the sending domain (DNS: DKIM / SPF as Resend shows).
2. Create an API key. Treat it as a password.
3. Choose a from-address on that domain, e.g. `noreply@<your-domain>`.

### Paste into Supabase custom SMTP

| Supabase field | Value |
| --- | --- |
| Enable custom SMTP | On |
| Sender email | `noreply@<verified-domain>` (must match a Resend-verified domain) |
| Sender name | `TelesalesOS` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | the Resend API key (`re_…`) |
| Minimum interval between emails | `1` second (or dashboard default) |

Port **587** with STARTTLS also works with Resend if 465 is blocked. Prefer 465.

### Also required in the same Supabase project

- Authentication → URL Configuration: Site URL + Redirect URLs as in `docs/auth-setup.md`
- Email templates: confirm signup + reset password should use `token_hash` + `/auth/confirm` (same doc)
- Authentication → Email: confirm email **on**; min password length **12**
- Authentication → Multi-Factor: TOTP **on**

### After SMTP is saved (do not skip)

Send one new signup to a real inbox you control (not `jake@powerbridge.io`, not isolation users). Expected path:

signup → confirmation email → `/auth/confirm` → login → MFA enroll (owner) → dashboard.

Invitation **email** still waits on a later mailer in the app. Copy-invite links already work. Email OTP is not implemented yet; SMTP unblocks confirmation, recovery, and future OTP.

## What we will do when they arrive (not before)

Dashboard: **Project Settings → Authentication → SMTP**.  
Then confirm templates and redirect URLs in `docs/auth-setup.md` (P2-02, P2-03), and run one new signup that is not `admin@gmail.com` (P2-04).
