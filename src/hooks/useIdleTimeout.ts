import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Activity events. We deliberately listen for a *broad* set so that any
 * realistic user interaction (typing, clicking, scrolling inside an
 * overflow container, touch, pointer, wheel, form input) resets the idle
 * timer. Events are registered on `window` with capture so child handlers
 * that call stopPropagation cannot starve us.
 */
const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "click",
  "pointerdown",
  "keydown",
  "keypress",
  "wheel",
  "scroll",
  "touchstart",
  "touchmove",
  "input",
] as const;

interface Options {
  enabled: boolean;
  /** Total idle period before logout, in minutes. */
  idleMinutes: number;
  /** Warning toast lead time, in seconds. */
  warnSeconds: number;
  onLogout?: () => void;
}

/**
 * Signs the user out after `idleMinutes` of *true* inactivity, with a
 * warning toast `warnSeconds` before the logout fires.
 *
 * Implementation: we record a `lastActivity` timestamp on every input
 * event and poll once per second. The clock-based check is immune to
 * stale closures, missed setTimeouts (background tab throttling), or
 * dependency churn that would otherwise reset / fire timers incorrectly.
 */
export function useIdleTimeout({ enabled, idleMinutes, warnSeconds, onLogout }: Options) {
  const lastActivityRef = useRef<number>(Date.now());
  const warnedRef = useRef(false);
  const loggedOutRef = useRef(false);

  // Keep latest config in refs so the polling interval never goes stale.
  const idleMinutesRef = useRef(idleMinutes);
  const warnSecondsRef = useRef(warnSeconds);
  const onLogoutRef = useRef(onLogout);
  useEffect(() => { idleMinutesRef.current = idleMinutes; }, [idleMinutes]);
  useEffect(() => { warnSecondsRef.current = warnSeconds; }, [warnSeconds]);
  useEffect(() => { onLogoutRef.current = onLogout; }, [onLogout]);

  useEffect(() => {
    if (!enabled) return;

    loggedOutRef.current = false;
    warnedRef.current = false;
    lastActivityRef.current = Date.now();

    const markActive = () => {
      // Any signal of life resets the warning state.
      lastActivityRef.current = Date.now();
      if (warnedRef.current) {
        warnedRef.current = false;
        toast.dismiss("idle-warn");
      }
    };

    const onActivity = () => {
      // Ignore events fired while the tab is hidden — those don't represent
      // a present user, and we don't want background scripts to keep the
      // session alive forever.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      markActive();
    };

    const onVisibility = () => {
      // When the user returns to the tab, count that as fresh activity.
      if (document.visibilityState === "visible") markActive();
    };

    ACTIVITY_EVENTS.forEach((evt) => {
      window.addEventListener(evt, onActivity, { passive: true, capture: true });
    });
    document.addEventListener("visibilitychange", onVisibility);

    const tick = window.setInterval(async () => {
      if (loggedOutRef.current) return;
      const idleMs = Math.max(60_000, Math.round(idleMinutesRef.current * 60_000));
      const warnMs = Math.max(5_000, Math.min(idleMs - 5_000, Math.round(warnSecondsRef.current * 1_000)));
      const elapsed = Date.now() - lastActivityRef.current;

      if (elapsed >= idleMs) {
        loggedOutRef.current = true;
        try { await supabase.auth.signOut(); } catch { /* noop */ }
        const mins = idleMinutesRef.current;
        toast.error(`Signed out due to ${mins} minute${mins === 1 ? "" : "s"} of inactivity.`);
        onLogoutRef.current?.();
        return;
      }

      if (!warnedRef.current && elapsed >= idleMs - warnMs) {
        warnedRef.current = true;
        const remaining = Math.max(1, Math.round((idleMs - elapsed) / 1000));
        toast.warning(`You will be signed out in ${remaining} seconds due to inactivity.`, {
          id: "idle-warn",
        });
      }
    }, 1000);

    return () => {
      window.clearInterval(tick);
      ACTIVITY_EVENTS.forEach((evt) => {
        window.removeEventListener(evt, onActivity, { capture: true } as EventListenerOptions);
      });
      document.removeEventListener("visibilitychange", onVisibility);
      toast.dismiss("idle-warn");
    };
    // Only re-bind when auth toggles. Config changes flow through refs.
  }, [enabled]);
}
