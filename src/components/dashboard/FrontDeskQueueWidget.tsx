import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stamp, FileText, BookOpen, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function FrontDeskQueueWidget() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("frontdesk-widget-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "visa_applications" }, () => {
        queryClient.invalidateQueries({ queryKey: ["frontdesk-queue-counts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "visa_extensions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["frontdesk-queue-counts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "passport_applications" }, () => {
        queryClient.invalidateQueries({ queryKey: ["frontdesk-queue-counts"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data } = useQuery({
    queryKey: ["frontdesk-queue-counts"],
    queryFn: async () => {
      const [visaRes, extRes, passRes] = await Promise.all([
        supabase.from("visa_applications").select("id", { count: "exact", head: true }),
        supabase.from("visa_extensions").select("id", { count: "exact", head: true }),
        supabase.from("passport_applications").select("id", { count: "exact", head: true }),
      ]);
      return {
        visa: visaRes.count ?? 0,
        extensions: extRes.count ?? 0,
        passport: passRes.count ?? 0,
      };
    },
    refetchInterval: 60_000,
  });

  if (!data) return null;
  const total = data.visa + data.extensions + data.passport;
  if (total === 0) return null;

  const queues = [
    { label: "Visa Apps", count: data.visa, icon: Stamp, color: "text-blue-600 dark:text-blue-400", tab: "visa" },
    { label: "Extensions", count: data.extensions, icon: FileText, color: "text-purple-600 dark:text-purple-400", tab: "extensions" },
    { label: "Passports", count: data.passport, icon: BookOpen, color: "text-emerald-600 dark:text-emerald-400", tab: "passport" },
  ];

  return (
    <Card className="border-lime-200 dark:border-lime-800 bg-lime-50/50 dark:bg-lime-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-lime-600 dark:text-lime-400" />
          Front Desk
          <Badge variant="outline" className="ml-auto text-[10px]">{total} total</Badge>
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
