-- Audit table for interlink_lists
CREATE TABLE public.interlink_lists_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL,
  list_name text,
  action text NOT NULL CHECK (action IN ('create','update','delete')),
  actor_id uuid,
  actor_name text,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_row jsonb,
  after_row jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_interlink_lists_audit_at ON public.interlink_lists_audit(created_at DESC);
CREATE INDEX idx_interlink_lists_audit_list ON public.interlink_lists_audit(list_id);

ALTER TABLE public.interlink_lists_audit ENABLE ROW LEVEL SECURITY;

-- Block direct client writes; trigger uses SECURITY DEFINER
CREATE POLICY "Block direct writes interlink lists audit"
  ON public.interlink_lists_audit FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "Command tier reads interlink lists audit"
  ON public.interlink_lists_audit FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'oic'::app_role)
    OR has_role(auth.uid(),'2ic'::app_role)
    OR has_role(auth.uid(),'staff_officer'::app_role)
    OR has_role(auth.uid(),'head_of_administration'::app_role)
    OR has_role(auth.uid(),'chief_staff_officer'::app_role)
  );

-- Helper: build a JSON diff between two rows for the columns we care about
CREATE OR REPLACE FUNCTION public.log_interlink_list_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_name  text;
  v_diff  jsonb := '{}'::jsonb;
  v_action text;
BEGIN
  -- Resolve actor display name (best-effort)
  SELECT COALESCE(p.first_name || ' ' || p.last_name, p.email)
    INTO v_name FROM public.profiles p WHERE p.id = v_actor LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_diff := jsonb_build_object(
      'name',          jsonb_build_object('from', null, 'to', NEW.name),
      'description',   jsonb_build_object('from', null, 'to', NEW.description),
      'scope',         jsonb_build_object('from', null, 'to', NEW.scope),
      'member_emails', jsonb_build_object('from', null, 'to', to_jsonb(NEW.member_emails))
    );
    INSERT INTO public.interlink_lists_audit(list_id,list_name,action,actor_id,actor_name,diff,after_row)
      VALUES (NEW.id, NEW.name, v_action, v_actor, v_name, v_diff, to_jsonb(NEW));
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    IF NEW.name IS DISTINCT FROM OLD.name THEN
      v_diff := v_diff || jsonb_build_object('name', jsonb_build_object('from', OLD.name, 'to', NEW.name));
    END IF;
    IF NEW.description IS DISTINCT FROM OLD.description THEN
      v_diff := v_diff || jsonb_build_object('description', jsonb_build_object('from', OLD.description, 'to', NEW.description));
    END IF;
    IF NEW.scope IS DISTINCT FROM OLD.scope THEN
      v_diff := v_diff || jsonb_build_object('scope', jsonb_build_object('from', OLD.scope, 'to', NEW.scope));
    END IF;
    IF NEW.member_emails IS DISTINCT FROM OLD.member_emails THEN
      v_diff := v_diff || jsonb_build_object('member_emails',
        jsonb_build_object('from', to_jsonb(OLD.member_emails), 'to', to_jsonb(NEW.member_emails)));
    END IF;
    -- Only log if something actually changed
    IF v_diff <> '{}'::jsonb THEN
      INSERT INTO public.interlink_lists_audit(list_id,list_name,action,actor_id,actor_name,diff,before_row,after_row)
        VALUES (NEW.id, NEW.name, v_action, v_actor, v_name, v_diff, to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_diff := jsonb_build_object(
      'name',          jsonb_build_object('from', OLD.name, 'to', null),
      'member_emails', jsonb_build_object('from', to_jsonb(OLD.member_emails), 'to', null)
    );
    INSERT INTO public.interlink_lists_audit(list_id,list_name,action,actor_id,actor_name,diff,before_row)
      VALUES (OLD.id, OLD.name, v_action, v_actor, v_name, v_diff, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_interlink_lists_audit ON public.interlink_lists;
CREATE TRIGGER trg_interlink_lists_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.interlink_lists
  FOR EACH ROW EXECUTE FUNCTION public.log_interlink_list_change();