-- ---------------------------------------------------------------------------
-- contacts — first CRM record type
--
-- Tenancy rules this migration must guarantee:
--   1. A member of Org A cannot SELECT Org B's contacts (read isolation).
--   2. A member of Org A cannot INSERT/UPDATE a row into Org B (write
--      isolation). Reading isolation alone is only half the property: a table
--      that blocks SELECT but accepts a forged organization_id on INSERT is
--      still a cross-tenant vulnerability.
--
-- organization_id is never trusted from the client. The WITH CHECK clauses
-- below reject a forged value, and private.contacts_guard_organization()
-- rejects it a second time at the row level so a future policy edit cannot
-- silently open the write path.
-- ---------------------------------------------------------------------------

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  full_name text NOT NULL
    CONSTRAINT contacts_full_name_not_blank
      CHECK (length(btrim(full_name)) > 0)
    CONSTRAINT contacts_full_name_length
      CHECK (length(full_name) <= 120),
  -- Contact email/phone are CRM data about a third party. They are not
  -- credentials and never touch auth.users.
  email text
    CONSTRAINT contacts_email_length CHECK (email IS NULL OR length(email) <= 254),
  phone text
    CONSTRAINT contacts_phone_length CHECK (phone IS NULL OR length(phone) <= 40),
  notes text
    CONSTRAINT contacts_notes_length CHECK (notes IS NULL OR length(notes) <= 2000),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contacts IS
  'People an organization has a relationship with. Tenant-scoped by organization_id; RLS is the boundary, not the UI.';

COMMENT ON COLUMN public.contacts.organization_id IS
  'Owning tenant. Never accepted from the client as authority — enforced by RLS WITH CHECK and a row trigger.';

COMMENT ON COLUMN public.contacts.email IS
  'CRM data about the contact. Not an auth identity.';

CREATE INDEX contacts_organization_id_idx
  ON public.contacts (organization_id);

CREATE INDEX contacts_org_created_at_idx
  ON public.contacts (organization_id, created_at DESC);

CREATE TRIGGER contacts_set_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Second line of defence against a forged organization_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.contacts_guard_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- service_role and trusted SQL bypass RLS; auth.uid() is NULL there.
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

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.contacts_guard_organization() IS
  'Rejects cross-tenant contact writes at the row level, independently of the RLS policies.';

REVOKE ALL ON FUNCTION private.contacts_guard_organization() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.contacts_guard_organization() FROM anon;
GRANT EXECUTE ON FUNCTION private.contacts_guard_organization() TO authenticated, service_role, postgres;

CREATE TRIGGER contacts_guard_organization
  BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION private.contacts_guard_organization();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
-- FORCE so the table owner is subject to the policies too.
ALTER TABLE public.contacts FORCE ROW LEVEL SECURITY;

CREATE POLICY contacts_select_member
  ON public.contacts
  FOR SELECT
  TO authenticated
  USING (private.is_active_member(organization_id));

CREATE POLICY contacts_insert_member
  ON public.contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_active_member(organization_id));

CREATE POLICY contacts_update_member
  ON public.contacts
  FOR UPDATE
  TO authenticated
  USING (private.is_active_member(organization_id))
  WITH CHECK (private.is_active_member(organization_id));

CREATE POLICY contacts_delete_member
  ON public.contacts
  FOR DELETE
  TO authenticated
  USING (private.is_active_member(organization_id));

-- ---------------------------------------------------------------------------
-- Grants — anon has no access at all
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.contacts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contacts TO authenticated;
GRANT ALL ON TABLE public.contacts TO service_role;
