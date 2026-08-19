import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";
import { getMyClientIp } from "@/lib/client-ip";

const HEARTBEAT_MS = 60_000;
const SESSION_KEY_STORAGE = "cybernet.session-key";

/**
 * Stable per-tab/device session key. Derived from the Supabase refresh token
 * suffix when available (so it changes on a real re-login) and persisted in
 * localStorage so page reloads keep the same session row.
 */
export function getStoredSessionKey(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY_STORAGE);
  } catch {
    return null;
  }
}

async function resolveSessionKey(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.refresh_token;
  if (!token) return null;
  const fp = await getDeviceFingerprint();
  const key = `${fp.slice(0, 12)}.${token.slice(-16)}`;
  try {
    localStorage.setItem(SESSION_KEY_STORAGE, key);
  } catch { /* ignore */ }
  return key;
}

function labelForPath(pathname: string): string {
  return pathname || "/";
}

/**
 * Registers the current device/session in `user_sessions` and keeps it alive.
 * When an administrator (or the user themselves, from another device) ends the
 * session, the next heartbeat returns `true` and this hook signs the user out.
 */
export function useSessionRegistry() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const keyRef = useRef<string | null>(null);
  const pageRef = useRef<string>("/");

  pageRef.current = labelForPath(location.pathname);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const endSession = async () => {
      toast({
        title: "Signed out",
        description: "This session was ended from the Session Management console.",
        variant: "destructive",
      });
      try { await signOut(); } catch { /* ignore */ }
    };

    const beat = async () => {
      if (cancelled || !keyRef.current) return;
      const { data, error } = await supabase.rpc("session_heartbeat", {
        _session_key: keyRef.current,
        _page: pageRef.current,
      });
      if (!error && data === true) await endSession();
    };

    (async () => {
      const key = await resolveSessionKey();
      if (cancelled || !key) return;
      keyRef.current = key;
      const [fp, ip] = await Promise.all([getDeviceFingerprint(), getMyClientIp()]);
      if (cancelled) return;
      await supabase.rpc("register_session", {
        _session_key: key,
        _fingerprint: fp || null,
        _user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        _ip: ip,
        _page: pageRef.current,
      });
      if (cancelled) return;
      timer = setInterval(() => { void beat(); }, HEARTBEAT_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [user, signOut, toast]);
}
