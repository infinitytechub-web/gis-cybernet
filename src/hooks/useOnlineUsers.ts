import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface OnlineUser {
  userId: string;
  firstName: string;
  lastName: string;
  staffId: string;
  department: string;
  rank: string;
  photoUrl: string | null;
  currentPage: string;
  onlineSince: string;
  lastActiveAt: string;
}

const ROUTE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/staff": "Staff",
  "/directory": "Staff Directory",
  "/attendance": "Attendance",
  "/shifts": "Shifts",
  "/duty-roster": "Duty Roster",
  "/leave": "Leave Requests",
  "/postings": "Postings & Transfers",
  "/holidays": "Holidays",
  "/announcements": "Announcements",
  "/reports": "Reports",
  "/analytics": "Analytics",
  "/compliance": "Compliance",
  "/operations": "Operations",
  "/enforcement": "Enforcement",
  "/holding-center": "Holding Center",
  "/stores": "Stores",
  "/procurement": "Procurement",
  "/misd": "MISD",
  "/front-desk": "Front Desk",
  "/processing": "Processing",
  "/settings": "Settings",
  "/roles": "Roles",
  "/departments": "Departments",
};

function labelForPath(pathname: string): string {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname];
  const seg = "/" + pathname.split("/").filter(Boolean)[0];
  return ROUTE_LABELS[seg] ?? pathname;
}

// How long a user is considered "online" since their last heartbeat / activity.
// Default 5 minutes; consumers may override.
export const DEFAULT_ONLINE_WINDOW_MINUTES = 5;
// Heartbeat cadence — must be < window so users don't drop out unexpectedly.
const HEARTBEAT_INTERVAL_MS = 60_000;
// How often we re-evaluate the staleness filter on the client.
// Lowered so the visible countdown ticks smoothly and stale users drop quickly.
const PRUNE_INTERVAL_MS = 10_000;

// ----- Module-level singleton -----
// Multiple components mount this hook simultaneously (header badge + dashboard
// panel). Supabase Realtime forbids adding `.on()` listeners after a channel
// has subscribed, so we share ONE channel + presence subscription across all
// hook instances and fan-out updates via a Set of subscribers.
type Subscriber = (users: OnlineUser[], syncedAt: number) => void;
const subscribers = new Set<Subscriber>();
let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let sharedUsers: OnlineUser[] = [];
let sharedSyncedAt: number = Date.now();
let sharedUserId: string | null = null;
let sharedPayload: OnlineUser | null = null;
let refCount = 0;

function notifySubscribers() {
  subscribers.forEach((cb) => {
    try { cb(sharedUsers, sharedSyncedAt); } catch { /* ignore */ }
  });
}

function ensureChannel(userId: string) {
  if (sharedChannel && sharedUserId === userId) return sharedChannel;
  if (sharedChannel) {
    try { sharedChannel.untrack(); supabase.removeChannel(sharedChannel); } catch { /* ignore */ }
    sharedChannel = null;
  }
  sharedUserId = userId;
  const ch = supabase.channel("online-users-global", {
    config: { presence: { key: userId } },
  });
  ch.on("presence", { event: "sync" }, () => {
    const state = ch.presenceState<OnlineUser>();
    const users: OnlineUser[] = [];
    for (const key of Object.keys(state)) {
      const presences = state[key];
      if (presences && presences.length > 0) {
        users.push(presences[0] as unknown as OnlineUser);
      }
    }
    sharedUsers = users;
    sharedSyncedAt = Date.now();
    notifySubscribers();
  });
  ch.subscribe(async (status) => {
    if (status === "SUBSCRIBED" && sharedPayload && sharedChannel === ch) {
      await ch.track(sharedPayload);
      void supabase.from("presence_events").insert({
        user_id: userId,
        event_type: "heartbeat",
        current_page: sharedPayload.currentPage,
        last_active_at: sharedPayload.lastActiveAt,
        details: { phase: "subscribed" },
      });
    }
  });
  sharedChannel = ch;
  return ch;
}

