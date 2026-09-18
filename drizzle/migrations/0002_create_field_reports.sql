CREATE TABLE public.abandoned_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id),
  area_id uuid REFERENCES public.areas(id),
  property_no text NOT NULL,
  subscriptions text,
  images text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abandoned_properties TO authenticated;
GRANT ALL ON public.abandoned_properties TO service_role;
ALTER TABLE public.abandoned_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "abandoned select own or staff" ON public.abandoned_properties FOR SELECT TO authenticated USING (collector_id = auth.uid() OR public.is_staff());
CREATE POLICY "abandoned insert own" ON public.abandoned_properties FOR INSERT TO authenticated WITH CHECK (collector_id = auth.uid());
CREATE POLICY "abandoned update own or staff" ON public.abandoned_properties FOR UPDATE TO authenticated USING (collector_id = auth.uid() OR public.is_staff()) WITH CHECK (collector_id = auth.uid() OR public.is_staff());
CREATE POLICY "abandoned delete staff only" ON public.abandoned_properties FOR DELETE TO authenticated USING (public.is_staff());
CREATE TRIGGER abandoned_properties_touch BEFORE UPDATE ON public.abandoned_properties FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.demolished_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id),
  area_id uuid REFERENCES public.areas(id),
  property_no text NOT NULL,
  subscriptions text,
  images text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demolished_properties TO authenticated;
GRANT ALL ON public.demolished_properties TO service_role;
ALTER TABLE public.demolished_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demolished select own or staff" ON public.demolished_properties FOR SELECT TO authenticated USING (collector_id = auth.uid() OR public.is_staff());
CREATE POLICY "demolished insert own" ON public.demolished_properties FOR INSERT TO authenticated WITH CHECK (collector_id = auth.uid());
CREATE POLICY "demolished update own or staff" ON public.demolished_properties FOR UPDATE TO authenticated USING (collector_id = auth.uid() OR public.is_staff()) WITH CHECK (collector_id = auth.uid() OR public.is_staff());
CREATE POLICY "demolished delete staff only" ON public.demolished_properties FOR DELETE TO authenticated USING (public.is_staff());
CREATE TRIGGER demolished_properties_touch BEFORE UPDATE ON public.demolished_properties FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.high_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id),
  area_id uuid REFERENCES public.areas(id),
  subscription_no text NOT NULL,
  reading numeric(14,2) NOT NULL DEFAULT 0,
  images text[] NOT NULL DEFAULT '{}',
  notes text,
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.high_readings TO authenticated;
GRANT ALL ON public.high_readings TO service_role;
ALTER TABLE public.high_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "high readings select own or staff" ON public.high_readings FOR SELECT TO authenticated USING (collector_id = auth.uid() OR public.is_staff());
CREATE POLICY "high readings insert own" ON public.high_readings FOR INSERT TO authenticated WITH CHECK (collector_id = auth.uid());
CREATE POLICY "high readings update staff only" ON public.high_readings FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "high readings delete staff only" ON public.high_readings FOR DELETE TO authenticated USING (public.is_staff());
CREATE TRIGGER high_readings_touch BEFORE UPDATE ON public.high_readings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_abandoned_collector ON public.abandoned_properties(collector_id, created_at DESC);
CREATE INDEX idx_demolished_collector ON public.demolished_properties(collector_id, created_at DESC);
CREATE INDEX idx_high_readings_collector ON public.high_readings(collector_id, created_at DESC);