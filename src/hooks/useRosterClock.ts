/**
 * ROSTER CLOCK — clock a staff member in or out straight from the staff roster.
 *
 * All the decision-making lives server-side in `roster_clock_action`: it checks
 * the caller may act for that officer (self, admin, OIC/2IC/staff officer, or
 * the officer's own supervisor), reads the effective attendance window (shift
 * start/end plus grace, from `get_effective_attendance_window`), marks the
 * attendance row `present` or `late`, and returns a late / early alert so the
 * UI can raise it.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { validatePhotoFile } from "@/lib/image-upload";
import { toast } from "sonner";

export type ClockAction = "check_in" | "check_out";

export const ATTENDANCE_PHOTO_BUCKET = "attendance-photos";

/**
 * Photos must be under 3MB, really be a JPG/PNG/WEBP (magic bytes, not just the
 * extension) and pass the threat scan. Returns an error message, or null.
 */
export async function validateClockPhoto(file: File): Promise<string | null> {
  const check = await validatePhotoFile(file);
  return check.ok ? null : `${check.reason}`;
}

export interface ClockResult {
  attendance_id: string;
  profile_id: string;
  date: string;
  action: ClockAction;
  status: string;
  check_in: string | null;
  check_out: string | null;
  shift_start: string | null;
  shift_end: string | null;
  grace_minutes: number;
  late_minutes: number;
  early_minutes: number;
  reason: string | null;
  photo_path: string | null;
  on_behalf: boolean;
  /** "ok" | "late" | "early" */
  severity: string;
  alert: string | null;
}

export function useRosterClock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      profileId: string;
      action: ClockAction;
      notes?: string;
      /** Why the officer is clocking now — required when acting for someone else. */
      reason?: string;
      /** Optional proof-of-presence photo, stored privately. */
      photo?: File | null;
      /** Only used for the toast copy. */
      name?: string;
    }): Promise<ClockResult> => {
      let photoPath: string | null = null;
      if (vars.photo) {
        const invalid = await validateClockPhoto(vars.photo);
        if (invalid) throw new Error(invalid);
        const ext = vars.photo.name.split(".").pop()?.toLowerCase() ?? "jpg";
        photoPath = `${vars.profileId}/${vars.action}-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(ATTENDANCE_PHOTO_BUCKET)
          .upload(photoPath, vars.photo, { contentType: vars.photo.type, upsert: false });
        if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`);
      }

      const { data, error } = await supabase.rpc("roster_clock_action", {
        _profile_id: vars.profileId,
        _action: vars.action,
        _notes: vars.notes ?? null,
        _reason: vars.reason?.trim() || null,
        _photo_path: photoPath,
      } as any);
      if (error) throw error;
      return data as unknown as ClockResult;
    },
    onSuccess: (res, vars) => {
      // Refresh every surface that reports attendance: roster columns, the
      // Command Dashboard "Staff attendance today" KPI and unit roll-ups.
      qc.invalidateQueries({ queryKey: ["staff-roster"] });
      qc.invalidateQueries({ queryKey: ["command-roster"] });
      qc.invalidateQueries({ queryKey: ["command-dashboard"] });
      qc.invalidateQueries({ queryKey: ["unit-roster"] });
      qc.invalidateQueries({ queryKey: ["my-attendance"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["unit-dashboard"] });

      const who = vars.name ? `${vars.name}: ` : "";
      const time = (res.action === "check_in" ? res.check_in : res.check_out) ?? null;
      const stamp = time
        ? new Date(time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
        : "";
      const verb = res.action === "check_in" ? "Clocked in" : "Clocked out";

      if (res.severity === "late") {
        toast.warning(`${who}${verb} at ${stamp}`, { description: res.alert ?? undefined });
      } else if (res.severity === "early") {
        toast.warning(`${who}${verb} at ${stamp}`, { description: res.alert ?? undefined });
      } else {
        toast.success(`${who}${verb} at ${stamp}`, {
          description: res.action === "check_in" ? "Marked present on today's attendance." : undefined,
        });
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not record attendance"),
  });
}
