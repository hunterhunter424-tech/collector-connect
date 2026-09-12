ALTER TABLE public.deposits DROP CONSTRAINT deposits_invoices_count_check;
ALTER TABLE public.deposits ADD CONSTRAINT deposits_invoices_count_check CHECK (invoices_count >= 0);