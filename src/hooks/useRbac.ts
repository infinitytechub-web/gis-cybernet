import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canAccessModule, canAccessPath, type AccessInput } from "@/lib/rbac";

/**
 * Loads the two admin-controlled inputs to the RBAC decision once per session:
 *   • `permission_matrix_overrides` — System Settings permission matrix.
 *   • active `command_tier_grants`  — delegated capabilities for this user.
 *
 * Both are cached for the session; the resolved helpers are pure functions of
 * role + overrides + capabilities (see `src/lib/rbac.ts`).
 */
export function useRbac() {
  const { user, role, loading: authLoading } = useAuth();

  const overridesQuery = useQuery({
    queryKey: ["rbac", "permission-overrides"],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permission_matrix_overrides")
        .select("feature_name, role, access");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) map[`${row.feature_name}::${row.role}`] = row.access;
      return map;
    },
  });

  const grantsQuery = useQuery({
    queryKey: ["rbac", "capabilities", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("command_tier_grants")
        .select("capability, expires_at, revoked_at")
        .eq("user_id", user!.id)
        .is("revoked_at", null);
      if (error) throw error;
      const now = Date.now();
      return (data ?? [])
        .filter((g) => !g.expires_at || new Date(g.expires_at).getTime() > now)
        .map((g) => g.capability);
    },
  });

  const input = useMemo<AccessInput>(
    () => ({ role, overrides: overridesQuery.data, capabilities: grantsQuery.data }),
    [role, overridesQuery.data, grantsQuery.data],
  );

  // Never decide "denied" before the inputs have settled — that would flash an
  // Access Denied screen at a legitimately authorised user.
  const loading =
    authLoading ||
    (!!user && (overridesQuery.isLoading || grantsQuery.isLoading));

  return useMemo(
    () => ({
      loading,
      role,
      capabilities: grantsQuery.data ?? [],
      can: (moduleKey: string) => canAccessModule(moduleKey, input),
      canPath: (pathname: string) => canAccessPath(pathname, input),
    }),
    [loading, role, grantsQuery.data, input],
  );
}

/** Single-module convenience wrapper. */
export function useModuleAccess(moduleKey: string) {
  const { loading, can, role } = useRbac();
  return { loading, role, allowed: can(moduleKey) };
}
