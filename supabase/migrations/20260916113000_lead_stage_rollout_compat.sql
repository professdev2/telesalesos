-- Temporary expand/contract compatibility.
--
-- Staging backs the currently deployed Vercel app as well as local work. That
-- deployed app still emits working/won/lost until the canonical-stage code is
-- deployed. Keep those legacy writes valid during the rollout; new code does
-- not offer them and normalizes any legacy row when reading it.
--
-- After the new app is deployed everywhere, a follow-up migration must map any
-- late legacy writes and remove working/won/lost from this constraint.

ALTER TABLE public.leads
  DROP CONSTRAINT leads_status_valid;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_valid CHECK (
    status IN (
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
      'dnc',
      'working',
      'won',
      'lost'
    )
  );

COMMENT ON COLUMN public.leads.status IS
  'Canonical opportunity stage. Legacy working/won/lost are temporarily accepted during the Vercel rollout and normalized by the new application.';
