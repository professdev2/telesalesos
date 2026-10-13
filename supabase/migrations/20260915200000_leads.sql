-- ---------------------------------------------------------------------------
-- leads — first sales-workflow record type
--
-- Tenancy rules this migration must guarantee:
--   1. A member of Org A cannot SELECT Org B's leads.
--   2. A member of Org A cannot INSERT/UPDATE a lead into Org B.
--   3. A lead's contact must belong to the same organization.
--   4. Deleting a contact that still has leads is rejected (RESTRICT).
--
-- organization_id is never trusted from the client. WITH CHECK and
-- private.leads_guard_organization() both reject a forged value.
-- ---------------------------------------------------------------------------

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  contact_id uuid NOT NULL
    REFERENCES public.contacts (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'new'
    CONSTRAINT leads_status_valid
      CHECK (status IN ('new', 'working', 'won', 'lost')),
  notes text
    CONSTRAINT leads_notes_length CHECK (notes IS NULL OR length(notes) <= 2000),
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leads IS
  'A contact in a sales workflow for one organization. Tenant-scoped by organization_id; RLS is the boundary, not the UI.';

COMMENT ON COLUMN public.leads.organization_id IS
  'Owning tenant. Never accepted from the client as authority — enforced by RLS WITH CHECK and a row trigger.';

COMMENT ON COLUMN public.leads.contact_id IS
  'Contact in the same organization. ON DELETE RESTRICT so contact history is not silently removed.';

COMMENT ON COLUMN public.leads.archived_at IS
  'Null means the lead is on the default list. Set means archived; the row is kept.';

CREATE INDEX leads_organization_id_idx
  ON public.leads (organization_id);

CREATE INDEX leads_org_created_at_idx
  ON public.leads (organization_id, created_at DESC);

CREATE INDEX leads_org_contact_id_idx
  ON public.leads (organization_id, contact_id);

CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Guard: membership, no org move, contact in the same org
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.leads_guard_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contact_org uuid;
BEGIN
  -- service_role and trusted SQL bypass RLS; auth.uid() is NULL there.
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT private.is_active_member(NEW.organization_id) THEN
    RAISE EXCEPTION 'Cannot write a lead into an organization you are not an active member of'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Leads cannot be moved between organizations'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.organization_id INTO v_contact_org
  FROM public.contacts AS c
  WHERE c.id = NEW.contact_id;

  IF v_contact_org IS NULL THEN
    RAISE EXCEPTION 'Lead contact does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_contact_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Lead contact must belong to the same organization'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.leads_guard_organization() IS
  'Rejects cross-tenant lead writes and contacts from another organization, independently of RLS.';

REVOKE ALL ON FUNCTION private.leads_guard_organization() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.leads_guard_organization() FROM anon;
GRANT EXECUTE ON FUNCTION private.leads_guard_organization() TO authenticated, service_role, postgres;

CREATE TRIGGER leads_guard_organization
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION private.leads_guard_organization();

-- ---------------------------------------------------------------------------
-- Audit — metadata is lead_id only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.leads_write_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id uuid;
  v_lead_id uuid;
  v_action text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_organization_id := OLD.organization_id;
    v_lead_id := OLD.id;
    v_action := 'lead.deleted';
  ELSIF TG_OP = 'UPDATE' THEN
    v_organization_id := NEW.organization_id;
    v_lead_id := NEW.id;
    IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
      v_action := 'lead.archived';
    ELSE
      v_action := 'lead.updated';
    END IF;
  ELSE
    v_organization_id := NEW.organization_id;
    v_lead_id := NEW.id;
    v_action := 'lead.created';
  END IF;

  PERFORM private.write_audit_log(
    p_organization_id => v_organization_id,
    p_action => v_action,
    p_metadata => jsonb_build_object('lead_id', v_lead_id)
  );

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.leads_write_audit() IS
  'Records lead.created / lead.updated / lead.archived / lead.deleted. Metadata holds the lead id only.';

REVOKE ALL ON FUNCTION private.leads_write_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.leads_write_audit() FROM anon;
GRANT EXECUTE ON FUNCTION private.leads_write_audit() TO authenticated;
GRANT EXECUTE ON FUNCTION private.leads_write_audit() TO service_role;
GRANT EXECUTE ON FUNCTION private.leads_write_audit() TO postgres;

CREATE TRIGGER leads_write_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION private.leads_write_audit();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads FORCE ROW LEVEL SECURITY;

CREATE POLICY leads_select_member
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (private.is_active_member(organization_id));

CREATE POLICY leads_insert_member
  ON public.leads
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_active_member(organization_id));

CREATE POLICY leads_update_member
  ON public.leads
  FOR UPDATE
  TO authenticated
  USING (private.is_active_member(organization_id))
  WITH CHECK (private.is_active_member(organization_id));

CREATE POLICY leads_delete_member
  ON public.leads
  FOR DELETE
  TO authenticated
  USING (private.is_active_member(organization_id));

REVOKE ALL ON TABLE public.leads FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leads TO authenticated;
GRANT ALL ON TABLE public.leads TO service_role;
