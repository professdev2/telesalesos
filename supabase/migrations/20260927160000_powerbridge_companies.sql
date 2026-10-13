-- PowerBridge Slice A: Companies (accounts) + link to contacts/leads.
-- Gated in the app by organizations.powerbridge_enabled; RLS is org membership.

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL
    CONSTRAINT companies_name_not_blank CHECK (length(btrim(name)) > 0)
    CONSTRAINT companies_name_length CHECK (length(name) <= 160),
  website text
    CONSTRAINT companies_website_length CHECK (website IS NULL OR length(website) <= 2048),
  imo text
    CONSTRAINT companies_imo_length CHECK (imo IS NULL OR length(imo) <= 160),
  state text
    CONSTRAINT companies_state_length CHECK (state IS NULL OR length(state) <= 64),
  priority text
    CONSTRAINT companies_priority_valid
      CHECK (priority IS NULL OR priority IN ('hot', 'warm', 'cold')),
  notes text
    CONSTRAINT companies_notes_length CHECK (notes IS NULL OR length(notes) <= 2000),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.companies IS
  'PowerBridge B2B accounts. One company, many opportunities (leads). Tenant-scoped.';

CREATE INDEX companies_organization_id_idx ON public.companies (organization_id);
CREATE INDEX companies_org_name_idx ON public.companies (organization_id, name);
CREATE INDEX companies_org_created_at_idx ON public.companies (organization_id, created_at DESC);

CREATE TRIGGER companies_set_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE OR REPLACE FUNCTION private.companies_guard_organization()
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
    RAISE EXCEPTION 'Cannot write a company into an organization you are not an active member of'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Companies cannot be moved between organizations'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.companies_guard_organization() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.companies_guard_organization() TO authenticated, service_role, postgres;

CREATE TRIGGER companies_guard_organization
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION private.companies_guard_organization();

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;

CREATE POLICY companies_select
  ON public.companies FOR SELECT TO authenticated
  USING (private.is_active_member(organization_id));

CREATE POLICY companies_insert
  ON public.companies FOR INSERT TO authenticated
  WITH CHECK (private.is_active_member(organization_id));

CREATE POLICY companies_update
  ON public.companies FOR UPDATE TO authenticated
  USING (private.is_active_member(organization_id))
  WITH CHECK (private.is_active_member(organization_id));

CREATE POLICY companies_delete
  ON public.companies FOR DELETE TO authenticated
  USING (private.is_active_member(organization_id));

REVOKE ALL ON TABLE public.companies FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.companies TO authenticated;
GRANT ALL ON TABLE public.companies TO service_role;

-- Link contacts and leads (nullable — sales/recruiting/retention stay person-based)
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS company_id uuid
    REFERENCES public.companies (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS contacts_org_company_id_idx
  ON public.contacts (organization_id, company_id);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS company_id uuid
    REFERENCES public.companies (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_org_company_id_idx
  ON public.leads (organization_id, company_id);

-- Extend lead guard: company (when set) must be same org
CREATE OR REPLACE FUNCTION private.leads_guard_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contact_org uuid;
  v_company_org uuid;
BEGIN
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

  IF NEW.company_id IS NOT NULL THEN
    SELECT co.organization_id INTO v_company_org
    FROM public.companies AS co
    WHERE co.id = NEW.company_id;

    IF v_company_org IS NULL THEN
      RAISE EXCEPTION 'Lead company does not exist'
        USING ERRCODE = '23503';
    END IF;

    IF v_company_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Lead company must belong to the same organization'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Contact guard: company (when set) must be same org
CREATE OR REPLACE FUNCTION private.contacts_guard_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_org uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT private.is_active_member(NEW.organization_id) THEN
    RAISE EXCEPTION 'Cannot write a contact into an organization you are not an active member of'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Contacts cannot be moved between organizations'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.company_id IS NOT NULL THEN
    SELECT co.organization_id INTO v_company_org
    FROM public.companies AS co
    WHERE co.id = NEW.company_id;

    IF v_company_org IS NULL THEN
      RAISE EXCEPTION 'Contact company does not exist'
        USING ERRCODE = '23503';
    END IF;

    IF v_company_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Contact company must belong to the same organization'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
