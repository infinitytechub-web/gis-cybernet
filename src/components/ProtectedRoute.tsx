import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "admin" | "supervisor";
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();
  const location = useLocation();
  const mustChange = user?.user_metadata?.must_change_password === true;
  const isPasswordChangeRoute = location.pathname === "/change-password";

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" />
        <span className="sr-only">Loading, please wait…</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole === "admin" && role !== "admin") return <Navigate to="/" replace />;

  // Force password change on first login before any other protected route.
  if (mustChange && !isPasswordChangeRoute) {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}
