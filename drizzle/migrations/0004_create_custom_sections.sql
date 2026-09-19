CREATE TABLE public.custom_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.custom_section_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.custom_sections(id) ON DELETE CASCADE,
  collector_id uuid NOT NULL REFERENCES public.profiles(id),
  branch_id uuid REFERENCES public.branches(id),
  area_id uuid REFERENCES public.areas(id),
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  images text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX custom_section_entries_section_idx ON public.custom_section_entries(section_id, created_at DESC);
CREATE INDEX custom_section_entries_collector_idx ON public.custom_section_entries(collector_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_sections TO authenticated;
GRANT ALL ON public.custom_sections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_section_entries TO authenticated;
GRANT ALL ON public.custom_section_entries TO service_role;

ALTER TABLE public.custom_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_section_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sections readable by authenticated" ON public.custom_sections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sections managed by staff" ON public.custom_sections
  FOR ALL TO authenticated USING (public.supervisor_can('collectors')) WITH CHECK (public.supervisor_can('collectors'));

CREATE POLICY "entries insert own" ON public.custom_section_entries
  FOR INSERT TO authenticated WITH CHECK (collector_id = auth.uid());
CREATE POLICY "entries select own or staff" ON public.custom_section_entries
  FOR SELECT TO authenticated USING (collector_id = auth.uid() OR public.is_staff());
CREATE POLICY "entries update own or staff" ON public.custom_section_entries
  FOR UPDATE TO authenticated USING (collector_id = auth.uid() OR public.is_staff()) WITH CHECK (collector_id = auth.uid() OR public.is_staff());
CREATE POLICY "entries delete staff" ON public.custom_section_entries
  FOR DELETE TO authenticated USING (public.is_staff());

CREATE TRIGGER custom_sections_touch BEFORE UPDATE ON public.custom_sections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER custom_section_entries_touch BEFORE UPDATE ON public.custom_section_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();