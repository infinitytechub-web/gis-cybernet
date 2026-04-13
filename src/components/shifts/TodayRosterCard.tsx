import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Shield, Phone, Mail, Clock } from "lucide-react";
import { format } from "date-fns";
import { useOnlineUsers } from "@/hooks/useOnlineUsers";

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  staff_id: string;
  phone?: string | null;
  email?: string | null;
}

interface Props {
  todayDutyStaff: StaffMember[];
  totalStaff: number;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
}

export function TodayRosterCard({ todayDutyStaff, totalStaff }: Props) {
  const { onlineUsers } = useOnlineUsers();
  const onlineStaffIds = new Set(onlineUsers.map((u) => u.staffId));

  return (
    <Card className="border-[hsl(220,80%,18%)]/20 dark:border-[hsl(220,70%,60%)]/20 bg-gradient-to-br from-[hsl(220,60%,97%)] to-background dark:from-[hsl(220,40%,12%)] dark:to-background">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-[hsl(220,80%,18%)] dark:text-[hsl(220,70%,60%)] font-bold">
          <Shield className="h-4 w-4 stroke-[2.5]" />
          Tonight's Duty Roster — {format(new Date(), "EEEE, dd MMM yyyy")}
          <Badge variant="outline" className="ml-auto text-[10px] font-semibold">
            {todayDutyStaff.length} of {totalStaff} assigned
          </Badge>
        </CardTitle>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
          <Clock className="h-3 w-3" />
          <span>Duty Hours: 18:00 – 06:00</span>
        </div>
      </CardHeader>
      <CardContent>
        {todayDutyStaff.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">No guards assigned for tonight.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {todayDutyStaff.map((staff) => {
              const isOnline = onlineStaffIds.has(staff.staff_id);
              return (
                <div
                  key={staff.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 border bg-card hover:bg-accent/30 transition-colors"
                >
                  <div className="relative">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-xs bg-[hsl(220,60%,92%)] dark:bg-[hsl(220,40%,20%)] text-[hsl(220,80%,18%)] dark:text-[hsl(220,70%,60%)] font-semibold">
                        {staff.first_name?.[0]}{staff.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${isOnline ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{staff.first_name} {staff.last_name}</p>
                    <p className="text-[10px] text-muted-foreground">{staff.staff_id}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {staff.phone && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Phone className="h-2.5 w-2.5" /> {staff.phone}
                        </span>
                      )}
                      {staff.email && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Mail className="h-2.5 w-2.5" /> {staff.email}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${
                      isOnline
                        ? "text-emerald-700 dark:text-emerald-300 border-emerald-400 bg-emerald-500/10"
                        : "text-muted-foreground"
                    }`}
                  >
                    {isOnline ? "Online" : "Offline"}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
