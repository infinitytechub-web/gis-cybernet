import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "admin" | "supervisor";
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, role, isAdmin, loading } = useAuth();
  const location = useLocation();
  const mustChange = user?.user_metadata?.must_change_password === true;
  const isPasswordChangeRoute = location.pathname === "/change-password";

  // For admin accounts, require AAL2 (TOTP-verified session) on every protected page.
  const [aalChecked, setAalChecked] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user || !isAdmin) { setAalChecked(true); setNeedsMfa(false); return; }
    (async () => {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled) return;
      setNeedsMfa(data?.currentLevel !== "aal2");
      setAalChecked(true);
    })();
    return () => { cancelled = true; };
  }, [user, isAdmin, location.pathname]);

  if (loading || (user && isAdmin && !aalChecked)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole === "admin" && role !== "admin") return <Navigate to="/" replace />;

  // Force password change on first login before any other protected route.
  if (mustChange && !isPasswordChangeRoute) {
    return <Navigate to="/change-password" replace />;
  }

  // Mandatory 2FA gate for admins, but never before the required first-login
  // password change has been completed.
  if (isAdmin && needsMfa && !mustChange && location.pathname !== "/2fa") {
    return <Navigate to="/2fa" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
