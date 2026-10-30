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
  tone: string;
}

const REFRESH_INTERVAL = 60000;

export default function DailyOccurrencesWidget() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const { data, isLoading, dataUpdatedAt } = useQuery({
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

      setLastRefresh(new Date());

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
    refetchInterval: REFRESH_INTERVAL,
  });

  // Update "seconds ago" counter
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastRefresh.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastRefresh]);

  const items: OccurrenceItem[] = [
    {
      label: "Check-Ins",
      count: data?.attendance ?? 0,
      icon: CalendarCheck,
      tone: "bg-sidebar text-sidebar-foreground border-secondary/40",
    },
    {
      label: "Leave Requests",
      count: data?.leaveReqs ?? 0,
      icon: CalendarOff,
      tone: "bg-secondary text-secondary-foreground border-secondary",
    },
    {
      label: "Postings",
      count: data?.postings ?? 0,
      icon: ArrowRightLeft,
      tone: "bg-sidebar text-sidebar-foreground border-secondary/40",
    },
    {
      label: "Visa Apps",
      count: data?.visaApps ?? 0,
      icon: Stamp,
      tone: "bg-card text-card-foreground border-secondary/60",
    },
    {
      label: "Visa Extensions",
      count: data?.visaExts ?? 0,
      icon: FileText,
      tone: "bg-sidebar text-sidebar-foreground border-secondary/40",
    },
    {
      label: "Passport Apps",
      count: data?.passportApps ?? 0,
      icon: FileText,
      tone: "bg-secondary text-secondary-foreground border-secondary",
    },
    {
      label: "Incidents",
      count: data?.incidents ?? 0,
      icon: ShieldAlert,
      tone: "bg-sidebar text-sidebar-foreground border-secondary/40",
    },
  ];

  const totalOccurrences = items.reduce((sum, i) => sum + i.count, 0);

  return (
    <Card className="border-border/50 overflow-hidden relative">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-secondary to-card" />

      <CardHeader className="pb-2 pt-5">
        <CardTitle className="text-sm flex flex-wrap items-center gap-2">
          <span className="relative flex h-5 w-5 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/30" />
            <Zap className="relative h-4 w-4 text-primary" />
          </span>
          Today's Occurrences
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 ml-auto">
                <RefreshCw className={`h-3 w-3 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {secondsAgo < 5 ? "Just now" : `${secondsAgo}s ago`}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Auto-refreshes every 60s</p>
            </TooltipContent>
          </Tooltip>
          <Badge variant="outline" className="text-[10px] font-semibold">
            {format(new Date(), "dd/MM/yyyy")}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Total banner */}
            <div className="flex items-center justify-between mb-4 px-3 py-2 rounded-lg bg-accent border border-secondary/30">
              <span className="text-xs font-medium text-accent-foreground">Total Activity</span>
              <span className="text-2xl font-bold tabular-nums text-primary">
                {totalOccurrences}
              </span>
            </div>

            {/* Occurrence cards grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {items.map((item) => (
                <div
                  key={item.label}
                  className={`min-h-24 rounded-lg border ${item.tone} p-3`}
                >
                  <div className="flex flex-col items-center text-center gap-1">
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                    <span className="text-2xl font-bold tabular-nums leading-none">
                      {item.count}
                    </span>
                    <span className="text-xs font-medium leading-tight">
                      {item.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
