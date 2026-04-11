ALTER TABLE profiles DISABLE TRIGGER restrict_profile_updates;
ALTER TABLE profiles DISABLE TRIGGER enforce_profile_field_restrictions;

UPDATE profiles SET department_id = 'f31320e7-dd70-4181-ab1d-8febf5af753a' WHERE id IN (
  '2708f7c6-c358-4cb6-9898-3cb1af871ebe',
  'b1d44754-2296-4adc-ab35-a2d9036e4fd5',
  'dfd93364-c837-40a7-81b9-f27daba6eb00',
  '9db9ef28-9927-41f5-8466-0788234509a5',
  'a71eb258-5acc-47fa-bb80-6741c309b8a2',
  '6431529d-aba7-438a-a7c2-5e996e965419',
  '07a47fdc-2804-48f0-b9e9-055d06ae2ffc',
  'e9c00445-eb13-43b5-b96b-29826144ce56'
);

ALTER TABLE profiles ENABLE TRIGGER restrict_profile_updates;
ALTER TABLE profiles ENABLE TRIGGER enforce_profile_field_restrictions;