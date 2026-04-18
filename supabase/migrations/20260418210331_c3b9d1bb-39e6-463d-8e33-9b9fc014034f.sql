ALTER TABLE public.report_schedules
  DROP CONSTRAINT IF EXISTS report_schedules_frequency_check;

ALTER TABLE public.report_schedules
  ADD CONSTRAINT report_schedules_frequency_check
  CHECK (frequency = ANY (ARRAY['daily','weekly','monthly','quarterly','annually']));