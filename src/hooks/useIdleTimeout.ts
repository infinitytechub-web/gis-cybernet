import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { idleStore } from "@/lib/idle-store";

interface Options {
  enabled: boolean;
  /** Total idle period before logout, in minutes. */
  idleMinutes: number;
  /** Warning toast lead time, in seconds. */
  warnSeconds: number;
  onLogout?: () => void;
}

/**
 * Configures and enables the singleton idle store while the user is
 * authenticated. The store handles activity tracking and emits warning
 * state to <IdleWarningDialog />, which renders the confirm-to-stay UI.
 *
 * Sign-out is performed here so we keep all auth side-effects in one
 * place (toast + supabase signOut + optional caller hook).
 */
export function useIdleTimeout({ enabled, idleMinutes, warnSeconds, onLogout }: Options) {
  useEffect(() => {
    idleStore.configure({
      idleMinutes,
      warnSeconds,
      onLogout: async () => {
        try { await supabase.auth.signOut(); } catch { /* noop */ }
        toast.error(`Signed out due to ${idleMinutes} minute${idleMinutes === 1 ? "" : "s"} of inactivity.`);
        onLogout?.();
      },
    });
  }, [idleMinutes, warnSeconds, onLogout]);

  useEffect(() => {
    if (!enabled) {
      idleStore.disable();
      return;
    }
    idleStore.enable();
    return () => { idleStore.disable(); };
  }, [enabled]);
}
