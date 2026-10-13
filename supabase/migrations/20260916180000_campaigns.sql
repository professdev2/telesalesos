-- ---------------------------------------------------------------------------
-- campaigns — named contact lists for one organization (not a dialer)
--
-- Tenancy rules this migration must guarantee:
--   1. A member of Org A cannot SELECT Org B's campaigns or memberships.
--   2. A member of Org A cannot INSERT a campaign or membership into Org B.
--   3. A campaign_contacts row's contact and campaign must share organization_id.
--   4. Deleting a contact that is still on a campaign is rejected (RESTRICT).
--
-- organization_id is never trusted from the client.
-- ---------------------------------------------------------------------------

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL
    CONSTRAINT campaigns_name_length CHECK (length(name) >= 2 AND length(name) <= 120),
  status text NOT NULL DEFAULT 'draft'
    CONSTRAINT campaigns_status_valid
      CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  notes text
    CONSTRAINT campaigns_notes_length CHECK (notes IS NULL OR length(notes) <= 2000),
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.campaigns IS
  'A named list of contacts for one organization. Not a dialer. Tenant-scoped by organization_id; RLS is the boundary, not the UI.';

COMMENT ON COLUMN public.campaigns.organization_id IS
  'Owning tenant. Never accepted from the client as authority.';

COMMENT ON COLUMN public.campaigns.archived_at IS
  'Null means the campaign is on the default list. Set means archived; membership rows are kept.';

CREATE INDEX campaigns_organization_id_idx
  ON public.campaigns (organization_id);

CREATE INDEX campaigns_org_created_at_idx
  ON public.campaigns (organization_id, created_at DESC);

CREATE TRIGGER campaigns_set_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE TABLE public.campaign_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL
    REFERENCES public.campaigns (id) ON DELETE CASCADE,
  contact_id uuid NOT NULL
    REFERENCES public.contacts (id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_contacts_unique UNIQUE (campaign_id, contact_id)
);

COMMENT ON TABLE public.campaign_contacts IS
  'A contact on a campaign in the same organization. Duplicate pairs are rejected. Contact delete is RESTRICT.';

CREATE INDEX campaign_contacts_organization_id_idx
  ON public.campaign_contacts (organization_id);

CREATE INDEX campaign_contacts_org_campaign_id_idx
  ON public.campaign_contacts (organization_id, campaign_id);

CREATE INDEX campaign_contacts_org_contact_id_idx
  ON public.campaign_contacts (organization_id, contact_id);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.campaigns_guard_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT private.is_active_member(NEW.organization_id) THEN
    RAISE EXCEPTION 'Cannot write a campaign into an organization you are not an active member of'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Campaigns cannot be moved between organizations'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.campaigns_guard_organization() IS
  'Rejects cross-tenant campaign writes, independently of RLS.';

REVOKE ALL ON FUNCTION private.campaigns_guard_organization() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.campaigns_guard_organization() FROM anon;
GRANT EXECUTE ON FUNCTION private.campaigns_guard_organization() TO authenticated, service_role, postgres;

CREATE TRIGGER campaigns_guard_organization
  BEFORE INSERT OR UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION private.campaigns_guard_organization();

CREATE OR REPLACE FUNCTION private.campaign_contacts_guard_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campaign_org uuid;
  v_contact_org uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT private.is_active_member(NEW.organization_id) THEN
    RAISE EXCEPTION 'Cannot write a campaign contact into an organization you are not an active member of'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
      OR NEW.contact_id IS DISTINCT FROM OLD.contact_id THEN
      RAISE EXCEPTION 'Campaign contacts cannot change organization, campaign, or contact'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT c.organization_id INTO v_campaign_org
  FROM public.campaigns AS c
  WHERE c.id = NEW.campaign_id;

  IF v_campaign_org IS NULL THEN
    RAISE EXCEPTION 'Campaign does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_campaign_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Campaign contact campaign must belong to the same organization'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.organization_id INTO v_contact_org
  FROM public.contacts AS c
  WHERE c.id = NEW.contact_id;

  IF v_contact_org IS NULL THEN
    RAISE EXCEPTION 'Campaign contact does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_contact_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Campaign contact must belong to the same organization'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.campaign_contacts_guard_organization() IS
  'Rejects cross-tenant membership writes and contacts or campaigns from another organization.';

