-- ============================================================
-- إنشاء كل حسابات المستخدمين (الحاليين) في قاعدة البيانات الجديدة
-- شغّل هذا الملف مرة واحدة في SQL Editor بالقاعدة الجديدة
-- بعد تشغيل docs/external-setup.sql
--
-- كلمة المرور الموحدة لكل الحسابات: Tawreed@2026
-- (يمكن لكل مستخدم تغييرها لاحقًا من الإعدادات، أو غيّرها بالأسفل)
--
-- آمن للتشغيل أكثر من مرة: لا يكرر ولا يحذف أي بيانات.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  v_password text := 'Tawreed@2026';
  u record;
BEGIN
  FOR u IN
    SELECT * FROM (VALUES
      ('ed8c40d2-a566-41bc-b11d-05f73ce19c2b','محمود بكر','admin','admin',NULL,NULL),
      ('9f84e0ff-5625-4209-8eed-2e8655e72d39','تامر عبدالمعطي','t.ahmed','supervisor','11111111-1111-1111-1111-111111111111',NULL),
      ('131d94ee-125c-40da-b449-701f5bab57ba','م. الوافي عامر','eng.wafi','supervisor','11111111-1111-1111-1111-111111111111',NULL),
      ('6f5f8cbd-0f1e-4f93-9621-428dc943deae','محمود عامر','m.amer','supervisor','11111111-1111-1111-1111-111111111111',NULL),
      ('4a73d80a-087e-44a2-9407-95b9e4a10f9f','محمد السيد','m.elsaid','supervisor','11111111-1111-1111-1111-111111111111',NULL),
      ('6024ad3d-ef5a-4221-b12d-4c8ab8742b2a','fathy elsaid','fathy.elsaid','supervisor',NULL,NULL),
      ('10f03297-818f-4f55-b027-6940abd5054a','hani ali','hani.ali','supervisor',NULL,NULL),
      ('95e3f415-8ec5-4e83-9570-69451dd50ef8','علي الجميل','ali.elgamel','collector','11111111-1111-1111-1111-111111111111','aa7d459a-84da-4c25-a65b-1815753e3585'),
      ('12678e97-858c-473d-9ca6-0fdaeb5c5b7e','محمد العساس','m.asas','collector','11111111-1111-1111-1111-111111111111','aa7d459a-84da-4c25-a65b-1815753e3585'),
      ('86e0bff3-6a01-460f-ae15-07dc8a4d4601','عزيز سمير','aziz.samir','collector','11111111-1111-1111-1111-111111111111','aa7d459a-84da-4c25-a65b-1815753e3585'),
      ('dae78db0-82a6-4d48-bb11-370a057fd6a0','هاني حلمي','hani.helmy','collector','11111111-1111-1111-1111-111111111111','d3dcc9a5-28c6-4179-9351-c27378ff7280'),
      ('c2277637-7a1b-43af-ab5b-faafc7dfbcee','شريف نوفل','sherif.nofal','collector','11111111-1111-1111-1111-111111111111','d3dcc9a5-28c6-4179-9351-c27378ff7280'),
      ('8c32f4a7-ba92-4cb4-81af-ef7a29028212','عادل عاطف','adel.atef','collector','11111111-1111-1111-1111-111111111111','7542d4ef-0efd-4fd1-84fe-a9f1062d4650'),
      ('db4f89cf-f642-4e15-9394-43a8d967070c','احمد عبدالدايم','ahmed.saleh','collector','11111111-1111-1111-1111-111111111111','7542d4ef-0efd-4fd1-84fe-a9f1062d4650'),
      ('d79c5937-3112-49e4-bf75-98c95f32539b','جمال الباز','el.gemy','collector','11111111-1111-1111-1111-111111111111','7542d4ef-0efd-4fd1-84fe-a9f1062d4650'),
      ('edc058d9-8144-4d1b-b733-953cb98418a8','مو سلامة','mo.salama','collector','11111111-1111-1111-1111-111111111111','7542d4ef-0efd-4fd1-84fe-a9f1062d4650'),
      ('47760c65-b10d-47f2-9e5c-5dd46f0d9fde','العندليبو','abdelhalim.hamed','collector','11111111-1111-1111-1111-111111111111','18e10a74-0758-459e-ab5a-cce2598219b3'),
      ('a950836d-98d9-4756-8279-eb8b81761006','عبده مسعد','abdo.mosaad','collector','11111111-1111-1111-1111-111111111111','18e10a74-0758-459e-ab5a-cce2598219b3'),
      ('37a59610-6d4e-4b24-b573-183d8e6555f0','حاتم ابوجبل','hatem.mo','collector','11111111-1111-1111-1111-111111111111','18e10a74-0758-459e-ab5a-cce2598219b3'),
      ('98146a95-5aa2-45df-8837-e2043220e79d','احمد عطية','ahmed.attia','collector','11111111-1111-1111-1111-111111111111','3db50c96-9afa-4117-a5c5-18f95db5d467')
    ) AS t(id, full_name, username, role, branch_id, area_id)
  LOOP
    -- 1) حساب الدخول
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      u.username || '@tawreedat.app',
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', u.full_name),
      now(), now()
    ) ON CONFLICT (id) DO NOTHING;

    -- 2) هوية الدخول بالبريد
    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), u.id::uuid, u.id, 'email',
      jsonb_build_object('sub', u.id, 'email', u.username || '@tawreedat.app', 'email_verified', true),
      now(), now(), now()
    ) ON CONFLICT (provider_id, provider) DO NOTHING;

    -- 3) الملف الشخصي
    INSERT INTO public.profiles (id, full_name, username, branch_id, area_id, active)
    VALUES (u.id::uuid, u.full_name, u.username, u.branch_id::uuid, u.area_id::uuid, true)
    ON CONFLICT (id) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          username  = EXCLUDED.username,
          branch_id = EXCLUDED.branch_id,
          area_id   = EXCLUDED.area_id;

    -- 4) الصلاحية (مدير / مشرف / محصل)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (u.id::uuid, u.role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END $$;

-- 5) صلاحيات المشرفين التفصيلية
INSERT INTO public.supervisor_permissions (user_id, can_manage_collectors, can_review_deposits, can_manage_collections)
VALUES
  ('9f84e0ff-5625-4209-8eed-2e8655e72d39', false, true, true),
  ('131d94ee-125c-40da-b449-701f5bab57ba', false, true, true),
  ('6f5f8cbd-0f1e-4f93-9621-428dc943deae', false, true, true),
  ('4a73d80a-087e-44a2-9407-95b9e4a10f9f', false, true, true),
  ('6024ad3d-ef5a-4221-b12d-4c8ab8742b2a', false, true, false),
  ('10f03297-818f-4f55-b027-6940abd5054a', false, true, false)
