/**
 * Biometric audit log.
 *
 * Read-only, immutable trail of every enrollment attempt and failure, each
 * compliance/grace status change, and every administrator policy update, with
 * timestamps, the staff member's user ID and the acting user ID. Restricted to
 * admin / OIC / 2IC through the `webauthn_audit_feed` RPC.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, RefreshCw, ScrollText } from "lucide-react";
import { formatDateTime } from "@/lib/date-format";
import { downloadBlob } from "@/lib/download-utils";
import { buildCsv } from "@/lib/csv-safe";

interface AuditRow {
  id: string;
  created_at: string;
  event: string;
  user_id: string | null;
  staff_name: string | null;
  staff_identifier: string | null;
  actor_id: string | null;
  actor_name: string | null;
  device_label: string | null;
  detail: string | null;
}

const EVENT_GROUPS: Record<string, { label: string; events: string[] }> = {
  all: { label: "All biometric events", events: [] },
  enrollment: {
    label: "Enrollment attempts & outcomes",
    events: ["enroll_attempt", "enroll_failure", "enroll", "revoke"],
  },
  status: { label: "Grace / compliance status changes", events: ["status_change"] },
  policy: { label: "Administrator policy updates", events: ["policy_change", "settings_change"] },
  signin: {
    label: "Sign-in & step-up verification",
    events: ["authenticate_success", "authenticate_failure", "stepup_success", "stepup_failure"],
  },
};

const EVENT_LABEL: Record<string, string> = {
  enroll: "Enrolled",
  enroll_attempt: "Enrollment attempt",
  enroll_failure: "Enrollment failed",
  revoke: "Passkey removed",
  status_change: "Status change",
  policy_change: "Policy update",
  settings_change: "Settings change",
  authenticate_success: "Sign-in success",
  authenticate_failure: "Sign-in failure",
  stepup_success: "Step-up success",
  stepup_failure: "Step-up failure",
};

const DANGER_EVENTS = new Set([
  "enroll_failure",
  "authenticate_failure",
  "stepup_failure",
  "revoke",
]);

const RANGE_DAYS: Record<string, number | null> = {
  "1": 1,
  "7": 7,
  "30": 30,
  all: null,
};

export function BiometricAuditLogCard() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [group, setGroup] = useState("all");
  const [range, setRange] = useState("30");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const days = RANGE_DAYS[range];
    const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
    const events = EVENT_GROUPS[group]?.events ?? [];
    const { data, error } = await supabase.rpc("webauthn_audit_feed", {
      _events: events.length ? events : null,
      _since: since,
      _limit: 1000,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Could not load audit log", description: error.message, variant: "destructive" });
      return;
    }
    setRows((data as unknown as AuditRow[]) ?? []);
  }, [group, range, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.staff_name, r.staff_identifier, r.actor_name, r.device_label, r.detail, r.event, r.user_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const exportCsv = useCallback(() => {
    const csv = buildCsv(
      ["Timestamp", "Event", "Staff", "Staff ID", "Staff user ID", "Actor", "Actor user ID", "Device", "Detail"],
      filtered.map((r) => [
        r.created_at,
        EVENT_LABEL[r.event] ?? r.event,
        r.staff_name ?? "",
        r.staff_identifier ?? "",
        r.user_id ?? "",
        r.actor_name ?? "",
        r.actor_id ?? "",
        r.device_label ?? "",
        r.detail ?? "",
      ]),
    );
    downloadBlob(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `biometric-audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }, [filtered]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          Biometric audit log
        </CardTitle>
        <CardDescription>
          Immutable record of enrollment attempts, grace/compliance status changes and administrator
          policy updates, with timestamps and user IDs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="bio-audit-group">Event type</Label>
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger id="bio-audit-group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EVENT_GROUPS).map(([key, g]) => (
                  <SelectItem key={key} value={key}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bio-audit-range">Period</Label>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger id="bio-audit-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24 hours</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bio-audit-search">Search</Label>
            <Input
              id="bio-audit-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Staff, device, detail…"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
        </p>

        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {loading ? "Loading…" : "No biometric audit entries for this filter."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={DANGER_EVENTS.has(r.event) ? "destructive" : "secondary"}>
                        {EVENT_LABEL[r.event] ?? r.event}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.staff_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.staff_identifier ?? r.user_id ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{r.actor_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.actor_id ?? "—"}</div>
                    </TableCell>
                    <TableCell>{r.device_label || "—"}</TableCell>
                    <TableCell className="max-w-[320px] text-sm">{r.detail || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
