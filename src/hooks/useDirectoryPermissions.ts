import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Hierarchy levels the directory matrix is configured against. */
export const DIRECTORY_LEVELS = [
  "hq",
  "regional",
  "sector",
  "department",
  "section",
  "unit",
  "shift",
] as const;
export type DirectoryLevel = (typeof DIRECTORY_LEVELS)[number];

export const DIRECTORY_LEVEL_LABELS: Record<DirectoryLevel, string> = {
  hq: "HQ",
  regional: "Regional Command",
  sector: "Sector Command",
  department: "Department",
  section: "Section",
  unit: "Unit",
  shift: "Shift",
};

export const DIRECTORY_ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "download",
  "print",
  "vault",
] as const;
export type DirectoryAction = (typeof DIRECTORY_ACTIONS)[number];

export const DIRECTORY_ACTION_LABELS: Record<DirectoryAction, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  download: "Download",
  print: "Print",
  vault: "Document Vault",
};

export const DIRECTORY_SCOPES = [
  "all",
  "own_subtree",
  "own_unit",
  "shift",
  "self",
  "none",
] as const;
export type DirectoryScope = (typeof DIRECTORY_SCOPES)[number];

export const DIRECTORY_SCOPE_LABELS: Record<DirectoryScope, string> = {
  all: "All commands",
  own_subtree: "Assigned scope + subordinates",
  own_unit: "Assigned command only",
  shift: "Own shift only",
  self: "Own record only",
  none: "No access",
};

export interface DirectoryLevelPermission {
  level: DirectoryLevel;
  scope: DirectoryScope;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_download: boolean;
  can_print: boolean;
  can_vault: boolean;
}

const FLAG: Record<DirectoryAction, keyof DirectoryLevelPermission> = {
  view: "can_view",
  create: "can_create",
  edit: "can_edit",
  delete: "can_delete",
  download: "can_download",
  print: "can_print",
  vault: "can_vault",
};

/**
 * Effective directory permissions of the signed-in user, resolved server-side
 * from `directory_permissions` (admins always get full access).
 *
 * These are the UI switches only — the same matrix is enforced in the database
 * through `public.can_directory_action`, so hiding a button is never the only
 * thing standing between a user and a record.
 */
export function useDirectoryPermissions() {
  const { user, isAdmin } = useAuth();

  const query = useQuery({
    queryKey: ["directory-permissions", "mine", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_directory_permissions");
      if (error) throw error;
      return (data ?? []) as DirectoryLevelPermission[];
    },
  });

  return useMemo(() => {
    const byLevel = new Map<string, DirectoryLevelPermission>();
    for (const row of query.data ?? []) byLevel.set(row.level, row);

    const can = (action: DirectoryAction, level?: DirectoryLevel | null) => {
      if (isAdmin) return true;
      if (level) return !!byLevel.get(level)?.[FLAG[action]];
      // No level given → allowed if any level grants it.
      return DIRECTORY_LEVELS.some((l) => !!byLevel.get(l)?.[FLAG[action]]);
    };

    return {
      loading: !!user && query.isLoading,
      levels: query.data ?? [],
      scopeFor: (level: DirectoryLevel) =>
        (isAdmin ? "all" : byLevel.get(level)?.scope ?? "none") as DirectoryScope,
      can,
      canView: can("view"),
      canCreate: can("create"),
      canEdit: can("edit"),
      canDelete: can("delete"),
      canDownload: can("download"),
      canPrint: can("print"),
      canVault: can("vault"),
    };
  }, [query.data, query.isLoading, user, isAdmin]);
}

/** Server-side confirmation for a single record (used before risky actions). */
export async function checkDirectoryAction(action: DirectoryAction, profileId: string) {
  const { data, error } = await supabase.rpc("can_directory_action", {
    _action: action,
    _profile_id: profileId,
  });
  if (error) throw error;
  return data === true;
}
