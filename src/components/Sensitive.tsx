import { useState } from "react";
import { Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRbac } from "@/hooks/useRbac";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  canSeeField,
  canRevealField,
  displayField,
  fieldLabel,
  maskValue,
  type SensitiveField,
} from "@/lib/field-visibility";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SensitiveProps {
  /** Classified field key from `src/lib/field-visibility.ts`. */
  field: SensitiveField;
  value: unknown;
  /** True when the signed-in user is the subject of this record. */
  isOwner?: boolean;
  /**
   * Offer an explicit reveal action to viewers who are allowed the value but
   * are shown it masked by default. Each reveal writes an audit entry.
   */
  revealable?: boolean;
  /** Record this value belongs to, recorded in the reveal audit entry. */
  recordId?: string | null;
  entityType?: string;
  className?: string;
}

/**
 * Renders a classified value, masked unless the viewer has a need-to-know.
 * Hiding in the UI is not the security boundary — RLS and the SECURITY DEFINER
 * RPCs are — this keeps confidential data off screens that don't require it.
 */
export function Sensitive({
  field,
  value,
  isOwner,
  revealable = false,
  recordId,
  entityType = "sensitive_field",
  className,
}: SensitiveProps) {
  const { role } = useAuth();
  const { capabilities } = useRbac();
  const ctx = { role, capabilities, isOwner };
  const allowed = canSeeField(field, ctx);
  const [revealed, setRevealed] = useState(false);

  // Allowed viewers see the value directly unless the caller asked for an
  // explicit, audited reveal step.
  if (allowed && (!revealable || revealed)) {
    return <span className={className}>{displayField(field, value, ctx)}</span>;
  }

  const masked = maskValue(field, value);
  const label = fieldLabel(field);

  if (allowed && revealable && canRevealField(field, ctx)) {
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        <span className="tabular-nums">{masked}</span>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Reveal ${label}`}
          onClick={() => {
            setRevealed(true);
            void logAdminAudit(entityType, "revealed_sensitive_field", { field, label }, recordId ?? null);
          }}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("tabular-nums text-muted-foreground", className)}
          aria-label={`${label} — restricted`}
        >
          {masked}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {label} is restricted to authorized personnel
      </TooltipContent>
    </Tooltip>
  );
}

export default Sensitive;
