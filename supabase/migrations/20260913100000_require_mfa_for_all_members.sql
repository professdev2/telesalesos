-- Require MFA for every user with an active organization membership.
--
-- Factors remain in Supabase Auth. This function only derives whether the
-- application must enforce MFA. Tenant isolation continues to depend on
-- organization membership and RLS, never on Auth AAL.

CREATE OR REPLACE FUNCTION private.compute_mfa_required(p_user_id uuid)
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
        WHERE m.user_id = p_user_id
          AND m.status = 'active'
      )
    );
$$;

COMMENT ON FUNCTION private.compute_mfa_required(uuid) IS
  'True when a user has an active organization membership or is a platform admin. Never reads user metadata or Auth MFA secrets.';

COMMENT ON FUNCTION public.user_requires_mfa(uuid) IS
  'Whether the user must complete MFA before application features (all active organization members and platform admins).';

-- Refresh existing rows immediately. Membership/platform-admin triggers keep
-- the value current after this migration.
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
    LEFT JOIN public.user_security_settings s ON s.user_id = m.user_id
    WHERE m.status = 'active'
      AND COALESCE(s.mfa_required, false) = false
  ) THEN
    RAISE EXCEPTION 'MFA backfill failed for one or more active members';
  END IF;
END;
$$;
