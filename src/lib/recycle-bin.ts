import { supabase } from "@/integrations/supabase/client";

/**
 * Centralized soft-delete helper.
 *
 * Replaces direct `supabase.from(table).delete().eq("id", id)` calls so that
 * mistakenly-deleted rows can be restored from the Recycle Bin (Admin / Command
 * OIC only). Files attached to the record are NOT removed from storage at this
 * stage — they are only purged when the bin entry is permanently deleted or
 * auto-expires after 30 days.
 */
export type StoragePath = { bucket: string; path: string };

export type RecyclableTable =
  | "announcements"
  | "announcement_files"
  | "holidays"
  | "departments"
  | "staff_documents"
  | "command_vault_files"
  | "report_uploads"
  | "report_schedules"
  | "procurement_documents"
  | "shift_assignments"
  | "misd_unit_assignments"
  | "certifications"
  | "equipment_issuance"
  | "inventory_items"
  | "inventory_categories"
  | "inventory_suppliers"
  | "detention_records"
  | "enforcement_operations"
  | "operations"
  | "cyber_incidents"
  | "cyber_investigations"
  | "cyber_threat_intel"
  | "leave_requests"
  | "postings_transfers"
  | "visa_applications"
  | "visa_extensions"
  | "permits"
  | "passport_applications"
  | "official_applications"
  | "enquiry_applications"
  | "front_desk_audit_log"
  | "night_guard_activity_log"
  | "platform_sync_history"
  | "staff_appraisals";

export interface SoftDeleteOptions {
  table: RecyclableTable;
  id: string;
  /** Human-friendly name shown in the Recycle Bin list */
  label?: string;
  /** Secondary line shown beneath the label (e.g. file size, applicant) */
  context?: string;
  /** Storage object(s) to keep around so they can be restored (NOT removed yet) */
  storagePaths?: StoragePath[];
}

/**
 * Move a record into the Recycle Bin instead of hard-deleting it.
 * Throws on failure so calling mutations show their existing error toasts.
 */
export async function softDelete(opts: SoftDeleteOptions): Promise<string> {
  const { data, error } = await supabase.rpc("soft_delete_record", {
    _table: opts.table,
    _record_id: opts.id,
    _display_label: opts.label ?? null,
    _display_context: opts.context ?? null,
    _storage_paths: (opts.storagePaths ?? []) as any,
  });
  if (error) throw error;
  return data as unknown as string;
}

/** Restore a single bin entry — Admin / Command OIC only (enforced server-side). */
export async function restoreRecycleBinEntry(binId: string): Promise<void> {
  const { error } = await supabase.rpc("restore_recycle_bin_entry", { _bin_id: binId });
  if (error) throw error;
}

/** Permanently delete a single bin entry (and its storage objects). */
export async function purgeRecycleBinEntry(binId: string): Promise<StoragePath[]> {
  const { data, error } = await supabase.rpc("purge_recycle_bin_entry", { _bin_id: binId });
  if (error) throw error;
  const paths = (data as unknown as StoragePath[]) ?? [];
  await removeStorageObjects(paths);
  return paths;
}

/** Empty the bin entirely. */
export async function emptyRecycleBin(): Promise<StoragePath[]> {
  const { data, error } = await supabase.rpc("empty_recycle_bin");
  if (error) throw error;
  const paths = (data as unknown as StoragePath[]) ?? [];
  await removeStorageObjects(paths);
  return paths;
}

/** Auto-purge expired entries (called when the user opens the bin). */
export async function purgeExpiredRecycleBin(): Promise<StoragePath[]> {
  const { data, error } = await supabase.rpc("purge_expired_recycle_bin");
  if (error) throw error;
  const paths = (data as unknown as StoragePath[]) ?? [];
  await removeStorageObjects(paths);
  return paths;
}

async function removeStorageObjects(paths: StoragePath[]): Promise<void> {
  if (!paths || paths.length === 0) return;
  // Group by bucket
  const grouped = new Map<string, string[]>();
  for (const p of paths) {
    if (!p?.bucket || !p?.path) continue;
    const list = grouped.get(p.bucket) ?? [];
    list.push(p.path);
    grouped.set(p.bucket, list);
  }
  await Promise.all(
    Array.from(grouped.entries()).map(([bucket, items]) =>
      supabase.storage.from(bucket).remove(items).catch(() => undefined)
    )
  );
}
