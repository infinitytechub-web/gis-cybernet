import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CalendarCheck, CalendarOff, ArrowRightLeft, Stamp, FileText, ShieldAlert, Zap, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect } from "react";

interface OccurrenceItem {
  label: string;
  count: number;
  icon: React.ElementType;
  gradient: string;
  glow: string;
  textColor: string;
}

const REFRESH_INTERVAL = 60000;

export default function DailyOccurrencesWidget() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ["daily-occurrences", today],
    queryFn: async () => {
      const todayStart = `${today}T00:00:00`;
      const todayEnd = `${today}T23:59:59`;

      const [
        attendance,
        leaveReqs,
        postings,
        visaApps,
        visaExts,
        passportApps,
        incidents,
      ] = await Promise.all([
        supabase.from("attendances").select("id", { count: "exact", head: true }).eq("date", today),
        supabase.from("leave_requests").select("id", { count: "exact", head: true }).gte("created_at", todayStart).lte("created_at", todayEnd),
        supabase.from("postings_transfers").select("id", { count: "exact", head: true }).gte("created_at", todayStart).lte("created_at", todayEnd),
        supabase.from("visa_applications").select("id", { count: "exact", head: true }).gte("created_at", todayStart).lte("created_at", todayEnd),
        supabase.from("visa_extensions").select("id", { count: "exact", head: true }).gte("created_at", todayStart).lte("created_at", todayEnd),
        supabase.from("passport_applications").select("id", { count: "exact", head: true }).gte("created_at", todayStart).lte("created_at", todayEnd),
        supabase.from("security_incidents").select("id", { count: "exact", head: true }).gte("created_at", todayStart).lte("created_at", todayEnd),
      ]);

      return {
        attendance: attendance.count ?? 0,
        leaveReqs: leaveReqs.count ?? 0,
        postings: postings.count ?? 0,
        visaApps: visaApps.count ?? 0,
        visaExts: visaExts.count ?? 0,
        passportApps: passportApps.count ?? 0,
        incidents: incidents.count ?? 0,
      };
    },
    refetchInterval: 60000, // refresh every minute
  });

  const items: OccurrenceItem[] = [
    {
      label: "Check-Ins",
      count: data?.attendance ?? 0,
      icon: CalendarCheck,
      gradient: "from-emerald-500 to-teal-600",
      glow: "shadow-emerald-500/25",
      textColor: "text-emerald-100",
    },
    {
      label: "Leave Requests",
      count: data?.leaveReqs ?? 0,
      icon: CalendarOff,
      gradient: "from-amber-500 to-orange-600",
      glow: "shadow-amber-500/25",
      textColor: "text-amber-100",
    },
    {
      label: "Postings",
      count: data?.postings ?? 0,
      icon: ArrowRightLeft,
      gradient: "from-violet-500 to-purple-600",
      glow: "shadow-violet-500/25",
      textColor: "text-violet-100",
    },
    {
      label: "Visa Apps",
      count: data?.visaApps ?? 0,
      icon: Stamp,
      gradient: "from-blue-500 to-indigo-600",
      glow: "shadow-blue-500/25",
      textColor: "text-blue-100",
    },
    {
      label: "Visa Extensions",
      count: data?.visaExts ?? 0,
      icon: FileText,
      gradient: "from-cyan-500 to-sky-600",
      glow: "shadow-cyan-500/25",
      textColor: "text-cyan-100",
    },
    {
      label: "Passport Apps",
      count: data?.passportApps ?? 0,
      icon: FileText,
      gradient: "from-rose-500 to-pink-600",
      glow: "shadow-rose-500/25",
      textColor: "text-rose-100",
    },
    {
      label: "Incidents",
      count: data?.incidents ?? 0,
      icon: ShieldAlert,
      gradient: "from-red-500 to-rose-700",
      glow: "shadow-red-500/25",
      textColor: "text-red-100",
    },
  ];

  const totalOccurrences = items.reduce((sum, i) => sum + i.count, 0);

  return (
    <Card className="border-border/50 overflow-hidden relative">
      {/* Subtle gradient border accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-blue-500 via-violet-500 to-rose-500" />

      <CardHeader className="pb-2 pt-5">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="relative flex h-5 w-5 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/30" />
            <Zap className="relative h-4 w-4 text-primary" />
          </span>
          Today's Occurrences
          <Badge variant="outline" className="ml-auto text-[10px] font-semibold">
            {format(new Date(), "dd MMM yyyy")}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Total banner */}
            <div className="flex items-center justify-between mb-4 px-3 py-2 rounded-lg bg-gradient-to-r from-primary/10 via-secondary/5 to-primary/10 border border-primary/10">
              <span className="text-xs font-medium text-muted-foreground">Total Activity</span>
              <span className="text-2xl font-bold tabular-nums bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                {totalOccurrences}
              </span>
            </div>

            {/* Occurrence cards grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {items.map((item) => (
                <div
                  key={item.label}
                  className={`relative rounded-xl bg-gradient-to-br ${item.gradient} p-3 shadow-lg ${item.glow} transition-transform hover:scale-105 hover:shadow-xl`}
                >
                  <div className="flex flex-col items-center text-center gap-1">
                    <item.icon className="h-5 w-5 text-white/90" />
                    <span className="text-2xl font-bold text-white tabular-nums leading-none">
                      {item.count}
                    </span>
                    <span className={`text-[10px] font-medium ${item.textColor} leading-tight`}>
                      {item.label}
                    </span>
                  </div>
                  {/* Decorative circle */}
                  <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-white/10 blur-sm" />
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
