# Merge to main and production go-live

**Status:** not this week. Staging Auth is already what `telesalesos.vercel.app` uses when Production is wired to `feat/foundation-sprint`.  
**Do not** treat the current Vercel Production URL as a legal production environment (real customer data, production Stripe, production Telnyx).

---

## Before a real production project

1. Separate Supabase **production** project (not `ceyaylgqcletophrjlja`).
2. SMTP on production.
3. Google OAuth **production** client + verified consent screen.
4. Vercel Production env pointing at production Supabase.
5. RLS/isolation re-run against production with **non-customer** isolation tenants.
6. PR `feat/foundation-sprint` → `main` after CI green; owner review (existing GitHub rule).
7. Backup/retention, error logging, and who is on-call — client names an owner.

---

## Out of scope as “just merge”

Copying Staging data that includes isolation test emails into production. Using Powerbridge as Google Cloud or Stripe owner.

---

## Done when

The client signs in writing that production may take real agencies. Until then: Staging only.
