import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Shield, MapPin, Clock } from "lucide-react";
import { useOnlineUsers } from "@/hooks/useOnlineUsers";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNowStrict } from "date-fns";

const ALLOWED_ROLES = [
  "admin",
  "oic",
  "2ic",
  "head_of_administration",
  "chief_staff_officer",
  "staff_officer",
  "supervisor",
  "deputy_supervisor",
  "ipse_supervisor",
  "ipse_deputy_supervisor",
  "shift_supervisor",
  "deputy_shift_supervisor",
  "shift_leader",
  "deputy_shift_leader",
];

export default function OnlineNowPanel() {
  const { role } = useAuth();
  const { onlineUsers, onlineCount, windowMinutes } = useOnlineUsers();

  if (!role || !ALLOWED_ROLES.includes(role)) return null;

  return (
    <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
          </span>
          Online Now — Live Presence
          <span className="text-[10px] font-normal text-muted-foreground">
            (active in last {windowMinutes} min)
          </span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {onlineCount} user{onlineCount !== 1 ? "s" : ""}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {onlineCount === 0 ? (
          <p className="text-sm text-muted-foreground">No users currently online</p>
        ) : (
          <ScrollArea className="max-h-[260px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {onlineUsers.map((u) => {
                const isNightGuard = u.department?.toLowerCase().includes("night guard");
                let onlineFor = "";
                try {
                  onlineFor = formatDistanceToNowStrict(new Date(u.onlineSince), { addSuffix: false });
                } catch { /* ignore */ }
                return (
                  <TooltipProvider key={u.userId} delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex items-center gap-2 rounded-md border px-2 py-2 cursor-help ${
                            isNightGuard
                              ? "bg-amber-100/60 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700"
                              : "bg-background border-border"
                          }`}
                        >
                          <Avatar className="h-9 w-9">
                            {u.photoUrl ? <AvatarImage src={u.photoUrl} alt={`${u.firstName} ${u.lastName}`} /> : null}
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {u.firstName?.[0]}
                              {u.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-xs font-semibold truncate">
                                {u.firstName} {u.lastName}
                              </span>
                              {isNightGuard && (
                                <Shield className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                              <span className="truncate font-medium">{u.staffId}</span>
                              {u.rank && (
                                <>
                                  <span>·</span>
                                  <span className="truncate">{u.rank}</span>
                                </>
                              )}
                            </div>
                            {u.department && (
                              <div className="text-[10px] text-muted-foreground truncate">{u.department}</div>
                            )}
                            <div className="flex items-center gap-2 text-[10px] mt-0.5">
                              {u.currentPage && (
                                <span className="inline-flex items-center gap-0.5 text-primary">
                                  <MapPin className="h-2.5 w-2.5" />
                                  {u.currentPage}
                                </span>
                              )}
                              {onlineFor && (
                                <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                                  <Clock className="h-2.5 w-2.5" />
                                  {onlineFor}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <div className="space-y-1 text-xs">
                          <div className="font-semibold">{u.firstName} {u.lastName}</div>
                          <div className="text-muted-foreground">
                            <span className="font-medium">Online ID:</span> {u.staffId}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground" title={u.userId}>
                            UID: {u.userId.slice(0, 8)}…{u.userId.slice(-4)}
                          </div>
                          {u.department && (
                            <div className="text-muted-foreground">
                              <span className="font-medium">Department:</span> {u.department}
                            </div>
                          )}
                          {u.rank && (
                            <div className="text-muted-foreground">
                              <span className="font-medium">Rank:</span> {u.rank}
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
