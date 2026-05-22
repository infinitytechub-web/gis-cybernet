---
name: Backup Schedules
description: Recurring system backups via system_backup_schedules + hourly run-backup-schedules edge function; per-schedule retention pruning
type: feature
---
- Table `system_backup_schedules` (admin RLS): name, frequency (hourly/daily/weekly/monthly/quarterly/annually), tables_included[], retention_days, is_active, last_run_at, last_run_status, next_run_at.
- pg_cron `run-backup-schedules-hourly` (minute 7) calls edge function `run-backup-schedules` with vault-stored service_role key from `email_queue_service_role_key`.
- Edge function: claim_due_backup_schedules() → for each runs same backup logic as system-backup, writes audit + snapshot (source='scheduled', schedule_id set), then prune_backup_schedule_history(), then mark_backup_schedule_ran().
- UI: `BackupSchedulesPanel` at top of System Backup page (admin-only); "Run due now" button invokes the function directly.
- Upload restore accepts `.json` and `.json.gz` (via DecompressionStream). `.sql/.csv/.xlsx/.zip` show friendly rejection — upsert-by-PK restore can't safely consume them.
