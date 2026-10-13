-- Training library v1: Vimeo lessons and external resource links.
-- Platform content is global; organization content is tenant-scoped.
-- No uploads, quizzes, certificates, or progress tracking.

CREATE TABLE public.training_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visibility text NOT NULL
    CONSTRAINT training_courses_visibility_valid
      CHECK (visibility IN ('platform', 'organization')),
  organization_id uuid
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL
    CONSTRAINT training_courses_name_length
      CHECK (length(trim(name)) BETWEEN 2 AND 120),
  description text
    CONSTRAINT training_courses_description_length
      CHECK (description IS NULL OR length(description) <= 2000),
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_courses_owner_valid CHECK (
    (visibility = 'platform' AND organization_id IS NULL)
    OR
    (visibility = 'organization' AND organization_id IS NOT NULL)
  )
);

CREATE TABLE public.training_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL
    REFERENCES public.training_courses (id) ON DELETE RESTRICT,
  title text NOT NULL
    CONSTRAINT training_lessons_title_length
      CHECK (length(trim(title)) BETWEEN 2 AND 120),
  vimeo_video_id text NOT NULL
    CONSTRAINT training_lessons_vimeo_id_valid
      CHECK (vimeo_video_id ~ '^[0-9]+$'),
  sort_order integer NOT NULL DEFAULT 0
    CONSTRAINT training_lessons_sort_order_valid
      CHECK (sort_order BETWEEN 0 AND 100000),
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.training_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL
    REFERENCES public.training_lessons (id) ON DELETE RESTRICT,
  title text NOT NULL
    CONSTRAINT training_resources_title_length
      CHECK (length(trim(title)) BETWEEN 1 AND 120),
  url text NOT NULL
    CONSTRAINT training_resources_url_valid
      CHECK (length(url) <= 2048 AND url ~ '^https://'),
  sort_order integer NOT NULL DEFAULT 0
    CONSTRAINT training_resources_sort_order_valid
      CHECK (sort_order BETWEEN 0 AND 100000),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Existing audit_logs requires an organization. Global catalog changes need a
