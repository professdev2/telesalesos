-- PowerBridge Orders: purchases under a company. Reorder = new order row.
-- Gross profit / margin are generated columns (Collected − Our Cost).

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations (id) ON DELETE CASCADE,
  company_id uuid NOT NULL
    REFERENCES public.companies (id) ON DELETE CASCADE,
  contact_id uuid
    REFERENCES public.contacts (id) ON DELETE SET NULL,
  order_date date NOT NULL DEFAULT (CURRENT_DATE),
  vertical text
    CONSTRAINT orders_vertical_length CHECK (vertical IS NULL OR length(vertical) <= 80),
  lead_type text
    CONSTRAINT orders_lead_type_length CHECK (lead_type IS NULL OR length(lead_type) <= 80),
  age_range text
    CONSTRAINT orders_age_range_length CHECK (age_range IS NULL OR length(age_range) <= 80),
  lead_provider text
    CONSTRAINT orders_lead_provider_length CHECK (lead_provider IS NULL OR length(lead_provider) <= 160),
  quantity integer
    CONSTRAINT orders_quantity_nonneg CHECK (quantity IS NULL OR quantity >= 0),
  cost_per_record numeric(12, 4)
    CONSTRAINT orders_cost_per_record_nonneg CHECK (cost_per_record IS NULL OR cost_per_record >= 0),
  extra_free_leads integer
    CONSTRAINT orders_extra_free_nonneg CHECK (extra_free_leads IS NULL OR extra_free_leads >= 0),
  states text
    CONSTRAINT orders_states_length CHECK (states IS NULL OR length(states) <= 500),
  collected numeric(14, 2)
    CONSTRAINT orders_collected_nonneg CHECK (collected IS NULL OR collected >= 0),
  our_cost numeric(14, 2)
    CONSTRAINT orders_our_cost_nonneg CHECK (our_cost IS NULL OR our_cost >= 0),
  gross_profit numeric(14, 2)
    GENERATED ALWAYS AS (
      CASE
        WHEN collected IS NULL OR our_cost IS NULL THEN NULL
        ELSE collected - our_cost
      END
    ) STORED,
  gross_margin_pct numeric(8, 2)
    GENERATED ALWAYS AS (
      CASE
        WHEN collected IS NULL OR our_cost IS NULL OR collected = 0 THEN NULL
        ELSE round(((collected - our_cost) / collected) * 100, 2)
      END
    ) STORED,
  payment_method text
    CONSTRAINT orders_payment_method_length CHECK (payment_method IS NULL OR length(payment_method) <= 80),
  payment_status text
    CONSTRAINT orders_payment_status_valid
      CHECK (
        payment_status IS NULL
        OR payment_status IN ('pending', 'paid', 'partial', 'refunded')
      ),
  payment_terms text
    CONSTRAINT orders_payment_terms_length CHECK (payment_terms IS NULL OR length(payment_terms) <= 120),
  paid_provider boolean NOT NULL DEFAULT false,
  delivery_status text
    CONSTRAINT orders_delivery_status_valid
      CHECK (
        delivery_status IS NULL
        OR delivery_status IN ('pending', 'delivered', 'partial', 'cancelled')
      ),
  delivery_date date,
  notes text
    CONSTRAINT orders_notes_length CHECK (notes IS NULL OR length(notes) <= 2000),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.orders IS
  'PowerBridge purchases under a company. Gross profit/margin are generated from collected and our_cost.';

CREATE INDEX orders_organization_id_idx ON public.orders (organization_id);
CREATE INDEX orders_org_company_id_idx ON public.orders (organization_id, company_id);
CREATE INDEX orders_org_order_date_idx ON public.orders (organization_id, order_date DESC);
CREATE INDEX orders_company_order_date_idx ON public.orders (company_id, order_date DESC);

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE OR REPLACE FUNCTION private.orders_guard_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_org uuid;
  v_contact_org uuid;
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

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.orders_guard_organization() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.orders_guard_organization() TO authenticated, service_role, postgres;

CREATE TRIGGER orders_guard_organization
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.orders_guard_organization();

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;

CREATE POLICY orders_select
  ON public.orders FOR SELECT TO authenticated
  USING (private.is_active_member(organization_id));

CREATE POLICY orders_insert
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (private.is_active_member(organization_id));

CREATE POLICY orders_update
  ON public.orders FOR UPDATE TO authenticated
  USING (private.is_active_member(organization_id))
  WITH CHECK (private.is_active_member(organization_id));

CREATE POLICY orders_delete
  ON public.orders FOR DELETE TO authenticated
  USING (private.is_active_member(organization_id));

REVOKE ALL ON TABLE public.orders FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;
