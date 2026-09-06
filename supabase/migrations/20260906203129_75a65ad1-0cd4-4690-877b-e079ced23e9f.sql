CREATE TABLE public.profile_areas (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, area_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_areas TO authenticated;
GRANT ALL ON public.profile_areas TO service_role;

ALTER TABLE public.profile_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile areas read own or staff" ON public.profile_areas
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff());

CREATE POLICY "profile areas managed by permitted staff" ON public.profile_areas
  FOR ALL TO authenticated
  USING (public.supervisor_can('collectors'))
  WITH CHECK (public.supervisor_can('collectors'));

INSERT INTO public.profile_areas (user_id, area_id)
SELECT id, area_id FROM public.profiles WHERE area_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.deposits_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p RECORD;
DECLARE requested uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- trusted server-side insert (seed / admin tooling)
  END IF;
  requested := NEW.area_id;
  NEW.collector_id := auth.uid();
  SELECT branch_id, area_id, active INTO p FROM public.profiles WHERE id = auth.uid();
  IF p IS NULL THEN RAISE EXCEPTION 'المستخدم غير مسجل في النظام'; END IF;
  IF p.active IS NOT TRUE THEN RAISE EXCEPTION 'الحساب موقوف'; END IF;
  NEW.branch_id := p.branch_id;
  IF requested IS NOT NULL AND (
    requested = p.area_id
    OR EXISTS (SELECT 1 FROM public.profile_areas pa WHERE pa.user_id = auth.uid() AND pa.area_id = requested)
  ) THEN
    NEW.area_id := requested;
  ELSE
    NEW.area_id := p.area_id;
  END IF;
  NEW.created_at := now();
  NEW.status := 'pending';
  NEW.admin_notes := NULL;
  NEW.reviewed_at := NULL;
  NEW.reviewed_by := NULL;
  RETURN NEW;
END;
$function$;
