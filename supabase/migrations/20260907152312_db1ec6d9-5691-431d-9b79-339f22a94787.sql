ALTER TABLE public.collection_entries ADD COLUMN IF NOT EXISTS screenshot_url text;

DROP POLICY IF EXISTS "receipts select staff" ON storage.objects;
CREATE POLICY "receipts select staff" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'receipts' AND public.is_staff());