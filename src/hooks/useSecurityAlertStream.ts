import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "security-monitor-live-mode";

/**
 * Streams new rows from security_monitor_alerts so the monitoring page updates
 * immediately instead of waiting for the 10-minute background scan.
 */
export function useSecurityAlertStream(opts: { enabled: boolean; onAlert?: (alert: any) => void }) {
  const { enabled, onAlert } = opts;
  const queryClient = useQueryClient();
  const [live, setLive] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const callbackRef = useRef(onAlert);
  callbackRef.current = onAlert;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, live ? "on" : "off");
    } catch {
      /* ignore */
    }
  }, [live]);

  useEffect(() => {
    if (!enabled || !live) {
      setConnected(false);
      return;
    }

    const channel = supabase
      .channel("security-monitor-alerts-stream")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "security_monitor_alerts" },
        (payload) => {
          setLastEventAt(new Date().toISOString());
          queryClient.invalidateQueries({ queryKey: ["security-monitor-alerts"] });
          if (payload.eventType === "INSERT") callbackRef.current?.(payload.new);
        },
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
      setConnected(false);
    };
  }, [enabled, live, queryClient]);

  return { live, setLive, connected, lastEventAt };
}