export function useOnlineUsers(windowMinutes: number = DEFAULT_ONLINE_WINDOW_MINUTES) {
  const { user } = useAuth();
  const location = useLocation();
  const [allUsers, setAllUsers] = useState<OnlineUser[]>(sharedUsers);
  const [now, setNow] = useState<number>(Date.now());
  const [lastSyncAt, setLastSyncAt] = useState<number>(sharedSyncedAt);

  // Subscribe this component to shared presence updates.
  useEffect(() => {
    const cb: Subscriber = (users, syncedAt) => {
      setAllUsers(users);
      setLastSyncAt(syncedAt);
    };
    subscribers.add(cb);
    return () => { subscribers.delete(cb); };
  }, []);

  // Manage the singleton channel + heartbeat lifecycle.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    refCount += 1;

    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, staff_id, photo_url, department_id, rank_id, departments:department_id(name), ranks:rank_id(name)")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;

      const deptName = (profile as any)?.departments?.name ?? "";
      const rankName = (profile as any)?.ranks?.name ?? "";
      const nowIso = new Date().toISOString();

      sharedPayload = {
        userId: user.id,
        firstName: profile?.first_name ?? "Unknown",
        lastName: profile?.last_name ?? "",
        staffId: profile?.staff_id ?? "",
        department: deptName,
        rank: rankName,
        photoUrl: (profile as any)?.photo_url ?? null,
        currentPage: labelForPath(location.pathname),
        onlineSince: nowIso,
        lastActiveAt: nowIso,
      };

      const ch = ensureChannel(user.id);
      // If channel already subscribed (other instance set it up), re-track now.
      try { await ch.track(sharedPayload); } catch { /* ignore */ }

      heartbeat = setInterval(() => {
        if (!sharedPayload || !sharedChannel) return;
        const iso = new Date().toISOString();
        sharedPayload = { ...sharedPayload, lastActiveAt: iso };
        sharedChannel.track(sharedPayload);
        void supabase.from("presence_events").insert({
          user_id: user.id,
          event_type: "heartbeat",
          current_page: sharedPayload.currentPage,
          last_active_at: iso,
        });
      }, HEARTBEAT_INTERVAL_MS);
    })();

    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      refCount = Math.max(0, refCount - 1);
      // Only tear the shared channel down when no consumers remain.
      if (refCount === 0 && sharedChannel) {
        try { sharedChannel.untrack(); supabase.removeChannel(sharedChannel); } catch { /* ignore */ }
        sharedChannel = null;
        sharedUserId = null;
        sharedPayload = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Update presence when route changes (counts as activity).
  useEffect(() => {
    if (!user || !sharedChannel || !sharedPayload) return;
    sharedPayload = {
      ...sharedPayload,
      currentPage: labelForPath(location.pathname),
      lastActiveAt: new Date().toISOString(),
    };
    sharedChannel.track(sharedPayload);
  }, [location.pathname, user]);

  // Periodically advance "now" so the staleness filter re-evaluates even
  // when no presence sync arrives.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), PRUNE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Apply expiry window: only show users whose last activity is within window.
  const cutoff = now - windowMinutes * 60_000;
  const onlineUsers = allUsers.filter((u) => {
    const last = u.lastActiveAt ? new Date(u.lastActiveAt).getTime() : new Date(u.onlineSince).getTime();
    return last >= cutoff;
  });

  // Log a prune event when this user transitions from "in-window" to "stale".
  const wasOnlineRef = useRef<boolean>(false);
  useEffect(() => {
    if (!user) return;
    const me = allUsers.find((u) => u.userId === user.id);
    if (!me) return;
    const last = me.lastActiveAt ? new Date(me.lastActiveAt).getTime() : new Date(me.onlineSince).getTime();
    const isVisible = last >= cutoff;
    if (wasOnlineRef.current && !isVisible) {
      void supabase.from("presence_events").insert({
        user_id: user.id,
        event_type: "prune",
        current_page: me.currentPage,
        last_active_at: me.lastActiveAt ?? me.onlineSince,
        pruned_at: new Date().toISOString(),
        window_minutes: windowMinutes,
        details: { reason: "expired_window" },
      });
    }
    wasOnlineRef.current = isVisible;
  }, [allUsers, cutoff, user, windowMinutes]);

  return {
    onlineUsers,
    onlineCount: onlineUsers.length,
    windowMinutes,
    lastSyncAt,
    refreshIntervalMs: PRUNE_INTERVAL_MS,
  };
}
