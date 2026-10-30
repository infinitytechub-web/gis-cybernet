import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { DASHBOARD_LIVE_TABLES, DASHBOARD_QUERY_KEYS } from "@/lib/dashboard-integrity";

const SyncContext = createContext({ online: true, connected: false });
export const useDashboardConnection = () => useContext(SyncContext);

/** One session subscription; payloads are never retained or shown in dashboards. */
export function DashboardSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void client.invalidateQueries({ predicate: (q) => DASHBOARD_QUERY_KEYS.some((k) => k === q.queryKey[0]) });
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, [client]);
  useEffect(() => {
    if (!user) { setConnected(false); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void client.invalidateQueries({ predicate: (q) => DASHBOARD_QUERY_KEYS.some((k) => k === q.queryKey[0]) });
      }, 350);
    };
    const channel = supabase.channel(`dashboard-sync-${crypto.randomUUID()}`);
    DASHBOARD_LIVE_TABLES.forEach((table) => channel.on("postgres_changes", { event: "*", schema: "public", table }, invalidate));
    channel.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") invalidate();
    });
    return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [user?.id, client]);
  return <SyncContext.Provider value={{ online, connected }}>{children}</SyncContext.Provider>;
}