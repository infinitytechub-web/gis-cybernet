CREATE TABLE public.me_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  audience_type text NOT NULL CHECK (audience_type IN ('individual','department','command','reply')),
  target_profile_id uuid,
  target_department_id uuid,
  target_org_unit_id uuid,
  parent_id uuid REFERENCES public.me_messages(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','important','urgent')),
  recipient_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.me_message_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.me_messages(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL,
  recipient_profile_id uuid,
  status text NOT NULL DEFAULT 'delivered' CHECK (status IN ('queued','delivered','read')),
  delivered_at timestamptz DEFAULT now(),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, recipient_user_id)
);
CREATE TABLE public.me_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.me_messages(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  filename text NOT NULL,
  size_bytes bigint,
  mime_type text,
  sha256 text,
  scan_action text NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.me_message_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  message_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.me_message_recipients (recipient_user_id, read_at);
CREATE INDEX ON public.me_messages (sender_id, created_at DESC);
CREATE INDEX ON public.me_messages (parent_id);

GRANT SELECT ON public.me_messages, public.me_message_recipients, public.me_message_attachments, public.me_message_audit TO authenticated;
GRANT INSERT ON public.me_message_audit TO authenticated;
GRANT ALL ON public.me_messages, public.me_message_recipients, public.me_message_attachments, public.me_message_audit TO service_role;

ALTER TABLE public.me_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.me_message_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.me_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.me_message_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.me_comm_can_send(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id=_uid AND role IN
    ('admin','oic','2ic','head_of_administration','chief_staff_officer','command_officer','me_officer','project_manager'))
  OR (EXISTS (SELECT 1 FROM user_roles WHERE user_id=_uid AND role='staff_officer')
      AND EXISTS (SELECT 1 FROM command_tier_grants WHERE user_id=_uid AND capability IN ('me-communications','*')
                  AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())));
$$;

CREATE OR REPLACE FUNCTION public.me_comm_can_view(_uid uuid, _mid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT has_role(_uid,'admin')
    OR EXISTS (SELECT 1 FROM me_messages m WHERE m.id=_mid AND m.sender_id=_uid)
    OR EXISTS (SELECT 1 FROM me_message_recipients r WHERE r.message_id=_mid AND r.recipient_user_id=_uid)
    OR EXISTS (SELECT 1 FROM me_messages m JOIN me_messages p ON p.id=m.parent_id WHERE m.id=_mid AND (p.sender_id=_uid));
$$;

CREATE POLICY "view messages" ON public.me_messages FOR SELECT TO authenticated USING (public.me_comm_can_view(auth.uid(), id));
CREATE POLICY "view recipients" ON public.me_message_recipients FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid() OR has_role(auth.uid(),'admin')
         OR EXISTS (SELECT 1 FROM me_messages m WHERE m.id=message_id AND m.sender_id=auth.uid()));
CREATE POLICY "view attachments" ON public.me_message_attachments FOR SELECT TO authenticated USING (public.me_comm_can_view(auth.uid(), message_id));
CREATE POLICY "admins read comm audit" ON public.me_message_audit FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'oic') OR has_role(auth.uid(),'2ic'));
CREATE POLICY "self log comm audit" ON public.me_message_audit FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND action IN ('attachment_download','attachment_blocked','attachment_uploaded'));

CREATE OR REPLACE FUNCTION public.block_me_message_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND current_setting('app.audit_purge', true)='on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Communication audit records are immutable';
END $$;
CREATE TRIGGER me_message_audit_immutable BEFORE UPDATE OR DELETE ON public.me_message_audit
  FOR EACH ROW EXECUTE FUNCTION public.block_me_message_audit_mutation();

