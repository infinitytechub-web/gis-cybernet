import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { allowedRoles } from "@/lib/rbac";
import { roleLabel } from "@/lib/role-labels";

interface AccessDeniedProps {
  /** Module key from the RBAC registry — drives the label and role list. */
  moduleKey?: string;
  /** Fallback label when no module key is supplied. */
  label?: string;
}

/**
 * Shown whenever a signed-in user reaches a module their role, privileges or
 * delegated grants do not cover — including via a direct URL or bookmark.
 */
export function AccessDenied({ moduleKey, label }: AccessDeniedProps) {
  const roles = moduleKey ? allowedRoles(moduleKey) : [];
  const name = label ?? (moduleKey ? undefined : "this area");

  return (
    <div className="mx-auto max-w-2xl py-6" role="alert" aria-live="assertive">
      <Alert variant="destructive">
        <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        <AlertTitle>Access denied — insufficient privileges</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            You do not have the role, privileges or access level required to open{" "}
            <strong>{name ?? "this module"}</strong>. If you believe you should have access,
            contact a System Administrator to have the permission assigned.
          </p>
          {Array.isArray(roles) && roles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium">Permitted roles:</span>
              {roles.map((r) => (
                <Badge key={r} variant="outline" className="text-[10px]">
                  {roleLabel(r)}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button asChild size="sm" variant="secondary">
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/my-portal">My Portal</Link>
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default AccessDenied;
