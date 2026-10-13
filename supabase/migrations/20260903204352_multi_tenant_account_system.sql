-- =============================================================================
-- QuoteCoach: multi-tenant account system (organizations-first)
--
-- Architecture:
--   Every account is an organization. An individual account is an organization
--   with one member; a team account is an organization with multiple members.
--
-- Security notes (high level):
--   - RLS is enabled (and forced) on every public table in this migration.
--   - Membership checks use SECURITY DEFINER helpers in schema "private" so
--     policies on organization_memberships do not recurse into themselves.
--   - Signup / create_organization trust only safe display fields (name,
--     account_type). Roles, platform-admin status, seat limits, billing, and
--     permissions are NEVER taken from user metadata.
--   - Invitation tokens are stored only as token_hash (never raw tokens).
--   - platform_admins has no authenticated INSERT/UPDATE/DELETE policies;
--     verified platform admins may SELECT tenant data for the ops portal, but
--     cannot grant platform-admin access through ordinary client operations.
--   - audit_logs are append-only for clients: no authenticated INSERT/UPDATE/
--     DELETE. Rows are written only by private SECURITY DEFINER audit helpers
--     invoked from membership/invitation triggers (and trusted RPCs).
--   - Organizations are not creatable via direct INSERT; use signup trigger or
--     public.create_organization().
--   - account_type is immutable via direct UPDATE. Individual → team only through
--     public.convert_organization_to_team() (owner-only). No team → individual.
--   - Individual orgs may have only one membership and no invitations; team is
--     required before invitations or additional members.
--   - Internal trigger functions live in schema private (not PostgREST RPCs).
--     EXECUTE is revoked from PUBLIC/anon; grants are limited to the roles that
--     must fire them (authenticated for table DML, supabase_auth_admin for
--     signup, service_role/postgres for privileged paths).
--   - Credential-sharing controls: user_security_settings tracks whether MFA is
--     required from role (org owner/admin or platform admin). TOTP/SMS secrets
--     are NEVER stored here — Supabase Auth owns MFA factors. SMS MFA and
--     device fingerprinting are out of scope for this migration.
--   - security_audit_logs records MFA enroll/remove/recovery, sign-out-all-
--     devices, and suspicious-session review events via controlled RPCs only.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Private schema for SECURITY DEFINER helpers (avoids RLS recursion)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;

COMMENT ON SCHEMA private IS
  'Internal helpers for RLS and triggers. Not for direct client table access.';

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

-- USAGE for roles that invoke private helpers/triggers. private is not an
-- exposed PostgREST schema, so these are not application RPCs.
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT USAGE ON SCHEMA private TO supabase_auth_admin;
GRANT USAGE ON SCHEMA private TO postgres;

-- ---------------------------------------------------------------------------
-- updated_at helper (trigger only — not an application RPC)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION private.set_updated_at() FROM authenticated;
-- PostgreSQL checks EXECUTE for the role issuing DML that fires the trigger.
GRANT EXECUTE ON FUNCTION private.set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION private.set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION private.set_updated_at() TO postgres;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'App profile row keyed 1:1 to auth.users. Users may view/update only their own row (platform admins may read).';

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  account_type text NOT NULL
    CONSTRAINT organizations_account_type_check
      CHECK (account_type IN ('individual', 'team')),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_name_nonempty CHECK (length(trim(name)) > 0)
);

COMMENT ON TABLE public.organizations IS
  'Tenant root. Direct client INSERT denied; use signup or create_organization(). account_type changes only via convert_organization_to_team().';

COMMENT ON COLUMN public.organizations.account_type IS
  'individual = single-member org; team = multi-member org. Never derived from privilege metadata.';

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE INDEX organizations_created_by_idx
  ON public.organizations (created_by);

CREATE INDEX organizations_account_type_idx
  ON public.organizations (account_type);

CREATE TABLE public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL
    CONSTRAINT organization_memberships_role_check
      CHECK (role IN ('owner', 'admin', 'member')),
  status text NOT NULL DEFAULT 'active'
    CONSTRAINT organization_memberships_status_check
      CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_memberships_org_user_key UNIQUE (organization_id, user_id)
);

COMMENT ON TABLE public.organization_memberships IS
  'Links users to organizations. Suspended members must not access org data via RLS.';

CREATE TRIGGER organization_memberships_set_updated_at
  BEFORE UPDATE ON public.organization_memberships
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE INDEX organization_memberships_user_id_idx
  ON public.organization_memberships (user_id);

CREATE INDEX organization_memberships_org_id_idx
  ON public.organization_memberships (organization_id);

CREATE INDEX organization_memberships_org_status_idx
  ON public.organization_memberships (organization_id, status);

CREATE INDEX organization_memberships_user_status_idx
  ON public.organization_memberships (user_id, status);

CREATE TABLE public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL
    CONSTRAINT organization_invitations_role_check
      CHECK (role IN ('admin', 'member')),
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT organization_invitations_status_check
      CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  invited_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  CONSTRAINT organization_invitations_email_nonempty
    CHECK (length(trim(email)) > 0),
  CONSTRAINT organization_invitations_token_hash_nonempty
    CHECK (length(trim(token_hash)) > 0)
);

COMMENT ON TABLE public.organization_invitations IS
  'Team-only invites. token_hash only — raw tokens belong in the email/link, never the DB.';

COMMENT ON COLUMN public.organization_invitations.token_hash IS
  'SHA-256 hex hash of the invitation token. Raw tokens must not be stored.';