CREATE OR REPLACE FUNCTION public.me_send_message(
  _audience text, _target uuid, _subject text, _body text, _priority text DEFAULT 'normal',
  _attachments jsonb DEFAULT '[]'::jsonb, _parent uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid := auth.uid(); _mid uuid; _n int; _a jsonb; _unit uuid; _root uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE='42501'; END IF;
  IF length(trim(coalesce(_subject,''))) = 0 OR length(trim(coalesce(_body,''))) = 0 THEN RAISE EXCEPTION 'Subject and message are required'; END IF;
  IF length(_subject) > 200 OR length(_body) > 10000 THEN RAISE EXCEPTION 'Message is too long'; END IF;
  IF coalesce(_priority,'normal') NOT IN ('normal','important','urgent') THEN RAISE EXCEPTION 'Invalid priority'; END IF;
  IF jsonb_array_length(coalesce(_attachments,'[]'::jsonb)) > 5 THEN RAISE EXCEPTION 'At most 5 attachments'; END IF;

  IF _parent IS NOT NULL THEN
    IF NOT me_comm_can_view(_uid, _parent) THEN RAISE EXCEPTION 'Not authorised to reply' USING ERRCODE='42501'; END IF;
    SELECT coalesce(parent_id, id) INTO _root FROM me_messages WHERE id=_parent;
    INSERT INTO me_messages(sender_id,audience_type,parent_id,subject,body,priority)
      VALUES (_uid,'reply',_root,_subject,_body,coalesce(_priority,'normal')) RETURNING id INTO _mid;
    INSERT INTO me_message_recipients(message_id,recipient_user_id,recipient_profile_id)
      SELECT DISTINCT _mid, u.uid, p.id FROM (
        SELECT sender_id uid FROM me_messages WHERE id=_root
        UNION SELECT recipient_user_id FROM me_message_recipients WHERE message_id=_root
      ) u LEFT JOIN profiles p ON p.user_id=u.uid WHERE u.uid <> _uid
      ON CONFLICT DO NOTHING;
  ELSE
    IF NOT me_comm_can_send(_uid) THEN
      INSERT INTO me_message_audit(actor_id,action,details) VALUES (_uid,'send_denied',jsonb_build_object('audience',_audience,'target',_target));
      RAISE EXCEPTION 'Not authorised to send communications' USING ERRCODE='42501';
    END IF;
    IF _audience = 'individual' THEN
      SELECT org_unit_id INTO _unit FROM profiles WHERE id=_target AND deleted_at IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'Recipient not found'; END IF;
      IF NOT has_role(_uid,'admin') AND NOT can_access_staff_profile(_uid,_target) THEN
        INSERT INTO me_message_audit(actor_id,action,details) VALUES (_uid,'send_denied',jsonb_build_object('audience',_audience,'target',_target));
        RAISE EXCEPTION 'Recipient is outside your command scope' USING ERRCODE='42501';
      END IF;
    ELSIF _audience = 'command' THEN
      IF NOT has_role(_uid,'admin') AND NOT (has_org_access(_uid,_target) AND can_manage_org_unit(_uid,_target)) THEN
        INSERT INTO me_message_audit(actor_id,action,details) VALUES (_uid,'send_denied',jsonb_build_object('audience',_audience,'target',_target));
        RAISE EXCEPTION 'Command is outside your scope' USING ERRCODE='42501';
      END IF;
    ELSIF _audience <> 'department' THEN RAISE EXCEPTION 'Invalid audience';
    END IF;

    INSERT INTO me_messages(sender_id,audience_type,target_profile_id,target_department_id,target_org_unit_id,subject,body,priority)
      VALUES (_uid,_audience,
        CASE WHEN _audience='individual' THEN _target END,
        CASE WHEN _audience='department' THEN _target END,
        CASE WHEN _audience='command' THEN _target END,
        _subject,_body,coalesce(_priority,'normal')) RETURNING id INTO _mid;

    INSERT INTO me_message_recipients(message_id,recipient_user_id,recipient_profile_id)
      SELECT _mid, p.user_id, p.id FROM profiles p
      WHERE p.deleted_at IS NULL AND p.user_id IS NOT NULL AND p.user_id <> _uid
        AND CASE _audience
          WHEN 'individual' THEN p.id=_target
          WHEN 'department' THEN p.department_id=_target AND (has_role(_uid,'admin') OR can_access_staff_profile(_uid,p.id))
          WHEN 'command' THEN p.org_unit_id IN (SELECT d FROM org_unit_descendants(_target) d UNION SELECT _target)
        END
      ON CONFLICT DO NOTHING;
  END IF;

  GET DIAGNOSTICS _n = ROW_COUNT;
  SELECT count(*) INTO _n FROM me_message_recipients WHERE message_id=_mid;
  IF _n = 0 THEN RAISE EXCEPTION 'No recipients found for this audience'; END IF;
  UPDATE me_messages SET recipient_count=_n WHERE id=_mid;

  FOR _a IN SELECT * FROM jsonb_array_elements(coalesce(_attachments,'[]'::jsonb)) LOOP
    IF split_part(_a->>'path','/',1) <> _uid::text THEN RAISE EXCEPTION 'Invalid attachment'; END IF;
    IF (_a->>'scan') NOT IN ('allow','warn') THEN RAISE EXCEPTION 'Attachment failed security scan'; END IF;
    INSERT INTO me_message_attachments(message_id,storage_path,filename,size_bytes,mime_type,sha256,scan_action,uploaded_by)
      VALUES (_mid,_a->>'path',_a->>'name',(_a->>'size')::bigint,_a->>'mime',_a->>'sha',_a->>'scan',_uid);
  END LOOP;

  INSERT INTO me_message_audit(actor_id,action,message_id,details)
    VALUES (_uid, CASE WHEN _parent IS NULL THEN 'send' ELSE 'reply' END, _mid,
      jsonb_build_object('audience',_audience,'target',_target,'recipients',_n,'attachments',jsonb_array_length(coalesce(_attachments,'[]'::jsonb)),'priority',_priority));
  RETURN _mid;
END $$;

CREATE OR REPLACE FUNCTION public.me_mark_read(_message uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE me_message_recipients SET status='read', read_at=now()
   WHERE message_id=_message AND recipient_user_id=auth.uid() AND read_at IS NULL;
  IF FOUND THEN INSERT INTO me_message_audit(actor_id,action,message_id) VALUES (auth.uid(),'read',_message); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.me_message_stats() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH mine AS (SELECT * FROM me_messages WHERE sender_id=auth.uid() OR has_role(auth.uid(),'admin')),
  rc AS (SELECT r.* FROM me_message_recipients r JOIN mine m ON m.id=r.message_id)
  SELECT jsonb_build_object(
    'sent_today',(SELECT count(*) FROM mine WHERE created_at >= date_trunc('day',now())),
    'sent_7d',(SELECT count(*) FROM mine WHERE created_at >= now()-interval '7 days'),
    'delivered',(SELECT count(*) FROM rc WHERE delivered_at IS NOT NULL),
    'read',(SELECT count(*) FROM rc WHERE read_at IS NOT NULL),
    'unread_inbox',(SELECT count(*) FROM me_message_recipients WHERE recipient_user_id=auth.uid() AND read_at IS NULL),
    'attachments',(SELECT count(*) FROM me_message_attachments a JOIN mine m ON m.id=a.message_id),
    'blocked',(SELECT count(*) FROM me_message_audit WHERE action='attachment_blocked' AND (actor_id=auth.uid() OR has_role(auth.uid(),'admin'))),
    'by_audience',(SELECT coalesce(jsonb_object_agg(audience_type,c),'{}'::jsonb) FROM (SELECT audience_type,count(*) c FROM mine GROUP BY 1) x)
  );
$$;

CREATE OR REPLACE FUNCTION public.me_attachment_can_read(_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM me_message_attachments a WHERE a.storage_path=_path AND me_comm_can_view(auth.uid(), a.message_id));
$$;
CREATE POLICY "Message recipients read attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='secure-uploads' AND public.me_attachment_can_read(name));

REVOKE EXECUTE ON FUNCTION public.me_send_message(text,uuid,text,text,text,jsonb,uuid), public.me_mark_read(uuid), public.me_message_stats() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.me_send_message(text,uuid,text,text,text,jsonb,uuid), public.me_mark_read(uuid), public.me_message_stats(), public.me_comm_can_send(uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.me_messages, public.me_message_recipients;

CREATE OR REPLACE FUNCTION public.purge_audit_records(_table text, _before timestamp with time zone, _reason text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _n integer; _col text; _allowed text[] := ARRAY[
  'system_audit_log','security_audit_log','staff_access_log','sensitive_table_access_log','front_desk_audit_log',
  'command_role_audit','compliance_upload_audit','enforcement_field_audit','hrm_export_audit','map_access_audit',
  'mfa_challenge_audit','request_approval_audit','session_action_audit','webauthn_audit','biodata_restricted_access_log',
  'staff_list_import_audit','guard_duty_import_audit','staff_bulk_upload_audit','status_change_audit',
  'announcement_file_audit','interlink_lists_audit','ip_block_audit','shift_window_override_audit',
  'rotation_change_proposal_audit','staff_appraisal_audit','account_unlock_audit','command_vault_file_audit','me_message_audit'];
BEGIN
  IF NOT public.can_purge_audit() THEN RAISE EXCEPTION 'Not authorised to purge audit records' USING ERRCODE='42501'; END IF;
  IF NOT (_table = ANY(_allowed)) OR to_regclass('public.'||_table) IS NULL THEN RAISE EXCEPTION 'This audit trail cannot be purged'; END IF;
  IF length(coalesce(trim(_reason),'')) < 8 THEN RAISE EXCEPTION 'A reason of at least 8 characters is required'; END IF;
  IF _before > now() - interval '30 days' THEN RAISE EXCEPTION 'Only entries older than 30 days can be purged'; END IF;
  SELECT column_name INTO _col FROM information_schema.columns
   WHERE table_schema='public' AND table_name=_table AND data_type LIKE 'timestamp%'
   ORDER BY (column_name='created_at') DESC, ordinal_position LIMIT 1;
  IF _col IS NULL THEN RAISE EXCEPTION 'Audit trail has no timestamp column'; END IF;
  PERFORM set_config('app.audit_purge','on',true);
  EXECUTE format('DELETE FROM public.%I WHERE %I < $1', _table, _col) USING _before;
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM set_config('app.audit_purge','off',true);
  INSERT INTO system_audit_log(action, entity_type, entity_id, performed_by, details)
  VALUES ('purge_audit_records', _table, NULL, auth.uid(),
          jsonb_build_object('before', _before, 'rows', _n, 'reason', trim(_reason)));
  RETURN _n;
END $function$;