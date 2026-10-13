-- Manual invoice reference for PowerBridge orders (no PandaDoc API).

ALTER TABLE public.orders
  ADD COLUMN invoice_number text
    CONSTRAINT orders_invoice_number_length CHECK (
      invoice_number IS NULL OR length(invoice_number) <= 80
    );

COMMENT ON COLUMN public.orders.invoice_number IS
  'External invoice number entered manually (e.g. from QuickBooks / PDF).';
