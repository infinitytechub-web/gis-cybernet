import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  buildOrgTree,
  resolveOrgScope,
  type OrgUnit,
  type OrgUnitAssignment,
} from "@/lib/org-hierarchy";

/** All org units (readable by every authenticated user — RLS allows SELECT). */
export function useOrgUnits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["org-units"],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<OrgUnit[]> => {
      const { data, error } = await supabase
        .from("org_units")
        .select("id, name, code, type, parent_id, is_active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as OrgUnit[];
    },
  });
}

/**
 * Hierarchical scope of the signed-in user: their posting + every delegated
 * oversight branch. Mirrors the server-side `user_org_scope` rule so the UI and
 * RLS agree; the backend remains the enforcement point.
 */
export function useOrgScope() {
  const { user, role, loading: authLoading } = useAuth();
  const unitsQuery = useOrgUnits();

  const homeQuery = useQuery({
    queryKey: ["org-scope", "home", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("org_unit_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.org_unit_id ?? null) as string | null;
    },
  });

  const assignmentsQuery = useQuery({
    queryKey: ["org-scope", "assignments", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<OrgUnitAssignment[]> => {
      const { data, error } = await supabase
        .from("org_unit_assignments")
        .select("id, user_id, org_unit_id, can_manage, expires_at, revoked_at")
        .eq("user_id", user!.id)
        .is("revoked_at", null);
      if (error) throw error;
      const now = Date.now();
      return (data ?? []).filter(
        (a) => !a.expires_at || new Date(a.expires_at).getTime() > now,
      ) as OrgUnitAssignment[];
    },
  });

  const units = unitsQuery.data ?? [];

  const scope = useMemo(
    () =>
      resolveOrgScope({
        isAdmin: role === "admin",
        homeUnitId: homeQuery.data ?? null,
        assignments: assignmentsQuery.data ?? [],
        units,
      }),
    [role, homeQuery.data, assignmentsQuery.data, units],
  );

  const tree = useMemo(() => buildOrgTree(units), [units]);

  const loading =
    authLoading ||
    (!!user &&
      (unitsQuery.isLoading || homeQuery.isLoading || assignmentsQuery.isLoading));

  return {
    loading,
    units,
    tree,
    scope,
    homeUnitId: homeQuery.data ?? null,
    assignments: assignmentsQuery.data ?? [],
  };
}
