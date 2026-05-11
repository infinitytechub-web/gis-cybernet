UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) - 'must_change_password'
WHERE email IN ('deputy.001@gis.local','gis.admin.001@gis.local','gis.asc.0007@gis.local')
   OR raw_user_meta_data->>'staff_id' IN ('DEPUTY-001','GIS-ADMIN-001','GIS-ASC-0007');