ON CONFLICT (user_id) DO UPDATE SET
  can_manage_collectors = EXCLUDED.can_manage_collectors,
  can_review_deposits   = EXCLUDED.can_review_deposits,
  can_manage_collections = EXCLUDED.can_manage_collections;

-- 6) مناطق كل محصل (تعدد المناطق)
INSERT INTO public.profile_areas (user_id, area_id) VALUES
  ('95e3f415-8ec5-4e83-9570-69451dd50ef8','aa7d459a-84da-4c25-a65b-1815753e3585'),
  ('12678e97-858c-473d-9ca6-0fdaeb5c5b7e','aa7d459a-84da-4c25-a65b-1815753e3585'),
  ('86e0bff3-6a01-460f-ae15-07dc8a4d4601','aa7d459a-84da-4c25-a65b-1815753e3585'),
  ('dae78db0-82a6-4d48-bb11-370a057fd6a0','d3dcc9a5-28c6-4179-9351-c27378ff7280'),
  ('c2277637-7a1b-43af-ab5b-faafc7dfbcee','d3dcc9a5-28c6-4179-9351-c27378ff7280'),
  ('8c32f4a7-ba92-4cb4-81af-ef7a29028212','7542d4ef-0efd-4fd1-84fe-a9f1062d4650'),
  ('db4f89cf-f642-4e15-9394-43a8d967070c','7542d4ef-0efd-4fd1-84fe-a9f1062d4650'),
  ('d79c5937-3112-49e4-bf75-98c95f32539b','7542d4ef-0efd-4fd1-84fe-a9f1062d4650'),
  ('edc058d9-8144-4d1b-b733-953cb98418a8','7542d4ef-0efd-4fd1-84fe-a9f1062d4650'),
  ('47760c65-b10d-47f2-9e5c-5dd46f0d9fde','18e10a74-0758-459e-ab5a-cce2598219b3'),
  ('a950836d-98d9-4756-8279-eb8b81761006','18e10a74-0758-459e-ab5a-cce2598219b3'),
  ('a950836d-98d9-4756-8279-eb8b81761006','2b4e2532-2f65-4dca-8d2b-1e24c1c58cb4'),
  ('37a59610-6d4e-4b24-b573-183d8e6555f0','18e10a74-0758-459e-ab5a-cce2598219b3'),
  ('98146a95-5aa2-45df-8837-e2043220e79d','3db50c96-9afa-4117-a5c5-18f95db5d467')
ON CONFLICT (user_id, area_id) DO NOTHING;

-- ملاحظة: لو الفروع والمناطق غير موجودة بالقاعدة الجديدة، شغّل هذا أولًا:
-- INSERT INTO public.branches (id, name, active) VALUES
--   ('11111111-1111-1111-1111-111111111111','فرع جمصة',true) ON CONFLICT (id) DO NOTHING;
-- INSERT INTO public.areas (id, branch_id, name, active) VALUES
--   ('aa7d459a-84da-4c25-a65b-1815753e3585','11111111-1111-1111-1111-111111111111','فرع 1',true),
--   ('d3dcc9a5-28c6-4179-9351-c27378ff7280','11111111-1111-1111-1111-111111111111','فرع 2',true),
--   ('7542d4ef-0efd-4fd1-84fe-a9f1062d4650','11111111-1111-1111-1111-111111111111','فرع 3',true),
--   ('18e10a74-0758-459e-ab5a-cce2598219b3','11111111-1111-1111-1111-111111111111','فرع 4',true),
--   ('2b4e2532-2f65-4dca-8d2b-1e24c1c58cb4','11111111-1111-1111-1111-111111111111','فرع 5',true),
--   ('3db50c96-9afa-4117-a5c5-18f95db5d467','11111111-1111-1111-1111-111111111111','فرع 20',true)
--   ON CONFLICT (id) DO NOTHING;
