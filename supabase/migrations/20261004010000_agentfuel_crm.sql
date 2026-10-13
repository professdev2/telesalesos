-- AgentFuel membership pipeline (applicants → enrolled/paid → cutoff).
-- Separate from recruiting. $1600/mo tracking is CRM status + extra fields;
-- Stripe auto-cutoff is a later slice.

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_purpose_valid;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_purpose_valid
  CHECK (purpose IN ('sales', 'recruiting', 'powerbridge', 'retention', 'agentfuel'));

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_purpose_valid;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_purpose_valid
  CHECK (purpose IN ('sales', 'recruiting', 'powerbridge', 'retention', 'agentfuel'));

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
    OR (
      purpose = 'agentfuel'
      AND status IN (
        'new',
        'attempted',
        'contacted',
        'enrolled',
        'paid',
        'past_due',
        'cut_off',
        'not_interested',
        'declined',
        'withdrawn'
      )
    )
  );

COMMENT ON CONSTRAINT leads_purpose_status_valid ON public.leads IS
  'Stage within leads.purpose. Allowed values depend on purpose (see leads_purpose_status_valid).';
