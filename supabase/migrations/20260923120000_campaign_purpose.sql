-- ---------------------------------------------------------------------------
-- campaigns.purpose — sales vs recruiting lists on the same CRM
--
-- Purpose is a campaign kind, not a tenancy boundary. RLS, the organization
-- guard, and audit triggers are unchanged; they still key on organization_id.
-- Existing rows become 'sales'.
-- ---------------------------------------------------------------------------

ALTER TABLE public.campaigns
  ADD COLUMN purpose text NOT NULL DEFAULT 'sales'
    CONSTRAINT campaigns_purpose_valid CHECK (purpose IN ('sales', 'recruiting'));

COMMENT ON COLUMN public.campaigns.purpose IS
  'Campaign kind: sales or recruiting. A label and list filter only; tenancy is organization_id + RLS.';

CREATE INDEX campaigns_org_purpose_idx
  ON public.campaigns (organization_id, purpose);
