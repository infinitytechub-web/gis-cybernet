import { useMemo, useState } from "react";
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
import { Building2, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

type Status = "ready" | "no_change" | "no_staff" | "no_dept" | "no_rank";

interface PreviewRow {
  staff_id: string;
  raw_dept: string;
  raw_designation: string;
  profile_id: string | null;
  current_dept_id: string | null;
  current_rank_id: string | null;
  new_dept_id: string | null;
  new_rank_id: string | null;
  status: Status;
  reason?: string;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export default function StaffMappingImport() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [parsing, setParsing] = useState(false);

  const { data: history = [] } = useQuery({
    queryKey: ["staff-mapping-imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_mapping_imports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
  });

  const handleFile = async (file: File) => {
    setParsing(true);
    setFilename(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
      if (!rows.length) throw new Error("Empty file");

      const staffIds = rows
        .map((r) => String(r.staff_id ?? r["Staff ID"] ?? r.STAFF_ID ?? "").trim())
        .filter(Boolean);

      const [{ data: profs }, { data: depts }, { data: ranks }] = await Promise.all([
        supabase.from("profiles").select("id, staff_id, department_id, rank_id").in("staff_id", staffIds),
        supabase.from("departments").select("id, name"),
        supabase.from("ranks").select("id, name, abbreviation"),
      ]);

      const profMap = new Map((profs ?? []).map((p) => [p.staff_id, p]));
      const deptMap = new Map((depts ?? []).map((d) => [norm(d.name), d.id]));
      const rankMap = new Map<string, string>();
      (ranks ?? []).forEach((r) => {
        rankMap.set(norm(r.name), r.id);
        if (r.abbreviation) rankMap.set(norm(r.abbreviation), r.id);
      });

      const seen = new Set<string>();
      const out: PreviewRow[] = rows.map((r) => {
        const staff_id = String(r.staff_id ?? r["Staff ID"] ?? r.STAFF_ID ?? "").trim();
        const raw_dept = String(r.department ?? r.Department ?? r.DEPARTMENT ?? "").trim();
        const raw_designation = String(
          r.designation ?? r.Designation ?? r.DESIGNATION ?? r.rank ?? r.Rank ?? ""
        ).trim();

        const profile = profMap.get(staff_id);
        if (!staff_id || !profile) {
          return {
            staff_id, raw_dept, raw_designation, profile_id: null,
            current_dept_id: null, current_rank_id: null,
            new_dept_id: null, new_rank_id: null,
            status: "no_staff", reason: "Staff ID not found",
          };
        }

        const new_dept_id = raw_dept ? deptMap.get(norm(raw_dept)) ?? null : null;
        const new_rank_id = raw_designation ? rankMap.get(norm(raw_designation)) ?? null : null;

        if (raw_dept && !new_dept_id) {
          return { staff_id, raw_dept, raw_designation, profile_id: profile.id,
            current_dept_id: profile.department_id, current_rank_id: profile.rank_id,
            new_dept_id: null, new_rank_id, status: "no_dept", reason: `Department "${raw_dept}" not found` };
        }
        if (raw_designation && !new_rank_id) {
          return { staff_id, raw_dept, raw_designation, profile_id: profile.id,
            current_dept_id: profile.department_id, current_rank_id: profile.rank_id,
            new_dept_id, new_rank_id: null, status: "no_rank", reason: `Designation "${raw_designation}" not found` };
        }

        const dupKey = `${profile.id}|${new_dept_id ?? "_"}|${new_rank_id ?? "_"}`;
        const sameDept = !new_dept_id || profile.department_id === new_dept_id;
        const sameRank = !new_rank_id || profile.rank_id === new_rank_id;
        if (sameDept && sameRank) {
          return { staff_id, raw_dept, raw_designation, profile_id: profile.id,
            current_dept_id: profile.department_id, current_rank_id: profile.rank_id,
            new_dept_id, new_rank_id, status: "no_change", reason: "Already assigned (skip)" };
        }
        if (seen.has(dupKey)) {
          return { staff_id, raw_dept, raw_designation, profile_id: profile.id,
            current_dept_id: profile.department_id, current_rank_id: profile.rank_id,
            new_dept_id, new_rank_id, status: "no_change", reason: "Duplicate row in file (skip)" };
        }
        seen.add(dupKey);
        return { staff_id, raw_dept, raw_designation, profile_id: profile.id,
          current_dept_id: profile.department_id, current_rank_id: profile.rank_id,
          new_dept_id, new_rank_id, status: "ready" };
      });

      setPreview(out);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to parse file");
    } finally {
      setParsing(false);
    }
  };

  const counts = useMemo(() => {
    if (!preview) return { ready: 0, skip: 0, err: 0 };
    let ready = 0, skip = 0, err = 0;
    for (const r of preview) {
      if (r.status === "ready") ready++;
      else if (r.status === "no_change") skip++;
      else err++;
    }
    return { ready, skip, err };
  }, [preview]);

  const commit = useMutation({
    mutationFn: async () => {
      if (!preview) return 0;
      const ready = preview.filter((r) => r.status === "ready" && r.profile_id);
      if (!ready.length) throw new Error("No mappings to commit");
      let updated = 0;
      for (const r of ready) {
        const patch: any = {};
        if (r.new_dept_id) patch.department_id = r.new_dept_id;
        if (r.new_rank_id) patch.rank_id = r.new_rank_id;
        if (!Object.keys(patch).length) continue;
        const { error } = await supabase.from("profiles").update(patch).eq("id", r.profile_id!);
        if (error) throw error;
        updated++;
      }
      await supabase.from("staff_mapping_imports").insert({
        imported_by: user?.id ?? null,
        filename,
        total_rows: preview.length,
        updated_count: updated,
        skipped_count: counts.skip,
        error_count: counts.err,
      } as any);
      return updated;
    },
    onSuccess: (n) => {
      toast.success(`${n} staff record(s) updated`);
      setPreview(null);
      setFilename("");
      qc.invalidateQueries({ queryKey: ["staff-mapping-imports"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <Alert><AlertDescription>Admin access required.</AlertDescription></Alert>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Building2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-secondary">Staff → Department / Designation Import</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" /> Bulk Map Staff to Departments &amp; Designations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload a CSV/Excel with columns <code>staff_id</code>, <code>department</code>, and <code>designation</code> (rank name or abbreviation).
            Department and designation names are matched case-insensitively. Rows where the staff member already has the
            target department <em>and</em> designation are skipped automatically — no duplicate mappings.
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
              <Button onClick={() => { setPreview(null); setFilename(""); }} variant="outline" size="sm">Clear</Button>
            )}
          </div>

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-emerald-100 text-emerald-800">Ready: {counts.ready}</Badge>
                <Badge className="bg-amber-100 text-amber-800">Skip (no change / duplicate): {counts.skip}</Badge>
                <Badge variant="destructive">Errors: {counts.err}</Badge>
              </div>
              <div className="rounded border max-h-80 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff ID</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.slice(0, 200).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{r.staff_id || "—"}</TableCell>
                        <TableCell className="text-xs">{r.raw_dept || "—"}</TableCell>
                        <TableCell className="text-xs">{r.raw_designation || "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              r.status === "ready" ? "bg-emerald-100 text-emerald-800" :
                              r.status === "no_change" ? "bg-amber-100 text-amber-800" :
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
                disabled={commit.isPending || counts.ready === 0}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                Commit {counts.ready} mapping(s)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4" /> Recent Imports
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">No imports yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Skipped</TableHead>
                  <TableHead>Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h: any) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs">{new Date(h.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{h.filename ?? "—"}</TableCell>
                    <TableCell>{h.total_rows}</TableCell>
                    <TableCell className="text-emerald-700">{h.updated_count}</TableCell>
                    <TableCell className="text-amber-700">{h.skipped_count}</TableCell>
                    <TableCell className="text-destructive">{h.error_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Every commit is captured in the universal audit log via the profile-update trigger, and this page records its own per-file summary above.
        </AlertDescription>
      </Alert>
    </div>
  );
}
