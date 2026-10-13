# Eight-role model

**Status:** not started. Current schema: `owner` / `admin` / `member` plus `platform_admins`.  
**Do not start** until Training UI, Google login, and the 16 Sep MFA rules are live. Every CRM and Training write path currently uses `hasAtLeastRole(..., 'admin')` or membership checks. Changing roles without a map will break isolation.

---

## Out of scope until this slice is approved

- Inventing Manager / Super Admin **rows** in Training or CRM “just for the UI.”
- Putting role names in React as the security boundary.

---

## Product (from earlier client language)

Typical target (confirm before coding): Agent, Manager, Admin, Owner-equivalent, Super Admin / platform, plus teams, skills, state licensing as **later** columns — not in the first roles migration.

Until then:

| Client term | Today |
| --- | --- |
| Agent | `member` |
| Admin | org `admin` |
| Owner | org `owner` |
| Super Admin | `platform_admins` |
| Manager | **no row** — do not fake it |

---

## This slice must include

1. Written map: each new role → who can read/write contacts, leads, calls, campaigns, training (platform vs agency).
2. One migration replacing or extending the text check on `organization_memberships.role`.
3. `private.has_org_role` / DAL helpers updated once. UI does not switch on raw strings.
4. Isolation scripts extended for a Manager (or whichever new role can read but not archive).
5. MFA: privileged roles still TOTP; agents optional (16 Sep).

---

## Done when

A member of role X cannot perform role Y’s writes. Isolation scripts PASS. No production cutover required for the first staging apply.
