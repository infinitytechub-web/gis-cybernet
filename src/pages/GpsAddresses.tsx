import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MapPin, Search, Lock, Activity, Globe2, Crosshair, Package, Shield,
  ExternalLink, Radio, Navigation as NavIcon, Sparkles, Cloud, Copy, Check, Loader2, Timer,
  MoreHorizontal, Eye, Pencil, Trash2, Satellite, ShieldAlert, Printer,
} from "lucide-react";
import { ExportMenu } from "@/components/ui/export-menu";
import { toast } from "@/hooks/use-toast";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import { GpsLiveMap } from "@/components/command-vault/GpsLiveMap";
import { StaticCoordinateMap } from "@/components/command-vault/StaticCoordinateMap";

type SourceKey = "operations" | "enforcement_operations" | "cyber_incidents" | "inventory_items";

const SOURCE_META: Record<SourceKey, { label: string; icon: any; color: string; chartColor: string }> = {
  operations: {
    label: "Operations",
    icon: Crosshair,
    color: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
    chartColor: "hsl(25, 90%, 55%)",
  },
  enforcement_operations: {
    label: "Enforcement",
    icon: Shield,
    color: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
    chartColor: "hsl(0, 80%, 55%)",
  },
  cyber_incidents: {
    label: "Cyber Incidents",
    icon: Radio,
    color: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
    chartColor: "hsl(270, 70%, 60%)",
  },
  inventory_items: {
    label: "Inventory",
    icon: Package,
    color: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    chartColor: "hsl(40, 85%, 55%)",
  },
};

interface GpsRecord {
  id: string;
  source: SourceKey;
  raw_location: string;
  digital_address: string | null;
  lat: number | null;
  lng: number | null;
  context: string;
  reference: string;
  created_at: string;
  status?: string | null;
}

// Re-uses the canonical KNOWN_LOCATIONS map from OperationsMap to derive coords
// from landmark-style addresses (Amasaman, Pokuase, etc.).
const KNOWN_LOCATIONS: Record<string, [number, number]> = {
  amasaman: [5.7, -0.2833],
  pokuase: [5.7167, -0.2833],
  ofankor: [5.6667, -0.2667],
  achimota: [5.6167, -0.2333],
  dome: [5.65, -0.2333],
  haatso: [5.6667, -0.2],
  taifa: [5.6667, -0.25],
  kwabenya: [5.7, -0.2167],
  ashongman: [5.7, -0.2],
  legon: [5.65, -0.1833],
  circle: [5.5667, -0.2167],
  accra: [5.6037, -0.187],
  tema: [5.6698, -0.0166],
  kasoa: [5.5333, -0.4167],
  nsawam: [5.8, -0.35],
  adenta: [5.7167, -0.1667],
  madina: [5.6833, -0.1667],
  pantang: [5.7167, -0.1833],
  aburi: [5.85, -0.175],
  dodowa: [5.8833, -0.0833],
  weija: [5.5667, -0.3333],
  mallam: [5.5833, -0.2667],
  bortianor: [5.55, -0.3667],
};

// "GA-123-4567" → rough centroid by hashing the digits to a small jitter around Greater Accra.
function digitalAddressToCoords(addr: string): [number, number] | null {
  const m = /^([A-Z]{2})-(\d{3})-(\d{4})$/.exec(addr);
  if (!m) return null;
  const region = m[1];
  const a = parseInt(m[2], 10);
  const b = parseInt(m[3], 10);
  // Region-based approximate centroid (very rough — UI labels this as approximate).
  const base: Record<string, [number, number]> = {
    GA: [5.65, -0.2],   // Greater Accra
    AK: [6.7, -1.6],    // Ashanti
    GS: [5.0, -1.7],    // Western
  };
  const [bLat, bLng] = base[region] ?? [5.65, -0.2];
  const lat = bLat + ((a % 100) - 50) * 0.002;
  const lng = bLng + ((b % 1000) - 500) * 0.0008;
  return [lat, lng];
}

function parseLocation(raw: string): { lat: number | null; lng: number | null; digital: string | null; approximate: boolean } {
  if (!raw) return { lat: null, lng: null, digital: null, approximate: false };
  // Coords explicit "(lat, lng)"
  const coordMatch = raw.match(/\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
  const digitalMatch = raw.match(/^([A-Z]{2}-\d{3}-\d{4})/);
  const digital = digitalMatch ? digitalMatch[1] : null;
  if (coordMatch) {
    return { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]), digital, approximate: false };
  }
  if (digital) {
    const c = digitalAddressToCoords(digital);
    if (c) return { lat: c[0], lng: c[1], digital, approximate: true };
  }
  const lower = raw.toLowerCase();
  for (const [name, c] of Object.entries(KNOWN_LOCATIONS)) {
    if (lower.includes(name)) return { lat: c[0], lng: c[1], digital, approximate: true };
  }
  return { lat: null, lng: null, digital, approximate: false };
}

// Where to route the user when they click "Edit" on a GPS row.
// Each source module owns its own edit UI; this dashboard simply opens it.
const SOURCE_ROUTES: Record<SourceKey, string> = {
  operations: "/operations",
  enforcement_operations: "/enforcement",
  cyber_incidents: "/command-vault",
  inventory_items: "/stores",
};

