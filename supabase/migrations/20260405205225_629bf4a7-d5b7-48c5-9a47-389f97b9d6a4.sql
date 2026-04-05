
-- Delete OPS department
DELETE FROM departments WHERE name = 'OPS';

-- Fix casing: these should NOT be all-caps
UPDATE departments SET name = 'Deputy Staff Officer' WHERE name = 'DEPUTY STAFF OFFICER';
UPDATE departments SET name = 'Legal' WHERE name = 'LEGAL';
UPDATE departments SET name = 'Night Guard Duty' WHERE name = 'NIGHT GUARD DUTY';
UPDATE departments SET name = 'Staff Officer' WHERE name = 'STAFF OFFICER';
