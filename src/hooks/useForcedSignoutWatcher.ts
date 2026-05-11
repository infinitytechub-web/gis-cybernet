import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";
import { getMyClientIp } from "@/lib/client-ip";
import { useToast } from "@/hooks/use-toast";

/**
 * Polls the server every 30s (and on realtime forced_signouts inserts) to
 * check whether the current device/IP has been blocked. If so, signs the
 * user out immediately.
 */
export function useForcedSignoutWatcher() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const ipRef = useRef<string | null>(null);
  const fpRef = useRef<string>("");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const init = async () => {
      fpRef.current = await getDeviceFingerprint();
      ipRef.current = await getMyClientIp();
      void check();
    };

    const check = async () => {
      if (cancelled) return;
      if (!ipRef.current && !fpRef.current) return;
      const { data } = await supabase.rpc("should_force_signout", {
        _ip: ipRef.current ?? "",
        _fingerprint: fpRef.current || null,
      });
      if (data === true) {
        toast({
          title: "Session ended",
          description: "An administrator has blocked this device or network.",
          variant: "destructive",
        });
        try { await signOut(); } catch { /* ignore */ }
      }
    };

    void init();
    timerRef.current = window.setInterval(check, 30_000);

    const channel = supabase
      .channel("forced-signouts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "forced_signouts" }, () => { void check(); })
      .subscribe();

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, signOut, toast]);
}
