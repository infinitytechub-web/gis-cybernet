import { useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileSearch, Stamp, FileText, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNewItemAlert } from "@/hooks/useNewItemAlert";
import { toast } from "sonner";

export default function ProcessingQueueWidget() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const handleNewItems = useCallback((diff: number) => {
    toast.info(`${diff} new application${diff > 1 ? "s" : ""} in Processing Queue`, {
      description: "Click to review",
      action: { label: "View", onClick: () => navigate("/processing") },
    });
  }, [navigate]);
  const { flash, checkForNewItems } = useNewItemAlert(handleNewItems);

  useEffect(() => {
    const channel = supabase
      .channel("processing-widget-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "visa_applications" }, () => {
        queryClient.invalidateQueries({ queryKey: ["processing-queue-counts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "visa_extensions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["processing-queue-counts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "passport_applications" }, () => {
        queryClient.invalidateQueries({ queryKey: ["processing-queue-counts"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data } = useQuery({
    queryKey: ["processing-queue-counts"],
    queryFn: async () => {
      const [visaRes, extRes, passRes] = await Promise.all([
        supabase.from("visa_applications").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
        supabase.from("visa_extensions").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
        supabase.from("passport_applications").select("id", { count: "exact", head: true }).in("status", ["submitted", "processing"]),
      ]);
      return {
        visa: visaRes.count ?? 0,
        extensions: extRes.count ?? 0,
        passport: passRes.count ?? 0,
      };
    },
    refetchInterval: 60_000,
  });

  const total = data ? data.visa + data.extensions + data.passport : 0;

  useEffect(() => {
    if (data) checkForNewItems(total);
  }, [total, data, checkForNewItems]);

  if (!data || total === 0) return null;

  const queues = [
    { label: "Visa Apps", count: data.visa, icon: Stamp, color: "text-blue-600 dark:text-blue-400", tab: "visa" },
    { label: "Extensions", count: data.extensions, icon: FileText, color: "text-purple-600 dark:text-purple-400", tab: "extensions" },
    { label: "Passports", count: data.passport, icon: BookOpen, color: "text-emerald-600 dark:text-emerald-400", tab: "passport" },
  ];

  return (
    <Card className={`border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 transition-all duration-300 ${flash ? "ring-2 ring-amber-400 shadow-lg shadow-amber-200/50 dark:shadow-amber-800/30 animate-pulse" : ""}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Processing Queue
          <Badge variant="outline" className={`ml-auto text-[10px] transition-colors ${flash ? "bg-amber-500 text-white border-amber-500" : ""}`}>{total} pending</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          {queues.filter(q => q.count > 0).map((q) => (
            <button
              key={q.label}
              onClick={() => navigate(`/processing?tab=${q.tab}`)}
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