-- separate append-only trail instead of a fake tenant.
CREATE TABLE public.training_platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL
    CONSTRAINT training_platform_audit_action_nonempty
      CHECK (length(trim(action)) > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.training_courses IS
  'Training catalog courses. Platform rows are global; organization rows are tenant-scoped.';
COMMENT ON TABLE public.training_lessons IS
  'Vimeo-only lessons. Ownership and permissions are inherited from the parent course.';
COMMENT ON COLUMN public.training_lessons.vimeo_video_id IS
  'Numeric Vimeo video id parsed from a validated Vimeo URL; never a raw iframe source.';
COMMENT ON TABLE public.training_resources IS
  'External HTTPS resource links. Access permissions remain controlled by the external provider.';
COMMENT ON TABLE public.training_platform_audit_logs IS
  'Append-only audit trail for global training content; readable only by platform admins.';

CREATE INDEX training_courses_catalog_idx
  ON public.training_courses (visibility, organization_id, created_at DESC);
CREATE INDEX training_lessons_course_sort_idx
  ON public.training_lessons (course_id, sort_order, created_at);
CREATE INDEX training_resources_lesson_sort_idx
  ON public.training_resources (lesson_id, sort_order, created_at);
CREATE INDEX training_platform_audit_created_idx
  ON public.training_platform_audit_logs (created_at DESC);

CREATE TRIGGER training_courses_set_updated_at
  BEFORE UPDATE ON public.training_courses
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER training_lessons_set_updated_at
  BEFORE UPDATE ON public.training_lessons
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER training_resources_set_updated_at
  BEFORE UPDATE ON public.training_resources
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Security helpers used by child-table policies (SECURITY DEFINER avoids RLS
-- recursion while preserving the parent course as the single ownership source).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.has_any_active_membership(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships m
    WHERE m.user_id = p_user_id
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.training_course_can_read(
  p_course_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.training_courses c
    WHERE c.id = p_course_id
      AND (
        (
          c.visibility = 'platform'
          AND (
            private.has_any_active_membership(p_user_id)
            OR private.is_platform_admin(p_user_id)
          )
        )
        OR (
          c.visibility = 'organization'
          AND private.is_active_member(c.organization_id, p_user_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.training_course_can_write(
  p_course_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.training_courses c
    WHERE c.id = p_course_id
      AND (
        (c.visibility = 'platform' AND private.is_platform_admin(p_user_id))
        OR (
          c.visibility = 'organization'
          AND private.has_org_role(
            c.organization_id,
            ARRAY['owner', 'admin']::text[],
            p_user_id
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION private.has_any_active_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.training_course_can_read(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.training_course_can_write(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_any_active_membership(uuid)
  TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.training_course_can_read(uuid, uuid)
  TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.training_course_can_write(uuid, uuid)
  TO authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- Second-barrier row guards.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.training_courses_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.visibility IS DISTINCT FROM OLD.visibility
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
  ) THEN
    RAISE EXCEPTION 'Training courses cannot change ownership'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.visibility = 'platform' THEN
    IF NOT private.is_platform_admin() THEN
      RAISE EXCEPTION 'Only platform admins can write platform training'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT private.has_org_role(
    NEW.organization_id,
    ARRAY['owner', 'admin']::text[]
  ) THEN
    RAISE EXCEPTION 'Only organization owners and admins can write agency training'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.training_lessons_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.course_id IS DISTINCT FROM OLD.course_id THEN
    RAISE EXCEPTION 'Training lessons cannot move between courses'
      USING ERRCODE = '42501';
  END IF;

  IF NOT private.training_course_can_write(NEW.course_id) THEN
    RAISE EXCEPTION 'You cannot write lessons in this training library'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.training_resources_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_course_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.lesson_id IS DISTINCT FROM OLD.lesson_id THEN
    RAISE EXCEPTION 'Training resources cannot move between lessons'
      USING ERRCODE = '42501';
  END IF;

  SELECT l.course_id INTO v_course_id
  FROM public.training_lessons l
  WHERE l.id = NEW.lesson_id;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'Training lesson does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF NOT private.training_course_can_write(v_course_id) THEN
    RAISE EXCEPTION 'You cannot write resources in this training library'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.training_courses_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.training_lessons_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.training_resources_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.training_courses_guard()
  TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.training_lessons_guard()
  TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.training_resources_guard()
  TO authenticated, service_role, postgres;

CREATE TRIGGER training_courses_guard
  BEFORE INSERT OR UPDATE ON public.training_courses
  FOR EACH ROW EXECUTE FUNCTION private.training_courses_guard();
CREATE TRIGGER training_lessons_guard
  BEFORE INSERT OR UPDATE ON public.training_lessons
  FOR EACH ROW EXECUTE FUNCTION private.training_lessons_guard();
CREATE TRIGGER training_resources_guard
  BEFORE INSERT OR UPDATE ON public.training_resources
  FOR EACH ROW EXECUTE FUNCTION private.training_resources_guard();

-- ---------------------------------------------------------------------------
-- Audit routing: organization content uses audit_logs; global content uses the
-- dedicated platform audit table.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.write_training_platform_audit(
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_actor_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF nullif(trim(p_action), '') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.training_platform_audit_logs (
    actor_user_id,
    action,
    metadata
  ) VALUES (
    p_actor_user_id,
    trim(p_action),
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.training_courses_write_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.training_courses;
  v_action text;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  v_action := CASE
    WHEN TG_OP = 'INSERT' THEN 'training_course.created'
    WHEN TG_OP = 'DELETE' THEN 'training_course.deleted'
    WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL
      THEN 'training_course.archived'
    ELSE 'training_course.updated'
  END;

  IF v_row.visibility = 'platform' THEN
    PERFORM private.write_training_platform_audit(
      v_action,
      jsonb_build_object('course_id', v_row.id)
    );
  ELSE
    PERFORM private.write_audit_log(
      p_organization_id => v_row.organization_id,
      p_action => v_action,
      p_metadata => jsonb_build_object('course_id', v_row.id)
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.training_lessons_write_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.training_lessons;
  v_visibility text;
  v_organization_id uuid;
  v_action text;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT c.visibility, c.organization_id
  INTO v_visibility, v_organization_id
  FROM public.training_courses c
  WHERE c.id = v_row.course_id;

  v_action := CASE
    WHEN TG_OP = 'INSERT' THEN 'training_lesson.created'
    WHEN TG_OP = 'DELETE' THEN 'training_lesson.deleted'
    WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL
      THEN 'training_lesson.archived'
    ELSE 'training_lesson.updated'
  END;

  IF v_visibility = 'platform' THEN
    PERFORM private.write_training_platform_audit(
      v_action,
      jsonb_build_object('course_id', v_row.course_id, 'lesson_id', v_row.id)
    );
  ELSE
    PERFORM private.write_audit_log(
      p_organization_id => v_organization_id,
      p_action => v_action,
      p_metadata => jsonb_build_object(
        'course_id', v_row.course_id,
        'lesson_id', v_row.id
      )
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.training_resources_write_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.training_resources;
  v_course_id uuid;
  v_visibility text;
  v_organization_id uuid;
  v_action text;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT c.id, c.visibility, c.organization_id
  INTO v_course_id, v_visibility, v_organization_id
  FROM public.training_lessons l
  JOIN public.training_courses c ON c.id = l.course_id
  WHERE l.id = v_row.lesson_id;

  v_action := CASE
    WHEN TG_OP = 'INSERT' THEN 'training_resource.created'
    WHEN TG_OP = 'DELETE' THEN 'training_resource.deleted'
    ELSE 'training_resource.updated'
  END;

  IF v_visibility = 'platform' THEN
    PERFORM private.write_training_platform_audit(
      v_action,
      jsonb_build_object(
        'course_id', v_course_id,
        'lesson_id', v_row.lesson_id,
        'resource_id', v_row.id
      )
    );
  ELSE
    PERFORM private.write_audit_log(
      p_organization_id => v_organization_id,
      p_action => v_action,
      p_metadata => jsonb_build_object(
        'course_id', v_course_id,
        'lesson_id', v_row.lesson_id,
        'resource_id', v_row.id
      )
    );
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.write_training_platform_audit(text, jsonb, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION private.training_courses_write_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.training_lessons_write_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.training_resources_write_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.write_training_platform_audit(text, jsonb, uuid)
  TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.training_courses_write_audit()
  TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.training_lessons_write_audit()
  TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.training_resources_write_audit()
  TO authenticated, service_role, postgres;

CREATE TRIGGER training_courses_write_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.training_courses
  FOR EACH ROW EXECUTE FUNCTION private.training_courses_write_audit();
CREATE TRIGGER training_lessons_write_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.training_lessons
  FOR EACH ROW EXECUTE FUNCTION private.training_lessons_write_audit();
CREATE TRIGGER training_resources_write_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.training_resources
  FOR EACH ROW EXECUTE FUNCTION private.training_resources_write_audit();

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------

ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_courses FORCE ROW LEVEL SECURITY;

CREATE POLICY training_courses_select
  ON public.training_courses FOR SELECT TO authenticated
  USING (
    (
      visibility = 'platform'
      AND (
        private.has_any_active_membership()
        OR private.is_platform_admin()
      )
    )
    OR (
      visibility = 'organization'
      AND private.is_active_member(organization_id)
    )
  );

CREATE POLICY training_courses_insert
  ON public.training_courses FOR INSERT TO authenticated
  WITH CHECK (
    (visibility = 'platform' AND private.is_platform_admin())
    OR (
      visibility = 'organization'
      AND private.has_org_role(
        organization_id,
        ARRAY['owner', 'admin']::text[]
      )
    )
  );

CREATE POLICY training_courses_update
  ON public.training_courses FOR UPDATE TO authenticated
  USING (
    (visibility = 'platform' AND private.is_platform_admin())
    OR (
      visibility = 'organization'
      AND private.has_org_role(
        organization_id,
        ARRAY['owner', 'admin']::text[]
      )
    )
  )
  WITH CHECK (
    (visibility = 'platform' AND private.is_platform_admin())
    OR (
      visibility = 'organization'
      AND private.has_org_role(
        organization_id,
        ARRAY['owner', 'admin']::text[]
      )
    )
  );

CREATE POLICY training_courses_delete
  ON public.training_courses FOR DELETE TO authenticated
  USING (
    (visibility = 'platform' AND private.is_platform_admin())
    OR (
      visibility = 'organization'
      AND private.has_org_role(
        organization_id,
        ARRAY['owner', 'admin']::text[]
      )
    )
  );

ALTER TABLE public.training_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_lessons FORCE ROW LEVEL SECURITY;

CREATE POLICY training_lessons_select
  ON public.training_lessons FOR SELECT TO authenticated
  USING (private.training_course_can_read(course_id));
CREATE POLICY training_lessons_insert
  ON public.training_lessons FOR INSERT TO authenticated
  WITH CHECK (private.training_course_can_write(course_id));
CREATE POLICY training_lessons_update
  ON public.training_lessons FOR UPDATE TO authenticated
  USING (private.training_course_can_write(course_id))
  WITH CHECK (private.training_course_can_write(course_id));
CREATE POLICY training_lessons_delete
  ON public.training_lessons FOR DELETE TO authenticated
  USING (private.training_course_can_write(course_id));

ALTER TABLE public.training_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_resources FORCE ROW LEVEL SECURITY;

CREATE POLICY training_resources_select
  ON public.training_resources FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.training_lessons l
      WHERE l.id = lesson_id
        AND private.training_course_can_read(l.course_id)
    )
  );
CREATE POLICY training_resources_insert
  ON public.training_resources FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.training_lessons l
      WHERE l.id = lesson_id
        AND private.training_course_can_write(l.course_id)
    )
  );
CREATE POLICY training_resources_update
  ON public.training_resources FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.training_lessons l
      WHERE l.id = lesson_id
        AND private.training_course_can_write(l.course_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.training_lessons l
      WHERE l.id = lesson_id
        AND private.training_course_can_write(l.course_id)
    )
  );
CREATE POLICY training_resources_delete
  ON public.training_resources FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.training_lessons l
      WHERE l.id = lesson_id
        AND private.training_course_can_write(l.course_id)
    )
  );

ALTER TABLE public.training_platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_platform_audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY training_platform_audit_select
  ON public.training_platform_audit_logs FOR SELECT TO authenticated
  USING (private.is_platform_admin());

REVOKE ALL ON TABLE public.training_courses FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.training_lessons FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.training_resources FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.training_platform_audit_logs FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_courses
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_lessons
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_resources
  TO authenticated;
GRANT SELECT ON TABLE public.training_platform_audit_logs TO authenticated;

GRANT ALL ON TABLE public.training_courses TO service_role;
GRANT ALL ON TABLE public.training_lessons TO service_role;
GRANT ALL ON TABLE public.training_resources TO service_role;
GRANT ALL ON TABLE public.training_platform_audit_logs TO service_role;
