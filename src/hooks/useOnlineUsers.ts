import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface OnlineUser {
  userId: string;
  firstName: string;
  lastName: string;
  staffId: string;
  department: string;
  onlineSince: string;
}

export function useOnlineUsers() {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    if (!user) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      // Fetch this user's profile info for presence payload
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, staff_id, department_id, departments:department_id(name)")
        .eq("user_id", user.id)
        .maybeSingle();

      const deptName = (profile as any)?.departments?.name ?? "";

      const presencePayload = {
        userId: user.id,
        firstName: profile?.first_name ?? "Unknown",
        lastName: profile?.last_name ?? "",
        staffId: profile?.staff_id ?? "",
        department: deptName,
        onlineSince: new Date().toISOString(),
      };

      channel = supabase.channel("online-users", {
        config: { presence: { key: user.id } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel!.presenceState<OnlineUser>();
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
          if (status === "SUBSCRIBED") {
            await channel!.track(presencePayload);
          }
        });
    };

    setup();

    return () => {
      if (channel) {
        channel.untrack();
        supabase.removeChannel(channel);
      }
    };
  }, [user]);

  return { onlineUsers, onlineCount: onlineUsers.length };
}
