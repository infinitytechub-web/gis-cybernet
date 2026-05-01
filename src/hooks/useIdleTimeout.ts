import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ACTIVITY_EVENTS: (keyof DocumentEventMap | keyof WindowEventMap)[] = [
  "mousemove", "mousedown", "keydown", "touchstart", "scroll", "visibilitychange",
];

interface Options {
  enabled: boolean;
  /** Total idle period before logout, in minutes. */
  idleMinutes: number;
  /** Warning toast lead time, in seconds. */
  warnSeconds: number;
  onLogout?: () => void;
}

/**
 * Signs the user out after `idleMinutes` of inactivity, with a warning
 * toast `warnSeconds` before the logout fires.
 * Activity = mouse, keyboard, touch, scroll, or tab becoming visible.
 */
export function useIdleTimeout({ enabled, idleMinutes, warnSeconds, onLogout }: Options) {
  const idleTimer = useRef<number | null>(null);
  const warnTimer = useRef<number | null>(null);
  const warnedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const idleMs = Math.max(60_000, Math.round(idleMinutes * 60_000));
    const warnMs = Math.max(5_000, Math.min(idleMs - 5_000, Math.round(warnSeconds * 1_000)));

    const clearTimers = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      if (warnTimer.current) window.clearTimeout(warnTimer.current);
      idleTimer.current = null;
      warnTimer.current = null;
    };

    const doLogout = async () => {
      clearTimers();
      try { await supabase.auth.signOut(); } catch { /* noop */ }
      toast.error(`Signed out due to ${idleMinutes} minute${idleMinutes === 1 ? "" : "s"} of inactivity.`);
      onLogout?.();
    };

    const reset = () => {
      clearTimers();
      warnedRef.current = false;
      warnTimer.current = window.setTimeout(() => {
        if (warnedRef.current) return;
        warnedRef.current = true;
        toast.warning(`You will be signed out in ${Math.round(warnMs / 1000)} seconds due to inactivity.`);
      }, idleMs - warnMs);
      idleTimer.current = window.setTimeout(doLogout, idleMs);
    };

    const onActivity = () => {
      if (document.visibilityState === "hidden") return;
      reset();
    };

    ACTIVITY_EVENTS.forEach((evt) => {
      window.addEventListener(evt as string, onActivity, { passive: true });
    });

    reset();

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((evt) => {
        window.removeEventListener(evt as string, onActivity);
      });
    };
  }, [enabled, idleMinutes, warnSeconds, onLogout]);
}
