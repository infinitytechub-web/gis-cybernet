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
const PRUNE_INTERVAL_MS = 30_000;

export function useOnlineUsers(windowMinutes: number = DEFAULT_ONLINE_WINDOW_MINUTES) {
  const { user } = useAuth();
  const location = useLocation();
  const [allUsers, setAllUsers] = useState<OnlineUser[]>([]);
  const [now, setNow] = useState<number>(Date.now());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const payloadRef = useRef<OnlineUser | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const setup = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, staff_id, photo_url, department_id, rank_id, departments:department_id(name), ranks:rank_id(name)")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      const deptName = (profile as any)?.departments?.name ?? "";
      const rankName = (profile as any)?.ranks?.name ?? "";
      const nowIso = new Date().toISOString();

      payloadRef.current = {
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

      const ch = supabase.channel(`online-users-${user.id}-${Date.now()}`, {
        config: { presence: { key: user.id } },
      });
      channelRef.current = ch;

      ch
        .on("presence", { event: "sync" }, () => {
          if (cancelled) return;
          const state = ch.presenceState<OnlineUser>();
          const users: OnlineUser[] = [];
          for (const key of Object.keys(state)) {
            const presences = state[key];
            if (presences && presences.length > 0) {
              users.push(presences[0] as unknown as OnlineUser);
            }
          }
          setAllUsers(users);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && !cancelled && payloadRef.current) {
            await ch.track(payloadRef.current);
            // Heartbeat: refresh lastActiveAt so we're not pruned as stale.
            heartbeat = setInterval(() => {
              if (!payloadRef.current || !channelRef.current) return;
              payloadRef.current = {
                ...payloadRef.current,
                lastActiveAt: new Date().toISOString(),
              };
              channelRef.current.track(payloadRef.current);
            }, HEARTBEAT_INTERVAL_MS);
          }
        });
    };

    setup();

    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      const ch = channelRef.current;
      if (ch) {
        ch.untrack();
        supabase.removeChannel(ch);
      }
      channelRef.current = null;
      payloadRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Update presence when route changes (counts as activity).
  useEffect(() => {
    if (!user || !channelRef.current || !payloadRef.current) return;
    payloadRef.current = {
      ...payloadRef.current,
      currentPage: labelForPath(location.pathname),
      lastActiveAt: new Date().toISOString(),
    };
    channelRef.current.track(payloadRef.current);
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

  return {
    onlineUsers,
    onlineCount: onlineUsers.length,
    windowMinutes,
  };
}
