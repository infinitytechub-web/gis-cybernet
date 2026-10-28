import { useEffect, useId } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ATTENDANCE_REPORT_KEYS = [
  "attendance-hours-summary", "attendance_validation", "my-shift-tracker", "today-duty",
] as const;

/** Refresh scoped reads, never broadcast staff records through the client. */
export function useAttendanceReportSync() {
  const queryClient = useQueryClient();
  const id = useId();
  useEffect(() => {
    const channel = supabase.channel(`attendance-report-sync-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendances" }, () => {
        ATTENDANCE_REPORT_KEYS.forEach((key) => {
          void queryClient.invalidateQueries({ queryKey: [key] });
        });
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id, queryClient]);
}