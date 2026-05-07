import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UserCog, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "sonner";

type AppRole =
  | "admin" | "supervisor" | "staff" | "deputy_supervisor" | "deputy_shift_leader"
  | "deputy" | "shift_leader" | "special_duties" | "front_desk" | "oic" | "2ic"
  | "shift_supervisor" | "deputy_shift_supervisor" | "official" | "enquiry"
  | "storekeeper" | "procurement_officer" | "staff_officer" | "ipse_supervisor"
  | "ipse_deputy_supervisor" | "head_of_administration" | "chief_staff_officer"
  | "head_of_processing" | "deputy_head_of_processing" | "medical_officer";

const KNOWN_ROLES: AppRole[] = [
  "admin","supervisor","staff","deputy_supervisor","deputy_shift_leader","deputy",
  "shift_leader","special_duties","front_desk","oic","2ic","shift_supervisor",
  "deputy_shift_supervisor","official","enquiry","storekeeper","procurement_officer",
  "staff_officer","ipse_supervisor","ipse_deputy_supervisor","head_of_administration",
  "chief_staff_officer","head_of_processing","deputy_head_of_processing","medical_officer",
];

interface PreviewRow {
  staff_id: string;
  role: AppRole | null;
  raw_role: string;
  user_id: string | null;
  status: "ready" | "duplicate" | "no_staff" | "bad_role";
  reason?: string;
}

function normalizeRole(r: string): AppRole | null {
  const k = r.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (KNOWN_ROLES as string[]).includes(k) ? (k as AppRole) : null;
}

export default function RoleAssignmentsAdmin() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [parsing, setParsing] = useState(false);

  const { data: existingAssignments = [], isLoading } = useQuery({
    queryKey: ["role-assignments-list"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("id, role, user_id");
      if (error) throw error;
      const userIds = Array.from(new Set(roles.map((r) => r.user_id)));
      if (!userIds.length) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, staff_id, first_name, last_name")
        .in("user_id", userIds);
      const map = new Map((profs ?? []).map((p) => [p.user_id, p]));
      return roles.map((r) => ({ ...r, profile: map.get(r.user_id) }));
    },
    enabled: isAdmin,
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of existingAssignments) c[r.role] = (c[r.role] || 0) + 1;
    return c;
  }, [existingAssignments]);

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
      if (!rows.length) throw new Error("Empty file");

      const staffIds = rows.map((r) => String(r.staff_id ?? r["Staff ID"] ?? r.STAFF_ID ?? "").trim()).filter(Boolean);
      const { data: profs } = await supabase
        .from("profiles").select("staff_id, user_id").in("staff_id", staffIds);
      const profMap = new Map((profs ?? []).map((p) => [p.staff_id, p.user_id]));

      const { data: existing } = await supabase.from("user_roles").select("user_id, role");
      const existingSet = new Set((existing ?? []).map((e) => `${e.user_id}|${e.role}`));

      const out: PreviewRow[] = rows.map((r) => {
        const staff_id = String(r.staff_id ?? r["Staff ID"] ?? r.STAFF_ID ?? "").trim();
        const raw_role = String(r.role ?? r.Role ?? r.ROLE ?? "").trim();
        const role = normalizeRole(raw_role);
        const user_id = profMap.get(staff_id) ?? null;
        if (!staff_id || !user_id) return { staff_id, role, raw_role, user_id, status: "no_staff", reason: "Staff ID not found" };
        if (!role) return { staff_id, role: null, raw_role, user_id, status: "bad_role", reason: `Unknown role "${raw_role}"` };
        if (existingSet.has(`${user_id}|${role}`)) return { staff_id, role, raw_role, user_id, status: "duplicate", reason: "Already assigned" };
        return { staff_id, role, raw_role, user_id, status: "ready" };
      });
      setPreview(out);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to parse file");
    } finally {
      setParsing(false);
    }
  };

  const commit = useMutation({
    mutationFn: async () => {
      if (!preview) return 0;
      const ready = preview.filter((r) => r.status === "ready" && r.user_id && r.role);
      if (!ready.length) throw new Error("No new assignments to commit");
      const seen = new Set<string>();
      const rows = ready
        .filter((r) => {
          const k = `${r.user_id}|${r.role}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .map((r) => ({ user_id: r.user_id!, role: r.role! }));
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 50) {
        const { error } = await supabase.from("user_roles").insert(rows.slice(i, i + 50));
        if (error) throw error;
        inserted += rows.slice(i, i + 50).length;
      }
      return inserted;
    },
    onSuccess: (n) => {
      toast.success(`${n} role(s) assigned`);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["role-assignments-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role removed");
      qc.invalidateQueries({ queryKey: ["role-assignments-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <Alert><AlertDescription>Admin access required.</AlertDescription></Alert>;
  }

  const readyCount = preview?.filter((r) => r.status === "ready").length ?? 0;
  const dupCount = preview?.filter((r) => r.status === "duplicate").length ?? 0;
  const errCount = preview?.filter((r) => r.status === "no_staff" || r.status === "bad_role").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <UserCog className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-secondary">Role &amp; Department Assignments</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" /> Bulk Upload Roles
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload a CSV or Excel file with columns <code>staff_id</code> and <code>role</code>.
            Duplicates are detected and skipped automatically. Recognized roles: {KNOWN_ROLES.length} app roles.
          </p>
          <div className="flex gap-2 items-center">
            <Input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              disabled={parsing}
              className="max-w-md"
            />
            {preview && (
              <Button onClick={() => setPreview(null)} variant="outline" size="sm">Clear</Button>
            )}
          </div>

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-emerald-100 text-emerald-800">Ready: {readyCount}</Badge>
                <Badge className="bg-amber-100 text-amber-800">Duplicate (skip): {dupCount}</Badge>
                <Badge variant="destructive">Errors: {errCount}</Badge>
              </div>
              <div className="rounded border max-h-80 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff ID</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.slice(0, 200).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{r.staff_id || "—"}</TableCell>
                        <TableCell className="text-xs">{r.raw_role}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              r.status === "ready" ? "bg-emerald-100 text-emerald-800" :
                              r.status === "duplicate" ? "bg-amber-100 text-amber-800" :
                              "bg-red-100 text-red-800"
                            }
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.reason ?? "OK"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button
                onClick={() => commit.mutate()}
                disabled={commit.isPending || readyCount === 0}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                Commit {readyCount} new assignment(s)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4" /> Current Assignments ({existingAssignments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-3">
            {Object.entries(counts).map(([role, n]) => (
              <Badge key={role} variant="outline">{role}: {n}</Badge>
            ))}
          </div>
          {isLoading ? (
            <div className="text-center py-6 text-muted-foreground">Loading…</div>
          ) : (
            <div className="rounded border max-h-[500px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="w-12">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {existingAssignments.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.profile?.staff_id ?? "—"}</TableCell>
                      <TableCell>{r.profile ? `${r.profile.last_name}, ${r.profile.first_name}` : "—"}</TableCell>
                      <TableCell><Badge variant="secondary">{r.role}</Badge></TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            if (confirm(`Remove ${r.role} from ${r.profile?.staff_id}?`)) remove.mutate(r.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Roles are stored separately from profiles to prevent privilege-escalation. All assignments are written to the universal audit log.
        </AlertDescription>
      </Alert>
    </div>
  );
}
