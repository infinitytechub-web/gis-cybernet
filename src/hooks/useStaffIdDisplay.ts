import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRbac } from "@/hooks/useRbac";
import { canSeeField, displayField } from "@/lib/field-visibility";

/**
 * Consistent employee-ID anonymisation for general screens.
 *
 * Returns a formatter that yields the full staff ID only for the
 * administration tier (Admin Console surfaces), the record owner, or an active
 * delegated `field:identity` grant — everyone else gets the partially masked
 * form (`GIS•••••21`). Use it for table cells, sublabels and exports so the
 * same identifier never appears unmasked on one widget and masked on another.
 */
export function useStaffIdDisplay() {
  const { role, user } = useAuth();
  const { capabilities } = useRbac();

  const canSeeFull = canSeeField("staff_identifier", { role, capabilities });

  const format = useCallback(
    (staffId: unknown, opts?: { ownerUserId?: string | null }) =>
      displayField("staff_identifier", staffId, {
        role,
        capabilities,
        isOwner: !!opts?.ownerUserId && opts.ownerUserId === user?.id,
      }),
    [role, capabilities, user?.id],
  );

  return { formatStaffId: format, canSeeFullStaffId: canSeeFull };
}