COMMENT ON COLUMN public.organization_invitations.role IS
  'Invitees may only be admin or member — never owner via invitation.';

CREATE INDEX organization_invitations_org_id_idx
  ON public.organization_invitations (organization_id);

CREATE INDEX organization_invitations_email_idx
  ON public.organization_invitations (lower(email));

CREATE UNIQUE INDEX organization_invitations_token_hash_key
  ON public.organization_invitations (token_hash);

CREATE INDEX organization_invitations_org_status_idx
  ON public.organization_invitations (organization_id, status);

CREATE UNIQUE INDEX organization_invitations_one_pending_per_email
  ON public.organization_invitations (organization_id, lower(email))
  WHERE status = 'pending';

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL,
  target_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_action_nonempty CHECK (length(trim(action)) > 0)
);

COMMENT ON TABLE public.audit_logs IS
  'Append-oriented org audit trail. Written only by private helpers/triggers; no client INSERT/UPDATE/DELETE.';

CREATE INDEX audit_logs_org_id_idx
  ON public.audit_logs (organization_id);

CREATE INDEX audit_logs_actor_user_id_idx
  ON public.audit_logs (actor_user_id);

CREATE INDEX audit_logs_org_created_at_idx
  ON public.audit_logs (organization_id, created_at DESC);

CREATE INDEX audit_logs_target_user_id_idx
  ON public.audit_logs (target_user_id)
  WHERE target_user_id IS NOT NULL;

CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_admins IS
  'Platform operators. Provision only via service role / trusted SQL — never client metadata or RLS writes.';

-- 7. user_security_settings -------------------------------------------------
-- MFA factor secrets live in Supabase Auth (auth.mfa_factors), not here.
CREATE TABLE public.user_security_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Maintained from roles: active org owner/admin OR platform admin => true.
  mfa_required boolean NOT NULL DEFAULT false,
  mfa_required_since timestamptz,
  last_sign_out_all_at timestamptz,
  last_suspicious_session_review_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_security_settings IS
  'Per-user security posture for credential-sharing controls. Does NOT store TOTP secrets, SMS factors, or device fingerprints — Supabase Auth manages MFA factors.';

COMMENT ON COLUMN public.user_security_settings.mfa_required IS
  'True when the user must enroll/verify MFA before administrative features (org owner, org admin, or platform admin). Derived from roles, not user metadata.';

CREATE TRIGGER user_security_settings_set_updated_at
  BEFORE UPDATE ON public.user_security_settings
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE INDEX user_security_settings_mfa_required_idx
  ON public.user_security_settings (mfa_required)
  WHERE mfa_required = true;

-- 8. security_audit_logs ----------------------------------------------------
CREATE TABLE public.security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL
    CONSTRAINT security_audit_logs_action_check
      CHECK (action IN (
        'mfa.enrolled',
        'mfa.removed',
        'mfa.recovery',
        'session.sign_out_all_devices',
        'session.suspicious_review'
      )),
  organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_audit_logs_metadata_no_secrets
    CHECK (
      NOT (metadata ? 'totp_secret')
      AND NOT (metadata ? 'secret')
      AND NOT (metadata ? 'factor_secret')
      AND NOT (metadata ? 'sms_code')
      AND NOT (metadata ? 'phone_otp')
    )
);

COMMENT ON TABLE public.security_audit_logs IS
  'User-centric security events (MFA + session controls). Written only via private helpers / controlled RPCs. No TOTP secrets in metadata.';

CREATE INDEX security_audit_logs_user_id_idx
  ON public.security_audit_logs (user_id);

CREATE INDEX security_audit_logs_actor_user_id_idx
  ON public.security_audit_logs (actor_user_id);

CREATE INDEX security_audit_logs_user_created_at_idx
  ON public.security_audit_logs (user_id, created_at DESC);

CREATE INDEX security_audit_logs_action_idx
  ON public.security_audit_logs (action);

CREATE INDEX security_audit_logs_organization_id_idx
  ON public.security_audit_logs (organization_id)
  WHERE organization_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS / security helpers (SECURITY DEFINER, fixed search_path)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.is_active_member(
  p_organization_id uuid,
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
    WHERE m.organization_id = p_organization_id
      AND m.user_id = p_user_id
      AND m.status = 'active'
  );
$$;

COMMENT ON FUNCTION private.is_active_member(uuid, uuid) IS
  'True when the user has an active membership. SECURITY DEFINER avoids RLS recursion.';

CREATE OR REPLACE FUNCTION private.has_org_role(
  p_organization_id uuid,
  p_roles text[],
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
    WHERE m.organization_id = p_organization_id
      AND m.user_id = p_user_id
      AND m.status = 'active'
      AND m.role = ANY (p_roles)
  );
$$;

COMMENT ON FUNCTION private.has_org_role(uuid, text[], uuid) IS
  'True when the user is an active member with one of the given roles.';

-- Platform-admin status is derived ONLY from public.platform_admins.
-- Never read auth.users metadata for this check.
CREATE OR REPLACE FUNCTION private.is_platform_admin(
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
    FROM public.platform_admins pa
    WHERE pa.user_id = p_user_id
  );
$$;

COMMENT ON FUNCTION private.is_platform_admin(uuid) IS
  'True only when user_id exists in platform_admins. Never derived from user metadata.';

CREATE OR REPLACE FUNCTION private.is_team_organization(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = p_organization_id
      AND o.account_type = 'team'
  );
$$;

