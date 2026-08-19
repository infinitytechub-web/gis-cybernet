/**
 * Offline GPS sync — keeps the local position store draining whenever the
 * device has a connection. Runs a flush on mount, on `online` events and on a
 * slow interval so a flaky link eventually clears the backlog.
 */
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { flushQueue, isOnline, queueSize, subscribeQueue } from "@/lib/fleet-offline";

const RETRY_MS = 30_000;

export function useFleetOfflineSync(enabled = true) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(() => queueSize());
  const [online, setOnline] = useState(() => isOnline());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => subscribeQueue(setPending), []);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const sync = useCallback(async (announce = false) => {
    if (!isOnline() || queueSize() === 0) return;
    setSyncing(true);
    try {
      const result = await flushQueue();
      if (result.synced > 0) {
        queryClient.invalidateQueries({ queryKey: ["fleet"] });
        if (announce) {
          toast({
            title: `${result.synced} offline position(s) synced`,
            description: result.remaining > 0 ? `${result.remaining} still queued.` : undefined,
          });
        }
      }
    } finally {
      setSyncing(false);
    }
  }, [queryClient]);

  useEffect(() => {
    if (!enabled) return;
    void sync(false);
    const timer = window.setInterval(() => void sync(false), RETRY_MS);
    return () => window.clearInterval(timer);
  }, [enabled, online, sync]);

  return { pending, online, syncing, sync: () => sync(true) };
}
