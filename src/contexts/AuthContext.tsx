import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/types";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";

const DEFAULT_IDLE_MINUTES = 5;
const DEFAULT_WARN_SECONDS = 30;

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
  isHoa: boolean;
  /** Admin, OIC and 2IC may assign, modify and revoke command-tier roles/grants. */
  canManageCommandTier: boolean;
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
  isHoa: false,
  canManageCommandTier: false,
  canExportInterlinkLogs: false,
};

const AuthContext = createContext<AuthContextValue>(FALLBACK_AUTH);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [idleMinutes, setIdleMinutes] = useState<number>(DEFAULT_IDLE_MINUTES);
  const [warnSeconds, setWarnSeconds] = useState<number>(DEFAULT_WARN_SECONDS);

  // Load idle-timeout settings (and refresh whenever the singleton row changes).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("auto_logout_minutes, auto_logout_warning_seconds")
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      setIdleMinutes(Math.max(1, Number(data.auto_logout_minutes) || DEFAULT_IDLE_MINUTES));
      setWarnSeconds(Math.max(5, Number((data as any).auto_logout_warning_seconds) || DEFAULT_WARN_SECONDS));
    };
    load();
    const channel = supabase
      .channel("app-settings-idle")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, load)
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchRole = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (!data || data.length === 0) return "staff" as AppRole;
    // Prioritize command authority before M&E delivery and operational roles.
    const priority: Record<string, number> = { admin: 0, oic: 1, "2ic": 2, head_of_administration: 3, chief_staff_officer: 4, command_officer: 5, me_officer: 6, project_manager: 7, staff_officer: 8, supervisor: 9, field_officer: 10, ipse_supervisor: 11, ipse_deputy_supervisor: 12, head_of_processing: 13, deputy_head_of_processing: 14, shift_supervisor: 15, deputy_shift_supervisor: 16, shift_leader: 17, deputy_supervisor: 18, deputy_shift_leader: 19, special_duties: 20, deputy: 21, staff: 99 };
    const sorted = data.sort((a, b) => (priority[a.role] ?? 99) - (priority[b.role] ?? 99));
    return (sorted[0].role as AppRole) ?? "staff";
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Push the current access token into the realtime client so that every
    // WebSocket subscription is authenticated against RLS. Without this, the
    // socket would attach with the anon key only and any postgres_changes
    // stream would be silently filtered to the public-read subset.
    const syncRealtimeAuth = (session: { access_token?: string } | null) => {
      try {
        const token = session?.access_token ?? null;
        // Public type-stable surface; supabase-js v2 exposes setAuth on realtime.
        (supabase as any).realtime?.setAuth?.(token);
      } catch { /* best effort — never block auth flow on realtime hiccups */ }
    };

    const handleSession = async (session: { user: User; access_token?: string } | null) => {
      const currentUser = session?.user ?? null;
      if (!isMounted) return;
      syncRealtimeAuth(session);
      setUser(currentUser);
      if (currentUser) {
        const r = await fetchRole(currentUser.id);
        if (!isMounted) return;
        setRole(r);
      } else {
        setRole(null);
        // No session → tear down the socket so a stale token can't linger.
        try { (supabase as any).realtime?.disconnect?.(); } catch { /* ignore */ }
      }
      setLoading(false);
    };

    // Get initial session first. If the persisted token is no longer valid
    // (e.g. signing keys were rotated → "missing sub claim" / "bad_jwt"),
    // clear it so the user can sign in fresh instead of being stuck.
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error || (session && !session.user)) {
        try { await supabase.auth.signOut({ scope: "local" } as any); } catch { /* ignore */ }
        handleSession(null);
        return;
      }
      handleSession(session as any);
    }).catch(async () => {
      try { await supabase.auth.signOut({ scope: "local" } as any); } catch { /* ignore */ }
      handleSession(null);
    });

    // Then listen for changes (skip INITIAL_SESSION to avoid double-fetch).
    // TOKEN_REFRESHED must re-bind the socket so refreshed JWTs flow through.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'INITIAL_SESSION') return;
        if (event === 'TOKEN_REFRESHED') {
          syncRealtimeAuth(session as any);
          return;
        }
        handleSession(session as any);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRole]);

  // Auto sign-out after the configured idle period (only when authenticated).
  useIdleTimeout({ enabled: !!user, idleMinutes, warnSeconds });

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
    // Command tier: admin, OIC, 2IC, Head of Administration, Chief Staff Officer,
    // Staff Officer, and Supervisor share elevated reporting/oversight access.
    isAdminOrSupervisor:
      role === "admin" ||
      role === "oic" ||
      role === "2ic" ||
      role === "head_of_administration" ||
      role === "chief_staff_officer" ||
      role === "command_officer" ||
      role === "staff_officer" ||
      role === "supervisor",
    isIpse: role === "ipse_supervisor" || role === "ipse_deputy_supervisor",
    is2ic: role === "2ic",
    isOic: role === "oic",
    isHoa: role === "head_of_administration",
    canManageCommandTier: role === "admin" || role === "oic" || role === "2ic",
    canExportInterlinkLogs: role === "admin" || role === "oic",
  }), [user, role, loading, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  // Context default is FALLBACK_AUTH, so this can never be null and never throws.
  return useContext(AuthContext);
}
