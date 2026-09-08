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

/**
 * Maps an organisational unit type onto the matrix hierarchy level.
 * `org_units.type` is the column name (there is no `unit_type`).
 */
export function directoryLevelOfUnitType(type?: string | null): DirectoryLevel {
  switch (type) {
    case "directorate":
    case "national":
    case "management":
    case "command":
      return "hq";
    case "regional":
      return "regional";
    case "sector":
      return "sector";
    case "department":
      return "department";
    case "section":
      return "section";
    default:
      return "unit";
  }
}

/**
 * Whether the signed-in officer may open their own staff portal dashboard.
 *
 * The portal is governed by the View switch of the directory matrix at the
 * officer's own hierarchy level, so an administrator can turn the portal off
 * for a whole role/level from Settings → Directory Matrix. Officers with no
 * posting yet fall back to the Unit level.
 */
export function useMyDirectoryAccess() {
  const { user, isAdmin } = useAuth();
  const perms = useDirectoryPermissions();

  const levelQuery = useQuery({
    queryKey: ["my-directory-level", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DirectoryLevel> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("org_unit:org_units!profiles_org_unit_id_fkey(type)")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const unit = (data as { org_unit?: { type?: string | null } | null } | null)?.org_unit;
      return directoryLevelOfUnitType(unit?.type ?? null);
    },
  });

  const loading = !!user && (perms.loading || levelQuery.isLoading);
  const level = levelQuery.data ?? null;

  return {
    loading,
    level,
    /** Undecided while loading; keeps the UI from flashing a denial. */
    canOpenPortal: isAdmin || (!loading && !!level && perms.can("view", level)),
    perms,
  };
}
