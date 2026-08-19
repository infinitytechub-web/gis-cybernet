import { useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, HelpCircle, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNewItemAlert } from "@/hooks/useNewItemAlert";
import { toast } from "sonner";
import { FRONT_DESK_TABLES, countPendingByTable } from "@/lib/application-queues";

/** Front Desk queue: only the modules the Front Desk page actually owns. */
export default function FrontDeskQueueWidget() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const handleNewItems = useCallback((diff: number) => {
    toast.info(`${diff} new application${diff > 1 ? "s" : ""} at Front Desk`, {
      description: "Click to review",
      action: { label: "View", onClick: () => navigate("/front-desk") },
    });
  }, [navigate]);
  const { flash, checkForNewItems } = useNewItemAlert(handleNewItems);

  useEffect(() => {
    const channel = supabase.channel("frontdesk-widget-realtime");
    FRONT_DESK_TABLES.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        queryClient.invalidateQueries({ queryKey: ["frontdesk-queue-counts"] });
      });
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data } = useQuery({
    queryKey: ["frontdesk-queue-counts"],
    queryFn: () => countPendingByTable(FRONT_DESK_TABLES),
    refetchInterval: 60_000,
  });

  const total = data ? Object.values(data).reduce((a, b) => a + b, 0) : 0;

  useEffect(() => {
    if (data) checkForNewItems(total);
  }, [total, data, checkForNewItems]);

  if (!data || total === 0) return null;

  const queues = [
    { label: "Official", count: data.official_applications ?? 0, icon: Shield, color: "text-cyan-600 dark:text-cyan-400", tab: "official" },
    { label: "Enquiry", count: data.enquiry_applications ?? 0, icon: HelpCircle, color: "text-lime-600 dark:text-lime-400", tab: "enquiry" },
  ];

  return (
    <Card className={`border-lime-200 dark:border-lime-800 bg-lime-50/50 dark:bg-lime-950/20 transition-all duration-300 ${flash ? "ring-2 ring-lime-400 shadow-lg shadow-lime-200/50 dark:shadow-lime-800/30 animate-pulse" : ""}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-lime-600 dark:text-lime-400" />
          Front Desk
          <Badge variant="outline" className={`ml-auto text-[10px] transition-colors ${flash ? "bg-lime-500 text-white border-lime-500" : ""}`}>{total} pending</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          {queues.filter(q => q.count > 0).map((q) => (
            <button
              key={q.label}
              onClick={() => navigate(`/front-desk?tab=${q.tab}`)}
              className="flex items-center gap-3 p-3 rounded-lg bg-background border hover:border-primary/50 transition-colors cursor-pointer"
            >
              <q.icon className={`h-6 w-6 ${q.color}`} />
              <div className="text-left">
                <div className="text-xl font-bold">{q.count}</div>
                <div className="text-xs text-muted-foreground">{q.label}</div>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
