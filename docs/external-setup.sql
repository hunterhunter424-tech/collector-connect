-- =====================================================================
-- إعداد قاعدة بيانات خارجية لنظام إدارة توريدات المحصلين
-- شغّل هذا الملف مرة واحدة بالكامل في SQL Editor للقاعدة الجديدة.
-- آمن للتشغيل أكثر من مرة (idempotent) ولا يحذف أي بيانات موجودة.
-- =====================================================================

-- 1) الأنواع والتسلسلات ------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'collector', 'supervisor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS public.deposit_ref_seq START 1000;

-- 2) الجداول (تُنشأ فقط إن كانت ناقصة) --------------------------------
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  username text NOT NULL UNIQUE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.supervisor_permissions (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_manage_collectors boolean NOT NULL DEFAULT false,
  can_review_deposits boolean NOT NULL DEFAULT false,
  can_manage_collections boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profile_areas (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, area_id)
);

CREATE TABLE IF NOT EXISTS public.branch_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  month date NOT NULL,
  target_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, month)
);

CREATE TABLE IF NOT EXISTS public.deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref bigint NOT NULL DEFAULT nextval('public.deposit_ref_seq'),
  collector_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  invoices_count integer NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL,
  receipt_image_url text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

DO $$ BEGIN
  ALTER TABLE public.deposits
    ADD CONSTRAINT deposits_collector_profile_fkey
    FOREIGN KEY (collector_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.collection_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month smallint NOT NULL,
  year integer NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  collector_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  billing_target_amount numeric(14,2) NOT NULL DEFAULT 0,
  billing_invoices_count integer,
  target_received_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  status text NOT NULL DEFAULT 'open',
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  final_billing_target_amount numeric(14,2),
  final_invoice_collection numeric(14,2),
  final_other_revenue numeric(14,2),
  final_grand_total numeric(14,2),
  final_collection_percentage numeric(10,4),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.collection_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.collection_cycles(id) ON DELETE CASCADE,
  collector_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  invoices_collection_amount numeric(14,2) NOT NULL DEFAULT 0,
  other_revenue_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  screenshot_url text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.collection_entries ADD COLUMN IF NOT EXISTS screenshot_url text;

CREATE TABLE IF NOT EXISTS public.other_revenue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_entry_id uuid NOT NULL REFERENCES public.collection_entries(id) ON DELETE CASCADE,
  category text NOT NULL,
  amount numeric(14,2) NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  action text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3) الصلاحيات (هذا أهم سبب لرسائل الصلاحيات) ------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.deposit_ref_seq TO authenticated, service_role;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches','areas','profiles','user_roles','supervisor_permissions','profile_areas',
    'branch_targets','deposits','collection_cycles','collection_entries',
    'other_revenue_items','audit_logs'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- 4) الدوال -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(), 'supervisor');
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_admin() OR public.is_supervisor();
$$;

CREATE OR REPLACE FUNCTION public.supervisor_can(_perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.supervisor_permissions sp
    WHERE sp.user_id = auth.uid()
      AND public.has_role(auth.uid(), 'supervisor')
      AND CASE _perm
        WHEN 'collectors' THEN sp.can_manage_collectors
        WHEN 'deposits' THEN sp.can_review_deposits
        WHEN 'collections' THEN sp.can_manage_collections
        ELSE false END
  );
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.deposits_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p RECORD; requested uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  requested := NEW.area_id;
  NEW.collector_id := auth.uid();
  SELECT branch_id, area_id, active INTO p FROM public.profiles WHERE id = auth.uid();
  IF p IS NULL THEN RAISE EXCEPTION 'المستخدم غير مسجل في النظام'; END IF;
  IF p.active IS NOT TRUE THEN RAISE EXCEPTION 'الحساب موقوف'; END IF;
  NEW.branch_id := p.branch_id;
  IF requested IS NOT NULL AND (
    requested = p.area_id
    OR EXISTS (SELECT 1 FROM public.profile_areas pa WHERE pa.user_id = auth.uid() AND pa.area_id = requested)
  ) THEN NEW.area_id := requested; ELSE NEW.area_id := p.area_id; END IF;
  NEW.created_at := now();
  NEW.status := 'pending';
  NEW.admin_notes := NULL; NEW.reviewed_at := NULL; NEW.reviewed_by := NULL;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.deposits_before_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  NEW.collector_id := OLD.collector_id;
  NEW.branch_id := OLD.branch_id;
  NEW.area_id := OLD.area_id;
  NEW.created_at := OLD.created_at;
  NEW.ref := OLD.ref;
  NEW.invoices_count := OLD.invoices_count;
  NEW.amount := OLD.amount;
  NEW.receipt_image_url := OLD.receipt_image_url;
  IF NEW.status <> OLD.status THEN
    NEW.reviewed_at := now(); NEW.reviewed_by := auth.uid();
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_collection_entry_write()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE cycle_row public.collection_cycles%ROWTYPE;
BEGIN
  SELECT * INTO cycle_row FROM public.collection_cycles WHERE id = NEW.cycle_id;
  IF cycle_row.id IS NULL THEN RAISE EXCEPTION 'دورة التحصيل غير موجودة'; END IF;
  IF cycle_row.status <> 'open' THEN RAISE EXCEPTION 'لا يمكن تعديل دورة منتهية'; END IF;
  NEW.collector_id := cycle_row.collector_id;
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_other_revenue_write()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE cycle_status text;
BEGIN
  SELECT c.status INTO cycle_status
  FROM public.collection_entries e
  JOIN public.collection_cycles c ON c.id = e.cycle_id
  WHERE e.id = NEW.collection_entry_id;
  IF cycle_status IS NULL THEN RAISE EXCEPTION 'عملية التحصيل غير موجودة'; END IF;
  IF cycle_status <> 'open' THEN RAISE EXCEPTION 'لا يمكن تعديل دورة منتهية'; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_entry_other_revenue()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE target_entry uuid;
