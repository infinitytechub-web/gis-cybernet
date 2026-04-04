INSERT INTO public.holidays (name, date, recurring) VALUES
  ('New Year''s Day', '2026-01-01', true),
  ('Constitution Day', '2026-01-07', true),
  ('Independence Day', '2026-03-06', true),
  ('Good Friday', '2026-04-03', false),
  ('Easter Monday', '2026-04-06', false),
  ('May Day', '2026-05-01', true),
  ('Eid al-Fitr', '2026-03-20', false),
  ('Eid al-Adha', '2026-05-27', false),
  ('Founders'' Day', '2026-08-04', true),
  ('Kwame Nkrumah Memorial Day', '2026-09-21', true),
  ('Farmers'' Day', '2026-12-04', true),
  ('Christmas Day', '2026-12-25', true),
  ('Boxing Day', '2026-12-26', true)
ON CONFLICT DO NOTHING;