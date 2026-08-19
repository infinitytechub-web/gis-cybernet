UPDATE public.operations SET status = 'open'
 WHERE id IN (SELECT record_id FROM public.status_change_audit WHERE entity_table = 'operations' AND reason = 'E2E verification: operation concluded');

UPDATE public.detention_records SET status = 'in_custody', released_at = NULL, released_by = NULL, release_reason = NULL
 WHERE id IN (SELECT record_id FROM public.status_change_audit WHERE entity_table = 'detention_records' AND reason = 'E2E verification: released after screening');

DELETE FROM public.status_change_audit WHERE reason LIKE 'E2E verification:%';