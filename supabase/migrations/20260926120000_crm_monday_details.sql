-- CRM Monday details: expanded stages, disposition, leads.extra, contact fields.
-- Maps legacy PowerBridge statuses before tightening the CHECK.

-- ---------------------------------------------------------------------------
-- Contacts: telesales-critical extras
-- ---------------------------------------------------------------------------

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text
    CONSTRAINT contacts_gender_length CHECK (gender IS NULL OR length(gender) <= 40),
  ADD COLUMN IF NOT EXISTS phone_secondary text
    CONSTRAINT contacts_phone_secondary_length CHECK (phone_secondary IS NULL OR length(phone_secondary) <= 40),
  ADD COLUMN IF NOT EXISTS timezone text
    CONSTRAINT contacts_timezone_length CHECK (timezone IS NULL OR length(timezone) <= 64),
  ADD COLUMN IF NOT EXISTS best_time_to_call text
    CONSTRAINT contacts_best_time_length CHECK (best_time_to_call IS NULL OR length(best_time_to_call) <= 120),
  ADD COLUMN IF NOT EXISTS lead_source text
    CONSTRAINT contacts_lead_source_length CHECK (lead_source IS NULL OR length(lead_source) <= 120),
  ADD COLUMN IF NOT EXISTS dnc boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_consent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.contacts.dnc IS 'Do-not-call flag for this contact.';
COMMENT ON COLUMN public.contacts.sms_consent IS 'Whether SMS outreach is consented.';
COMMENT ON COLUMN public.contacts.email_consent IS 'Whether email outreach is consented.';

-- ---------------------------------------------------------------------------
-- Leads: disposition + extra jsonb pack
-- ---------------------------------------------------------------------------

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS disposition text
    CONSTRAINT leads_disposition_length CHECK (disposition IS NULL OR length(disposition) <= 64),
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT leads_extra_is_object CHECK (jsonb_typeof(extra) = 'object');

COMMENT ON COLUMN public.leads.disposition IS
  'Call/outcome disposition. Separate from status (pipeline stage).';
COMMENT ON COLUMN public.leads.extra IS
  'Per-purpose core field pack (Monday seeded keys). Not a substitute for Policy/Company/Order tables.';

-- ---------------------------------------------------------------------------
-- Remap legacy PowerBridge stages → Jake 25 Sep simplified list
-- ---------------------------------------------------------------------------

UPDATE public.leads
SET status = CASE status
  WHEN 'target' THEN 'new_prospect'
  WHEN 'prospecting' THEN 'attempting_contact'
  WHEN 'proposal' THEN 'pricing_sample_sent'
  WHEN 'negotiation' THEN 'test_order_verbal'
  WHEN 'won' THEN 'closed_won'
  WHEN 'active' THEN 'active_buyer'
  WHEN 'lost' THEN 'closed_lost'
  ELSE status
END
WHERE purpose = 'powerbridge'
  AND status IN (
    'target',
    'prospecting',
    'proposal',
    'negotiation',
    'won',
    'active',
    'lost'
  );

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_purpose_status_valid;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_purpose_status_valid CHECK (
    (
      purpose = 'sales'
      AND status IN (
        'new',
        'attempted',
        'contacted',
        'appointment_scheduled',
        'needs_analysis',
        'quoted',
        'application_started',
        'submitted',
        'pending_carrier',
        'approved',
        'placed',
        'nurture',
        'not_interested',
        'unreachable',
        'dnc',
        'declined',
        'chargeback'
      )
    )
    OR (
      purpose = 'recruiting'
      AND status IN (
        'new',
        'attempted',
        'contacted',
        'interview_scheduled',
        'interviewed',
        'qualified',
        'pre_licensing',
        'exam_scheduled',
        'licensed',
        'contracting_started',
        'contracting_pending',
        'contracted',
        'training',
        'ready_to_sell',
        'active',
        'not_interested',
        'lost',
        'inactive'
      )
    )
    OR (
      purpose = 'retention'
      AND status IN (
        'pending',
        'requirements_needed',
        'issued',
        'payment_monitoring',
        'payment_failed',
        'grace_period',
        'conservation',
        'payment_arranged',
        'reinstatement_pending',
        'saved',
        'lapsed',
        'cancelled',
        'unable_to_save'
      )
    )
    OR (
      purpose = 'powerbridge'
      AND status IN (
        'new_prospect',
        'attempting_contact',
        'contacted',
        'qualified',
        'pricing_sample_sent',
        'test_order_verbal',
        'payment_pending',
        'closed_won',
        'active_buyer',
        'paused_nurture',
        'closed_lost'
      )
    )
  );
