INSERT INTO public.org_units (name, code, type, parent_id, authorised_strength)
SELECT v.name, v.code, v.type::org_unit_type, '1ca5d24e-2a63-4b70-a47f-8ee3569732c0'::uuid, v.strength
FROM (VALUES
  ('Amasaman Station', 'GAR-AMS-STN', 'station', 60),
  ('Amasaman Operations Unit', 'GAR-AMS-OPS', 'unit', 40),
  ('Amasaman Control Post', 'GAR-AMS-CTL', 'control', 20)
) AS v(name, code, type, strength)
WHERE NOT EXISTS (SELECT 1 FROM public.org_units u WHERE u.code = v.code);