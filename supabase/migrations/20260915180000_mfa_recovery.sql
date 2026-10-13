-- Milestone D: lost-authenticator recovery clears Email OTP state for the
-- caller. TOTP factors are removed through the Auth admin API, not SQL.

CREATE OR REPLACE FUNCTION public.clear_email_mfa_state()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM private.email_mfa_sessions
  WHERE user_id = v_user_id;

  DELETE FROM private.email_mfa_challenges
  WHERE user_id = v_user_id;
END;
$$;

COMMENT ON FUNCTION public.clear_email_mfa_state() IS
  'Drops Email OTP challenges and session markers for the current user.';

REVOKE ALL ON FUNCTION public.clear_email_mfa_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_email_mfa_state() TO authenticated, service_role;
