import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CalendarCheck, CalendarOff, Calendar } from "lucide-react";

export default function Dashboard() {
  const { data: staffCount = 0 } = useQuery({
    queryKey: ["staff-count"],
    queryFn: async () => {
      const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: todayAttendance = 0 } = useQuery({
    queryKey: ["today-attendance"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { count } = await supabase.from("attendances").select("*", { count: "exact", head: true }).eq("date", today);
      return count ?? 0;
    },
  });

  const { data: pendingLeave = 0 } = useQuery({
    queryKey: ["pending-leave"],
    queryFn: async () => {
      const { count } = await supabase.from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "pending");
      return count ?? 0;
    },
  });

  const { data: upcomingHolidays = 0 } = useQuery({
    queryKey: ["upcoming-holidays"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { count } = await supabase.from("holidays").select("*", { count: "exact", head: true }).gte("date", today);
      return count ?? 0;
    },
  });

  const cards = [
    { title: "Total Staff", value: staffCount, icon: Users, color: "text-primary" },
    { title: "On-Duty Today", value: todayAttendance, icon: CalendarCheck, color: "text-emerald-600" },
    { title: "Pending Leave", value: pendingLeave, icon: CalendarOff, color: "text-amber-600" },
    { title: "Upcoming Holidays", value: upcomingHolidays, icon: Calendar, color: "text-secondary" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-secondary">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.title} className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
