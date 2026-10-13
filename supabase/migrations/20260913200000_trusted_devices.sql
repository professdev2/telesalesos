-- Milestone C: server-side trusted devices (30 days).
-- The cookie secret never lands in this table — only a SHA-256 hex hash.

CREATE TABLE private.trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  label text NOT NULL DEFAULT 'This browser',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT trusted_devices_token_hash_sha256
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT trusted_devices_label_len
    CHECK (char_length(label) BETWEEN 1 AND 80)
);

COMMENT ON TABLE private.trusted_devices IS
  'Revocable 30-day device trust. Cookie compared by hash only; not client-writable.';

CREATE UNIQUE INDEX trusted_devices_token_hash_key
  ON private.trusted_devices (token_hash);

CREATE INDEX trusted_devices_user_active_idx
  ON private.trusted_devices (user_id, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.security_audit_logs
  DROP CONSTRAINT security_audit_logs_action_check;

ALTER TABLE public.security_audit_logs
  ADD CONSTRAINT security_audit_logs_action_check
  CHECK (action IN (
    'mfa.enrolled',
    'mfa.removed',
    'mfa.recovery',
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
    - 'device_token';

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

CREATE OR REPLACE FUNCTION public.issue_trusted_device(
  p_token_hash text,
  p_label text DEFAULT 'This browser'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_label text := left(btrim(COALESCE(p_label, 'This browser')), 80);
  v_oldest uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid device token hash'
      USING ERRCODE = '22023';
  END IF;

  IF char_length(v_label) = 0 THEN
    v_label := 'This browser';
  END IF;

  LOOP
    EXIT WHEN (
      SELECT count(*)
      FROM private.trusted_devices
      WHERE user_id = v_user_id
        AND revoked_at IS NULL
        AND expires_at > now()
    ) < 10;

    SELECT id INTO v_oldest
    FROM private.trusted_devices
    WHERE user_id = v_user_id
      AND revoked_at IS NULL
      AND expires_at > now()
    ORDER BY last_used_at ASC
    LIMIT 1;

    EXIT WHEN v_oldest IS NULL;

    UPDATE private.trusted_devices
    SET revoked_at = now()
    WHERE id = v_oldest
      AND user_id = v_user_id
      AND revoked_at IS NULL;
  END LOOP;

  INSERT INTO private.trusted_devices (
    user_id,
    token_hash,
    label,
    expires_at
  ) VALUES (
    v_user_id,
    p_token_hash,
    v_label,
    now() + interval '30 days'
  )
  RETURNING id INTO v_id;

  PERFORM private.write_security_audit_log(
    v_user_id,
    'device.trusted',
    v_user_id,
    NULL,
    jsonb_build_object('label', v_label)
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_trusted_device(p_token_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  UPDATE private.trusted_devices
  SET last_used_at = now()
  WHERE user_id = v_user_id
    AND token_hash = p_token_hash
    AND revoked_at IS NULL
    AND expires_at > now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_trusted_devices()
RETURNS TABLE (
  id uuid,
  label text,
  created_at timestamptz,
  last_used_at timestamptz,
  expires_at timestamptz,
  is_current boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.label,
    d.created_at,
    d.last_used_at,
    d.expires_at,
    false AS is_current
  FROM private.trusted_devices d
  WHERE d.user_id = v_user_id
    AND d.revoked_at IS NULL
    AND d.expires_at > now()
  ORDER BY d.last_used_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_trusted_device(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  UPDATE private.trusted_devices
  SET revoked_at = now()
  WHERE id = p_id
    AND user_id = v_user_id
    AND revoked_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    PERFORM private.write_security_audit_log(
      v_user_id,
      'device.revoked',
      v_user_id,
      NULL,
      jsonb_build_object('reason', 'user', 'count', 1)
    );
  END IF;

  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_all_trusted_devices(
  p_reason text DEFAULT 'user'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_updated integer;
  v_reason text := left(btrim(COALESCE(p_reason, 'user')), 40);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  UPDATE private.trusted_devices
  SET revoked_at = now()
  WHERE user_id = v_user_id
    AND revoked_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    PERFORM private.write_security_audit_log(
      v_user_id,
      CASE
        WHEN v_reason = 'user' THEN 'session.sign_out_all_devices'
        ELSE 'device.revoked'
      END,
      v_user_id,
      NULL,
      jsonb_build_object('reason', v_reason, 'count', v_updated)
    );
  END IF;

  IF v_reason = 'user' THEN
    UPDATE public.user_security_settings
    SET last_sign_out_all_at = now(),
        updated_at = now()
    WHERE user_id = v_user_id;
  END IF;

  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.issue_trusted_device(text, text) IS
  'Stores a hash of a new device cookie for the current user. Secret stays in the cookie.';
COMMENT ON FUNCTION public.touch_trusted_device(text) IS
  'Returns true when the current session has a valid, unexpired, unrevoked device hash.';
COMMENT ON FUNCTION public.list_trusted_devices() IS
  'Active trusted devices for the current user. No hashes returned.';
COMMENT ON FUNCTION public.revoke_trusted_device(uuid) IS
  'Revokes one of the current user''s devices by id.';
COMMENT ON FUNCTION public.revoke_all_trusted_devices(text) IS
  'Revokes every active trusted device for the current user.';

REVOKE ALL ON FUNCTION public.issue_trusted_device(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_trusted_device(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_trusted_devices() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_trusted_device(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_all_trusted_devices(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.issue_trusted_device(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_trusted_device(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_trusted_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_trusted_device(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_all_trusted_devices(text) TO authenticated;
