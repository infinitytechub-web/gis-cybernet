/**
 * Administrator control of the biometric enrollment drive.
 *
 * Combines the policy switches (required, grace period, which roles) with a
 * coverage report showing every staff account's enrollment state so the
 * command can chase the outstanding ones.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Fingerprint, RefreshCw, ShieldCheck } from "lucide-react";
import { formatDate } from "@/lib/date-format";
import { downloadBlob } from "@/lib/download-utils";
import { csvCell } from "@/lib/csv-safe";

interface ReportRow {
  user_id: string;
  full_name: string | null;
  staff_id: string | null;
  department: string | null;
  roles: string[] | null;
  required: boolean;
  device_count: number;
  first_enrolled_at: string | null;
  last_used_at: string | null;
  compliance: "enrolled" | "grace" | "overdue" | "not_required";
}

/** Roles that can be placed under the biometric requirement. */
const ROLE_OPTIONS: string[] = [
  "admin", "oic", "2ic", "staff_officer", "supervisor", "command_officer",
  "shift_supervisor", "shift_leader", "deputy_supervisor", "front_desk",
  "storekeeper", "procurement_officer", "medical_officer",
  "head_of_administration", "chief_staff_officer", "head_of_processing",
  "official", "enquiry", "special_duties", "staff",
];

const COMPLIANCE_LABEL: Record<ReportRow["compliance"], string> = {
  enrolled: "Enrolled",
  grace: "Within grace",
  overdue: "Overdue",
  not_required: "Not required",
};

export function BiometricEnrollmentPolicyCard() {
  const { toast } = useToast();
  const [required, setRequired] = useState(false);
  const [graceDays, setGraceDays] = useState(15);
  const [roles, setRoles] = useState<string[]>([]);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: settings }, { data: report, error }] = await Promise.all([
      supabase
        .from("app_settings")
        .select("biometric_enrollment_required, biometric_enrollment_grace_days, biometric_required_roles, biometric_enrollment_enforced_at")
        .limit(1)
        .maybeSingle(),
      supabase.rpc("webauthn_admin_enrollment_report"),
    ]);

    if (settings) {
      setRequired(Boolean(settings.biometric_enrollment_required));
      setGraceDays(Number(settings.biometric_enrollment_grace_days ?? 15));
      setRoles(((settings.biometric_required_roles as string[] | null) ?? []).map(String));
      const enforced = settings.biometric_enrollment_enforced_at as string | null;
      setDeadline(
        enforced
          ? new Date(
              new Date(enforced).getTime() +
                Number(settings.biometric_enrollment_grace_days ?? 15) * 86_400_000,
            ).toISOString()
          : null,
      );
    }
    if (error) {
      toast({ title: "Could not load coverage", description: error.message, variant: "destructive" });
    }
    setRows((report as ReportRow[]) ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    const { error } = await supabase.rpc("webauthn_admin_set_enrollment_policy", {
      _required: required,
      _grace_days: graceDays,
      _roles: roles,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Could not save policy", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Enrollment policy saved",
      description: required
        ? `${roles.length} role(s) must enroll within ${graceDays} day(s).`
        : "Biometric enrollment is no longer enforced.",
    });
    await load();
  }, [required, graceDays, roles, load, toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.compliance !== filter) return false;
      if (!q) return true;
      return [r.full_name, r.staff_id, r.department, (r.roles ?? []).join(" ")]
        .some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [rows, query, filter]);

  const counts = useMemo(() => ({
    enrolled: rows.filter((r) => r.compliance === "enrolled").length,
    grace: rows.filter((r) => r.compliance === "grace").length,
    overdue: rows.filter((r) => r.compliance === "overdue").length,
    total: rows.length,
  }), [rows]);

  const exportCsv = useCallback(() => {
    const header = ["Staff", "Staff ID", "Department", "Roles", "Required", "Devices", "First enrolled", "Last used", "Status"];
    const lines = [header.join(",")].concat(
      filtered.map((r) => [
        csvCell(r.full_name ?? ""),
        csvCell(r.staff_id ?? ""),
        csvCell(r.department ?? ""),
        csvCell((r.roles ?? []).join(" | ")),
        r.required ? "Yes" : "No",
        String(r.device_count),
        r.first_enrolled_at ? formatDate(r.first_enrolled_at) : "",
        r.last_used_at ? formatDate(r.last_used_at) : "",
        COMPLIANCE_LABEL[r.compliance],
      ].join(",")),
    );
    downloadBlob(
      new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" }),
      "biometric-enrollment-coverage.csv",
    );
  }, [filtered]);

  const toggleRole = useCallback((role: string, checked: boolean) => {
    setRoles((prev) => (checked ? Array.from(new Set([...prev, role])) : prev.filter((r) => r !== role)));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          Biometric Enrollment Drive
          <Badge variant="secondary">{counts.enrolled}/{counts.total} enrolled</Badge>
          {counts.overdue > 0 && <Badge variant="destructive">{counts.overdue} overdue</Badge>}
        </CardTitle>
        <CardDescription>
          Passkeys are created on each staff member's own device, so enrollment cannot be done on
          their behalf. Turn on the requirement to prompt the selected roles at sign-in, blocking
          once the grace period ends.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-6 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Switch
              id="biometric-required"
              checked={required}
              onCheckedChange={setRequired}
              aria-label="Require biometric enrollment"
            />
            <Label htmlFor="biometric-required">Require enrollment</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="biometric-grace">Grace period (days)</Label>
            <Input
              id="biometric-grace"
              type="number"
              min={0}
              max={365}
              value={graceDays}
              onChange={(e) => setGraceDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
              className="w-28"
            />
          </div>
          {required && deadline && (
            <p className="text-sm text-muted-foreground">
              Current deadline: <strong>{formatDate(deadline)}</strong>
            </p>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save policy"}
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Roles that must enroll</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {ROLE_OPTIONS.map((role) => (
              <div key={role} className="flex items-center gap-2">
                <Checkbox
                  id={`biometric-role-${role}`}
                  checked={roles.includes(role)}
                  onCheckedChange={(c) => toggleRole(role, Boolean(c))}
                />
                <Label htmlFor={`biometric-role-${role}`} className="text-sm font-normal capitalize">
                  {role.replace(/_/g, " ")}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search staff, ID, department or role"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search enrollment coverage"
            className="max-w-sm"
          />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[190px]" aria-label="Filter by enrollment status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              <SelectItem value="enrolled">Enrolled</SelectItem>
              <SelectItem value="grace">Within grace</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="not_required">Not required</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={loading} aria-label="Refresh coverage">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            Export CSV
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Staff ID</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Devices</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6}>Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6}>No staff match this filter.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.user_id}>
                  <TableCell className="font-medium">{r.full_name ?? "—"}</TableCell>
                  <TableCell>{r.staff_id ?? "—"}</TableCell>
                  <TableCell>{r.department ?? "—"}</TableCell>
                  <TableCell className="flex items-center gap-1">
                    <Fingerprint className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {r.device_count}
                  </TableCell>
                  <TableCell>{r.last_used_at ? formatDate(r.last_used_at) : "Never"}</TableCell>
                  <TableCell>
                    {r.compliance === "enrolled" ? (
                      <Badge>Enrolled</Badge>
                    ) : r.compliance === "overdue" ? (
                      <Badge variant="destructive">Overdue</Badge>
                    ) : r.compliance === "grace" ? (
                      <Badge variant="secondary">Within grace</Badge>
                    ) : (
                      <Badge variant="outline">Not required</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default BiometricEnrollmentPolicyCard;
