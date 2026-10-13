# Passkeys

**Status:** not started. `plan/improve.md` listed Passkeys → TOTP → Email OTP. **16 Sep** did not ask for passkeys in the Google slice.  
**Starts after:** Google login + optional-agent MFA are stable. Do not combine with G-01.

---

## Product (when approved)

- Privileged users: passkey **or** TOTP (Email OTP still must not satisfy owners/admins).
- Agents: optional, like TOTP.
- WebAuthn via Supabase Auth experimental passkeys only if the SDK version still supports the chosen API — re-inspect at implementation time.
- Recovery: existing authenticator-recovery mail; not homemade backup codes unless designed.

---

## Out of scope

SMS. Skipping MFA because a passkey is “the Google account.”

---

## Done when

Privileged user can enroll a passkey and reach `(app)` without TOTP for that session; stolen password still cannot pass the gate; isolation unchanged (RLS still membership, not AAL).
