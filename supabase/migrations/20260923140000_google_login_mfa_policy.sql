-- Google login slice (plan/google-login.md, agreed 16 Sep 2026).
--
-- 1. MFA is required only for platform admins and active owners/admins of a
--    team organization. Agents (members) and standalone owners of an individual
--    workspace may sign in with Google or password alone.
-- 2. Converting an individual workspace to a team refreshes the requirement, so
--    the owner must enroll an authenticator on next login.
-- 3. A new Auth user whose email has a pending invitation does not get a
--    personal workspace. OAuth sign-ups cannot pass skip_workspace, so the
--    trigger checks the invitation table instead.

CREATE OR REPLACE FUNCTION private.user_is_mfa_privileged(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.platform_admins pa
        WHERE pa.user_id = p_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.organization_memberships m
        JOIN public.organizations o ON o.id = m.organization_id
        WHERE m.user_id = p_user_id
          AND m.status = 'active'
          AND m.role IN ('owner', 'admin')
          AND o.account_type = 'team'
      )
    );
$$;

COMMENT ON FUNCTION private.user_is_mfa_privileged(uuid) IS
  'True when the user is a platform admin or an active owner/admin of a team organization.';

CREATE OR REPLACE FUNCTION private.compute_mfa_required(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.user_is_mfa_privileged(p_user_id);
$$;

COMMENT ON FUNCTION private.compute_mfa_required(uuid) IS
  'MFA is required for platform admins and team owners/admins only. Never reads user metadata or Auth MFA secrets.';

COMMENT ON FUNCTION public.user_requires_mfa(uuid) IS
  'Whether the user must complete MFA before application features (platform admins and team owners/admins).';

CREATE OR REPLACE FUNCTION private.organizations_refresh_mfa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  FOR v_user_id IN
    SELECT m.user_id
    FROM public.organization_memberships m
    WHERE m.organization_id = NEW.id
  LOOP
    PERFORM private.refresh_user_mfa_requirement(v_user_id);
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.organizations_refresh_mfa() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER organizations_refresh_mfa
  AFTER UPDATE OF account_type ON public.organizations
  FOR EACH ROW
  WHEN (OLD.account_type IS DISTINCT FROM NEW.account_type)
  EXECUTE FUNCTION private.organizations_refresh_mfa();

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_full_name text;
  v_org_name text;
  v_account_type text;
  v_org_id uuid;
  v_skip boolean;
BEGIN
  v_full_name := nullif(trim(COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    ''
  )), '');
  v_org_name := nullif(trim(COALESCE(
    NEW.raw_user_meta_data->>'organization_name',
    NEW.raw_user_meta_data->>'org_name',
    ''
  )), '');

  v_account_type := private.sanitize_account_type(NEW.raw_user_meta_data->>'account_type');
  v_skip := lower(COALESCE(NEW.raw_user_meta_data->>'skip_workspace', '')) IN ('true', '1', 'yes')
    OR EXISTS (
      SELECT 1
      FROM public.organization_invitations i
      WHERE lower(trim(i.email)) = lower(trim(NEW.email))
        AND i.status = 'pending'
        AND i.expires_at > now()
    );

  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, v_full_name);

  INSERT INTO public.user_security_settings (user_id, mfa_required, mfa_required_since)
  VALUES (NEW.id, false, NULL);

  IF v_skip THEN
    RETURN NEW;
  END IF;

  IF v_org_name IS NULL THEN
    IF v_account_type = 'team' THEN
      v_org_name := COALESCE(v_full_name || '''s Team', 'Team Account');
    ELSE
      v_org_name := COALESCE(v_full_name, 'Personal Account');
    END IF;
  END IF;

  INSERT INTO public.organizations (name, account_type, created_by)
  VALUES (v_org_name, v_account_type, NEW.id)
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_memberships (
    organization_id,
    user_id,
    role,
    status
  ) VALUES (
    v_org_id,
    NEW.id,
    'owner',
    'active'
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.handle_new_user() IS
  'On auth signup (password or OAuth): profile + security settings. Creates an owner workspace unless skip_workspace is set or a pending invitation exists for the email.';

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  FOR v_user_id IN
    SELECT user_id FROM public.user_security_settings
    UNION
    SELECT user_id FROM public.organization_memberships
    UNION
    SELECT user_id FROM public.platform_admins
  LOOP
    PERFORM private.refresh_user_mfa_requirement(v_user_id);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.organization_memberships m
    JOIN public.organizations o ON o.id = m.organization_id
    LEFT JOIN public.user_security_settings s ON s.user_id = m.user_id
    WHERE m.status = 'active'
      AND m.role IN ('owner', 'admin')
      AND o.account_type = 'team'
      AND COALESCE(s.mfa_required, false) = false
  ) THEN
    RAISE EXCEPTION 'MFA backfill failed for one or more team owners/admins';
  END IF;
END;
$$;
