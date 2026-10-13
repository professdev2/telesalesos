-- CRM pipelines Monday MVP (plan/crm-pipelines-kanban.md).
-- Four campaign/lead purposes; per-purpose lead stages; PowerBridge org flag.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS powerbridge_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.powerbridge_enabled IS
  'When true, this organization may create PowerBridge-purpose campaigns and leads. Default false for all customers.';

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_purpose_valid;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_purpose_valid
  CHECK (purpose IN ('sales', 'recruiting', 'powerbridge', 'retention'));

COMMENT ON COLUMN public.campaigns.purpose IS
  'Campaign kind: sales (Insurance Telesales), recruiting, powerbridge, or retention. Label/filter only; tenancy is organization_id + RLS.';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'sales';

COMMENT ON COLUMN public.leads.purpose IS
  'Pipeline kind for this lead. Stages are validated together with status.';

CREATE INDEX IF NOT EXISTS leads_org_purpose_idx
  ON public.leads (organization_id, purpose);

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_status_valid;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_purpose_valid
  CHECK (purpose IN ('sales', 'recruiting', 'powerbridge', 'retention'));

ALTER TABLE public.leads
  ADD CONSTRAINT leads_purpose_status_valid CHECK (
    (
      purpose = 'sales'
      AND status IN (
        'new',
        'attempted',
        'contacted',
        'appointment_scheduled',
        'quoted',
        'application_started',
        'submitted',
        'approved',
        'placed',
        'not_interested',
        'unreachable',
        'dnc'
      )
    )
    OR (
      purpose = 'recruiting'
      AND status IN (
        'new',
        'contacted',
        'interview_scheduled',
        'qualified',
        'licensed',
        'contracted',
        'training',
        'active',
        'not_interested',
        'lost'
      )
    )
    OR (
      purpose = 'retention'
      AND status IN (
        'pending',
        'issued',
        'payment_monitoring',
        'at_risk',
        'saved',
        'lapsed'
      )
    )
    OR (
      purpose = 'powerbridge'
      AND status IN (
        'target',
        'prospecting',
        'contacted',
        'qualified',
        'proposal',
        'negotiation',
        'won',
        'active',
        'lost'
      )
    )
  );

COMMENT ON COLUMN public.leads.status IS
  'Stage within leads.purpose. Allowed values depend on purpose (see leads_purpose_status_valid).';
