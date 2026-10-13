# Pre-call email — tenant isolation summary

Send with `client-summary-tenant-isolation.md` attached (export to PDF if they prefer).

---

**Subject:** Tenant isolation — verified, summary attached

Hi [Name],

Tenant isolation is done and verified on staging. Two separate organizations, each with its own owner and its own contact record: a user in Organization A cannot read Organization B's records, and cannot create records inside Organization B either. A request with no login is rejected outright. All checks were run as a normal user through the same API the app uses — not with the administrative key, which would bypass the rules and prove nothing.

The one-page summary is attached. It also states what this does *not* cover, so the result isn't read as broader than it is.

I can re-run the whole test live in a couple of minutes during our call if you'd like to see it rather than read it.

One thing still blocked on your side: SMTP credentials. Until those arrive I can't demonstrate signup end to end.

[Your name]

---

## Shorter variant (chat or Slack)

Tenant isolation is verified on staging. Two organizations: A can't read B's records, and can't write into B either — both tested as a normal user, not with an admin key. Unauthenticated requests are rejected. One-page summary attached, including what it doesn't cover. Happy to re-run it live on the call. Still waiting on SMTP credentials before signup can be shown end to end.
