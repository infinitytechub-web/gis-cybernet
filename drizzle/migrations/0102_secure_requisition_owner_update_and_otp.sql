DROP POLICY IF EXISTS "Update own draft requisitions" ON public.purchase_requisitions;
CREATE POLICY "Update own draft requisitions" ON public.purchase_requisitions
 FOR UPDATE TO authenticated
 USING (requested_by = auth.uid() AND status = 'draft')
 WITH CHECK (requested_by = auth.uid() AND status IN ('draft','pending','cancelled') AND approved_by IS NULL AND approved_at IS NULL);

CREATE OR REPLACE FUNCTION public.issue_otp(_purpose text DEFAULT 'login'::text, _ttl_minutes integer DEFAULT 10)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE _code text; _uid uuid := auth.uid(); _n bigint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _n := ('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint;
  _code := lpad((_n % 1000000)::text, 6, '0');
  INSERT INTO public.otp_codes (user_id, code_hash, purpose, expires_at, used)
  VALUES (_uid, _code, COALESCE(_purpose, 'login'), now() + make_interval(mins => LEAST(15, GREATEST(1, _ttl_minutes))), false);
  RETURN _code;
END;
$function$;
REVOKE ALL ON FUNCTION public.issue_otp(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_otp(text, integer) TO service_role;