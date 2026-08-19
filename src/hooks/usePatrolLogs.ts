/**
 * PATROL LOG data services.
 *
 * Patrol entries record date, time, district, personnel, incidents and photos.
 * Rows are scoped by RLS to the signed-in officer's own unit branch (command
 * tier reaches their whole branch), so the client filters for presentation only.
 * The same rows feed the per-unit dashboard through the `unit_dashboard` RPC.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const PATROL_PHOTO_BUCKET = "patrol-photos";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export const PATROL_TYPES = [
  "routine",
  "snap_check",
  "border_patrol",
  "escort",
  "night_patrol",
  "joint_operation",
  "surveillance",
  "other",
] as const;

export const PATROL_STATUSES = ["draft", "submitted", "reviewed", "closed"] as const;
export type PatrolStatus = (typeof PATROL_STATUSES)[number];

export interface PatrolLog {
  id: string;
  patrol_reference: string;
  patrol_date: string;
  start_time: string;
  end_time: string | null;
  district_id: string | null;
  district_name: string | null;
  org_unit_id: string | null;
  patrol_type: string;
  patrol_leader_id: string | null;
  personnel_count: number;
  vehicle_id: string | null;
  route_summary: string | null;
  incidents_count: number;
  incidents: string | null;
  observations: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_by: string;
  created_at: string;
}

export interface PatrolPhoto {
  id: string;
  patrol_log_id: string;
  storage_path: string;
  caption: string | null;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
  signedUrl?: string | null;
}

const SELECT_COLS =
  "id, patrol_reference, patrol_date, start_time, end_time, district_id, district_name, org_unit_id, patrol_type, patrol_leader_id, personnel_count, vehicle_id, route_summary, incidents_count, incidents, observations, status, reviewed_by, reviewed_at, review_notes, created_by, created_at";

export function isPatrolOpen(status: string) {
  return !["reviewed", "closed"].includes((status ?? "").toLowerCase());
}

export function usePatrolLogs(days = 90, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["patrol-logs", days],
    enabled: enabled && !!user,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PatrolLog[]> => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("patrol_logs")
        .select(SELECT_COLS)
        .gte("patrol_date", since)
        .order("patrol_date", { ascending: false })
        .order("start_time", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as PatrolLog[];
    },
  });
}

export function usePatrolPhotos(patrolLogId: string | null) {
  return useQuery({
    queryKey: ["patrol-photos", patrolLogId],
    enabled: !!patrolLogId,
    queryFn: async (): Promise<PatrolPhoto[]> => {
      const { data, error } = await supabase
        .from("patrol_log_photos")
        .select("id, patrol_log_id, storage_path, caption, content_type, size_bytes, uploaded_by, created_at")
        .eq("patrol_log_id", patrolLogId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as PatrolPhoto[];
      if (rows.length === 0) return [];
      const { data: signed } = await supabase.storage
        .from(PATROL_PHOTO_BUCKET)
        .createSignedUrls(rows.map((r) => r.storage_path), 600);
      return rows.map((r, i) => ({ ...r, signedUrl: signed?.[i]?.signedUrl ?? null }));
    },
  });
}

export function validatePatrolPhoto(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `${file.name}: only JPEG, PNG or WebP photos are accepted`;
  }
  if (file.size > MAX_PHOTO_BYTES) return `${file.name}: larger than the 10 MB limit`;
  return null;
}

async function uploadPatrolPhotos(patrolLogId: string, files: File[], uploaderId: string) {
  for (const file of files) {
    const problem = validatePatrolPhoto(file);
    if (problem) throw new Error(problem);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${patrolLogId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(PATROL_PHOTO_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;
    const { error: rowErr } = await supabase.from("patrol_log_photos").insert({
      patrol_log_id: patrolLogId,
      storage_path: path,
      content_type: file.type,
      size_bytes: file.size,
      uploaded_by: uploaderId,
    });
    if (rowErr) throw rowErr;
  }
}

export interface PatrolLogInput {
  patrol_date: string;
  start_time: string;
  end_time?: string | null;
  district_id?: string | null;
  org_unit_id?: string | null;
  patrol_type: string;
  patrol_leader_id?: string | null;
  personnel_count: number;
  vehicle_id?: string | null;
  route_summary?: string | null;
  incidents_count: number;
  incidents?: string | null;
  observations?: string | null;
  status: PatrolStatus;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["patrol-logs"] });
  qc.invalidateQueries({ queryKey: ["unit-dashboard"] });
  qc.invalidateQueries({ queryKey: ["command-console"] });
}

export function useCreatePatrolLog() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: PatrolLogInput & { photos?: File[] }) => {
      if (!user) throw new Error("Not signed in");
      const { photos, ...row } = input;
      const { data, error } = await supabase
        .from("patrol_logs")
        .insert({
          patrol_reference: "",
          patrol_date: row.patrol_date,
          start_time: row.start_time,
          end_time: row.end_time || null,
          district_id: row.district_id || null,
          org_unit_id: row.org_unit_id || null,
          patrol_type: row.patrol_type,
          patrol_leader_id: row.patrol_leader_id || null,
          personnel_count: row.personnel_count ?? 0,
          vehicle_id: row.vehicle_id || null,
          route_summary: row.route_summary || null,
          incidents_count: row.incidents_count ?? 0,
          incidents: row.incidents || null,
          observations: row.observations || null,
          status: row.status,
          created_by: user.id,
        })
        .select("id, patrol_reference")
        .single();
      if (error) throw error;
      if (photos?.length) await uploadPatrolPhotos(data.id, photos, user.id);
      return data;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdatePatrolLog() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { id: string; photos?: File[] } & Partial<PatrolLogInput>) => {
      const { id, photos, ...patch } = input;
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("patrol_logs").update(patch).eq("id", id);
        if (error) throw error;
      }
      if (photos?.length && user) await uploadPatrolPhotos(id, photos, user.id);
    },
    onSuccess: (_d, v) => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: ["patrol-photos", v.id] });
    },
  });
}

/** Command-tier review: mark an entry reviewed or closed with a note. */
export function useReviewPatrolLog() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: PatrolStatus; note?: string }) => {
      const { error } = await supabase
        .from("patrol_logs")
        .update({
          status,
          review_notes: note || null,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeletePatrolLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("patrol_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeletePatrolPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photo: PatrolPhoto) => {
      const { error } = await supabase.from("patrol_log_photos").delete().eq("id", photo.id);
      if (error) throw error;
      await supabase.storage.from(PATROL_PHOTO_BUCKET).remove([photo.storage_path]);
    },
    onSuccess: (_d, photo) => {
      qc.invalidateQueries({ queryKey: ["patrol-photos", photo.patrol_log_id] });
    },
  });
}
