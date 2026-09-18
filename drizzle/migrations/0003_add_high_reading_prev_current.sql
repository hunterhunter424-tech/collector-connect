ALTER TABLE public.high_readings
  ADD COLUMN IF NOT EXISTS previous_reading numeric,
  ADD COLUMN IF NOT EXISTS current_reading numeric;