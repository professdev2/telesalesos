# Vercel environment variables

TelesalesOS is one Vercel project (`powerbridge-io` / `telesalesos`) with three
Vercel environments. Each one must be configured **explicitly**. Preview values
are **not** inherited by Production.

A Production build that is missing `NEXT_PUBLIC_SUPABASE_*` still compiles. The
login form then cannot reach Auth and always shows “Incorrect email or password.”

## Required variables

Set the **same three public names** on every deployed environment. Values differ by
which Supabase project that environment is allowed to use.

| Name | What it is | What it is not |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Not a Vercel URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Dashboard → **Project Settings → API Keys** → publishable / `anon` (`sb_publishable_…` or legacy `eyJ…` anon JWT) | **Never** the secret / `service_role` key |
| `NEXT_PUBLIC_SITE_URL` | Absolute origin of **this** deployment, no trailing slash | Not `http://localhost:3000` on Vercel |

Also set this **server-only** name on Preview and Production (not `NEXT_PUBLIC_`):

| Name | What it is | What it is not |
| --- | --- | --- |
| `RESEND_API_KEY` | Resend API key used by the app to email hashed invitation links from `noreply@telesalesos.com` | Not the SMTP username. Never `NEXT_PUBLIC_RESEND_API_KEY`. Same secret as the Staging SMTP password, stored here so Next.js can call `https://api.resend.com/emails` |

Without `RESEND_API_KEY`, Members still creates a copyable invite link; the email is skipped.

Do **not** add to Vercel:

- Isolation passwords or TOTP secrets (`ISOLATION_*`)

`SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY` name) is
**server-only** and is required for authenticator recovery to unenroll TOTP.
Never prefix it with `NEXT_PUBLIC_`. Isolation scripts may use the same secret
locally; they still must not live in `NEXT_PUBLIC_*`.

Those never belong in `NEXT_PUBLIC_*`. Auth confirmation and password-reset mail
still use **Supabase SMTP** (Resend). Isolation credentials stay in gitignored
`.env.local`.

## Current intended mapping (hosted staging)

Until a real customer-launch cutover is approved, **Preview and Production both
use TelesalesOS Staging**.

| Vercel environment | `NEXT_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_SITE_URL` |
| --- | --- | --- |
| Development (local) | Staging — see `.env.example` | `http://localhost:3000` |
| Preview | Staging `https://ceyaylgqcletophrjlja.supabase.co` | Prefer `https://telesalesos.vercel.app` so auth emails do not point at a throwaway `*.vercel.app` host. Preview URLs are also behind Vercel Deployment Protection. |
| Production | **Same staging project** (temporary; see below) | `https://telesalesos.vercel.app` |

Staging project name: **TelesalesOS Staging**. Ref: `ceyaylgqcletophrjlja`.

A separate Supabase project exists (`gbkdkfdcmztipbkucqhe`). **Do not point
Vercel Production at it** until migrations, Auth URL config, SMTP, and a
cutover plan are approved. Pointing Production at the wrong project is how
login broke.

## How to edit (Owner / Member)

1. Vercel → team **powerbridge-io** → project **telesalesos** (not Team Settings).
2. **Settings → Environment Variables**.
3. Confirm each row’s environment chips. **Preview ≠ Production.**
4. To reuse a Preview value on Production, edit the existing row and enable
   **Production**. Do not create a second row with a different project URL.
5. **Deployments → Production → Redeploy.** `NEXT_PUBLIC_*` values are baked in
   at build time. Saving variables without a redeploy does not fix the live site.

Developer role can see and edit Preview/Development, not Production. After a
Production change, confirm login on https://telesalesos.vercel.app — not on a
deployment URL that is gated by Vercel SSO.

## Verify after every env change

```bash
node scripts/verify-hosted-staging.mjs
node scripts/isolation-contacts.mjs --no-seed
```

The first script checks that the Production alias session cookie is
`sb-ceyaylgqcletophrjlja-auth-token` (staging), not the other project.

## After customer launch (not done yet)

Production Vercel → production Supabase. Preview + local → staging. Two
Supabase projects, two Auth URL/SMTP configs. Do not mix keys. See the
cutover notes in `DEVELOPMENT.md`.
