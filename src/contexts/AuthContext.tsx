import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isSupervisor: boolean;
  isAdminOrSupervisor: boolean;
  isIpse: boolean;
  is2ic: boolean;
  isOic: boolean;
  /** Tightest tier — only Admin + OIC may export Interlink dispatch & approval logs. */
  canExportInterlinkLogs: boolean;
}

/**
 * Stable fallback used as the createContext default — guarantees
 * useAuthContext() ALWAYS returns a usable value even if a child renders
 * before <AuthProvider> mounts (e.g. during HMR boundary remounts or
 * lazy-route Suspense hydration). No throws → no blank screens.
 */
const FALLBACK_AUTH: AuthContextValue = {
  user: null,
  role: null,
  loading: true,
  signIn: async () => { throw new Error("Auth not ready"); },
  signOut: async () => { /* no-op until provider mounts */ },
  isAdmin: false,
  isSupervisor: false,
  isAdminOrSupervisor: false,
  isIpse: false,
  is2ic: false,
  isOic: false,
  canExportInterlinkLogs: false,
};

const AuthContext = createContext<AuthContextValue>(FALLBACK_AUTH);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (!data || data.length === 0) return "staff" as AppRole;
    // Prioritize admin > oic > 2ic > staff_officer > supervisor > ipse > other roles > staff
    const priority: Record<string, number> = { admin: 0, oic: 1, "2ic": 2, staff_officer: 3, supervisor: 4, ipse_supervisor: 5, ipse_deputy_supervisor: 6, shift_supervisor: 7, deputy_shift_supervisor: 8, shift_leader: 9, deputy_supervisor: 10, deputy_shift_leader: 11, special_duties: 12, deputy: 13, staff: 99 };
    const sorted = data.sort((a, b) => (priority[a.role] ?? 99) - (priority[b.role] ?? 99));
    return (sorted[0].role as AppRole) ?? "staff";
  }, []);

  useEffect(() => {
    let isMounted = true;

    const handleSession = async (session: { user: User } | null) => {
      const currentUser = session?.user ?? null;
      if (!isMounted) return;
      setUser(currentUser);
      if (currentUser) {
        const r = await fetchRole(currentUser.id);
        if (!isMounted) return;
        setRole(r);
      } else {
        setRole(null);
      }
      setLoading(false);
    };

    // Get initial session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    // Then listen for changes (skip INITIAL_SESSION to avoid double-fetch)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'INITIAL_SESSION') return;
        handleSession(session);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRole]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    role,
    loading,
    signIn,
    signOut,
    isAdmin: role === "admin",
    isSupervisor: role === "supervisor",
    // Command tier: admin, OIC, 2IC, Staff Officer, and Supervisor share elevated reporting/oversight access
    isAdminOrSupervisor:
      role === "admin" ||
      role === "oic" ||
      role === "2ic" ||
      role === "staff_officer" ||
      role === "supervisor",
    isIpse: role === "ipse_supervisor" || role === "ipse_deputy_supervisor",
    is2ic: role === "2ic",
    isOic: role === "oic",
    canExportInterlinkLogs: role === "admin" || role === "oic",
  }), [user, role, loading, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Safe default — returned when called outside AuthProvider (e.g. during HMR
 * boundary remounts or in stories). Never throws, so the app never blanks.
 */
const FALLBACK_AUTH: AuthContextValue = {
  user: null,
  role: null,
  loading: true,
  signIn: async () => { throw new Error("Auth not ready"); },
  signOut: async () => { /* no-op */ },
  isAdmin: false,
  isSupervisor: false,
  isAdminOrSupervisor: false,
  isIpse: false,
  is2ic: false,
  isOic: false,
  canExportInterlinkLogs: false,
};

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    if (typeof console !== "undefined") {
      console.warn("useAuthContext called outside <AuthProvider> — returning fallback");
    }
    return FALLBACK_AUTH;
  }
  return ctx;
}
