import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Activity, Lock, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

type ThreatRow = { staff_id?: string; ip_address?: string; attempts: number; distinct_staff?: number; distinct_ips?: number; last_attempt?: string };
type ThreatSummary = {
  last_hour_attempts: number;
  last_5min_attempts: number;
  locked_accounts: number;
  top_targeted_staff: ThreatRow[];
  top_attacking_ips: ThreatRow[];
  credential_stuffing: ThreatRow[];
  distributed_attacks: ThreatRow[];
  generated_at: string;
};

export default function SecurityThreatsWidget() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, isFetching, refetch } = useQuery<ThreatSummary | null>({
    queryKey: ["security-threat-summary"],
    enabled: isAdmin,
    refetchInterval: 30_000, // poll every 30s
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_security_threat_summary" as any);
      if (error) throw error;
      return data as ThreatSummary;
    },
  });

  // Realtime: invalidate immediately when new failed attempts arrive
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("security-failed-logins")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "failed_login_attempts" }, () => {
        qc.invalidateQueries({ queryKey: ["security-threat-summary"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, qc]);

  if (!isAdmin) return null;

  const hasActiveThreat =
    (data?.credential_stuffing?.length ?? 0) > 0 ||
    (data?.distributed_attacks?.length ?? 0) > 0 ||
    (data?.last_5min_attempts ?? 0) >= 5;

  return (
    <Card className={hasActiveThreat ? "border-destructive/40 bg-destructive/5" : "border-border/50"}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldAlert className={`h-4 w-4 ${hasActiveThreat ? "text-destructive animate-pulse" : "text-primary"}`} />
          Security Threats {hasActiveThreat && <Badge variant="destructive" className="text-[10px]">ACTIVE</Badge>}
        </CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {data?.generated_at ? `Updated ${formatDistanceToNow(new Date(data.generated_at), { addSuffix: true })}` : ""}
          </span>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh">
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-3">
          <StatTile icon={Activity} label="Failed (last hr)" value={data?.last_hour_attempts ?? 0} tone="default" />
          <StatTile icon={AlertTriangle} label="Failed (last 5 min)" value={data?.last_5min_attempts ?? 0} tone={(data?.last_5min_attempts ?? 0) >= 5 ? "danger" : "default"} />
          <StatTile icon={Lock} label="Locked accounts" value={data?.locked_accounts ?? 0} tone={(data?.locked_accounts ?? 0) > 0 ? "warn" : "default"} />
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading threat data…
          </div>
        )}

        {/* Active suspicious patterns */}
        {(data?.credential_stuffing?.length ?? 0) > 0 && (
          <ThreatList
            tone="danger"
            title="Credential stuffing in progress"
            description="Single IP attempting many staff IDs (last 5 min)"
            rows={data!.credential_stuffing.map(r => ({
              primary: r.ip_address ?? "—",
              secondary: `${r.distinct_staff} different staff IDs · ${r.attempts} attempts`,
            }))}
          />
        )}
        {(data?.distributed_attacks?.length ?? 0) > 0 && (
          <ThreatList
            tone="danger"
            title="Distributed attack pattern"
            description="Same staff ID hit from many IPs (last 5 min)"
            rows={data!.distributed_attacks.map(r => ({
              primary: r.staff_id ?? "—",
              secondary: `${r.distinct_ips} different IPs · ${r.attempts} attempts`,
            }))}
          />
        )}

        {/* Top recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {(data?.top_targeted_staff?.length ?? 0) > 0 && (
            <ThreatList
              tone="warn"
              title="Most targeted staff IDs (last hr)"
              rows={data!.top_targeted_staff.map(r => ({
                primary: r.staff_id ?? "—",
                secondary: `${r.attempts} attempts${r.last_attempt ? ` · ${formatDistanceToNow(new Date(r.last_attempt), { addSuffix: true })}` : ""}`,
              }))}
            />
          )}
          {(data?.top_attacking_ips?.length ?? 0) > 0 && (
            <ThreatList
              tone="warn"
              title="Top source IPs (last hr)"
              rows={data!.top_attacking_ips.map(r => ({
                primary: r.ip_address ?? "—",
                secondary: `${r.attempts} attempts · ${r.distinct_staff} staff IDs`,
              }))}
            />
          )}
        </div>

        {!isLoading && !hasActiveThreat &&
         (data?.top_targeted_staff?.length ?? 0) === 0 &&
         (data?.top_attacking_ips?.length ?? 0) === 0 && (
          <p className="text-xs text-muted-foreground italic">No suspicious activity detected in the last hour ✓</p>
        )}

        <div className="flex justify-end pt-1">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate("/settings")}>
            Open security settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatTile({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: "default" | "warn" | "danger" }) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/40 bg-destructive/10"
      : tone === "warn"
      ? "border-warning/40 bg-warning/10"
      : "border-border bg-muted/30";
  const iconClass =
    tone === "danger" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-muted-foreground";
  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className={`h-3 w-3 ${iconClass}`} /> {label}
      </div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
    </div>
  );
}

function ThreatList({
  title,
  description,
  rows,
  tone,
}: {
  title: string;
  description?: string;
  rows: { primary: string; secondary: string }[];
  tone: "danger" | "warn";
}) {
  const headerClass = tone === "danger" ? "text-destructive" : "text-warning";
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div>
        <h4 className={`text-xs font-semibold uppercase tracking-wide ${headerClass}`}>{title}</h4>
        {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
      </div>
      <ul className="space-y-1">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center justify-between text-xs gap-2">
            <span className="font-mono truncate">{r.primary}</span>
            <span className="text-muted-foreground text-[11px] whitespace-nowrap">{r.secondary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
