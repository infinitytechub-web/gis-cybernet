import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Radio, Crosshair, Shield, ExternalLink } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { GpsLiveMap } from "@/components/command-vault/GpsLiveMap";
import { useNavigate } from "react-router-dom";

type SourceKey = "operations" | "enforcement_operations" | "cyber_incidents";

const SOURCE_META: Record<SourceKey, { label: string; icon: any; color: string }> = {
  operations: { label: "Operations", icon: Crosshair, color: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300" },
  enforcement_operations: { label: "Enforcement", icon: Shield, color: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300" },
  cyber_incidents: { label: "Cyber Incident", icon: Radio, color: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300" },
};

const KNOWN_LOCATIONS: Record<string, [number, number]> = {
  amasaman: [5.7, -0.2833], pokuase: [5.7167, -0.2833], ofankor: [5.6667, -0.2667],
  achimota: [5.6167, -0.2333], dome: [5.65, -0.2333], haatso: [5.6667, -0.2],
  taifa: [5.6667, -0.25], kwabenya: [5.7, -0.2167], ashongman: [5.7, -0.2],
  legon: [5.65, -0.1833], circle: [5.5667, -0.2167], accra: [5.6037, -0.187],
  tema: [5.6698, -0.0166], kasoa: [5.5333, -0.4167], nsawam: [5.8, -0.35],
  adenta: [5.7167, -0.1667], madina: [5.6833, -0.1667], pantang: [5.7167, -0.1833],
  aburi: [5.85, -0.175], dodowa: [5.8833, -0.0833], weija: [5.5667, -0.3333],
  mallam: [5.5833, -0.2667], bortianor: [5.55, -0.3667],
};

function parseLocation(raw: string | null): { lat: number | null; lng: number | null; approximate: boolean } {
  if (!raw) return { lat: null, lng: null, approximate: false };
  const m = raw.match(/\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), approximate: false };
  const lower = raw.toLowerCase();
  for (const [n, c] of Object.entries(KNOWN_LOCATIONS)) {
    if (lower.includes(n)) return { lat: c[0], lng: c[1], approximate: true };
  }
  return { lat: null, lng: null, approximate: false };
}

type GeoPoint = {
  id: string;
  source: SourceKey;
  lat: number;
  lng: number;
  label: string;
  context: string;
  approximate: boolean;
  created_at: string;
};

/**
 * Live GPS Map dashboard widget.
 * Restricted to: Admin, OIC, 2IC, Staff Officer (Head of Admin / Chief Staff Officer).
 * Shows the most-recent geolocated record across Operations, Enforcement, and Cyber Incidents,
 * auto-refreshes every 30s, and reacts to realtime updates on those tables.
 */
export default function LiveGpsMapWidget() {
  const { isAdmin, isOic, is2ic, role } = useAuth();
  const allowed = isAdmin || isOic || is2ic || role === "staff_officer";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pickedId, setPickedId] = useState<string | null>(null);

  const { data: points = [], isLoading } = useQuery({
    queryKey: ["dashboard-live-gps"],
    enabled: allowed,
    refetchInterval: 30_000,
    queryFn: async (): Promise<GeoPoint[]> => {
      const [ops, enf, cyber] = await Promise.all([
        supabase.from("operations").select("id, location, operation_type, created_at")
          .not("location", "is", null).order("created_at", { ascending: false }).limit(15),
        supabase.from("enforcement_operations").select("id, location, operation_type, created_at")
          .not("location", "is", null).order("created_at", { ascending: false }).limit(15),
        supabase.from("cyber_incidents").select("id, source, incident_type, reported_at, created_at")
          .not("source", "is", null).order("created_at", { ascending: false }).limit(15),
      ]);

      const all: GeoPoint[] = [];
      (ops.data ?? []).forEach((r: any) => {
        const p = parseLocation(r.location);
        if (p.lat != null && p.lng != null) all.push({
          id: `operations:${r.id}`, source: "operations", lat: p.lat, lng: p.lng,
          label: r.operation_type ?? "Operation", context: r.location, approximate: p.approximate,
          created_at: r.created_at,
        });
      });
      (enf.data ?? []).forEach((r: any) => {
        const p = parseLocation(r.location);
        if (p.lat != null && p.lng != null) all.push({
          id: `enforcement_operations:${r.id}`, source: "enforcement_operations", lat: p.lat, lng: p.lng,
          label: r.operation_type ?? "Enforcement", context: r.location, approximate: p.approximate,
          created_at: r.created_at,
        });
      });
      (cyber.data ?? []).forEach((r: any) => {
        const p = parseLocation(r.source);
        if (p.lat != null && p.lng != null) all.push({
          id: `cyber_incidents:${r.id}`, source: "cyber_incidents", lat: p.lat, lng: p.lng,
          label: r.incident_type ?? "Incident", context: r.source, approximate: p.approximate,
          created_at: r.created_at ?? r.reported_at,
        });
      });

      return all.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 10);
    },
  });

  // Realtime invalidation
  useEffect(() => {
    if (!allowed) return;
    const ch = supabase.channel("dashboard-live-gps-rt");
    (["operations", "enforcement_operations", "cyber_incidents"] as const).forEach((t) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-live-gps"] });
      })
    );
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [allowed, qc]);

  const active = useMemo(
    () => points.find((p) => p.id === pickedId) ?? points[0] ?? null,
    [points, pickedId]
  );

  if (!allowed) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Live GPS Map
            <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
              Command Tier
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Latest geolocated activity across Operations, Enforcement, and Cyber Incidents · auto-refresh 30s
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => navigate("/gps-addresses")}>
          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open GPS Hub
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[320px] rounded-md border bg-muted/40 animate-pulse" />
        ) : active ? (
          <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
            <div className="min-w-0 space-y-2">
              <GpsLiveMap
                lat={active.lat}
                lng={active.lng}
                label={`${SOURCE_META[active.source].label} — ${active.label}`}
                height={320}
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge className={SOURCE_META[active.source].color}>
                  {SOURCE_META[active.source].label}
                </Badge>
                <span className="font-mono">{active.lat.toFixed(5)}, {active.lng.toFixed(5)}</span>
                {active.approximate && (
                  <Badge variant="outline" className="text-[10px]">approx.</Badge>
                )}
                <span>· {format(new Date(active.created_at), "dd/MM/yyyy HH:mm")}</span>
              </div>
            </div>
            <div className="space-y-1 max-h-[340px] overflow-y-auto pr-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Recent geolocated records
              </p>
              {points.map((p) => {
                const Icon = SOURCE_META[p.source].icon;
                const isActive = active.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPickedId(p.id)}
                    className={`w-full text-left rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      isActive ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-medium">
                      <Icon className="h-3 w-3 shrink-0" />
                      <span className="truncate capitalize">{p.label.replace(/_/g, " ")}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{p.context}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground italic border rounded-md">
            No geolocated records yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
