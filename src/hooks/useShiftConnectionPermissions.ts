import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";

export type ShiftConnectionAction = "disconnect" | "reconnect" | "purge" | "export";

/**
 * Returns a map of action → boolean indicating whether the current user is
 * permitted to perform each shift platform connection action. Admins are
 * always allowed. Other roles are gated by the `shift_connection_permissions`
 * matrix maintained by admins in Settings.
 */
export function useShiftConnectionPermissions() {
  const { user, role, isAdmin } = useAuthContext();

  const query = useQuery({
    queryKey: ["shift-connection-permissions", role],
    enabled: !!user && !isAdmin,
    queryFn: async (): Promise<Record<ShiftConnectionAction, boolean>> => {
      const { data, error } = await supabase
        .from("shift_connection_permissions" as any)
        .select("action, allowed")
        .eq("role", role as string);
      if (error) throw error;
      const map: Record<ShiftConnectionAction, boolean> = {
        disconnect: false,
        reconnect: false,
        purge: false,
        export: false,
      };
      for (const row of (data ?? []) as Array<{ action: ShiftConnectionAction; allowed: boolean }>) {
        map[row.action] = !!row.allowed;
      }
      return map;
    },
  });

  const all: Record<ShiftConnectionAction, boolean> = isAdmin
    ? { disconnect: true, reconnect: true, purge: true, export: true }
    : query.data ?? { disconnect: false, reconnect: false, purge: false, export: false };

  return {
    can: all,
    isLoading: !isAdmin && query.isLoading,
  };
}