CREATE OR REPLACE FUNCTION private.active_owner_count(
  p_organization_id uuid,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer
  FROM public.organization_memberships m
  WHERE m.organization_id = p_organization_id
    AND m.role = 'owner'
    AND m.status = 'active'
    AND (p_exclude_user_id IS NULL OR m.user_id <> p_exclude_user_id);
$$;

CREATE OR REPLACE FUNCTION private.hash_invitation_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION private.sanitize_account_type(p_account_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN lower(nullif(trim(COALESCE(p_account_type, '')), '')) IN ('individual', 'team')
      THEN lower(trim(p_account_type))
    ELSE 'individual'
  END;
$$;

CREATE OR REPLACE FUNCTION private.write_audit_log(
  p_organization_id uuid,
  p_action text,
  p_actor_user_id uuid DEFAULT auth.uid(),
  p_target_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_organization_id IS NULL OR nullif(trim(p_action), '') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    target_user_id,
    metadata
  ) VALUES (
    p_organization_id,
    p_actor_user_id,
    trim(p_action),
    p_target_user_id,
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION private.write_audit_log(uuid, text, uuid, uuid, jsonb) IS
  'Trusted audit writer. Not granted to authenticated — called only from triggers/RPCs.';

-- MFA requirement is role-derived. Factors themselves stay in Supabase Auth.
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
          AND m.role IN ('owner', 'admin')
      )
    );
$$;

COMMENT ON FUNCTION private.compute_mfa_required(uuid) IS
  'True when user is an active org owner/admin or a platform admin. Never reads user metadata or Auth MFA secrets.';

CREATE OR REPLACE FUNCTION private.refresh_user_mfa_requirement(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_required boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  v_required := private.compute_mfa_required(p_user_id);

  INSERT INTO public.user_security_settings (user_id, mfa_required, mfa_required_since)
  VALUES (
    p_user_id,
    v_required,
    CASE WHEN v_required THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    mfa_required = EXCLUDED.mfa_required,
    mfa_required_since = CASE
      WHEN public.user_security_settings.mfa_required IS DISTINCT FROM EXCLUDED.mfa_required
        AND EXCLUDED.mfa_required = true
        THEN now()
      WHEN EXCLUDED.mfa_required = false
        THEN NULL
      ELSE public.user_security_settings.mfa_required_since
    END,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION private.ensure_user_security_settings(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_security_settings (user_id, mfa_required, mfa_required_since)
  VALUES (p_user_id, false, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM private.refresh_user_mfa_requirement(p_user_id);
END;
$$;

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
    'session.suspicious_review'
  ) THEN
    RAISE EXCEPTION 'Unsupported security audit action'
      USING ERRCODE = '22023';
  END IF;

  -- Defense in depth: never persist MFA secrets even if a caller tries.
  v_metadata := v_metadata
    - 'totp_secret'
    - 'secret'
    - 'factor_secret'
    - 'sms_code'
    - 'phone_otp'
    - 'recovery_codes';

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

COMMENT ON FUNCTION private.write_security_audit_log(uuid, text, uuid, uuid, jsonb) IS
  'Trusted writer for MFA/session security events. Strips secret-like metadata keys.';

CREATE OR REPLACE FUNCTION private.trg_refresh_mfa_from_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM private.refresh_user_mfa_requirement(NEW.user_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM private.refresh_user_mfa_requirement(NEW.user_id);
    IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      PERFORM private.refresh_user_mfa_requirement(OLD.user_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM private.refresh_user_mfa_requirement(OLD.user_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_refresh_mfa_from_platform_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM private.refresh_user_mfa_requirement(NEW.user_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM private.refresh_user_mfa_requirement(OLD.user_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.is_active_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_org_role(uuid, text[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_platform_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_team_organization(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.active_owner_count(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.hash_invitation_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sanitize_account_type(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.write_audit_log(uuid, text, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.compute_mfa_required(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.refresh_user_mfa_requirement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.ensure_user_security_settings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.write_security_audit_log(uuid, text, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.trg_refresh_mfa_from_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.trg_refresh_mfa_from_platform_admin() FROM PUBLIC;

REVOKE ALL ON FUNCTION private.is_active_member(uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.has_org_role(uuid, text[], uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.is_platform_admin(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.is_team_organization(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.active_owner_count(uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.hash_invitation_token(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.sanitize_account_type(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.write_audit_log(uuid, text, uuid, uuid, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.compute_mfa_required(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.refresh_user_mfa_requirement(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.ensure_user_security_settings(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.write_security_audit_log(uuid, text, uuid, uuid, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.trg_refresh_mfa_from_membership() FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.trg_refresh_mfa_from_platform_admin() FROM anon, authenticated;

-- RLS policy helpers: authenticated needs EXECUTE so policies can evaluate.
GRANT EXECUTE ON FUNCTION private.is_active_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_org_role(uuid, text[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_platform_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_team_organization(uuid) TO authenticated, service_role;

-- Internal-only helpers (SECURITY DEFINER callers / service_role).
GRANT EXECUTE ON FUNCTION private.active_owner_count(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.hash_invitation_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION private.sanitize_account_type(text) TO service_role;
GRANT EXECUTE ON FUNCTION private.write_audit_log(uuid, text, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION private.compute_mfa_required(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.refresh_user_mfa_requirement(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.ensure_user_security_settings(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.write_security_audit_log(uuid, text, uuid, uuid, jsonb) TO service_role;

-- MFA refresh triggers: grants applied with other trigger functions below.
-- (Declarations exist here; EXECUTE grants are consolidated after trigger creation.)


-- ---------------------------------------------------------------------------
-- Membership enforcement (self-owner actions + last active owner)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.enforce_membership_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_allow_self_demote text := current_setting('quotecoach.allow_owner_self_demote', true);
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'organization_id and user_id cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  -- Owners cannot demote or suspend themselves via direct table operations.
  -- Ownership transfer RPC may set quotecoach.allow_owner_self_demote=on (txn-local).
  IF v_actor IS NOT NULL
     AND OLD.user_id = v_actor
     AND OLD.role = 'owner'
     AND (
       NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
     )
  THEN
    IF v_allow_self_demote IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Owners cannot demote or suspend themselves'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Non-owners still cannot change their own role/status via direct updates.
  IF v_actor IS NOT NULL
     AND NEW.user_id = v_actor
     AND (
       NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
     )
     AND v_allow_self_demote IS DISTINCT FROM 'on'
  THEN
    RAISE EXCEPTION 'Members cannot change their own role or status'
      USING ERRCODE = '42501';
  END IF;

  -- Only owners may modify another owner's membership.
  IF OLD.role = 'owner'
     AND v_actor IS NOT NULL
     AND OLD.user_id IS DISTINCT FROM v_actor
     AND NOT private.has_org_role(OLD.organization_id, ARRAY['owner']::text[], v_actor)
  THEN
    RAISE EXCEPTION 'Only owners may modify an owner membership'
      USING ERRCODE = '42501';
  END IF;

  -- Only owners may promote another member to owner.
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NEW.role = 'owner'
     AND v_actor IS NOT NULL
     AND NOT private.has_org_role(OLD.organization_id, ARRAY['owner']::text[], v_actor)
  THEN
    RAISE EXCEPTION 'Only owners may promote another member to owner'
      USING ERRCODE = '42501';
  END IF;

  -- Prevent demoting/suspending the last active owner.
  IF OLD.role = 'owner'
     AND OLD.status = 'active'
     AND (NEW.role IS DISTINCT FROM 'owner' OR NEW.status IS DISTINCT FROM 'active')
     AND private.active_owner_count(OLD.organization_id, OLD.user_id) = 0
  THEN
    RAISE EXCEPTION 'Cannot demote or suspend the last active owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.enforce_membership_role_changes() IS
  'Blocks owner self demote/suspend (unless transfer GUC), last-owner loss, and illegal promotions.';

CREATE TRIGGER organization_memberships_enforce_role_changes
  BEFORE UPDATE ON public.organization_memberships
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_membership_role_changes();

CREATE OR REPLACE FUNCTION private.enforce_membership_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  -- Owners cannot remove themselves via direct table operations.
  IF v_actor IS NOT NULL
     AND OLD.user_id = v_actor
     AND OLD.role = 'owner'
  THEN
    RAISE EXCEPTION 'Owners cannot remove themselves'
      USING ERRCODE = '42501';
  END IF;

  -- Prevent removing the last active owner (any actor).
  IF OLD.role = 'owner'
     AND OLD.status = 'active'
     AND private.active_owner_count(OLD.organization_id, OLD.user_id) = 0
  THEN
    RAISE EXCEPTION 'Cannot remove the last active owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER organization_memberships_enforce_delete
  BEFORE DELETE ON public.organization_memberships
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_membership_delete();

CREATE OR REPLACE FUNCTION private.enforce_membership_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Serialize membership creation per organization (closes individual-org races).
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.organization_id::text, 0)
  );

  -- Individual orgs may only ever have a single membership row.
  -- Additional members require convert_organization_to_team() first.
  IF NOT private.is_team_organization(NEW.organization_id) THEN
    IF EXISTS (
      SELECT 1
      FROM public.organization_memberships m
      WHERE m.organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION
        'Individual organizations may only have one member; convert to a team first'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.enforce_membership_insert() IS
  'Blocks a second membership on individual organizations.';

CREATE TRIGGER organization_memberships_enforce_insert
  BEFORE INSERT ON public.organization_memberships
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_membership_insert();

-- ---------------------------------------------------------------------------
-- Organization / invitation immutability + team-only invites
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.enforce_organization_immutables()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_allow_account_type text :=
    current_setting('quotecoach.allow_account_type_change', true);
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'created_by cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'id cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
    IF v_allow_account_type IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION
        'account_type cannot be changed directly; use convert_organization_to_team()'
        USING ERRCODE = '42501';
    END IF;

    -- Even with the conversion GUC, only individual → team is permitted.
    IF NOT (
      OLD.account_type = 'individual'
      AND NEW.account_type = 'team'
    ) THEN
      RAISE EXCEPTION 'Only individual-to-team conversion is allowed'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.enforce_organization_immutables() IS
  'Locks id/created_by/created_at/account_type. account_type may change only via convert RPC GUC (individual→team).';

CREATE TRIGGER organizations_enforce_immutables
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_organization_immutables();

CREATE OR REPLACE FUNCTION private.enforce_invitation_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_team_organization(NEW.organization_id) THEN
    RAISE EXCEPTION 'Invitations are only allowed for team organizations'
      USING ERRCODE = '42501';
  END IF;

  NEW.email := lower(trim(NEW.email));

  IF NEW.role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'Invitation role must be admin or member'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'New invitations must start as pending'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_invitations_enforce_insert
  BEFORE INSERT ON public.organization_invitations
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_invitation_insert();

CREATE OR REPLACE FUNCTION private.enforce_invitation_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.token_hash IS DISTINCT FROM OLD.token_hash THEN
    RAISE EXCEPTION 'token_hash cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_invitations_enforce_updates
  BEFORE UPDATE ON public.organization_invitations
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_invitation_updates();

-- ---------------------------------------------------------------------------
-- Audit triggers (membership + invitation changes)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.audit_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM private.write_audit_log(
      NEW.organization_id,
      'membership.created',
      COALESCE(v_actor, NEW.user_id),
      NEW.user_id,
      jsonb_build_object('role', NEW.role, 'status', NEW.status)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM private.write_audit_log(
      NEW.organization_id,
      'membership.updated',
      v_actor,
      NEW.user_id,
      jsonb_build_object(
        'old_role', OLD.role,
        'new_role', NEW.role,
        'old_status', OLD.status,
        'new_status', NEW.status
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM private.write_audit_log(
      OLD.organization_id,
      'membership.deleted',
      v_actor,
      OLD.user_id,
      jsonb_build_object('role', OLD.role, 'status', OLD.status)
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER organization_memberships_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.organization_memberships
  FOR EACH ROW
  EXECUTE FUNCTION private.audit_membership_change();

CREATE TRIGGER organization_memberships_refresh_mfa
  AFTER INSERT OR UPDATE OR DELETE ON public.organization_memberships
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_refresh_mfa_from_membership();

CREATE TRIGGER platform_admins_refresh_mfa
  AFTER INSERT OR DELETE ON public.platform_admins
  FOR EACH ROW
  EXECUTE FUNCTION private.trg_refresh_mfa_from_platform_admin();

CREATE OR REPLACE FUNCTION private.audit_invitation_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM private.write_audit_log(
      NEW.organization_id,
      'invitation.created',
      COALESCE(v_actor, NEW.invited_by),
      NULL,
      jsonb_build_object(
        'email', NEW.email,
        'role', NEW.role,
        'status', NEW.status,
        'invitation_id', NEW.id
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM private.write_audit_log(
      NEW.organization_id,
      'invitation.updated',
      v_actor,
      NULL,
      jsonb_build_object(
        'email', NEW.email,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'role', NEW.role,
        'invitation_id', NEW.id
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM private.write_audit_log(
      OLD.organization_id,
      'invitation.deleted',
      v_actor,
      NULL,
      jsonb_build_object(
        'email', OLD.email,
        'status', OLD.status,
        'invitation_id', OLD.id
      )
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER organization_invitations_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.organization_invitations
  FOR EACH ROW
  EXECUTE FUNCTION private.audit_invitation_change();

-- ---------------------------------------------------------------------------
-- Trigger function EXECUTE grants (not application RPCs — schema private)
-- ---------------------------------------------------------------------------
-- Baseline: revoke from clients. Then grant only what Postgres/Supabase need
-- so authorized DML and auth signup can fire triggers.

REVOKE ALL ON FUNCTION private.enforce_membership_role_changes() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_membership_role_changes() FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.enforce_membership_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_membership_delete() FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.enforce_membership_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_membership_insert() FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.enforce_organization_immutables() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_organization_immutables() FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.enforce_invitation_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_invitation_insert() FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.enforce_invitation_updates() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_invitation_updates() FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.audit_membership_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.audit_membership_change() FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.audit_invitation_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.audit_invitation_change() FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.trg_refresh_mfa_from_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.trg_refresh_mfa_from_membership() FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.trg_refresh_mfa_from_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.trg_refresh_mfa_from_platform_admin() FROM anon, authenticated;

-- Table-DML triggers: invoking role (authenticated) must hold EXECUTE.
GRANT EXECUTE ON FUNCTION private.enforce_membership_role_changes()
  TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.enforce_membership_delete()
  TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.enforce_membership_insert()
  TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.enforce_organization_immutables()
  TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.enforce_invitation_insert()
  TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.enforce_invitation_updates()
  TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.audit_membership_change()
  TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.audit_invitation_change()
  TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.trg_refresh_mfa_from_membership()
  TO authenticated, service_role, postgres;

-- platform_admins is not writable by authenticated (no INSERT/UPDATE/DELETE policies).
GRANT EXECUTE ON FUNCTION private.trg_refresh_mfa_from_platform_admin()
  TO service_role, postgres;
-- ---------------------------------------------------------------------------
-- Signup: auth.users → profile + organization + owner membership
-- ---------------------------------------------------------------------------

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
BEGIN
  -- Safe display fields only. Do NOT read roles, platform_admin, seats, billing,
  -- or permission claims from raw_user_meta_data.
  v_full_name := nullif(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '');
  v_org_name := nullif(trim(COALESCE(
    NEW.raw_user_meta_data->>'organization_name',
    NEW.raw_user_meta_data->>'org_name',
    ''
  )), '');

  v_account_type := private.sanitize_account_type(NEW.raw_user_meta_data->>'account_type');

  IF v_org_name IS NULL THEN
    IF v_account_type = 'team' THEN
      v_org_name := COALESCE(v_full_name || '''s Team', 'Team Account');
    ELSE
      v_org_name := COALESCE(v_full_name, 'Personal Account');
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, v_full_name);

  -- Security settings row before membership so MFA requirement can be refreshed.
  INSERT INTO public.user_security_settings (user_id, mfa_required, mfa_required_since)
  VALUES (NEW.id, false, NULL);

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

  -- MFA requirement is refreshed by organization_memberships_refresh_mfa.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.handle_new_user() IS
  'On auth signup: create profile, org (sanitized account_type), and owner membership.';

REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION private.handle_new_user() FROM authenticated;
-- Auth service inserts into auth.users as supabase_auth_admin.
GRANT EXECUTE ON FUNCTION private.handle_new_user()
  TO supabase_auth_admin, service_role, postgres;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Public RPCs (SECURITY DEFINER, fixed search_path, least privilege)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_organization(
  p_name text,
  p_account_type text DEFAULT 'individual'
)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_account_type text;
  v_name text;
  v_org public.organizations;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  v_name := nullif(trim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Organization name is required'
      USING ERRCODE = '22023';
  END IF;

  v_account_type := private.sanitize_account_type(p_account_type);

  INSERT INTO public.organizations (name, account_type, created_by)
  VALUES (v_name, v_account_type, v_user_id)
  RETURNING * INTO v_org;

  INSERT INTO public.organization_memberships (
    organization_id,
    user_id,
    role,
    status
  ) VALUES (
    v_org.id,
    v_user_id,
    'owner',
    'active'
  );

  RETURN v_org;
END;
$$;

COMMENT ON FUNCTION public.create_organization(text, text) IS
  'Creates an organization and owner membership in one transaction. Direct org INSERT remains denied.';

CREATE OR REPLACE FUNCTION public.convert_organization_to_team(p_organization_id uuid)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org public.organizations;
  v_active_members integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT private.has_org_role(
    p_organization_id,
    ARRAY['owner']::text[],
    v_user_id
  ) THEN
    RAISE EXCEPTION 'Only owners may convert an organization to a team'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_org
    FROM public.organizations o
   WHERE o.id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_org.account_type = 'team' THEN
    RETURN v_org;
  END IF;

  IF v_org.account_type IS DISTINCT FROM 'individual' THEN
    RAISE EXCEPTION 'Unsupported account_type for conversion'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_invitations i
    WHERE i.organization_id = p_organization_id
      AND i.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Individual organizations cannot have pending invitations'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer
    INTO v_active_members
    FROM public.organization_memberships m
   WHERE m.organization_id = p_organization_id
     AND m.status = 'active';

  IF v_active_members > 1 THEN
    RAISE EXCEPTION
      'Individual organizations cannot have multiple active members'
      USING ERRCODE = '42501';
  END IF;

  -- Transaction-local escape hatch for enforce_organization_immutables.
  PERFORM set_config('quotecoach.allow_account_type_change', 'on', true);

  UPDATE public.organizations
  SET account_type = 'team'
  WHERE id = p_organization_id
  RETURNING * INTO v_org;

  PERFORM private.write_audit_log(
    p_organization_id,
    'organization.converted_to_team',
    v_user_id,
    NULL,
    jsonb_build_object(
      'previous_account_type', 'individual',
      'new_account_type', 'team'
    )
  );

  RETURN v_org;
END;
$$;

COMMENT ON FUNCTION public.convert_organization_to_team(uuid) IS
  'Owner-only individual→team conversion. No team→individual path in this migration.';

CREATE OR REPLACE FUNCTION public.leave_organization(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_membership public.organization_memberships;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_membership
    FROM public.organization_memberships m
   WHERE m.organization_id = p_organization_id
     AND m.user_id = v_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_membership.role = 'owner' THEN
    RAISE EXCEPTION 'Owners cannot leave; transfer ownership first'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.organization_memberships
  WHERE id = v_membership.id;
END;
$$;

COMMENT ON FUNCTION public.leave_organization(uuid) IS
  'Allows non-owner members to leave an organization. Owners must transfer ownership first.';

CREATE OR REPLACE FUNCTION public.transfer_organization_ownership(
  p_organization_id uuid,
  p_new_owner_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current public.organization_memberships;
  v_new public.organization_memberships;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_new_owner_user_id IS NULL OR p_new_owner_user_id = v_user_id THEN
    RAISE EXCEPTION 'A different active member must become the new owner'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_current
    FROM public.organization_memberships m
   WHERE m.organization_id = p_organization_id
     AND m.user_id = v_user_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_current.role IS DISTINCT FROM 'owner'
     OR v_current.status IS DISTINCT FROM 'active'
  THEN
    RAISE EXCEPTION 'Only active owners may transfer ownership'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_new
    FROM public.organization_memberships m
   WHERE m.organization_id = p_organization_id
     AND m.user_id = p_new_owner_user_id
   FOR UPDATE;

  IF NOT FOUND OR v_new.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'New owner must be an active organization member'
      USING ERRCODE = 'P0002';
  END IF;

  -- Transaction-local escape hatch for the current owner's demotion only.
  PERFORM set_config('quotecoach.allow_owner_self_demote', 'on', true);

  UPDATE public.organization_memberships
  SET role = 'owner'
  WHERE id = v_new.id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to promote the new owner'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.organization_memberships
  SET role = 'admin'
  WHERE id = v_current.id
    AND role = 'owner'
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to demote the previous owner'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM private.write_audit_log(
    p_organization_id,
    'ownership.transferred',
    v_user_id,
    p_new_owner_user_id,
    jsonb_build_object('previous_owner', v_user_id, 'new_owner', p_new_owner_user_id)
  );
END;
$$;

COMMENT ON FUNCTION public.transfer_organization_ownership(uuid, uuid) IS
  'Atomically promotes another active member to owner and demotes the caller to admin.';

CREATE OR REPLACE FUNCTION public.accept_organization_invitation(p_token text)
RETURNS public.organization_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_token_hash text;
  v_invite public.organization_invitations;
  v_membership public.organization_memberships;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF nullif(trim(COALESCE(p_token, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Invitation token is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT lower(u.email)
    INTO v_email
    FROM auth.users u
   WHERE u.id = v_user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user email is required'
      USING ERRCODE = '42501';
  END IF;

  v_token_hash := private.hash_invitation_token(p_token);

  SELECT *
    INTO v_invite
    FROM public.organization_invitations i
   WHERE i.token_hash = v_token_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_invite.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Invitation is not pending'
      USING ERRCODE = '22023';
  END IF;

  IF v_invite.expires_at <= now() THEN
    UPDATE public.organization_invitations
    SET status = 'expired'
    WHERE id = v_invite.id;
    RAISE EXCEPTION 'Invitation has expired'
      USING ERRCODE = '22023';
  END IF;

  IF lower(v_invite.email) IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'Invitation email does not match the signed-in user'
      USING ERRCODE = '42501';
  END IF;

  IF NOT private.is_team_organization(v_invite.organization_id) THEN
    RAISE EXCEPTION 'Invitations are only valid for team organizations'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_memberships m
    WHERE m.organization_id = v_invite.organization_id
      AND m.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User is already a member of this organization'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.organization_memberships (
    organization_id,
    user_id,
    role,
    status
  ) VALUES (
    v_invite.organization_id,
    v_user_id,
    v_invite.role,
    'active'
  )
  RETURNING * INTO v_membership;

  UPDATE public.organization_invitations
  SET status = 'accepted',
      accepted_at = now()
  WHERE id = v_invite.id;

  RETURN v_membership;
END;
$$;

COMMENT ON FUNCTION public.accept_organization_invitation(text) IS
  'Accepts a pending team invitation by raw token (hashed for lookup). Creates membership atomically.';

REVOKE ALL ON FUNCTION public.create_organization(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_organization(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.convert_organization_to_team(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_organization_to_team(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.leave_organization(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_organization(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.transfer_organization_ownership(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_organization_ownership(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.accept_organization_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_organization_invitation(text) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_organization(text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.convert_organization_to_team(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leave_organization(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_organization_ownership(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(text)
  TO authenticated, service_role;

-- MFA / credential-sharing control RPCs ------------------------------------
-- Applications must still enforce AAL2 via Supabase Auth before admin UI/API.
-- These helpers expose role-based MFA requirements and controlled security audits.

CREATE OR REPLACE FUNCTION public.user_requires_mfa(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS DISTINCT FROM v_actor
     AND NOT private.is_platform_admin(v_actor)
  THEN
    RAISE EXCEPTION 'Cannot inspect MFA requirements for another user'
      USING ERRCODE = '42501';
  END IF;

  RETURN private.compute_mfa_required(p_user_id);
END;
$$;

COMMENT ON FUNCTION public.user_requires_mfa(uuid) IS
  'Whether the user must use MFA before administrative features (owner/admin/platform admin).';

CREATE OR REPLACE FUNCTION public.record_security_audit_event(
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_organization_id uuid DEFAULT NULL
)
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

  -- Users may only record security events about themselves.
  v_id := private.write_security_audit_log(
    v_user_id,
    p_action,
    v_user_id,
    p_organization_id,
    p_metadata
  );

  IF p_action = 'session.sign_out_all_devices' THEN
    UPDATE public.user_security_settings
    SET last_sign_out_all_at = now(),
        updated_at = now()
    WHERE user_id = v_user_id;
  ELSIF p_action = 'session.suspicious_review' THEN
    UPDATE public.user_security_settings
    SET last_suspicious_session_review_at = now(),
        updated_at = now()
    WHERE user_id = v_user_id;
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_security_audit_event(text, jsonb, uuid) IS
  'Records MFA enroll/remove/recovery, sign-out-all-devices, or suspicious-session review. Never stores TOTP secrets.';

REVOKE ALL ON FUNCTION public.user_requires_mfa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_requires_mfa(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.record_security_audit_event(text, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_security_audit_event(text, jsonb, uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.user_requires_mfa(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_security_audit_event(text, jsonb, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_security_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_security_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_logs FORCE ROW LEVEL SECURITY;

-- profiles ------------------------------------------------------------------
CREATE POLICY profiles_select_own_or_platform_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR private.is_platform_admin()
  );

CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- organizations -------------------------------------------------------------
-- No authenticated INSERT policy: creation is via signup trigger or RPC only.
-- account_type is not updatable via this policy path: column grants allow only
-- name, and enforce_organization_immutables blocks account_type changes.
CREATE POLICY organizations_select_member_or_platform_admin
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    private.is_active_member(id)
    OR private.is_platform_admin()
  );

CREATE POLICY organizations_update_name_owner_admin
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (private.has_org_role(id, ARRAY['owner', 'admin']::text[]))
  WITH CHECK (private.has_org_role(id, ARRAY['owner', 'admin']::text[]));

CREATE POLICY organizations_delete_owner
  ON public.organizations
  FOR DELETE
  TO authenticated
  USING (private.has_org_role(id, ARRAY['owner']::text[]));

-- organization_memberships --------------------------------------------------
CREATE POLICY memberships_select_self_admin_or_platform_admin
  ON public.organization_memberships
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR private.has_org_role(organization_id, ARRAY['owner', 'admin']::text[])
    OR private.is_platform_admin()
  );

-- Direct membership INSERT is limited; invite accept uses SECURITY DEFINER RPC.
CREATE POLICY memberships_insert_owner_admin
  ON public.organization_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_org_role(organization_id, ARRAY['owner', 'admin']::text[])
    AND user_id IS DISTINCT FROM (SELECT auth.uid())
    AND role IN ('admin', 'member')
    AND status = 'active'
    AND private.is_team_organization(organization_id)
  );

CREATE POLICY memberships_update_owner_admin
  ON public.organization_memberships
  FOR UPDATE
  TO authenticated
  USING (
    user_id IS DISTINCT FROM (SELECT auth.uid())
    AND (
      (
        role IN ('admin', 'member')
        AND private.has_org_role(organization_id, ARRAY['owner', 'admin']::text[])
      )
      OR (
        role = 'owner'
        AND private.has_org_role(organization_id, ARRAY['owner']::text[])
      )
    )
  )
  WITH CHECK (
    user_id IS DISTINCT FROM (SELECT auth.uid())
    AND (
      (
        role IN ('admin', 'member')
        AND private.has_org_role(organization_id, ARRAY['owner', 'admin']::text[])
      )
      OR (
        role = 'owner'
        AND private.has_org_role(organization_id, ARRAY['owner']::text[])
      )
    )
  );

CREATE POLICY memberships_delete_owner_admin
  ON public.organization_memberships
  FOR DELETE
  TO authenticated
  USING (
    private.has_org_role(organization_id, ARRAY['owner', 'admin']::text[])
    AND user_id IS DISTINCT FROM (SELECT auth.uid())
    AND role IN ('admin', 'member')
  );

-- organization_invitations --------------------------------------------------
CREATE POLICY invitations_select_owner_admin_or_platform_admin
  ON public.organization_invitations
  FOR SELECT
  TO authenticated
  USING (
    private.has_org_role(organization_id, ARRAY['owner', 'admin']::text[])
    OR private.is_platform_admin()
  );

CREATE POLICY invitations_insert_owner_admin_team_only
  ON public.organization_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_org_role(organization_id, ARRAY['owner', 'admin']::text[])
    AND private.is_team_organization(organization_id)
    AND role IN ('admin', 'member')
    AND status = 'pending'
    AND invited_by = (SELECT auth.uid())
  );

CREATE POLICY invitations_update_owner_admin
  ON public.organization_invitations
  FOR UPDATE
  TO authenticated
  USING (
    private.has_org_role(organization_id, ARRAY['owner', 'admin']::text[])
    AND status = 'pending'
  )
  WITH CHECK (
    private.has_org_role(organization_id, ARRAY['owner', 'admin']::text[])
    AND private.is_team_organization(organization_id)
    AND status IN ('revoked', 'expired')
    AND role IN ('admin', 'member')
  );

CREATE POLICY invitations_delete_owner_admin
  ON public.organization_invitations
  FOR DELETE
  TO authenticated
  USING (private.has_org_role(organization_id, ARRAY['owner', 'admin']::text[]));

-- audit_logs: read for members / platform admins; no client writes ----------
CREATE POLICY audit_logs_select_member_or_platform_admin
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    private.is_active_member(organization_id)
    OR private.is_platform_admin()
  );

-- Intentionally no INSERT/UPDATE/DELETE policies for authenticated.

-- platform_admins: self or platform-admin read; no authenticated writes -----
CREATE POLICY platform_admins_select_self_or_admin
  ON public.platform_admins
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR private.is_platform_admin()
  );

-- Intentionally no INSERT/UPDATE/DELETE for authenticated.
-- Platform admin rows must be provisioned with the service role.

-- user_security_settings: read own (or platform admin); no direct writes ------
CREATE POLICY user_security_settings_select_own_or_platform_admin
  ON public.user_security_settings
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR private.is_platform_admin()
  );

-- mfa_required and timestamps are maintained by triggers/RPCs only.
-- Intentionally no INSERT/UPDATE/DELETE policies for authenticated.

-- security_audit_logs: read own (or platform admin); writes via RPC only ------
CREATE POLICY security_audit_logs_select_own_or_platform_admin
  ON public.security_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR actor_user_id = (SELECT auth.uid())
    OR private.is_platform_admin()
  );

-- Intentionally no INSERT/UPDATE/DELETE policies for authenticated.

-- ---------------------------------------------------------------------------
-- Least-privilege grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.organizations FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.organization_memberships FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.organization_invitations FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.user_security_settings FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.security_audit_logs FROM PUBLIC, anon;

GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
-- Organizations: name-only updates for clients. account_type/created_by/id/etc.
-- remain protected by column privileges + enforce_organization_immutables.
GRANT SELECT, DELETE ON TABLE public.organizations TO authenticated;
GRANT UPDATE (name) ON TABLE public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_invitations TO authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;
GRANT SELECT ON TABLE public.platform_admins TO authenticated;
GRANT SELECT ON TABLE public.user_security_settings TO authenticated;
GRANT SELECT ON TABLE public.security_audit_logs TO authenticated;

GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.organizations TO service_role;
GRANT ALL ON TABLE public.organization_memberships TO service_role;
GRANT ALL ON TABLE public.organization_invitations TO service_role;
GRANT ALL ON TABLE public.audit_logs TO service_role;
GRANT ALL ON TABLE public.platform_admins TO service_role;
GRANT ALL ON TABLE public.user_security_settings TO service_role;
GRANT ALL ON TABLE public.security_audit_logs TO service_role;
