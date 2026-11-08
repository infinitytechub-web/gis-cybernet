CREATE OR REPLACE FUNCTION public.sync_grade_from_rank()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.rank_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.rank_id IS DISTINCT FROM OLD.rank_id) AND (TG_OP = 'INSERT' OR NEW.grade_id IS NOT DISTINCT FROM OLD.grade_id) THEN
    SELECT g.id INTO NEW.grade_id FROM ranks r JOIN rank_categories rc ON rc.id = r.category_id JOIN staff_grades g ON g.name = rc.name AND g.is_active WHERE r.id = NEW.rank_id;
    NEW.grade_id := coalesce(NEW.grade_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.grade_id END);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_grade_from_rank ON public.profiles;
CREATE TRIGGER trg_sync_grade_from_rank BEFORE INSERT OR UPDATE OF rank_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_grade_from_rank();