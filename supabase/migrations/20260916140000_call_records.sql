-- ---------------------------------------------------------------------------
-- call_records — manual attempt history (not telephony)
--
-- Tenancy rules this migration must guarantee:
--   1. A member of Org A cannot SELECT Org B's call records.
--   2. A member of Org A cannot INSERT/UPDATE a call record into Org B.
--   3. The contact must belong to the same organization.
--   4. If lead_id is set, that lead must belong to the same organization
--      and point at the same contact.
--   5. Deleting a contact or lead that still has call records is rejected
--      (RESTRICT).
--
-- organization_id is never trusted from the client. WITH CHECK and
-- private.call_records_guard_organization() both reject a forged value.
-- ---------------------------------------------------------------------------

CREATE TABLE public.call_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  contact_id uuid NOT NULL
    REFERENCES public.contacts (id) ON DELETE RESTRICT,
  lead_id uuid
    REFERENCES public.leads (id) ON DELETE RESTRICT,
  outcome text NOT NULL DEFAULT 'no_answer'
    CONSTRAINT call_records_outcome_valid
      CHECK (outcome IN (
        'connected',
        'no_answer',
        'voicemail',
        'busy',
        'wrong_number',
        'disconnected',
        'callback_requested',
        'not_interested',
        'dnc'
      )),
  notes text
    CONSTRAINT call_records_notes_length CHECK (notes IS NULL OR length(notes) <= 2000),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer
    CONSTRAINT call_records_duration_range
      CHECK (duration_seconds IS NULL OR (duration_seconds >= 0 AND duration_seconds <= 14400)),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.call_records IS
  'A manual attempt log for one organization. Not a live call, recording, or Telnyx session. Tenant-scoped by organization_id; RLS is the boundary, not the UI.';

COMMENT ON COLUMN public.call_records.organization_id IS
  'Owning tenant. Never accepted from the client as authority — enforced by RLS WITH CHECK and a row trigger.';

COMMENT ON COLUMN public.call_records.contact_id IS
  'Contact in the same organization. ON DELETE RESTRICT so attempt history is not silently removed.';

COMMENT ON COLUMN public.call_records.lead_id IS
  'Optional lead in the same organization, and only if that lead points at this contact. ON DELETE RESTRICT.';

COMMENT ON COLUMN public.call_records.outcome IS
  'What happened on this attempt: connected, no_answer, voicemail, busy, wrong_number, disconnected, callback_requested, not_interested, or dnc.';

CREATE INDEX call_records_organization_id_idx
  ON public.call_records (organization_id);

CREATE INDEX call_records_org_occurred_at_idx
  ON public.call_records (organization_id, occurred_at DESC);

CREATE INDEX call_records_org_contact_id_idx
  ON public.call_records (organization_id, contact_id);

CREATE INDEX call_records_org_lead_id_idx
  ON public.call_records (organization_id, lead_id)
  WHERE lead_id IS NOT NULL;

CREATE TRIGGER call_records_set_updated_at
  BEFORE UPDATE ON public.call_records
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Guard: membership, no org/contact move, lead same org and same person
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.call_records_guard_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contact_org uuid;
  v_lead_org uuid;
  v_lead_contact uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT private.is_active_member(NEW.organization_id) THEN
    RAISE EXCEPTION 'Cannot write a call record into an organization you are not an active member of'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Call records cannot be moved between organizations'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.contact_id IS DISTINCT FROM OLD.contact_id THEN
    RAISE EXCEPTION 'Call records cannot change contact'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.organization_id INTO v_contact_org
  FROM public.contacts AS c
  WHERE c.id = NEW.contact_id;

  IF v_contact_org IS NULL THEN
    RAISE EXCEPTION 'Call record contact does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_contact_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Call record contact must belong to the same organization'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    SELECT l.organization_id, l.contact_id INTO v_lead_org, v_lead_contact
    FROM public.leads AS l
    WHERE l.id = NEW.lead_id;

    IF v_lead_org IS NULL THEN
      RAISE EXCEPTION 'Call record lead does not exist'
        USING ERRCODE = '23503';
    END IF;

    IF v_lead_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Call record lead must belong to the same organization'
        USING ERRCODE = '42501';
    END IF;

    IF v_lead_contact IS DISTINCT FROM NEW.contact_id THEN
      RAISE EXCEPTION 'Call record lead must point at the same contact'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.call_records_guard_organization() IS
  'Rejects cross-tenant call-record writes, contacts from another organization, and leads that do not match the contact.';

REVOKE ALL ON FUNCTION private.call_records_guard_organization() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.call_records_guard_organization() FROM anon;
GRANT EXECUTE ON FUNCTION private.call_records_guard_organization() TO authenticated, service_role, postgres;

CREATE TRIGGER call_records_guard_organization
  BEFORE INSERT OR UPDATE ON public.call_records
  FOR EACH ROW
  EXECUTE FUNCTION private.call_records_guard_organization();

-- ---------------------------------------------------------------------------
-- Audit — metadata is call_record_id only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.call_records_write_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id uuid;
  v_call_record_id uuid;
  v_action text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_organization_id := OLD.organization_id;
    v_call_record_id := OLD.id;
    v_action := 'call_record.deleted';
  ELSIF TG_OP = 'UPDATE' THEN
    v_organization_id := NEW.organization_id;
    v_call_record_id := NEW.id;
    v_action := 'call_record.updated';
  ELSE
    v_organization_id := NEW.organization_id;
    v_call_record_id := NEW.id;
    v_action := 'call_record.created';
  END IF;

  PERFORM private.write_audit_log(
    p_organization_id => v_organization_id,
    p_action => v_action,
    p_metadata => jsonb_build_object('call_record_id', v_call_record_id)
  );

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.call_records_write_audit() IS
  'Records call_record.created / call_record.updated / call_record.deleted. Metadata holds the call record id only.';

REVOKE ALL ON FUNCTION private.call_records_write_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.call_records_write_audit() FROM anon;
GRANT EXECUTE ON FUNCTION private.call_records_write_audit() TO authenticated;
GRANT EXECUTE ON FUNCTION private.call_records_write_audit() TO service_role;
GRANT EXECUTE ON FUNCTION private.call_records_write_audit() TO postgres;

CREATE TRIGGER call_records_write_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.call_records
  FOR EACH ROW
  EXECUTE FUNCTION private.call_records_write_audit();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_records FORCE ROW LEVEL SECURITY;

CREATE POLICY call_records_select_member
  ON public.call_records
  FOR SELECT
  TO authenticated
  USING (private.is_active_member(organization_id));

CREATE POLICY call_records_insert_member
  ON public.call_records
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_active_member(organization_id));

CREATE POLICY call_records_update_member
  ON public.call_records
  FOR UPDATE
  TO authenticated
  USING (private.is_active_member(organization_id))
  WITH CHECK (private.is_active_member(organization_id));

CREATE POLICY call_records_delete_member
  ON public.call_records
  FOR DELETE
  TO authenticated
  USING (private.is_active_member(organization_id));

REVOKE ALL ON TABLE public.call_records FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.call_records TO authenticated;
GRANT ALL ON TABLE public.call_records TO service_role;