BEGIN
  target_entry := COALESCE(NEW.collection_entry_id, OLD.collection_entry_id);
  UPDATE public.collection_entries
  SET other_revenue_amount = COALESCE((
    SELECT SUM(amount) FROM public.other_revenue_items WHERE collection_entry_id = target_entry
  ), 0), updated_at = now()
  WHERE id = target_entry;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.close_collection_cycle(_cycle_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE cycle_row public.collection_cycles%ROWTYPE;
DECLARE total_invoices numeric(14,2); total_other numeric(14,2); total_all numeric(14,2);
DECLARE final_percentage numeric(10,4); actor text;
BEGIN
  IF NOT public.supervisor_can('collections') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO cycle_row FROM public.collection_cycles WHERE id = _cycle_id FOR UPDATE;
  IF cycle_row.id IS NULL THEN RAISE EXCEPTION 'دورة التحصيل غير موجودة'; END IF;
  IF cycle_row.status = 'closed' THEN RAISE EXCEPTION 'الدورة منتهية بالفعل'; END IF;
  SELECT COALESCE(SUM(invoices_collection_amount), 0), COALESCE(SUM(other_revenue_amount), 0)
  INTO total_invoices, total_other FROM public.collection_entries WHERE cycle_id = _cycle_id;
  total_all := total_invoices + total_other;
  final_percentage := CASE WHEN cycle_row.billing_target_amount > 0
    THEN ROUND((total_invoices / cycle_row.billing_target_amount) * 100, 4) ELSE NULL END;
  UPDATE public.collection_cycles SET
    status = 'closed', closed_at = now(), closed_by = auth.uid(),
    final_billing_target_amount = cycle_row.billing_target_amount,
    final_invoice_collection = total_invoices,
    final_other_revenue = total_other,
    final_grand_total = total_all,
    final_collection_percentage = final_percentage
  WHERE id = _cycle_id;
  SELECT full_name INTO actor FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(actor_id, actor_name, action, details)
  VALUES (auth.uid(), COALESCE(actor, 'مدير النظام'), 'إنهاء دورة تحصيل',
          'تم إنهاء دورة ' || cycle_row.month || '/' || cycle_row.year);
END; $$;

CREATE OR REPLACE FUNCTION public.reopen_collection_cycle(_cycle_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE cycle_row public.collection_cycles%ROWTYPE; actor text;
BEGIN
  IF NOT public.supervisor_can('collections') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO cycle_row FROM public.collection_cycles WHERE id = _cycle_id FOR UPDATE;
  IF cycle_row.id IS NULL THEN RAISE EXCEPTION 'دورة التحصيل غير موجودة'; END IF;
  IF cycle_row.status = 'open' THEN RAISE EXCEPTION 'الدورة مفتوحة بالفعل'; END IF;
  UPDATE public.collection_cycles SET
    status = 'open', closed_at = NULL, closed_by = NULL,
    final_billing_target_amount = NULL, final_invoice_collection = NULL,
    final_other_revenue = NULL, final_grand_total = NULL,
    final_collection_percentage = NULL
  WHERE id = _cycle_id;
  SELECT full_name INTO actor FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(actor_id, actor_name, action, details)
  VALUES (auth.uid(), COALESCE(actor, 'مدير النظام'), 'إعادة فتح دورة تحصيل',
          'تمت إعادة فتح دورة ' || cycle_row.month || '/' || cycle_row.year);
END; $$;

GRANT EXECUTE ON FUNCTION public.close_collection_cycle(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_collection_cycle(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_supervisor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisor_can(text) TO authenticated;

-- 5) المشغّلات --------------------------------------------------------
DROP TRIGGER IF EXISTS profiles_touch ON public.profiles;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS supervisor_permissions_touch ON public.supervisor_permissions;
CREATE TRIGGER supervisor_permissions_touch BEFORE UPDATE ON public.supervisor_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS branch_targets_touch ON public.branch_targets;
CREATE TRIGGER branch_targets_touch BEFORE UPDATE ON public.branch_targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS collection_cycles_touch ON public.collection_cycles;
CREATE TRIGGER collection_cycles_touch BEFORE UPDATE ON public.collection_cycles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS collection_entries_touch ON public.collection_entries;
CREATE TRIGGER collection_entries_touch BEFORE UPDATE ON public.collection_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS other_revenue_items_touch ON public.other_revenue_items;
CREATE TRIGGER other_revenue_items_touch BEFORE UPDATE ON public.other_revenue_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS deposits_before_insert_trg ON public.deposits;
CREATE TRIGGER deposits_before_insert_trg BEFORE INSERT ON public.deposits
  FOR EACH ROW EXECUTE FUNCTION public.deposits_before_insert();

DROP TRIGGER IF EXISTS deposits_before_update_trg ON public.deposits;
CREATE TRIGGER deposits_before_update_trg BEFORE UPDATE ON public.deposits
  FOR EACH ROW EXECUTE FUNCTION public.deposits_before_update();

DROP TRIGGER IF EXISTS collection_entries_validate ON public.collection_entries;
CREATE TRIGGER collection_entries_validate BEFORE INSERT OR UPDATE ON public.collection_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_collection_entry_write();

DROP TRIGGER IF EXISTS other_revenue_items_validate ON public.other_revenue_items;
CREATE TRIGGER other_revenue_items_validate BEFORE INSERT OR UPDATE ON public.other_revenue_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_other_revenue_write();

DROP TRIGGER IF EXISTS other_revenue_items_sync ON public.other_revenue_items;
CREATE TRIGGER other_revenue_items_sync AFTER INSERT OR UPDATE OR DELETE ON public.other_revenue_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_entry_other_revenue();

-- 6) تشغيل حماية الصفوف + السياسات ------------------------------------
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches','areas','profiles','user_roles','supervisor_permissions','profile_areas',
    'branch_targets','deposits','collection_cycles','collection_entries',
    'other_revenue_items','audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "branches readable by authenticated" ON public.branches;
CREATE POLICY "branches readable by authenticated" ON public.branches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "branches managed by admin" ON public.branches;
CREATE POLICY "branches managed by admin" ON public.branches FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "areas readable by authenticated" ON public.areas;
CREATE POLICY "areas readable by authenticated" ON public.areas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "areas managed by admin" ON public.areas;
CREATE POLICY "areas managed by admin" ON public.areas FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "profiles select own or staff" ON public.profiles;
CREATE POLICY "profiles select own or staff" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "profiles managed by admin" ON public.profiles;
CREATE POLICY "profiles managed by admin" ON public.profiles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "roles select own" ON public.user_roles;
CREATE POLICY "roles select own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "supervisor permissions read self or staff" ON public.supervisor_permissions;
CREATE POLICY "supervisor permissions read self or staff" ON public.supervisor_permissions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "supervisor permissions managed by admin" ON public.supervisor_permissions;
CREATE POLICY "supervisor permissions managed by admin" ON public.supervisor_permissions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "profile areas read own or staff" ON public.profile_areas;
CREATE POLICY "profile areas read own or staff" ON public.profile_areas FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "profile areas managed by permitted staff" ON public.profile_areas;
CREATE POLICY "profile areas managed by permitted staff" ON public.profile_areas FOR ALL TO authenticated USING (public.supervisor_can('collectors')) WITH CHECK (public.supervisor_can('collectors'));

DROP POLICY IF EXISTS "branch targets readable by authenticated" ON public.branch_targets;
CREATE POLICY "branch targets readable by authenticated" ON public.branch_targets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "branch targets managed by admin" ON public.branch_targets;
CREATE POLICY "branch targets managed by admin" ON public.branch_targets FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "deposits select own or staff" ON public.deposits;
CREATE POLICY "deposits select own or staff" ON public.deposits FOR SELECT TO authenticated USING (collector_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "deposits insert own" ON public.deposits;
CREATE POLICY "deposits insert own" ON public.deposits FOR INSERT TO authenticated WITH CHECK (collector_id = auth.uid());
DROP POLICY IF EXISTS "deposits update by permitted staff" ON public.deposits;
CREATE POLICY "deposits update by permitted staff" ON public.deposits FOR UPDATE TO authenticated USING (public.supervisor_can('deposits')) WITH CHECK (public.supervisor_can('deposits'));
DROP POLICY IF EXISTS "deposits delete admin only" ON public.deposits;
CREATE POLICY "deposits delete admin only" ON public.deposits FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "collection cycles read own or staff" ON public.collection_cycles;
CREATE POLICY "collection cycles read own or staff" ON public.collection_cycles FOR SELECT TO authenticated USING (collector_id = auth.uid() OR public.is_staff());
DROP POLICY IF EXISTS "collection cycles admin manage" ON public.collection_cycles;
CREATE POLICY "collection cycles admin manage" ON public.collection_cycles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "collection cycles managed by permitted staff" ON public.collection_cycles;
CREATE POLICY "collection cycles managed by permitted staff" ON public.collection_cycles FOR ALL TO authenticated USING (public.supervisor_can('collections')) WITH CHECK (public.supervisor_can('collections'));

DROP POLICY IF EXISTS "collection entries read own or staff" ON public.collection_entries;
CREATE POLICY "collection entries read own or staff" ON public.collection_entries FOR SELECT TO authenticated USING (
  public.is_staff() OR EXISTS (
    SELECT 1 FROM public.collection_cycles c WHERE c.id = collection_entries.cycle_id AND c.collector_id = auth.uid()
  ));
DROP POLICY IF EXISTS "collection entries admin manage" ON public.collection_entries;
CREATE POLICY "collection entries admin manage" ON public.collection_entries FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "collection entries managed by permitted staff" ON public.collection_entries;
CREATE POLICY "collection entries managed by permitted staff" ON public.collection_entries FOR ALL TO authenticated USING (public.supervisor_can('collections')) WITH CHECK (public.supervisor_can('collections'));

DROP POLICY IF EXISTS "other revenue items read own or staff" ON public.other_revenue_items;
CREATE POLICY "other revenue items read own or staff" ON public.other_revenue_items FOR SELECT TO authenticated USING (
  public.is_staff() OR EXISTS (
    SELECT 1 FROM public.collection_entries e
    JOIN public.collection_cycles c ON c.id = e.cycle_id
    WHERE e.id = other_revenue_items.collection_entry_id AND c.collector_id = auth.uid()
  ));
DROP POLICY IF EXISTS "other revenue items admin manage" ON public.other_revenue_items;
CREATE POLICY "other revenue items admin manage" ON public.other_revenue_items FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "other revenue items managed by permitted staff" ON public.other_revenue_items;
CREATE POLICY "other revenue items managed by permitted staff" ON public.other_revenue_items FOR ALL TO authenticated USING (public.supervisor_can('collections')) WITH CHECK (public.supervisor_can('collections'));

DROP POLICY IF EXISTS "audit select staff" ON public.audit_logs;
CREATE POLICY "audit select staff" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "audit insert authenticated" ON public.audit_logs;
CREATE POLICY "audit insert authenticated" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- 7) مساحة تخزين صور الإيصالات ----------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "receipts insert own" ON storage.objects;
CREATE POLICY "receipts insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');

DROP POLICY IF EXISTS "receipts read own or staff" ON storage.objects;
CREATE POLICY "receipts read own or staff" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "receipts delete staff" ON storage.objects;
CREATE POLICY "receipts delete staff" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND public.is_staff());

-- 8) بعد التشغيل ------------------------------------------------------
-- أنشئ مستخدم مدير من صفحة Authentication (بريد: admin@tawreedat.app)
-- ثم شغّل السطرين التاليين بعد نسخ معرّف المستخدم (UUID):
--
-- INSERT INTO public.profiles (id, full_name, username, active)
-- VALUES ('<UUID>', 'مدير النظام', 'admin', true)
-- ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO public.user_roles (user_id, role)
-- VALUES ('<UUID>', 'admin') ON CONFLICT DO NOTHING;
