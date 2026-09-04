/**
 * INCIDENT PHOTOS attached to command alerts.
 *
 * Files live in the private `command-incidents` bucket; the register row in
 * `command_alert_photos` is what carries the caption and the link to the alert.
 * Viewing goes through short-lived signed URLs — no public object URLs exist.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { validatePhotoFile } from "@/lib/image-upload";

export const INCIDENT_PHOTO_BUCKET = "command-incidents";

export interface AlertPhoto {
  id: string;
  alert_id: string;
  storage_path: string;
  caption: string | null;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
  signedUrl: string | null;
}

export function useAlertPhotos(alertId: string | null) {
  return useQuery({
    queryKey: ["command-alert-photos", alertId],
    enabled: !!alertId,
    queryFn: async (): Promise<AlertPhoto[]> => {
      const { data, error } = await supabase
        .from("command_alert_photos")
        .select("id, alert_id, storage_path, caption, content_type, size_bytes, uploaded_by, created_at")
        .eq("alert_id", alertId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];

      const { data: signed } = await supabase.storage
        .from(INCIDENT_PHOTO_BUCKET)
        .createSignedUrls(rows.map((r) => r.storage_path), 600);

      return rows.map((r, i) => ({
        ...r,
        signedUrl: signed?.[i]?.signedUrl ?? null,
      })) as AlertPhoto[];
    },
  });
}

/**
 * Photos must be under 3MB, really be a JPG/PNG/WEBP (magic bytes, not just the
 * extension) and pass the threat scan. Returns an error message, or null.
 */
export async function validatePhoto(file: File): Promise<string | null> {
  const check = await validatePhotoFile(file);
  return check.ok ? null : `${file.name}: ${check.reason}`;
}

/** Upload one or more photos and register them against an alert. */
export function useUploadAlertPhotos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ alertId, files, caption }: { alertId: string; files: File[]; caption?: string | null }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");

      let uploaded = 0;
      for (const file of files) {
        const problem = await validatePhoto(file);
        if (problem) throw new Error(problem);

        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${alertId}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(INCIDENT_PHOTO_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;

        const { error: rowErr } = await supabase.from("command_alert_photos").insert({
          alert_id: alertId,
          storage_path: path,
          caption: caption ?? null,
          content_type: file.type,
          size_bytes: file.size,
          uploaded_by: uid,
        });
        if (rowErr) {
          // Keep the bucket clean when the register row is refused.
          await supabase.storage.from(INCIDENT_PHOTO_BUCKET).remove([path]);
          throw rowErr;
        }
        uploaded += 1;
      }
      return uploaded;
    },
    onSuccess: (_n, v) => {
      qc.invalidateQueries({ queryKey: ["command-alert-photos", v.alertId] });
    },
  });
}

export function useDeleteAlertPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ photo }: { photo: AlertPhoto }) => {
      const { error } = await supabase.from("command_alert_photos").delete().eq("id", photo.id);
      if (error) throw error;
      await supabase.storage.from(INCIDENT_PHOTO_BUCKET).remove([photo.storage_path]);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["command-alert-photos", v.photo.alert_id] });
    },
  });
}
