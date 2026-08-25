import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRbac } from "@/hooks/useRbac";
import { useAppSettings } from "@/hooks/useAppSettings";
import {
  applyStaffIdPattern,
  resolveStaffIdPattern,
  type StaffIdContext,
} from "@/lib/staff-id-mask";

/**
 * Employee-ID anonymisation driven by the configurable rules in
 * Settings → Security → Anonymisation.
 *
 * The formatter resolves the pattern for the current viewer's role and the
 * render context (dashboard tile, directory table, export, print), so the same
 * identifier is anonymised identically everywhere it appears.
 */
export function useStaffIdDisplay(defaultContext: StaffIdContext = "dashboard") {
  const { role, user } = useAuth();
  const { capabilities } = useRbac();
  const { staff_id_mask_rules: rules } = useAppSettings();

  const hasIdentityGrant = capabilities?.includes("field:identity") ?? false;

  const format = useCallback(
    (
      staffId: unknown,
      opts?: { ownerUserId?: string | null; context?: StaffIdContext },
    ) =>
      applyStaffIdPattern(
        staffId,
        resolveStaffIdPattern(rules, {
          role,
          context: opts?.context ?? defaultContext,
          isOwner: !!opts?.ownerUserId && opts.ownerUserId === user?.id,
          hasIdentityGrant,
        }),
      ),
    [rules, role, user?.id, hasIdentityGrant, defaultContext],
  );

  const canSeeFullStaffId =
    resolveStaffIdPattern(rules, { role, context: defaultContext, hasIdentityGrant }).mode === "full";

  return { formatStaffId: format, canSeeFullStaffId, staffIdRules: rules };
}