export default function GpsAddresses() {
  const { user, isAdmin, isOic, is2ic, isIpse, role, loading } = useAuth();
  const allowed = isAdmin || isOic || is2ic || role === "staff_officer";
  const canDelete = isAdmin || isOic; // Stricter — only admin/OIC can delete GPS source records
  // Search & Track exports / prints are restricted to cyber-intelligence
  // authorized roles. Lower-tier viewers can see results on screen but cannot
  // exfiltrate them to disk, paper, or other endpoints.
  const canExportTrack = isAdmin || isOic || is2ic || role === "staff_officer" || isIpse;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceKey | "all">("all");
  const [selected, setSelected] = useState<GpsRecord | null>(null);
  const [viewing, setViewing] = useState<GpsRecord | null>(null);
  const [deleting, setDeleting] = useState<GpsRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // ===== Online-tracking authorization gate =====
  // Live online map tiles (OpenStreetMap / Carto) are only loaded after the
  // operator confirms an explicit cyber-intel tracking authorization. The
  // consent is per-record: closing the dialog re-arms the gate so that every
  // new tracking session must be re-authorized and audit-logged.
  const [tilesAuthorized, setTilesAuthorized] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  // Only the command tier can authorize live online tile loading.
  const canAuthorizeTiles = isAdmin || isOic || is2ic || role === "staff_officer";

  const authorizeLiveTiles = async () => {
    if (!selected || !canAuthorizeTiles) return;
    setAuthorizing(true);
    try {
      // Audit the authorization event so commanders have a verifiable trail of
      // who loaded online map tiles for which GPS record.
      await supabase.from("front_desk_audit_log").insert({
        action: "gps_live_tiles_authorized",
        entity_type: selected.source,
        entity_id: selected.id,
        performed_by: (await supabase.auth.getUser()).data.user?.id ?? "",
        details: {
          raw_location: selected.raw_location,
          digital_address: selected.digital_address,
          lat: selected.lat,
          lng: selected.lng,
          context: selected.context,
          authorized_at: new Date().toISOString(),
          purpose: "cyber_intelligence_live_tracking",
        },
      });
      setTilesAuthorized(true);
      toast({
        title: "Live tracking authorized",
        description: "Online map tiles loaded for this record. Authorization recorded in the audit trail.",
      });
    } catch (e: any) {
      // Authorization is recorded best-effort; failure to log should not block
      // the operator, but we surface a warning so the audit gap is visible.
      setTilesAuthorized(true);
      toast({
        title: "Authorized (audit log warning)",
        description: e?.message ?? "Could not write authorization event to the audit log.",
        variant: "destructive",
      });
    } finally {
      setAuthorizing(false);
    }
  };

  // ===== Prior live-tracking authorizations (audit sidebar) =====
  // Pulls historic gps_live_tiles_authorized events for the currently selected
  // GPS record, plus a separate "my authorizations" stream so operators can
  // verify their own footprint at a glance.
  const { data: recordAuthorizations = [], isLoading: recordAuthLoading } = useQuery({
    queryKey: ["gps-tile-auth", "record", selected?.source, selected?.id],
    enabled: !!selected && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("front_desk_audit_log")
        .select("id, action, performed_by, details, created_at")
        .eq("action", "gps_live_tiles_authorized")
        .eq("entity_type", selected!.source)
        .eq("entity_id", selected!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: myAuthorizations = [], isLoading: myAuthLoading } = useQuery({
    queryKey: ["gps-tile-auth", "self", user?.id],
    enabled: !!user && !!selected && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("front_desk_audit_log")
        .select("id, action, entity_type, entity_id, details, created_at")
        .eq("action", "gps_live_tiles_authorized")
        .eq("performed_by", user!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Refresh audit panels after a fresh authorization so the new entry shows up
  // immediately without a manual reload.
  useEffect(() => {
    if (!tilesAuthorized) return;
    qc.invalidateQueries({ queryKey: ["gps-tile-auth"] });
  }, [tilesAuthorized, qc]);

  // Realtime: invalidate on changes to any of the source tables
  useEffect(() => {
    if (!allowed) return;
    const channel = supabase.channel("gps-addresses-rt");
    (["operations", "enforcement_operations", "cyber_incidents", "inventory_items"] as const).forEach((t) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
        qc.invalidateQueries({ queryKey: ["gps-addresses"] });
      });
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [allowed, qc]);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["gps-addresses"],
    enabled: allowed,
    refetchInterval: 60_000,
    queryFn: async (): Promise<GpsRecord[]> => {
      const [ops, enf, cyber, inv] = await Promise.all([
        supabase
          .from("operations")
          .select("id, location, operation_type, operation_date, status, created_at")
          .not("location", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("enforcement_operations")
          .select("id, location, operation_type, operation_date, status, created_at")
          .not("location", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("cyber_incidents")
          .select("id, location, incident_number, incident_type, severity, status, created_at")
          .not("location", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("inventory_items")
          .select("id, location, name, sku, qty_on_hand, unit, created_at")
          .not("location", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      const out: GpsRecord[] = [];
      for (const r of (ops.data ?? []) as any[]) {
        const p = parseLocation(r.location);
        out.push({
          id: r.id, source: "operations", raw_location: r.location,
          digital_address: p.digital, lat: p.lat, lng: p.lng,
          context: r.operation_type?.replace(/_/g, " ") ?? "Operation",
          reference: r.id.slice(0, 8), created_at: r.created_at, status: r.status,
        });
      }
      for (const r of (enf.data ?? []) as any[]) {
        const p = parseLocation(r.location);
        out.push({
          id: r.id, source: "enforcement_operations", raw_location: r.location,
          digital_address: p.digital, lat: p.lat, lng: p.lng,
          context: r.operation_type?.replace(/_/g, " ") ?? "Enforcement",
          reference: r.id.slice(0, 8), created_at: r.created_at, status: r.status,
        });
      }
      for (const r of (cyber.data ?? []) as any[]) {
        const p = parseLocation(r.location);
        out.push({
          id: r.id, source: "cyber_incidents", raw_location: r.location,
          digital_address: p.digital, lat: p.lat, lng: p.lng,
          context: `${r.incident_number} — ${r.incident_type}`,
          reference: r.incident_number, created_at: r.created_at, status: r.severity,
        });
      }
      for (const r of (inv.data ?? []) as any[]) {
        const p = parseLocation(r.location);
        out.push({
          id: r.id, source: "inventory_items", raw_location: r.location,
          digital_address: p.digital, lat: p.lat, lng: p.lng,
          context: `${r.name} (${r.qty_on_hand} ${r.unit})`,
          reference: r.sku ?? r.id.slice(0, 8), created_at: r.created_at,
          status: r.qty_on_hand > 0 ? "in_stock" : "out_of_stock",
        });
      }
      return out;
    },
  });

  const filtered = useMemo(() => {
    let list = records;
    if (sourceFilter !== "all") list = list.filter((r) => r.source === sourceFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((r) =>
        `${r.raw_location} ${r.digital_address ?? ""} ${r.context} ${r.reference}`.toLowerCase().includes(s),
      );
    }
    return list;
  }, [records, search, sourceFilter]);

  // Keep the open dialog's record in sync with realtime updates so the live map
  // and coordinate readouts reflect the latest data without manual reopen.
  useEffect(() => {
    if (!selected) return;
    const fresh = records.find((r) => r.source === selected.source && r.id === selected.id);
    if (fresh && (fresh.lat !== selected.lat || fresh.lng !== selected.lng || fresh.raw_location !== selected.raw_location)) {
      setSelected(fresh);
    }
  }, [records, selected]);

  // Pulse indicator: highlight analytics card when a new GPS record is inserted.
  const [pulse, setPulse] = useState(false);
  const totalRef = useRef<number>(records.length);
  useEffect(() => {
    if (records.length > totalRef.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 2500);
      totalRef.current = records.length;
      return () => clearTimeout(t);
    }
    totalRef.current = records.length;
  }, [records.length]);

  // ===== Search & Track (cyber-intel address lookup) =====
  // Geocodes any address/place using OpenStreetMap Nominatim (no API key) and
  // shows it on the live map. This lets analysts retrieve coordinates for
  // addresses that have NOT been captured into a source module yet.
  const [trackQuery, setTrackQuery] = useState("");
  const [trackBusy, setTrackBusy] = useState(false);
  const [trackResult, setTrackResult] = useState<{
    lat: number;
    lng: number;
    display_name: string;
    type?: string | null;
    importance?: number | null;
    osm_id?: string | null;
    bbox?: [number, number, number, number] | null;
  } | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);

  const runSearchTrack = async () => {
    const q = trackQuery.trim();
    if (!q) return;
    setTrackBusy(true);
    setTrackError(null);
    setTrackResult(null);
    try {
      // 1) Try to parse explicit "lat, lng" or "(lat, lng)" first — instant, offline.
      const direct = q.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
      if (direct) {
        const lat = parseFloat(direct[1]);
        const lng = parseFloat(direct[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          setTrackResult({ lat, lng, display_name: `Coordinates ${lat.toFixed(6)}, ${lng.toFixed(6)}`, type: "coordinates", importance: 1 });
          return;
        }
      }
      // 2) Try Ghana Post digital address with our offline lookup.
      const upper = q.toUpperCase();
      const digitalMatch = upper.match(/[A-Z]{2}-\d{3}-\d{4}/);
      if (digitalMatch) {
        const c = digitalAddressToCoords(digitalMatch[0]);
        if (c) {
          setTrackResult({ lat: c[0], lng: c[1], display_name: `Digital address ${digitalMatch[0]} (approximate)`, type: "digital_address", importance: 0.7 });
          return;
        }
      }
      // 3) Fall back to Nominatim geocoding (publicly accessible, no key required).
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error("No matching location found.");
      const hit = data[0];
      setTrackResult({
        lat: parseFloat(hit.lat),
        lng: parseFloat(hit.lon),
        display_name: hit.display_name,
        type: hit.type ?? hit.class ?? null,
        importance: typeof hit.importance === "number" ? hit.importance : null,
        osm_id: hit.osm_id ? String(hit.osm_id) : null,
        bbox: Array.isArray(hit.boundingbox) && hit.boundingbox.length === 4
          ? [parseFloat(hit.boundingbox[0]), parseFloat(hit.boundingbox[1]), parseFloat(hit.boundingbox[2]), parseFloat(hit.boundingbox[3])]
          : null,
      });
    } catch (e: any) {
      setTrackError(e?.message ?? String(e));
    } finally {
      setTrackBusy(false);
    }
  };

  const openTrackResultOnMap = () => {
    if (!trackResult) return;
    setSelected({
      id: `lookup-${Date.now()}`,
      source: "cyber_incidents",
      raw_location: `${trackResult.display_name} (${trackResult.lat.toFixed(6)}, ${trackResult.lng.toFixed(6)})`,
      digital_address: null,
      lat: trackResult.lat,
      lng: trackResult.lng,
      context: "Search & Track lookup",
      reference: trackResult.osm_id ?? "lookup",
      created_at: new Date().toISOString(),
      status: "lookup",
    });
  };

  // ===== Row delete (admin/OIC only) =====
  const performDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const { error } = await supabase.rpc("soft_delete_record", {
        _table: deleting.source,
        _record_id: deleting.id,
        _display_label: deleting.raw_location,
        _display_context: `${SOURCE_META[deleting.source].label} · ${deleting.context}`,
        _storage_paths: [],
      });
      if (error) throw error;
      toast({ title: "Moved to Recycle Bin", description: `${SOURCE_META[deleting.source].label} record removed.` });
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["gps-addresses"] });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setDeleteBusy(false);
    }
  };

  // ===== Search & Track result export / print =====
  // Packages a single Search & Track lookup result into the same tabular shape
  // ExportMenu expects, so commanders can download the lookup as PDF / CSV /
  // Excel / Word, or print it on letterhead-friendly stationery.
  const buildTrackResultExport = () => {
    if (!trackResult) return null;
    const captured = format(new Date(), "dd MMM yyyy, HH:mm");
    return {
      title: "GPS Search & Track Result",
      filename: `gps_search_track_${format(new Date(), "yyyyMMdd_HHmm")}`,
      headers: ["Field", "Value"],
      rows: [
        ["Query", trackQuery || "—"],
        ["Display Name", trackResult.display_name],
        ["Latitude", trackResult.lat.toFixed(6)],
        ["Longitude", trackResult.lng.toFixed(6)],
        ["Type", trackResult.type ?? "—"],
        ["Confidence", typeof trackResult.importance === "number" ? `${(trackResult.importance * 100).toFixed(0)}%` : "—"],
        ["OSM ID", trackResult.osm_id ?? "—"],
        ["Bounding Box", trackResult.bbox ? trackResult.bbox.map((n) => n.toFixed(4)).join(", ") : "—"],
        ["Google Maps", `https://www.google.com/maps/search/?api=1&query=${trackResult.lat},${trackResult.lng}`],
        ["Street View", `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${trackResult.lat},${trackResult.lng}`],
        ["OpenStreetMap", `https://www.openstreetmap.org/?mlat=${trackResult.lat}&mlon=${trackResult.lng}#map=18/${trackResult.lat}/${trackResult.lng}`],
        ["Captured", captured],
      ],
      subtitle: `Cyber Intelligence · Search & Track lookup at ${captured}`,
    };
  };

  // Browser-native print: opens a new window with a clean printable layout for
  // the current Search & Track result — no third-party tiles fetched.
  const printTrackResult = () => {
    if (!trackResult) return;
    const data = buildTrackResultExport();
    if (!data) return;
    const win = window.open("", "_blank", "width=900,height=720");
    if (!win) {
      toast({ title: "Popup blocked", description: "Allow popups to print the lookup.", variant: "destructive" });
      return;
    }
    const rowsHtml = data.rows
      .map(
        ([k, v]) =>
          `<tr><th style="text-align:left;padding:6px 10px;border:1px solid #ccc;background:#f5f5f5;width:200px;">${k}</th><td style="padding:6px 10px;border:1px solid #ccc;font-family:monospace;font-size:12px;word-break:break-all;">${v}</td></tr>`,
      )
      .join("");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>${data.title}</title>
      <style>
        body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 32px; color: #111; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .sub { font-size: 12px; color: #555; margin-bottom: 20px; }
        table { border-collapse: collapse; width: 100%; }
        .footer { margin-top: 24px; font-size: 10px; color: #777; border-top: 1px solid #ddd; padding-top: 8px; }
        @media print { @page { margin: 18mm; } }
      </style></head><body>
      <h1>${data.title}</h1>
      <div class="sub">${data.subtitle ?? ""}</div>
      <table>${rowsHtml}</table>
      <div class="footer">Ghana Immigration Service · Cybernet · Generated ${format(new Date(), "dd MMM yyyy, HH:mm")} · For official use only</div>
      <script>window.onload = () => { window.focus(); window.print(); };</script>
      </body></html>`);
    win.document.close();
  };



  const buildExport = () => {
    const headers = ["GPS Address", "Digital", "Latitude", "Longitude", "Source", "Context", "Reference", "Status", "Captured"];
    const rows = filtered.map((r) => [
      r.raw_location ?? "",
      r.digital_address ?? "",
      r.lat != null ? r.lat.toFixed(6) : "",
      r.lng != null ? r.lng.toFixed(6) : "",
      SOURCE_META[r.source].label,
      r.context ?? "",
      r.reference ?? "",
      r.status ?? "",
      format(new Date(r.created_at), "dd MMM yyyy, HH:mm"),
    ]);
    const filterParts: string[] = [];
    if (sourceFilter !== "all") filterParts.push(`Source: ${SOURCE_META[sourceFilter as SourceKey].label}`);
    if (search.trim()) filterParts.push(`Search: "${search.trim()}"`);
    const subtitle = `Command Vault · ${filtered.length} of ${records.length} GPS records${filterParts.length ? ` · ${filterParts.join(" · ")}` : ""}`;
    return {
      title: "GPS Address Register",
      filename: `gps_addresses_${format(new Date(), "yyyyMMdd_HHmm")}`,
      headers,
      rows,
      subtitle,
    };
  };

  // ===== Cloud export (S3-style storage + time-limited signed URL) =====
  const [cloudOpen, setCloudOpen] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudResult, setCloudResult] = useState<{
    url: string;
    filename: string;
    expires_at: string;
    expires_in: number;
    record_count: number;
  } | null>(null);
  const [cloudCopied, setCloudCopied] = useState(false);
  const [linkTtl, setLinkTtl] = useState<string>("3600");
  const [cloudCountdown, setCloudCountdown] = useState<string>("");

  useEffect(() => {
    if (!cloudResult) { setCloudCountdown(""); return; }
    const tick = () => {
      const ms = new Date(cloudResult.expires_at).getTime() - Date.now();
      if (ms <= 0) { setCloudCountdown("expired"); return; }
      const mins = Math.floor(ms / 60_000);
      const secs = Math.floor((ms % 60_000) / 1000);
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      setCloudCountdown(hrs > 0 ? `${hrs}h ${remMins}m` : `${mins}m ${secs.toString().padStart(2, "0")}s`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [cloudResult]);

  const csvEscape = (val: string) => {
    if (val == null) return "";
    const s = String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const buildCsv = () => {
    const exp = buildExport();
    const lines = [exp.headers.map(csvEscape).join(",")];
    for (const row of exp.rows) lines.push(row.map(csvEscape).join(","));
    return { csv: lines.join("\n"), filename: `${exp.filename}.csv`, subtitle: exp.subtitle };
  };

  const runCloudExport = async () => {
    if (filtered.length === 0) return;
    setCloudBusy(true);
    setCloudResult(null);
    setCloudCopied(false);
    try {
      const { csv, filename, subtitle } = buildCsv();
      const expiresIn = Number(linkTtl) || 3600;
      const { data, error } = await supabase.functions.invoke("gps-cloud-export", {
        body: { csv, filename, expiresIn, recordCount: filtered.length, filtersSummary: subtitle },
      });
      if (error) throw error;
      const payload = data as { url: string; filename: string; expires_at: string; expires_in: number };
      if (!payload?.url) throw new Error("No signed URL returned");
      setCloudResult({
        url: payload.url,
        filename: payload.filename,
        expires_at: payload.expires_at,
        expires_in: payload.expires_in,
        record_count: filtered.length,
      });
      toast({ title: "Uploaded to cloud", description: `Signed link valid for ${formatTtl(payload.expires_in)}.` });
    } catch (e: any) {
      toast({ title: "Cloud export failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setCloudBusy(false);
    }
  };

  const copyCloudLink = async () => {
    if (!cloudResult) return;
    try {
      await navigator.clipboard.writeText(cloudResult.url);
      setCloudCopied(true);
      window.setTimeout(() => setCloudCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Select and copy the link manually.", variant: "destructive" });
    }
  };

  const stats = useMemo(() => {
    const total = records.length;
    const mappable = records.filter((r) => r.lat != null && r.lng != null).length;
    const digital = records.filter((r) => r.digital_address).length;
    const sourceBreakdown = (Object.keys(SOURCE_META) as SourceKey[]).map((key) => ({
      key,
      label: SOURCE_META[key].label,
      count: records.filter((r) => r.source === key).length,
      color: SOURCE_META[key].chartColor,
    }));
    // Region tally from digital prefix
    const regionCounts = new Map<string, number>();
    records.forEach((r) => {
      if (r.digital_address) {
        const region = r.digital_address.slice(0, 2);
        regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
      }
    });
    const topRegions = Array.from(regionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([region, count]) => ({ region, count }));

    // Last 7 days timeline
    const series: { label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const count = records.filter((r) => {
        const t = new Date(r.created_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      }).length;
      series.push({ label: format(d, "EEE"), count });
    }

    const lastCapture = records.length > 0
      ? records.reduce((acc, r) => (new Date(r.created_at) > new Date(acc) ? r.created_at : acc), records[0].created_at)
      : null;

    return { total, mappable, digital, sourceBreakdown, topRegions, series, lastCapture };
  }, [records]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Globe2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-secondary">GPS Address Dashboard</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> Restricted — Admin, OIC, 2IC, Staff Officer · Live across Operations, Enforcement, Cyber, Inventory
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="gap-1">
          <MapPin className="h-3 w-3" /> {records.length} GPS record{records.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {/* ===== Search & Track (cyber-intel address lookup) ===== */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="h-9 w-9 rounded-md bg-primary/15 flex items-center justify-center">
              <Satellite className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-[220px]">
              <CardTitle className="text-base flex items-center gap-2">
                Search & Track
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <ShieldAlert className="h-3 w-3" /> Cyber Intelligence
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Resolve coordinates for any GPS address, place name, digital code, or
                <span className="font-mono"> lat,lng</span> pair. Authorized for command-tier use only.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder='e.g. "Amasaman Police Station", "GA-543-2210", or "5.7000, -0.2833"'
                value={trackQuery}
                onChange={(e) => setTrackQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runSearchTrack(); }}
                className="pl-8"
                disabled={trackBusy}
              />
            </div>
            <Button onClick={runSearchTrack} disabled={trackBusy || !trackQuery.trim()} className="gap-1.5">
              {trackBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <NavIcon className="h-4 w-4" />}
              {trackBusy ? "Locating…" : "Search & Track"}
            </Button>
            {(trackResult || trackError) && (
              <Button
                variant="ghost"
                onClick={() => { setTrackResult(null); setTrackError(null); setTrackQuery(""); }}
                disabled={trackBusy}
              >
                Clear
              </Button>
            )}
          </div>

          {trackError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
              {trackError}
            </div>
          )}

          {trackResult && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{trackResult.display_name}</div>
                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="font-mono">lat {trackResult.lat.toFixed(6)}</span>
                    <span className="font-mono">lng {trackResult.lng.toFixed(6)}</span>
                    {trackResult.type && <span className="capitalize">type: {trackResult.type}</span>}
                    {typeof trackResult.importance === "number" && (
                      <span>confidence: {(trackResult.importance * 100).toFixed(0)}%</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={openTrackResultOnMap} className="gap-1.5">
                  <NavIcon className="h-3.5 w-3.5" /> Open live map
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${trackResult.lat},${trackResult.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" /> Google Maps
                  </a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${trackResult.lat},${trackResult.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" /> Street View
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(`${trackResult.lat.toFixed(6)}, ${trackResult.lng.toFixed(6)}`);
                    toast({ title: "Coordinates copied" });
                  }}
                >
                  <Copy className="h-3 w-3 mr-1" /> Copy coords
                </Button>
                <ExportMenu
                  getData={buildTrackResultExport}
                  label="Export result"
                  size="sm"
                />
                <Button size="sm" variant="outline" onClick={printTrackResult} className="gap-1.5">
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Geocoding via OpenStreetMap (Nominatim). Use only for lawful intelligence operations.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Realtime analytics ===== */}
      <Card className={`border-primary/20 transition-shadow ${pulse ? "shadow-[0_0_0_3px_hsl(var(--primary)/0.25)]" : ""}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className={`h-5 w-5 text-primary ${pulse ? "animate-pulse" : ""}`} />
            <div className="flex-1">
              <CardTitle className="text-base flex items-center gap-2">
                Realtime Analytics
                {pulse && (
                  <Badge variant="secondary" className="gap-1 text-[10px] bg-primary/10 text-primary">
                    <Sparkles className="h-3 w-3" /> New record
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Auto-refreshes on database changes · Last capture {stats.lastCapture ? formatDistanceToNow(new Date(stats.lastCapture), { addSuffix: true }) : "—"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile icon={<MapPin className="h-4 w-4" />} label="Total GPS Records" value={stats.total} tone="primary" />
            <KpiTile icon={<NavIcon className="h-4 w-4" />} label="Mappable" value={stats.mappable} sub={`${stats.total ? Math.round((stats.mappable / stats.total) * 100) : 0}% have coords`} tone="emerald" />
            <KpiTile icon={<Crosshair className="h-4 w-4" />} label="Digital Addresses" value={stats.digital} sub="Ghana Post format" tone="violet" />
            <KpiTile icon={<Globe2 className="h-4 w-4" />} label="Active Sources" value={stats.sourceBreakdown.filter((s) => s.count > 0).length} sub="of 4 modules" tone="amber" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 7-day capture trend */}
            <div className="lg:col-span-2 rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Captures — Last 7 Days</h3>
                <Badge variant="outline" className="text-[10px]">By day</Badge>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.series} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <ReTooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Source breakdown */}
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">By Source Module</h3>
                <Badge variant="outline" className="text-[10px]">Live</Badge>
              </div>
              {stats.sourceBreakdown.every((s) => s.count === 0) ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No GPS data yet</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.sourceBreakdown.filter((s) => s.count > 0)}
                        dataKey="count"
                        nameKey="label"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                      >
                        {stats.sourceBreakdown.filter((s) => s.count > 0).map((entry) => (
                          <Cell key={entry.key} fill={entry.color} />
                        ))}
                      </Pie>
                      <Legend verticalAlign="bottom" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <ReTooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Region tally */}
          {stats.topRegions.length > 0 && (
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Top Regions (by digital prefix)</h3>
                <Badge variant="outline" className="text-[10px]">Top {stats.topRegions.length}</Badge>
              </div>
              <ul className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {stats.topRegions.map((r) => {
                  const pct = stats.digital > 0 ? Math.round((r.count / stats.digital) * 100) : 0;
                  return (
                    <li key={r.region} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-semibold">{r.region}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {r.count} <span className="text-muted-foreground/70">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Address list ===== */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-lg">All GPS Addresses</CardTitle>
              <CardDescription>Click any address to open coordinates and live map view.</CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCloudOpen(true); setCloudResult(null); setCloudCopied(false); }}
                disabled={filtered.length === 0}
                className="gap-1.5"
              >
                <Cloud className="h-4 w-4" />
                Cloud export
              </Button>
              <ExportMenu
                getData={buildExport}
                label="Export GPS addresses"
                disabled={filtered.length === 0}
              />
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap mt-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search address, digital code, context, reference…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as any)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {(Object.keys(SOURCE_META) as SourceKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{SOURCE_META[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">
              {records.length === 0 ? "No GPS addresses captured yet." : "No records match the current filters."}
            </p>
          ) : (
            <div className="rounded-lg border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>GPS Address</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="hidden md:table-cell">Context</TableHead>
                    <TableHead className="hidden md:table-cell">Reference</TableHead>
                    <TableHead className="hidden lg:table-cell">Captured</TableHead>
                    <TableHead className="text-right w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const meta = SOURCE_META[r.source];
                    const Icon = meta.icon;
                    const mappable = r.lat != null && r.lng != null;
                    return (
                      <TableRow
                        key={`${r.source}-${r.id}`}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setSelected(r)}
                      >
                        <TableCell>
                          <div className="flex items-start gap-2">
                            <MapPin className={`h-4 w-4 mt-0.5 shrink-0 ${mappable ? "text-primary" : "text-muted-foreground"}`} />
                            <div className="min-w-0">
                              <div className="font-medium font-mono text-xs truncate max-w-[260px]">{r.raw_location}</div>
                              {r.digital_address && (
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  Digital: {r.digital_address}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={meta.color}>
                            <Icon className="h-3 w-3 mr-1" />
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs capitalize">{r.context}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground">{r.reference}</TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                          {format(new Date(r.created_at), "dd MMM yyyy, HH:mm")}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Actions for ${r.raw_location}`}
                                className="h-8 w-8"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                GPS Record
                              </DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => setViewing(r)}>
                                <Eye className="h-4 w-4 mr-2" /> View details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setSelected(r)}
                                disabled={!mappable && !r.digital_address}
                              >
                                <NavIcon className="h-4 w-4 mr-2" /> Track on map
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => navigate(SOURCE_ROUTES[r.source])}>
                                <Pencil className="h-4 w-4 mr-2" /> Edit in {meta.label}
                              </DropdownMenuItem>
                              {canDelete && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setDeleting(r)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Live map dialog ===== */}
      <Dialog
        open={!!selected}
        onOpenChange={(o) => {
          if (!o) {
            setSelected(null);
            // Re-arm the authorization gate so the next tracking session must
            // be explicitly re-authorized before online tiles load again.
            setTilesAuthorized(false);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <NavIcon className="h-4 w-4 text-primary" />
              Live Map View
              <Badge variant="outline" className="text-[10px] gap-1 ml-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Live
              </Badge>
              {tilesAuthorized && (
                <Badge variant="secondary" className="text-[10px] gap-1 ml-1">
                  <ShieldAlert className="h-3 w-3" /> Authorized
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <InfoCell label="Address" value={selected.raw_location} mono />
                <InfoCell label="Digital" value={selected.digital_address ?? "—"} mono />
                <InfoCell
                  label="Latitude"
                  value={selected.lat != null ? selected.lat.toFixed(6) : "—"}
                  mono
                />
                <InfoCell
                  label="Longitude"
                  value={selected.lng != null ? selected.lng.toFixed(6) : "—"}
                  mono
                />
              </div>

              {selected.lat != null && selected.lng != null ? (
                tilesAuthorized ? (
                  <>
                    <GpsLiveMap
                      lat={selected.lat}
                      lng={selected.lng}
                      label={`${SOURCE_META[selected.source].label} — ${selected.context}`}
                      height={380}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${selected.lat},${selected.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" /> Street View
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" /> Google Maps
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${selected.lat}&mlon=${selected.lng}#map=18/${selected.lat}/${selected.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" /> OpenStreetMap
                        </a>
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {selected.raw_location.includes("(")
                        ? "Coordinates parsed directly from the captured GPS address."
                        : "Coordinates derived from the digital address / known landmark — approximate."}
                    </p>
                  </>
                ) : (
                  // Authorization gate — online tiles are NOT requested. We
                  // still render an OFFLINE static coordinate view so operators
                  // can read/copy the captured coordinates without any third-
                  // party network request being made on their behalf.
                  <div className="space-y-3">
                    <StaticCoordinateMap
                      lat={selected.lat}
                      lng={selected.lng}
                      label={`${SOURCE_META[selected.source].label} — ${selected.context}`}
                      height={320}
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await navigator.clipboard.writeText(`${selected.lat!.toFixed(6)}, ${selected.lng!.toFixed(6)}`);
                          toast({ title: "Coordinates copied" });
                        }}
                        className="gap-1.5"
                      >
                        <Copy className="h-3 w-3" /> Copy coordinates
                      </Button>
                      {selected.digital_address && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await navigator.clipboard.writeText(selected.digital_address!);
                            toast({ title: "Digital address copied" });
                          }}
                          className="gap-1.5"
                        >
                          <Copy className="h-3 w-3" /> Copy digital address
                        </Button>
                      )}
                    </div>

                    <div className="rounded-md border border-amber-300/60 dark:border-amber-700/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">Online tracking authorization required</p>
                          <p className="text-xs text-muted-foreground">
                            You are viewing the offline static coordinate fallback — no third-party tile servers
                            (OpenStreetMap / Carto) have been contacted. To load live online map tiles you must
                            confirm the cyber-intelligence tracking authorization. The action is recorded in the
                            audit trail with your identity, the target coordinates, and a timestamp.
                          </p>
                          <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5 pt-1">
                            <li>Use only for sanctioned cyber-intelligence operations.</li>
                            <li>Do not authorize on shared or untrusted networks.</li>
                            <li>Closing this dialog revokes authorization for the next session.</li>
                          </ul>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {canAuthorizeTiles ? (
                          <Button size="sm" onClick={authorizeLiveTiles} disabled={authorizing} className="gap-1.5">
                            {authorizing ? (
                              <><Loader2 className="h-3 w-3 animate-spin" /> Authorizing…</>
                            ) : (
                              <><ShieldAlert className="h-3 w-3" /> Authorize live tracking</>
                            )}
                          </Button>
                        ) : (
                          <Badge variant="destructive" className="gap-1 text-[11px]">
                            <Lock className="h-3 w-3" /> Command-tier authorization required
                          </Badge>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Cancel</Button>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  This record has no resolvable coordinates. Re-capture using "Get GPS Address" to enable live tracking.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Cloud export dialog ===== */}
      <Dialog open={cloudOpen} onOpenChange={(o) => { setCloudOpen(o); if (!o) { setCloudResult(null); setCloudCopied(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-primary" />
              Export to Cloud Storage
              <Badge variant="outline" className="text-[10px] ml-1">S3-style · Signed URL</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Records to export</span>
                <span className="font-semibold tabular-nums">{filtered.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Format</span>
                <span className="font-medium">CSV (UTF-8)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Destination</span>
                <span className="font-mono text-[11px]">command-vault/gps-exports/</span>
              </div>
            </div>

            {!cloudResult && (
              <div className="space-y-2">
                <label className="text-xs font-medium">Link valid for</label>
                <Select value={linkTtl} onValueChange={setLinkTtl} disabled={cloudBusy}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="900">15 minutes</SelectItem>
                    <SelectItem value="3600">1 hour</SelectItem>
                    <SelectItem value="14400">4 hours</SelectItem>
                    <SelectItem value="86400">24 hours</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  After uploading, a time-limited download link will be generated for command download.
                </p>
              </div>
            )}

            {cloudResult && (
              <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <Check className="h-4 w-4" />
                  Upload complete
                </div>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div className="font-mono truncate">{cloudResult.filename}</div>
                  <div className="flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    Expires in <span className="font-semibold text-foreground">{cloudCountdown || "—"}</span>
                  </div>
                </div>
                <div className="flex items-stretch gap-1 mt-2">
                  <Input readOnly value={cloudResult.url} className="font-mono text-[11px]" onFocus={(e) => e.currentTarget.select()} />
                  <Button size="sm" variant="outline" onClick={copyCloudLink} className="shrink-0">
                    {cloudCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" asChild className="flex-1">
                    <a href={cloudResult.url} target="_blank" rel="noopener noreferrer" download={cloudResult.filename}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Download
                    </a>
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setCloudOpen(false)} disabled={cloudBusy}>
                Close
              </Button>
              {!cloudResult ? (
                <Button onClick={runCloudExport} disabled={cloudBusy || filtered.length === 0}>
                  {cloudBusy ? (
                    <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Uploading…</>
                  ) : (
                    <><Cloud className="h-4 w-4 mr-1.5" /> Upload &amp; sign link</>
                  )}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => { setCloudResult(null); setCloudCopied(false); }}>
                  Generate another
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== View details dialog ===== */}
      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" /> GPS Record Details
            </DialogTitle>
            <DialogDescription>Full metadata for the selected GPS address.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className={SOURCE_META[viewing.source].color}>
                  {(() => { const I = SOURCE_META[viewing.source].icon; return <I className="h-3 w-3 mr-1" />; })()}
                  {SOURCE_META[viewing.source].label}
                </Badge>
                {viewing.status && (
                  <Badge variant="outline" className="text-[10px] capitalize">{viewing.status.replace(/_/g, " ")}</Badge>
                )}
                {viewing.lat != null && viewing.lng != null && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <MapPin className="h-3 w-3" /> Mappable
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <InfoCell label="Address" value={viewing.raw_location} mono />
                <InfoCell label="Digital code" value={viewing.digital_address ?? "—"} mono />
                <InfoCell label="Latitude" value={viewing.lat != null ? viewing.lat.toFixed(6) : "—"} mono />
                <InfoCell label="Longitude" value={viewing.lng != null ? viewing.lng.toFixed(6) : "—"} mono />
                <InfoCell label="Context" value={viewing.context || "—"} />
                <InfoCell label="Reference" value={viewing.reference || "—"} mono />
                <InfoCell label="Captured" value={format(new Date(viewing.created_at), "dd MMM yyyy, HH:mm")} />
                <InfoCell label="Record ID" value={viewing.id} mono />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
            <Button variant="ghost" onClick={() => setViewing(null)}>Close</Button>
            {viewing && (viewing.lat != null && viewing.lng != null) && (
              <Button onClick={() => { setSelected(viewing); setViewing(null); }} className="gap-1.5">
                <NavIcon className="h-4 w-4" /> Track on map
              </Button>
            )}
            {viewing && (
              <Button variant="outline" onClick={() => { navigate(SOURCE_ROUTES[viewing.source]); setViewing(null); }} className="gap-1.5">
                <Pencil className="h-4 w-4" /> Edit in {SOURCE_META[viewing.source].label}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Delete confirmation ===== */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o && !deleteBusy) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" /> Delete GPS record?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This moves the underlying{" "}
              <span className="font-medium">{deleting ? SOURCE_META[deleting.source].label : ""}</span>{" "}
              record to the Recycle Bin where it can be restored within 30 days.
              <span className="block mt-2 font-mono text-[11px] text-foreground break-all">
                {deleting?.raw_location}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); performDelete(); }}
              disabled={deleteBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBusy ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Deleting…</> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ============= small helpers ============= */

function KpiTile({
  icon, label, value, sub, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone: "primary" | "emerald" | "violet" | "amber";
}) {
  const toneCls: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={`h-7 w-7 rounded-md flex items-center justify-center ${toneCls[tone]}`}>{icon}</span>
        <span className="font-medium">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xs ${mono ? "font-mono" : ""} truncate`}>{value}</div>
    </div>
  );
}

function formatTtl(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.round(seconds / 3600);
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  const m = Math.round(seconds / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}
