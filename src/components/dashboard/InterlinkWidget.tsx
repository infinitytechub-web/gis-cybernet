import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Network, Send, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { INTERLINK_LABELS } from "@/lib/interlink-types";
import { useInterlinkBranding } from "@/hooks/useInterlinkBranding";

export default function InterlinkWidget() {
  const { isAdminOrSupervisor } = useAuth();
  const branding = useInterlinkBranding();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ["interlink-dashboard-stats"],
    enabled: isAdminOrSupervisor,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [{ count: totalWeek }, { count: sentWeek }, { count: failedWeek }, recent] = await Promise.all([
        supabase.from("interlink_dispatches").select("id", { count: "exact", head: true }).gte("created_at", since),
        supabase.from("interlink_dispatches").select("id", { count: "exact", head: true }).gte("created_at", since).eq("status", "sent"),
        supabase.from("interlink_dispatches").select("id", { count: "exact", head: true }).gte("created_at", since).in("status", ["failed", "partial"]),
        supabase.from("interlink_dispatches").select("id, subject, scope, status, recipient_count, attachment_count, created_at").order("created_at", { ascending: false }).limit(4),
      ]);
      return {
        totalWeek: totalWeek ?? 0,
        sentWeek: sentWeek ?? 0,
        failedWeek: failedWeek ?? 0,
        recent: recent.data ?? [],
      };
    },
    refetchInterval: 60_000,
  });

  // Realtime refresh
  useEffect(() => {
    if (!isAdminOrSupervisor) return;
    const ch = supabase
      .channel("interlink-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "interlink_dispatches" }, () => {
        queryClient.invalidateQueries({ queryKey: ["interlink-dashboard-stats"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isAdminOrSupervisor, queryClient]);

  if (!isAdminOrSupervisor) return null;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Network className="h-4 w-4 text-primary" />
          {branding.nav}
          <Badge variant="outline" className="ml-2 text-[10px] text-primary-foreground border-0 bg-primary">
            Command tier
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 text-xs gap-1"
            onClick={() => navigate("/interlink")}
          >
            Open <ArrowRight className="h-3 w-3" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Last 7 days" value={stats?.totalWeek ?? 0} tone="bg-secondary text-secondary-foreground" icon={Send} />
          <Stat label="Delivered" value={stats?.sentWeek ?? 0} tone="bg-success text-success-foreground" icon={CheckCircle2} />
          <Stat label="Issues" value={stats?.failedWeek ?? 0} tone="bg-warning text-warning-foreground" icon={AlertTriangle} />
        </div>
        <div className="space-y-1.5">
          {(stats?.recent ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground italic px-1">No dispatches yet — open Interlink to send your first.</p>
          )}
          {(stats?.recent ?? []).map((r: any) => (
            <Button
              variant="ghost"
              key={r.id}
              onClick={() => navigate("/interlink?tab=audit")}
              className="h-auto w-full text-left flex flex-wrap items-center gap-2 p-2 rounded-md border border-border bg-background hover:bg-accent whitespace-normal"
            >
              <Badge variant="outline" className="text-[10px] capitalize">{r.scope}</Badge>
              <span className="text-xs font-medium truncate flex-1">{r.subject}</span>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {r.recipient_count} · {r.attachment_count} files
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  r.status === "sent"
                    ? "bg-success text-success-foreground"
                    : r.status === "failed"
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-warning text-warning-foreground"
                }`}
              >
                {r.status}
              </Badge>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
              </span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone, icon: Icon }: { label: string; value: number; tone: string; icon: any }) {
  return (
    <div className={`rounded-md p-2 ${tone}`}>
      <div className="flex items-center justify-between">
        <Icon className="h-3.5 w-3.5 opacity-80" />
        <span className="text-lg font-bold leading-none">{value}</span>
      </div>
      <p className="text-[10px] mt-1 opacity-90">{label}</p>
    </div>
  );
}
