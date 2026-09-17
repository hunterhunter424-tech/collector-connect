CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcements managed by staff" ON public.announcements
  FOR ALL TO authenticated
  USING (public.supervisor_can('collectors'))
  WITH CHECK (public.supervisor_can('collectors'));

CREATE POLICY "announcements read own or staff" ON public.announcements
  FOR SELECT TO authenticated
  USING (public.is_staff() OR (active AND (target_user_id IS NULL OR target_user_id = auth.uid())));

CREATE INDEX announcements_target_idx ON public.announcements (target_user_id);

CREATE TRIGGER announcements_touch BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
