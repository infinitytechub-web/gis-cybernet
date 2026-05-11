import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ShieldOff, Ban, Clock, ScrollText, Search, Cpu, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizeMac } from "@/lib/trusted-mac";
import { formatDistanceToNow, format } from "date-fns";
import { SecurityHero } from "@/components/security/SecurityHero";

export default function IpBlocks() {
  const { isAdmin, loading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [ip, setIp] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [mac, setMac] = useState("");
  const [duration, setDuration] = useState<number>(60);
  const [reason, setReason] = useState("Repeated failed login attempts");
  const [notes, setNotes] = useState("");

  // Search + filter for both block list and audit log.
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "mac" | "ip" | "fingerprint">("all");

  // Lightweight client-side check; server normalizes & validates definitively.
  const macLooksValid = (v: string) => {
    if (!v.trim()) return true;
    const hex = v.replace(/[^0-9a-fA-F]/g, "");
    return hex.length === 12;
  };

  // Build a haystack-aware match function. If the search term parses as a MAC,
  // compare on its normalized canonical form so "aa-bb-cc-..." matches
  // "AA:BB:CC:..." stored in the DB.
  const buildMatcher = (term: string) => {
    const t = term.trim().toLowerCase();
    if (!t) return () => true;
    const macForm = normalizeMac(term);
    return (row: any) => {
      const ip = (row.ip_address ?? "").toLowerCase();
      const fp = (row.device_fingerprint ?? "").toLowerCase();
      const mc = (row.mac_address ?? "").toLowerCase();
      const reason = (row.reason ?? "").toLowerCase();
      const notes = (row.notes ?? "").toLowerCase();
      const macHit = macForm ? mc === macForm.toLowerCase() : mc.includes(t);
      return ip.includes(t) || fp.includes(t) || macHit || reason.includes(t) || notes.includes(t);
    };
  };
  const matcher = buildMatcher(search);
  const scopeFilter = (row: any) => {
    if (scope === "mac") return !!row.mac_address;
    if (scope === "ip") return !!row.ip_address && !row.mac_address;
    if (scope === "fingerprint") return !!row.device_fingerprint && !row.mac_address;
    return true;
  };

  const { data: blocks = [], refetch } = useQuery({
    queryKey: ["ip_blocks"],
    enabled: isAdmin,
    refetchInterval: 30000,
    queryFn: async () => {
      // auto-expire on view
      await supabase.rpc("expire_ip_blocks");
      const { data, error } = await supabase
        .from("ip_blocks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: audit = [] } = useQuery({
    queryKey: ["ip_block_audit"],
    enabled: isAdmin,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ip_block_audit" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const blockMutation = useMutation({
    mutationFn: async () => {
      if (!ip.trim()) throw new Error("IP address is required");
      if (!macLooksValid(mac)) throw new Error("MAC address must be 12 hex characters (e.g. AA:BB:CC:DD:EE:FF)");
      const { error } = await supabase.rpc("block_ip", {
        _ip: ip.trim(),
        _fingerprint: fingerprint.trim() || null,
        _mac: mac.trim() || null,
        _duration_minutes: duration > 0 ? duration : null,
        _reason: reason || "Manual block",
        _notes: notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "IP blocked", description: ip });
      setIp(""); setFingerprint(""); setMac(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["ip_blocks"] });
      qc.invalidateQueries({ queryKey: ["ip_block_audit"] });
    },
    onError: (e: any) => toast({ title: "Block failed", description: e.message, variant: "destructive" }),
  });

  const unblockMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("unblock_ip", { _block_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Unblocked" });
      qc.invalidateQueries({ queryKey: ["ip_blocks"] });
      qc.invalidateQueries({ queryKey: ["ip_block_audit"] });
    },
    onError: (e: any) => toast({ title: "Unblock failed", description: e.message, variant: "destructive" }),
  });

  if (loading) return <div className="p-6">Loading…</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const isActive = (b: any) =>
    b.active && (!b.blocked_until || new Date(b.blocked_until) > new Date());

  return (
    <div className="container py-6 space-y-6">
      <SecurityHero icon={Ban} title="IP & Device Blocks" subtitle="Block, unblock and review IP/device access controls." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Block an IP / Device</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>IP Address *</Label>
            <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="e.g. 41.66.10.22" />
          </div>
          <div className="space-y-2">
            <Label>Device Fingerprint (optional)</Label>
            <Input value={fingerprint} onChange={(e) => setFingerprint(e.target.value)} placeholder="SHA-256 hash" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>MAC Address (optional)</Label>
            <Input
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              placeholder="e.g. AA:BB:CC:DD:EE:FF"
              className={!macLooksValid(mac) ? "border-destructive" : ""}
            />
            <p className="text-xs text-muted-foreground">
              Accepts colons, hyphens, dots, or no separator. Normalized to <code>AA:BB:CC:DD:EE:FF</code>.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Duration (minutes, 0 = permanent)</Label>
            <Input type="number" min={0} value={duration} onChange={(e) => setDuration(parseInt(e.target.value || "0", 10))} />
          </div>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Button onClick={() => blockMutation.mutate()} disabled={blockMutation.isPending || !ip.trim()}>
              <Ban className="h-4 w-4 mr-2" /> Block
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Block list ({blocks.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div style={{ minWidth: 700 }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>MAC</TableHead>
                <TableHead>Fingerprint</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Blocked</TableHead>
                <TableHead>Unblock at</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blocks.map((b: any) => {
                const active = isActive(b);
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      {active ? (
                        <Badge variant="destructive">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{b.ip_address}</TableCell>
                    <TableCell className="font-mono text-xs">{b.mac_address || "—"}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[140px] truncate" title={b.device_fingerprint || ""}>
                      {b.device_fingerprint || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{b.reason}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(b.blocked_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-xs">
                      {b.blocked_until ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(b.blocked_until).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Permanent</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {active && (
                        <Button size="sm" variant="outline" onClick={() => unblockMutation.mutate(b.id)}>
                          <ShieldOff className="h-4 w-4 mr-1" /> Unblock
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {blocks.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No blocks yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-amber-700" />
            Block / Unblock Audit Log
            <Badge variant="secondary" className="ml-1">{audit.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div style={{ minWidth: 700 }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>MAC</TableHead>
                  <TableHead>Fingerprint</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Expiry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(a.created_at), "dd MMM yyyy HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.action === "blocked" ? "destructive" : "secondary"} className="uppercase text-[10px]">
                        {a.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.performed_by_name ?? <span className="font-mono text-muted-foreground">{(a.performed_by ?? "—").slice(0, 8)}</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{a.ip_address ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{a.mac_address ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[140px] truncate" title={a.device_fingerprint || ""}>
                      {a.device_fingerprint || "—"}
                    </TableCell>
                    <TableCell className="text-xs">{a.reason ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {a.blocked_until
                        ? new Date(a.blocked_until).toLocaleString()
                        : a.duration_minutes === 0 || a.duration_minutes === null
                          ? <span className="text-muted-foreground">Permanent</span>
                          : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {audit.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No audit entries yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
