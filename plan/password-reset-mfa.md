# Password reset when MFA is enrolled

**Status:** implemented locally, **not committed**. Ship with Training steps 4–5.  
**Bug:** `/reset-password` after the email link. Account with a verified authenticator. `updateUser({ password })` returns *“AAL2 session is required to update email or password when MFA is enabled.”*  
**Seen by:** Jake (`jake@jakelynn.com`) on hosted; kenji on localhost.

---

## Cause

A recovery link creates an **AAL1** session. Supabase Auth refuses password (and email) changes on accounts that have a verified TOTP factor until the session is **AAL2**. The reset form never collected a TOTP code, so every owner/admin (and any member who enrolled) failed after filling the form.

**I can’t use my authenticator** is a different path: it unenrolls TOTP then updates the password. That works but destroys the factor. It is the workaround, not the product.

---

## Product decisions

1. Forgot-password **keeps** the authenticator.
2. If the account has a verified TOTP factor and the session is not AAL2, the reset form shows **Authenticator code** (and a factor picker if needed).
3. The server action verifies TOTP (`challengeAndVerify` + `refreshSession`) **before** `updateUser`.
4. Do **not** redirect through `/mfa/challenge` for this: that page sends users with `mfaRequired === false` away and would loop agents with a voluntary factor.
5. Members with **no** factor keep the two-field password form.

---

## Files

- `src/app/(auth)/reset-password/page.tsx` — pass verified factors into the form.
- `src/components/auth/reset-password-form.tsx` — code field.
- `src/lib/auth/actions.ts` — `resetPasswordAction` AAL2 elevation.

---

## Done when

- MFA user: email link → code + new password → success; other sessions end.
- Wrong code: “not accepted”, not the AAL2 string.
- No-factor user: no code field; password still updates.
- Committed as nicolas, pushed, visible on `telesalesos.vercel.app`.
