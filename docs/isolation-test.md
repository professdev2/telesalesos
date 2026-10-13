# Isolation test — Org A ↛ Org B

**Date:** 2026-09-08
**Project:** TelesalesOS Staging (`ceyaylgqcletophrjlja`)
**Result: PASS**

The original D1-04 account (`D104 Verify Org`, `account_type = individual`) was not converted, renamed, or used as either tenant.

## Subjects created for this test only

Created via SQL insert into `auth.users` (email confirmation already set) so the built-in email rate limit did not fire. The signup trigger still created profile, organization, owner membership, and security settings.

| Tenant | Email | Organization | Org id |
| --- | --- | --- | --- |
| A | `isolation.a.d10@gmail.com` | Isolation Org A | `b00174b6-bb5d-4856-bfcf-a0bf9868f01b` |
| B | `isolation.b.d10@gmail.com` | Isolation Org B | `552bf447-1115-4808-9a2c-d3de4511a25e` |

User ids: A `c45b2e34-1015-46a5-98f0-6759b04121c0`, B `ea45f349-050e-472a-a0be-fc56140d5e59`.

These accounts are disposable. Delete them after the sprint. Passwords are not recorded here.

## Method

1. Password-grant a JWT for each user against `/auth/v1/token`.
2. Call PostgREST as that user (`Authorization: Bearer <access_token>` plus the publishable key). This is the same privilege the browser client has. Service role was not used.
3. RLS returning an empty array is the pass condition. A 403 is not required.

## Results — User A session

| Query | Response | Verdict |
| --- | --- | --- |
| `GET organizations?select=id,name` | `[{ Isolation Org A }]` only | PASS |
| `GET organizations?id=eq.<Org B>` | `[]` | PASS |
| `GET organization_memberships?select=organization_id,user_id,role` | A's owner row only | PASS |
| `GET organization_memberships?organization_id=eq.<Org B>` | `[]` | PASS |
| `GET profiles?id=eq.<User B>` | `[]` | PASS |
| `GET audit_logs?organization_id=eq.<Org B>` | `[]` | PASS |

## Results — User B session (reverse)

| Query | Response | Verdict |
| --- | --- | --- |
| `GET organizations?select=id,name` | `[{ Isolation Org B }]` only | PASS |
| `GET organizations?id=eq.<Org A>` | `[]` | PASS |
| `GET profiles?id=eq.<User A>` | `[]` | PASS |

## What this does not prove

- Invite-token secrecy (no invitation was created on these orgs).
- Service-role leakage (that key is not in the app).
- Membership list visibility among teammates in the same org (that policy is owner/admin-only by design).

## Cleanup

```sql
-- After the sprint, remove only these isolation users.
-- Cascades remove profile, membership, and the org if FK on delete is set.
-- Organizations.created_by is ON DELETE SET NULL, memberships CASCADE from user.
delete from auth.users
where email in ('isolation.a.d10@gmail.com', 'isolation.b.d10@gmail.com');
```
