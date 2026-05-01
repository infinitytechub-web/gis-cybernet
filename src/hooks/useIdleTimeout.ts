import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes
const WARN_BEFORE_MS = 30 * 1000;    // warn 30 s before
const ACTIVITY_EVENTS: (keyof DocumentEventMap | keyof WindowEventMap)[] = [
  "mousemove", "mousedown", "keydown", "touchstart", "scroll", "visibilitychange",
];

interface Options {
  enabled: boolean;
  onLogout?: () => void;
}

/**
 * Signs the user out after IDLE_LIMIT_MS of inactivity.
 * Activity = mouse, keyboard, touch, scroll, or tab becoming visible.
 * Shows a warning toast 30 s before logout.
 */
export function useIdleTimeout({ enabled, onLogout }: Options) {
  const idleTimer = useRef<number | null>(null);
  const warnTimer = useRef<number | null>(null);
  const warnedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const clearTimers = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      if (warnTimer.current) window.clearTimeout(warnTimer.current);
      idleTimer.current = null;
      warnTimer.current = null;
    };

    const doLogout = async () => {
      clearTimers();
      try { await supabase.auth.signOut(); } catch { /* noop */ }
      toast.error("Signed out due to 5 minutes of inactivity.");
      onLogout?.();
    };

    const reset = () => {
      clearTimers();
      warnedRef.current = false;
      warnTimer.current = window.setTimeout(() => {
        if (warnedRef.current) return;
        warnedRef.current = true;
        toast.warning("You will be signed out in 30 seconds due to inactivity.");
      }, IDLE_LIMIT_MS - WARN_BEFORE_MS);
      idleTimer.current = window.setTimeout(doLogout, IDLE_LIMIT_MS);
    };

    const onActivity = () => {
      // Ignore when tab is hidden — only "visibilitychange → visible" counts
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
  }, [enabled, onLogout]);
}
