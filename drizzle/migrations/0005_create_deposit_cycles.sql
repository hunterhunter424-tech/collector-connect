CREATE TABLE public.deposit_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  started_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX deposit_cycles_one_open ON public.deposit_cycles ((closed_at IS NULL)) WHERE closed_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposit_cycles TO authenticated;
GRANT ALL ON public.deposit_cycles TO service_role;
ALTER TABLE public.deposit_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read cycles" ON public.deposit_cycles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage cycles" ON public.deposit_cycles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
INSERT INTO public.deposit_cycles (started_at) VALUES (date_trunc('month', now()));