-- Replace the four foundation statuses with the canonical opportunity stages
-- in the TelesalesOS playbook. This remains one fixed pipeline: configurable
-- agency pipelines, custom labels, assignments, and board UX are later work.

ALTER TABLE public.leads
  DROP CONSTRAINT leads_status_valid;

-- Preserve existing records without claiming more progress than the old
-- status proved. "working" means an attempt, not necessarily contact.
UPDATE public.leads
SET status = CASE status
  WHEN 'working' THEN 'attempted'
  WHEN 'won' THEN 'placed'
  WHEN 'lost' THEN 'not_interested'
  ELSE status
END
WHERE status IN ('working', 'won', 'lost');

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
      'dnc'
    )
  );

COMMENT ON COLUMN public.leads.status IS
  'Canonical opportunity stage: new, attempted, contacted, appointment_scheduled, quoted, application_started, submitted, approved, placed, not_interested, unreachable, or dnc.';
