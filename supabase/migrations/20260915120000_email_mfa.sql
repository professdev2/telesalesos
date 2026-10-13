-- Milestone B: Email OTP as a second factor for Agents (members) only.
-- Codes are stored hashed. Privileged users (owner/admin/platform admin on
-- any active membership) cannot issue or satisfy this path.

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
        WHERE m.user_id = p_user_id
          AND m.status = 'active'
          AND m.role IN ('owner', 'admin')
      )
    );
$$;

COMMENT ON FUNCTION private.user_is_mfa_privileged(uuid) IS
  'True when the user is a platform admin or an active owner/admin of any organization.';

REVOKE ALL ON FUNCTION private.user_is_mfa_privileged(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.user_is_mfa_privileged(uuid) TO service_role;

CREATE TABLE private.email_mfa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CONSTRAINT email_mfa_challenges_hash_sha256
    CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT email_mfa_challenges_attempts_nonneg
    CHECK (attempts >= 0)
);

COMMENT ON TABLE private.email_mfa_challenges IS
  'Short-lived hashed Email OTP challenges. Not client-writable.';

CREATE INDEX email_mfa_challenges_user_open_idx
  ON private.email_mfa_challenges (user_id, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE TABLE private.email_mfa_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  marker_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT email_mfa_sessions_hash_sha256
    CHECK (marker_hash ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE private.email_mfa_sessions IS
  'Email OTP satisfied for this browser marker until expiry. Hash only.';

CREATE UNIQUE INDEX email_mfa_sessions_marker_key
  ON private.email_mfa_sessions (marker_hash);

CREATE INDEX email_mfa_sessions_user_idx
  ON private.email_mfa_sessions (user_id, expires_at);

ALTER TABLE public.security_audit_logs
  DROP CONSTRAINT security_audit_logs_action_check;

ALTER TABLE public.security_audit_logs
  ADD CONSTRAINT security_audit_logs_action_check
  CHECK (action IN (
    'mfa.enrolled',
    'mfa.removed',
    'mfa.recovery',
    'mfa.email_challenge',
    'mfa.email_verified',
    'session.sign_out_all_devices',
    'session.suspicious_review',
    'device.trusted',
    'device.revoked'
  ));

ALTER TABLE public.security_audit_logs
  DROP CONSTRAINT security_audit_logs_metadata_no_secrets;

ALTER TABLE public.security_audit_logs
  ADD CONSTRAINT security_audit_logs_metadata_no_secrets
  CHECK (
    NOT (metadata ? 'totp_secret')
    AND NOT (metadata ? 'secret')
    AND NOT (metadata ? 'factor_secret')
    AND NOT (metadata ? 'sms_code')
    AND NOT (metadata ? 'phone_otp')
    AND NOT (metadata ? 'token')
    AND NOT (metadata ? 'cookie')
    AND NOT (metadata ? 'token_hash')
    AND NOT (metadata ? 'device_token')
    AND NOT (metadata ? 'otp')
    AND NOT (metadata ? 'code')
    AND NOT (metadata ? 'code_hash')
  );

CREATE OR REPLACE FUNCTION private.write_security_audit_log(
  p_user_id uuid,
  p_action text,
  p_actor_user_id uuid DEFAULT auth.uid(),
  p_organization_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  IF p_user_id IS NULL OR nullif(trim(COALESCE(p_action, '')), '') IS NULL THEN
    RAISE EXCEPTION 'user_id and action are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_action NOT IN (
    'mfa.enrolled',
    'mfa.removed',
    'mfa.recovery',
    'mfa.email_challenge',
    'mfa.email_verified',
    'session.sign_out_all_devices',
    'session.suspicious_review',
    'device.trusted',
    'device.revoked'
  ) THEN
    RAISE EXCEPTION 'Unsupported security audit action'
      USING ERRCODE = '22023';
  END IF;

  v_metadata := v_metadata
    - 'totp_secret'
    - 'secret'
    - 'factor_secret'
    - 'sms_code'
    - 'phone_otp'
    - 'recovery_codes'
    - 'token'
    - 'cookie'
    - 'token_hash'
    - 'device_token'
    - 'otp'
    - 'code'
    - 'code_hash';

  INSERT INTO public.security_audit_logs (
    user_id,
    actor_user_id,
    action,
    organization_id,
    metadata
  ) VALUES (
    p_user_id,
    p_actor_user_id,
    p_action,
    p_organization_id,
    v_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_is_mfa_privileged()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.user_is_mfa_privileged(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.request_email_mfa_challenge(p_code_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_recent timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF private.user_is_mfa_privileged(v_user_id) THEN
    RAISE EXCEPTION 'Email verification is not available for this account'
      USING ERRCODE = '42501';
  END IF;

  IF p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid challenge'
      USING ERRCODE = '22023';
  END IF;

  SELECT created_at INTO v_recent
  FROM private.email_mfa_challenges
  WHERE user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_recent IS NOT NULL AND v_recent > now() - interval '60 seconds' THEN
    RAISE EXCEPTION 'Wait before requesting another code'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE private.email_mfa_challenges
  SET consumed_at = now()
  WHERE user_id = v_user_id
    AND consumed_at IS NULL;

  INSERT INTO private.email_mfa_challenges (
    user_id,
    code_hash,
    expires_at
  ) VALUES (
    v_user_id,
    p_code_hash,
    now() + interval '10 minutes'
  );

  PERFORM private.write_security_audit_log(
    v_user_id,
    'mfa.email_challenge',
    v_user_id,
    NULL,
    '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_email_mfa_challenge(p_code_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row private.email_mfa_challenges%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF private.user_is_mfa_privileged(v_user_id) THEN
    RETURN false;
  END IF;

  IF p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  SELECT * INTO v_row
  FROM private.email_mfa_challenges
  WHERE user_id = v_user_id
    AND consumed_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_row.attempts >= 5 THEN
    UPDATE private.email_mfa_challenges
    SET consumed_at = now()
    WHERE id = v_row.id;
    RETURN false;
  END IF;

  IF v_row.code_hash IS DISTINCT FROM p_code_hash THEN
    UPDATE private.email_mfa_challenges
    SET attempts = attempts + 1
    WHERE id = v_row.id;
    RETURN false;
  END IF;

  UPDATE private.email_mfa_challenges
  SET consumed_at = now(),
      attempts = attempts + 1
  WHERE id = v_row.id;

  PERFORM private.write_security_audit_log(
    v_user_id,
    'mfa.email_verified',
    v_user_id,
    NULL,
    '{}'::jsonb
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_email_mfa_session(p_marker_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF private.user_is_mfa_privileged(v_user_id) THEN
    RAISE EXCEPTION 'Email verification is not available for this account'
      USING ERRCODE = '42501';
  END IF;

  IF p_marker_hash IS NULL OR p_marker_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid session marker'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM private.email_mfa_sessions
  WHERE user_id = v_user_id
     OR marker_hash = p_marker_hash
     OR expires_at <= now();

  INSERT INTO private.email_mfa_sessions (
    user_id,
    marker_hash,
    expires_at
  ) VALUES (
    v_user_id,
    p_marker_hash,
    now() + interval '12 hours'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_email_mfa_session(p_marker_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ok boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF private.user_is_mfa_privileged(v_user_id) THEN
    RETURN false;
  END IF;

  IF p_marker_hash IS NULL OR p_marker_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  SELECT true INTO v_ok
  FROM private.email_mfa_sessions
  WHERE user_id = v_user_id
    AND marker_hash = p_marker_hash
    AND expires_at > now()
  LIMIT 1;

  RETURN COALESCE(v_ok, false);
END;
$$;

-- Invitee signup: profile only. They join the team via accept, not as last-owner
-- of a personal workspace (which would make Email OTP unavailable).
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
  v_full_name := nullif(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '');
  v_org_name := nullif(trim(COALESCE(
    NEW.raw_user_meta_data->>'organization_name',
    NEW.raw_user_meta_data->>'org_name',
    ''
  )), '');

  v_account_type := private.sanitize_account_type(NEW.raw_user_meta_data->>'account_type');
  v_skip := lower(COALESCE(NEW.raw_user_meta_data->>'skip_workspace', '')) IN ('true', '1', 'yes');

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
  'On auth signup: profile + security settings. Creates an owner workspace unless skip_workspace is set (invitee signup).';

REVOKE ALL ON FUNCTION public.user_is_mfa_privileged() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_email_mfa_challenge(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_email_mfa_challenge(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_email_mfa_session(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_email_mfa_session(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.user_is_mfa_privileged() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_email_mfa_challenge(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_email_mfa_challenge(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_email_mfa_session(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_email_mfa_session(text) TO authenticated, service_role;
