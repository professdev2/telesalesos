# SMTP — password signup and mail

**Status:** blocked on the client. Requested in writing (see `docs/smtp-request.md`).  
**Does not start Google login.** Google is a separate identity slice. SMTP is still required for **email confirmation** and **forgot-password / recovery** mail on password accounts.

---

## Product decisions

1. No homemade mailer. No personal inbox as production SMTP. No SQL “confirm this user” as the client demo.
2. Credentials only in Supabase Staging dashboard and local `.env.local`. Never git.
3. From-address on a domain the client owns (`noreply@telesalesos.com` or equivalent).
4. `NEXT_PUBLIC_SITE_URL` for hosted must be `https://telesalesos.vercel.app` so links do not point at localhost.

---

## Need from the client

Resend (preferred), Postmark, or SES: host, port, username, password, verified from-address.

---

## Done when

1. New agency owner signs up with email+password, receives mail, confirms, reaches the dashboard (or MFA enroll).
2. Forgot-password and “I can’t use my authenticator” mail arrive.
3. Rate-limit errors from the built-in Supabase mailer are gone on Staging.

Until then, criterion “a new agency owner can create an account” via **password** remains **blocked**. Google signup (when G-01 exists) can still create an account without that SMTP path.
