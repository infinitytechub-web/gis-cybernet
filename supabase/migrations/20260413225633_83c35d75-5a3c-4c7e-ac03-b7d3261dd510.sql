
ALTER TABLE profiles DISABLE TRIGGER USER;

UPDATE profiles SET gender = 'Female', rank_id = '763fb870-849c-429a-92a0-c1032dfdf9ec', email = 'akua.adomah@gis.local' WHERE id = '3621456a-7ec1-4734-b5ba-f3ef0efbf0df';
UPDATE profiles SET gender = 'Male', rank_id = 'fa4e8a15-8277-4da9-955b-dd253258f3ff', email = 'arron.asare@gis.local' WHERE id = 'df49b5b7-35a7-4bc3-9784-31631e74bff5';
UPDATE profiles SET gender = 'Female', rank_id = 'fa4e8a15-8277-4da9-955b-dd253258f3ff', email = 'grace.boateng@gis.local' WHERE id = 'd5f1a740-3523-4fab-9f96-318a985f0be9';
UPDATE profiles SET gender = 'Male', rank_id = '301f0448-0244-4fcd-9aa2-e02149071a5c', email = 'jeffrey.dankwah@gis.local' WHERE id = 'd9133f96-3a4d-4cef-a0f7-95bc701224ce';
UPDATE profiles SET gender = 'Male', rank_id = '301f0448-0244-4fcd-9aa2-e02149071a5c', email = 'nana.ofei-asare@gis.local' WHERE id = 'a476fe54-195e-47f3-b40a-0d373c1a55e1';
UPDATE profiles SET gender = 'Male', rank_id = 'fa4e8a15-8277-4da9-955b-dd253258f3ff', email = 'owusu.kwapong@gis.local' WHERE id = '80c01f52-5869-4489-9791-515bf8ff7910';

ALTER TABLE profiles ENABLE TRIGGER USER;
