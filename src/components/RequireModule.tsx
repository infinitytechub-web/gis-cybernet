import { useModuleAccess } from "@/hooks/useRbac";
import { AccessDenied } from "@/components/AccessDenied";
import { MODULES_BY_KEY } from "@/lib/rbac";

interface RequireModuleProps {
  module: string;
  children: React.ReactNode;
}

/**
 * Gate a module (page or in-page section) behind the RBAC registry. Renders the
 * shared Access Denied screen when the signed-in user's role, admin-tuned
 * permissions and delegated grants do not cover the module.
 */
export function RequireModule({ module, children }: RequireModuleProps) {
  const { loading, allowed } = useModuleAccess(module);

  if (loading) {
    return (
      <div
        className="flex min-h-[40vh] items-center justify-center"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" aria-hidden="true" />
        <span className="sr-only">Checking permissions…</span>
      </div>
    );
  }

  if (!allowed) return <AccessDenied moduleKey={module} label={MODULES_BY_KEY[module]?.label} />;

  return <>{children}</>;
}

export default RequireModule;
