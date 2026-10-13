-- Link orders to PowerBridge deals (leads) + IMO on the order row.
-- lead_id is nullable so company-level orders and history survive lead delete.

ALTER TABLE public.orders
  ADD COLUMN lead_id uuid
    REFERENCES public.leads (id) ON DELETE SET NULL,
  ADD COLUMN imo text
    CONSTRAINT orders_imo_length CHECK (imo IS NULL OR length(imo) <= 160);

CREATE INDEX orders_org_lead_id_idx
  ON public.orders (organization_id, lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX orders_lead_id_idx
  ON public.orders (lead_id)
  WHERE lead_id IS NOT NULL;

COMMENT ON COLUMN public.orders.lead_id IS
  'Optional PowerBridge deal (lead). Cleared if the lead is deleted; company history kept.';

-- Extend org guard to validate lead belongs to the same organization.
CREATE OR REPLACE FUNCTION private.orders_guard_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_org uuid;
  v_contact_org uuid;
  v_lead_org uuid;
  v_lead_company uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT private.is_active_member(NEW.organization_id) THEN
    RAISE EXCEPTION 'Cannot write an order into an organization you are not an active member of'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Orders cannot be moved between organizations'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.organization_id INTO v_company_org
  FROM public.companies AS c
  WHERE c.id = NEW.company_id;

  IF v_company_org IS NULL THEN
    RAISE EXCEPTION 'Order company does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_company_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Order company must belong to the same organization'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.contact_id IS NOT NULL THEN
    SELECT ct.organization_id INTO v_contact_org
    FROM public.contacts AS ct
    WHERE ct.id = NEW.contact_id;

    IF v_contact_org IS NULL THEN
      RAISE EXCEPTION 'Order contact does not exist'
        USING ERRCODE = '23503';
    END IF;

    IF v_contact_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Order contact must belong to the same organization'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    SELECT l.organization_id, l.company_id INTO v_lead_org, v_lead_company
    FROM public.leads AS l
    WHERE l.id = NEW.lead_id;

    IF v_lead_org IS NULL THEN
      RAISE EXCEPTION 'Order lead does not exist'
        USING ERRCODE = '23503';
    END IF;

    IF v_lead_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Order lead must belong to the same organization'
        USING ERRCODE = '42501';
    END IF;

    IF v_lead_company IS NOT NULL AND v_lead_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Order company must match the lead company'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
