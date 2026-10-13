-- ---------------------------------------------------------------------------
-- Audit trail for contact changes
--
-- `public.audit_logs` is append-only for clients: members may SELECT, there is
-- no INSERT policy, and `private.write_audit_log()` is not granted to
-- `authenticated`. Writing from the application is therefore impossible by
-- design. The established pattern — already used by the membership and
-- invitation triggers — is a SECURITY DEFINER trigger that calls the helper.
--
-- Metadata carries the contact id and nothing else. No name, email, or phone.
-- audit_logs has no retention policy yet, so copying personal data into an
-- append-only table would create an obligation that has not been designed for.
-- The trade-off is that a deletion entry points at a row that no longer
-- exists; revisit when retention is specified.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.contacts_write_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id uuid;
  v_contact_id uuid;
  v_action text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_organization_id := OLD.organization_id;
    v_contact_id := OLD.id;
    v_action := 'contact.deleted';
  ELSIF TG_OP = 'UPDATE' THEN
    v_organization_id := NEW.organization_id;
    v_contact_id := NEW.id;
    v_action := 'contact.updated';
  ELSE
    v_organization_id := NEW.organization_id;
    v_contact_id := NEW.id;
    v_action := 'contact.created';
  END IF;

  PERFORM private.write_audit_log(
    p_organization_id => v_organization_id,
    p_action => v_action,
    p_metadata => jsonb_build_object('contact_id', v_contact_id)
  );

  -- AFTER trigger: the return value is ignored.
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.contacts_write_audit() IS
  'Records contact.created / contact.updated / contact.deleted in audit_logs. Metadata holds the contact id only.';

REVOKE ALL ON FUNCTION private.contacts_write_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.contacts_write_audit() FROM anon;
-- PostgreSQL checks EXECUTE for the role issuing the DML that fires the trigger.
GRANT EXECUTE ON FUNCTION private.contacts_write_audit() TO authenticated;
GRANT EXECUTE ON FUNCTION private.contacts_write_audit() TO service_role;
GRANT EXECUTE ON FUNCTION private.contacts_write_audit() TO postgres;

CREATE TRIGGER contacts_write_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION private.contacts_write_audit();
