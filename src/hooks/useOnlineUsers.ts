import { useEffect, useState } from "react";
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
  // try first segment match
  const seg = "/" + pathname.split("/").filter(Boolean)[0];
  return ROUTE_LABELS[seg] ?? pathname;
}

export function useOnlineUsers() {
  const { user } = useAuth();
  const location = useLocation();
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    if (!user) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let currentPayload: OnlineUser | null = null;

    const setup = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, staff_id, photo_url, department_id, rank_id, departments:department_id(name), ranks:rank_id(name)")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      const deptName = (profile as any)?.departments?.name ?? "";
      const rankName = (profile as any)?.ranks?.name ?? "";

      currentPayload = {
        userId: user.id,
        firstName: profile?.first_name ?? "Unknown",
        lastName: profile?.last_name ?? "",
        staffId: profile?.staff_id ?? "",
        department: deptName,
        rank: rankName,
        photoUrl: (profile as any)?.photo_url ?? null,
        currentPage: labelForPath(location.pathname),
        onlineSince: new Date().toISOString(),
      };

      channel = supabase.channel(`online-users-${user.id}-${Date.now()}`, {
        config: { presence: { key: user.id } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          if (cancelled || !channel) return;
          const state = channel.presenceState<OnlineUser>();
          const users: OnlineUser[] = [];
          for (const key of Object.keys(state)) {
            const presences = state[key];
            if (presences && presences.length > 0) {
              users.push(presences[0] as unknown as OnlineUser);
            }
          }
          setOnlineUsers(users);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && channel && !cancelled && currentPayload) {
            await channel.track(currentPayload);
          }
        });
    };

    setup();

    return () => {
      cancelled = true;
      if (channel) {
        channel.untrack();
        supabase.removeChannel(channel);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Update presence when route changes (without recreating channel)
  useEffect(() => {
    if (!user) return;
    const channels = supabase.getChannels();
    const ch = channels.find((c) => c.topic.startsWith(`realtime:online-users-${user.id}-`));
    if (!ch) return;
    const state = (ch as any).presenceState?.();
    const mine = state?.[user.id]?.[0] as OnlineUser | undefined;
    if (mine) {
      ch.track({ ...mine, currentPage: labelForPath(location.pathname) });
    }
  }, [location.pathname, user]);

  return { onlineUsers, onlineCount: onlineUsers.length };
}
