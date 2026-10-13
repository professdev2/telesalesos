# Isolation test — Training library

**Date:** 2026-09-17  
**Project:** TelesalesOS Staging (`ceyaylgqcletophrjlja`)  
**Result: PASS (11/11)**

This test covers agency-library isolation and platform-publisher separation for
`training_courses`, `training_lessons`, and `training_resources`.

Reproduce with:

```text
node scripts/isolation-training.mjs
```

## Subjects and method

The dedicated Isolation Org A/B owners authenticate by password grant. Requests
use the publishable key and each user's JWT, matching browser privilege. The
service role is not read.

Each owner creates an organization course, Vimeo lesson, and HTTPS resource.
The script then attempts cross-tenant and forged-platform writes.

## Enforcement under test

Migration `20260917150000_training_library.sql`:

- ENABLE + FORCE RLS on all Training tables.
- Platform SELECT is available to active tenant members; platform writes require
  `private.is_platform_admin()`.
- Agency SELECT requires active membership.
- Agency writes require Owner/Admin through
  `private.has_org_role(..., ARRAY['owner', 'admin'])`.
- Child-table policies inherit ownership through
  `private.training_course_can_read/write()`.
- Row guards independently reject forged ownership and cross-library writes.
- `anon` has no table grants.

## Results

1. Org A saw its agency course and no Org B course — PASS.
2. Org A filtering Org B returned `[]` — PASS.
3. Org B saw its agency course and no Org A course — PASS.
4. Org A inserting an agency course into Org B returned 403/42501 — PASS.
5. Org A inserting `visibility=platform` returned 403/42501 — PASS.
6. Org A inserting a lesson into Org B's course returned 403/42501 — PASS.
7. Org A inserting a resource into Org B's lesson returned 403/42501 — PASS.
8. Org B had no forged course after attacks — PASS.
9. Org B had no forged lesson after attacks — PASS.
10. Anonymous course read returned 401 — PASS.
11. Anonymous lesson read returned 401 — PASS.

Seed resources, lessons, and agency courses were removed children-first. No
platform catalog row was created or modified by this script.

## What this does not prove

- Google SSO, Storage uploads, quizzes, certificates, or progress tracking.
- Vimeo availability or permissions on an individual video.
- Access to an external resource: that remains controlled by its provider.
- Member read-only UI behavior; that is part of the staging walkthrough.