REVOKE ALL ON FUNCTION private.campaign_contacts_guard_organization() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.campaign_contacts_guard_organization() FROM anon;
GRANT EXECUTE ON FUNCTION private.campaign_contacts_guard_organization() TO authenticated, service_role, postgres;

CREATE TRIGGER campaign_contacts_guard_organization
  BEFORE INSERT OR UPDATE ON public.campaign_contacts
  FOR EACH ROW
  EXECUTE FUNCTION private.campaign_contacts_guard_organization();

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.campaigns_write_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id uuid;
  v_campaign_id uuid;
  v_action text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_organization_id := OLD.organization_id;
    v_campaign_id := OLD.id;
    v_action := 'campaign.deleted';
  ELSIF TG_OP = 'UPDATE' THEN
    v_organization_id := NEW.organization_id;
    v_campaign_id := NEW.id;
    IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
      v_action := 'campaign.archived';
    ELSE
      v_action := 'campaign.updated';
    END IF;
  ELSE
    v_organization_id := NEW.organization_id;
    v_campaign_id := NEW.id;
    v_action := 'campaign.created';
  END IF;

  PERFORM private.write_audit_log(
    p_organization_id => v_organization_id,
    p_action => v_action,
    p_metadata => jsonb_build_object('campaign_id', v_campaign_id)
  );

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.campaigns_write_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.campaigns_write_audit() FROM anon;
GRANT EXECUTE ON FUNCTION private.campaigns_write_audit() TO authenticated, service_role, postgres;

CREATE TRIGGER campaigns_write_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION private.campaigns_write_audit();

CREATE OR REPLACE FUNCTION private.campaign_contacts_write_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id uuid;
  v_campaign_id uuid;
  v_id uuid;
  v_action text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_organization_id := OLD.organization_id;
    v_campaign_id := OLD.campaign_id;
    v_id := OLD.id;
    v_action := 'campaign_contact.removed';
  ELSE
    v_organization_id := NEW.organization_id;
    v_campaign_id := NEW.campaign_id;
    v_id := NEW.id;
    v_action := 'campaign_contact.added';
  END IF;

  PERFORM private.write_audit_log(
    p_organization_id => v_organization_id,
    p_action => v_action,
    p_metadata => jsonb_build_object(
      'campaign_id', v_campaign_id,
      'campaign_contact_id', v_id
    )
  );

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.campaign_contacts_write_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.campaign_contacts_write_audit() FROM anon;
GRANT EXECUTE ON FUNCTION private.campaign_contacts_write_audit() TO authenticated, service_role, postgres;

CREATE TRIGGER campaign_contacts_write_audit
  AFTER INSERT OR DELETE ON public.campaign_contacts
  FOR EACH ROW
  EXECUTE FUNCTION private.campaign_contacts_write_audit();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns FORCE ROW LEVEL SECURITY;

CREATE POLICY campaigns_select_member
  ON public.campaigns FOR SELECT TO authenticated
  USING (private.is_active_member(organization_id));

CREATE POLICY campaigns_insert_member
  ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (private.is_active_member(organization_id));

CREATE POLICY campaigns_update_member
  ON public.campaigns FOR UPDATE TO authenticated
  USING (private.is_active_member(organization_id))
  WITH CHECK (private.is_active_member(organization_id));

CREATE POLICY campaigns_delete_member
  ON public.campaigns FOR DELETE TO authenticated
  USING (private.is_active_member(organization_id));

REVOKE ALL ON TABLE public.campaigns FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.campaigns TO authenticated;
GRANT ALL ON TABLE public.campaigns TO service_role;

ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts FORCE ROW LEVEL SECURITY;

CREATE POLICY campaign_contacts_select_member
  ON public.campaign_contacts FOR SELECT TO authenticated
  USING (private.is_active_member(organization_id));

CREATE POLICY campaign_contacts_insert_member
  ON public.campaign_contacts FOR INSERT TO authenticated
  WITH CHECK (private.is_active_member(organization_id));

CREATE POLICY campaign_contacts_update_member
  ON public.campaign_contacts FOR UPDATE TO authenticated
  USING (private.is_active_member(organization_id))
  WITH CHECK (private.is_active_member(organization_id));

CREATE POLICY campaign_contacts_delete_member
  ON public.campaign_contacts FOR DELETE TO authenticated
  USING (private.is_active_member(organization_id));

REVOKE ALL ON TABLE public.campaign_contacts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.campaign_contacts TO authenticated;
GRANT ALL ON TABLE public.campaign_contacts TO service_role;
