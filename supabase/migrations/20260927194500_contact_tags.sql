-- Org-scoped tags on contacts (campaign roster records share these tags).

CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL
    CONSTRAINT tags_name_not_blank CHECK (length(btrim(name)) > 0)
    CONSTRAINT tags_name_length CHECK (length(name) <= 40),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tags IS
  'Organization tag dictionary. Applied to contacts (visible on campaigns and contact pages).';

CREATE UNIQUE INDEX tags_org_lower_name_uidx
  ON public.tags (organization_id, lower(btrim(name)));

CREATE INDEX tags_organization_id_idx ON public.tags (organization_id);

CREATE TABLE public.contact_tags (
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  contact_id uuid NOT NULL
    REFERENCES public.contacts (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL
    REFERENCES public.tags (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, tag_id)
);

COMMENT ON TABLE public.contact_tags IS
  'Tags on a contact. Same tags show on every campaign that includes the contact.';

CREATE INDEX contact_tags_organization_id_idx ON public.contact_tags (organization_id);
CREATE INDEX contact_tags_org_tag_id_idx ON public.contact_tags (organization_id, tag_id);
CREATE INDEX contact_tags_org_contact_id_idx ON public.contact_tags (organization_id, contact_id);

CREATE OR REPLACE FUNCTION private.contact_tags_guard_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contact_org uuid;
  v_tag_org uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT private.is_active_member(NEW.organization_id) THEN
    RAISE EXCEPTION 'Cannot tag a contact in an organization you are not an active member of'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.organization_id INTO v_contact_org
  FROM public.contacts AS c
  WHERE c.id = NEW.contact_id;

  IF v_contact_org IS NULL THEN
    RAISE EXCEPTION 'Tagged contact does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_contact_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Tagged contact must belong to the same organization'
      USING ERRCODE = '42501';
  END IF;

  SELECT t.organization_id INTO v_tag_org
  FROM public.tags AS t
  WHERE t.id = NEW.tag_id;

  IF v_tag_org IS NULL THEN
    RAISE EXCEPTION 'Tag does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_tag_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Tag must belong to the same organization'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.contact_tags_guard_organization() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.contact_tags_guard_organization() TO authenticated, service_role, postgres;

CREATE TRIGGER contact_tags_guard_organization
  BEFORE INSERT OR UPDATE ON public.contact_tags
  FOR EACH ROW
  EXECUTE FUNCTION private.contact_tags_guard_organization();

CREATE OR REPLACE FUNCTION private.tags_guard_organization()
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
    RAISE EXCEPTION 'Cannot create a tag in an organization you are not an active member of'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Tags cannot be moved between organizations'
      USING ERRCODE = '42501';
  END IF;

  NEW.name := btrim(NEW.name);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.tags_guard_organization() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.tags_guard_organization() TO authenticated, service_role, postgres;

CREATE TRIGGER tags_guard_organization
  BEFORE INSERT OR UPDATE ON public.tags
  FOR EACH ROW
  EXECUTE FUNCTION private.tags_guard_organization();

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags FORCE ROW LEVEL SECURITY;

CREATE POLICY tags_select ON public.tags FOR SELECT TO authenticated
  USING (private.is_active_member(organization_id));
CREATE POLICY tags_insert ON public.tags FOR INSERT TO authenticated
  WITH CHECK (private.is_active_member(organization_id));
CREATE POLICY tags_update ON public.tags FOR UPDATE TO authenticated
  USING (private.is_active_member(organization_id))
  WITH CHECK (private.is_active_member(organization_id));
CREATE POLICY tags_delete ON public.tags FOR DELETE TO authenticated
  USING (private.is_active_member(organization_id));

REVOKE ALL ON TABLE public.tags FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tags TO authenticated;
GRANT ALL ON TABLE public.tags TO service_role;

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags FORCE ROW LEVEL SECURITY;

CREATE POLICY contact_tags_select ON public.contact_tags FOR SELECT TO authenticated
  USING (private.is_active_member(organization_id));
CREATE POLICY contact_tags_insert ON public.contact_tags FOR INSERT TO authenticated
  WITH CHECK (private.is_active_member(organization_id));
CREATE POLICY contact_tags_update ON public.contact_tags FOR UPDATE TO authenticated
  USING (private.is_active_member(organization_id))
  WITH CHECK (private.is_active_member(organization_id));
CREATE POLICY contact_tags_delete ON public.contact_tags FOR DELETE TO authenticated
  USING (private.is_active_member(organization_id));

REVOKE ALL ON TABLE public.contact_tags FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contact_tags TO authenticated;
GRANT ALL ON TABLE public.contact_tags TO service_role;
