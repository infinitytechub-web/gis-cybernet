import { useEffect, useRef, useState } from "react";
import { useOnlineUsers } from "@/hooks/useOnlineUsers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, Wifi, WifiOff, History, Download, CalendarIcon } from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  nightGuardStaff: { id: string; first_name: string; last_name: string; staff_id: string }[];
}

export function NightGuardOnlinePanel({ nightGuardStaff }: Props) {
  const { onlineUsers } = useOnlineUsers();
  const queryClient = useQueryClient();

  // Activity log filters
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);
  const [filterType, setFilterType] = useState<string>("all");

  const nightGuardIds = new Set(nightGuardStaff.map((s) => s.staff_id));

  const onlineGuards = onlineUsers.filter((u) => nightGuardIds.has(u.staffId));
  const offlineGuards = nightGuardStaff.filter(
    (s) => !onlineUsers.some((u) => u.staffId === s.staff_id)
  );

  // Fetch activity history with date filter
  const { data: activityLog = [] } = useQuery({
    queryKey: ["night-guard-activity", filterDate?.toISOString()],
    queryFn: async () => {
      const profileIds = nightGuardStaff.map((s) => s.id);
      if (profileIds.length === 0) return [];
      let query = supabase
        .from("night_guard_activity_log" as any)
        .select("*")
        .in("profile_id", profileIds)
        .order("created_at", { ascending: false });

      if (filterDate) {
        query = query
          .gte("created_at", startOfDay(filterDate).toISOString())
          .lte("created_at", endOfDay(filterDate).toISOString());
      } else {
        query = query.limit(50);
      }
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    enabled: nightGuardStaff.length > 0,
  });

  // Persist event to DB
  const persistEvent = async (staffMember: { id: string; staff_id: string; first_name: string; last_name: string }, eventType: "online" | "offline") => {
    try {
      await supabase.from("night_guard_activity_log" as any).insert({
        profile_id: staffMember.id,
        staff_id: staffMember.staff_id,
        staff_name: `${staffMember.first_name} ${staffMember.last_name}`,
        event_type: eventType,
      } as any);
      queryClient.invalidateQueries({ queryKey: ["night-guard-activity"] });
    } catch {
      // Silent - don't block UI for logging failures
    }
  };

  // Track previous online guard staffIds for change detection
  const prevOnlineRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (nightGuardStaff.length === 0) return;

    const currentIds = new Set(onlineGuards.map((u) => u.staffId));
    const prevIds = prevOnlineRef.current;

    if (!initializedRef.current) {
      initializedRef.current = true;
      prevOnlineRef.current = currentIds;
      return;
    }

    // Detect newly online guards
    for (const guard of onlineGuards) {
      if (!prevIds.has(guard.staffId)) {
        toast.success(`🛡️ ${guard.firstName} ${guard.lastName} is now online`, {
          description: "Night Guard officer came on duty",
        });
        const staff = nightGuardStaff.find((s) => s.staff_id === guard.staffId);
        if (staff) persistEvent(staff, "online");
      }
    }

    // Detect newly offline guards
    for (const staffId of prevIds) {
      if (!currentIds.has(staffId)) {
        const staff = nightGuardStaff.find((s) => s.staff_id === staffId);
        if (staff) {
          toast.warning(`${staff.first_name} ${staff.last_name} went offline`, {
            description: "Night Guard officer left duty",
          });
          persistEvent(staff, "offline");
        }
      }
    }

    prevOnlineRef.current = currentIds;
  }, [onlineGuards, nightGuardStaff]);

  return (
    <div className="space-y-4">
      {/* Live status panel */}
      <Card className="border-amber-300/50 dark:border-amber-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Night Guard Duty — Online Status
            <Badge
              variant="outline"
              className="ml-auto text-[10px] border-amber-400 text-amber-700 dark:text-amber-300"
            >
              {onlineGuards.length}/{nightGuardStaff.length} online
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {nightGuardStaff.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staff assigned to Night Guard department.</p>
          ) : (
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-1.5">
                {onlineGuards.map((u) => (
                  <div
                    key={u.userId}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40"
                  >
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                          {u.firstName?.[0]}{u.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.firstName} {u.lastName}</p>
                      <p className="text-[10px] text-muted-foreground">{u.staffId}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Wifi className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <Badge className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-400">
                        Online
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground hidden sm:block">
                      since {format(new Date(u.onlineSince), "HH:mm")}
                    </span>
                  </div>
                ))}
                {offlineGuards.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 bg-muted/50 border border-border/50"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                        {s.first_name?.[0]}{s.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-muted-foreground truncate">{s.first_name} {s.last_name}</p>
                      <p className="text-[10px] text-muted-foreground">{s.staff_id}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-muted-foreground">
                        Offline
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Activity history log */}
      {activityLog.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              Night Guard Activity Log
              <Badge variant="outline" className="ml-auto text-[10px]">
                Recent {activityLog.length} events
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-1">
                {activityLog.map((entry: any) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm hover:bg-accent/50"
                  >
                    <div className={`h-2 w-2 rounded-full shrink-0 ${entry.event_type === "online" ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                    <span className="font-medium truncate">{entry.staff_name}</span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${
                        entry.event_type === "online"
                          ? "text-emerald-700 dark:text-emerald-300 border-emerald-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {entry.event_type === "online" ? "Came Online" : "Went Offline"}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                      {format(new Date(entry.created_at), "dd MMM HH:mm")}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
