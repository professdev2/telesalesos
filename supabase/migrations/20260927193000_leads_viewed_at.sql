-- Unread leads: viewed_at IS NULL means not yet opened.
-- Existing rows are backfilled as viewed so only new inbound/created leads start unread.

ALTER TABLE public.leads
  ADD COLUMN viewed_at timestamptz;

COMMENT ON COLUMN public.leads.viewed_at IS
  'When a member first opened the lead detail. NULL = unread.';

UPDATE public.leads
SET viewed_at = created_at
WHERE viewed_at IS NULL;

CREATE INDEX leads_org_unread_idx
  ON public.leads (organization_id, created_at DESC)
  WHERE viewed_at IS NULL AND archived_at IS NULL;
