/**
 * STAFF LIST IMPORT — upload a staff list (CSV / XLSX), preview every parsed
 * row, then commit. Nothing is written until Commit is pressed.
 *
 * The commit runs in one database action (`commit_staff_list_import`) so ranks,
 * units, postings and retirements all land together under an administrator
 * check. Officers absent from the file are retired, never deleted.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Rocket,
  Download,
  Search,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/date-format";
import { downloadCSVString } from "@/lib/download-utils";
import { csvCellQuoted } from "@/lib/csv-safe";
import {
  parseStaffListFile, distinctRanks, distinctUnits, normaliseRank, type StaffListRow,
} from "@/lib/staff-list-import";

const COMMAND_TYPES = ["sector", "command", "station", "district", "regional"];

export default function StaffListImport() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const [rows, setRows] = useState<StaffListRow[] | null>(null);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [targetUnit, setTargetUnit] = useState<string>("");
  const [search, setSearch] = useState("");
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<null | {
    new: number; matched: number; retired: number; ranks_created: number; units_created: number;
  }>(null);

  /* ── Reference data used to work out what each row will do ─────────────── */
  const { data: units = [] } = useQuery({
    queryKey: ["staff-list-import-units"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_units")
        .select("id, name, type, parent_id, is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: people = [] } = useQuery({
    queryKey: ["staff-list-import-people"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id, org_unit_id, status")
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ranks = [] } = useQuery({
    queryKey: ["staff-list-import-ranks"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("ranks").select("id, name, abbreviation");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["staff-list-imports"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_list_imports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const commandOptions = useMemo(
    () => units.filter((u) => COMMAND_TYPES.includes(String(u.type))),
    [units],
  );

  const nameIndex = useMemo(() => {
    const m = new Map<string, { id: string; staff_id: string | null }>();
    people.forEach((p) => {
      m.set(`${p.first_name ?? ""}|${p.last_name ?? ""}`.toUpperCase().trim(), {
        id: p.id,
        staff_id: p.staff_id,
      });
    });
    return m;
  }, [people]);

  const knownRanks = useMemo(() => {
    const s = new Set<string>();
    ranks.forEach((r) => {
      s.add(normaliseRank(r.name));
      if (r.abbreviation) s.add(normaliseRank(r.abbreviation));
    });
    return s;
  }, [ranks]);

  const existingChildUnits = useMemo(() => {
    const s = new Set<string>();
    units.filter((u) => u.parent_id === targetUnit).forEach((u) => s.add(u.name.toUpperCase().trim()));
    return s;
  }, [units, targetUnit]);

  /** Every command at or below the chosen one — used for the retirement count. */
  const subtreeIds = useMemo(() => {
    if (!targetUnit) return new Set<string>();
    const ids = new Set<string>([targetUnit]);
    let grew = true;
    while (grew) {
      grew = false;
      units.forEach((u) => {
        if (u.parent_id && ids.has(u.parent_id) && !ids.has(u.id)) {
          ids.add(u.id);
          grew = true;
        }
      });
    }
    return ids;
  }, [units, targetUnit]);

  const summary = useMemo(() => {
    const ready = (rows ?? []).filter((r) => r.outcome === "ready");
    const matchedIds = new Set<string>();
    let matched = 0;
    ready.forEach((r) => {
      const hit = nameIndex.get(`${r.first_name}|${r.last_name}`.toUpperCase().trim());
      if (hit) {
        matched += 1;
        matchedIds.add(hit.id);
      }
    });
    const newRanks = distinctRanks(ready).filter((r) => !knownRanks.has(r));
    const newUnits = distinctUnits(ready).filter((u) => !existingChildUnits.has(u.toUpperCase().trim()));
    const retiring = targetUnit
      ? people.filter(
          (p) =>
            p.org_unit_id &&
            subtreeIds.has(p.org_unit_id) &&
            p.status !== "inactive" &&
            !matchedIds.has(p.id),
        ).length
      : 0;
    return {
      total: rows?.length ?? 0,
      ready: ready.length,
      skipped: (rows?.length ?? 0) - ready.length,
      matched,
      created: ready.length - matched,
      newRanks,
      newUnits,
      retiring,
    };
  }, [rows, nameIndex, knownRanks, existingChildUnits, people, subtreeIds, targetUnit]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!rows) return [];
    if (!q) return rows;
    return rows.filter((r) =>
      [r.first_name, r.last_name, r.rank, r.unit, r.shift, r.phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const handleFile = async (file: File) => {
    setParsing(true);
    setResult(null);
    setFileName(file.name);
    try {
      const parsed = await parseStaffListFile(file);
      setRows(parsed.rows);
      setUnmapped(parsed.unmapped);
      toast.success(`${parsed.rows.length} row(s) read from ${file.name}`);
    } catch (e: any) {
      setRows(null);
      toast.error(e?.message || "Could not read that file");
    } finally {
      setParsing(false);
    }
  };

  /**
   * Stage the parsed rows for approval. Nothing touches staff records here —
   * an administrator approves the file afterwards, which commits it.
   */
  const submitForApproval = async () => {
    if (!rows || !targetUnit) return;
    setCommitting(true);
    try {
      const { data: me } = await supabase.auth.getUser();
      const { data: imp, error: impErr } = await supabase
        .from("staff_list_imports")
        .insert({
          file_name: fileName || "staff-list",
          uploaded_by: me?.user?.id ?? null,
          target_org_unit_id: targetUnit,
          total_rows: rows.length,
          skipped_count: summary.skipped,
          status: "preview",
          approval_status: "pending",
        })
        .select("id")
        .single();
      if (impErr) throw impErr;

      const payloadRows = rows.map((r) => ({
        import_id: imp.id,
        row_no: r.row_no,
        outcome: r.outcome,
        reason: r.reason ?? null,
        payload: {
          first_name: r.first_name,
          last_name: r.last_name,
          rank: r.rank,
          unit: r.unit,
          shift: r.shift,
          intake: r.intake,
          region: r.region,
          phone: r.phone,
          gender: r.gender,
        },
      }));
      for (let i = 0; i < payloadRows.length; i += 400) {
        const { error } = await supabase
          .from("staff_list_import_rows")
          .insert(payloadRows.slice(i, i + 400));
        if (error) throw error;
      }

      await supabase.from("staff_list_import_audit").insert({
        import_id: imp.id,
        action: "uploaded",
        performed_by: me?.user?.id ?? "",
        details: { file: fileName, rows: rows.length, skipped: summary.skipped } as never,
      });

      toast.success(`${summary.ready} row(s) saved — review then approve below`);
      qc.invalidateQueries({ queryKey: ["staff-list-imports"] });
      setRows(null);
    } catch (e: any) {
      toast.error(e?.message || "Could not save that file");
    } finally {
      setCommitting(false);
    }
  };


  const exportPreview = () => {
    if (!rows) return;
    const csv = [
      "Row,Last name,First name,Rank,Unit,Shift,Intake,Region,Phone,Gender,Sign-in email,Outcome,Reason",
      ...rows.map((r) =>
        [
          String(r.row_no), r.last_name, r.first_name, r.rank, r.unit, r.shift, r.intake,
          r.region, r.phone, r.gender, r.email_preview, r.outcome, r.reason ?? "",
        ].map(csvCellQuoted).join(","),
      ),
    ].join("\n");
    downloadCSVString(csv, "staff-list-preview.csv");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff list import"
        subtitle="Upload a staff list, check every row, then commit it to the system."
        icon={FileSpreadsheet}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choose the command and the file</CardTitle>
          <CardDescription>
            Staff numbers and sign-in emails are generated, because uploaded lists carry placeholders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="target-command">Import into</Label>
              <Select value={targetUnit} onValueChange={setTargetUnit}>
                <SelectTrigger id="target-command">
                  <SelectValue placeholder="Select a command" />
                </SelectTrigger>
                <SelectContent>
                  {commandOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-list-file">Staff list file</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="staff-list-file"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                    e.target.value = "";
                  }}
                />
                {parsing ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                ) : (
                  <Upload className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
            </div>
          </div>

          {unmapped.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle className="text-sm">Columns not recognised</AlertTitle>
              <AlertDescription className="text-xs">
                {unmapped.join(", ")} — these are ignored.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {result && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <AlertTitle className="text-sm">Import committed</AlertTitle>
          <AlertDescription className="text-sm">
            {result.new} staff added, {result.matched} updated, {result.retired} retired,{" "}
            {result.ranks_created} rank(s) and {result.units_created} unit(s) created.
          </AlertDescription>
        </Alert>
      )}

      {rows && (
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">2. Preview</CardTitle>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">{summary.total} rows</Badge>
              <Badge variant="secondary">{summary.created} new staff</Badge>
              <Badge variant="secondary">{summary.matched} existing updated</Badge>
              <Badge variant="outline">{summary.newRanks.length} ranks to create</Badge>
              <Badge variant="outline">{summary.newUnits.length} units to create</Badge>
              <Badge variant="destructive">{summary.retiring} to be retired</Badge>
              {summary.skipped > 0 && <Badge variant="destructive">{summary.skipped} skipped</Badge>}
            </div>
            {summary.newUnits.length > 0 && (
              <CardDescription className="text-xs">
                New units: {summary.newUnits.join(", ")}
              </CardDescription>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  className="pl-9"
                  placeholder="Search the preview"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search the preview rows"
                />
              </div>
              <Button variant="outline" size="sm" onClick={exportPreview}>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                Export preview
              </Button>
              <Button size="sm" disabled={!targetUnit || committing || summary.ready === 0} onClick={submitForApproval}>
                {committing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Rocket className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Save {summary.ready} row(s) for approval
              </Button>

            </div>
            {!targetUnit && (
              <CardDescription className="text-xs text-destructive">
                Choose the command to import into before committing.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Sign-in email</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.slice(0, 400).map((r) => {
                    const hit = nameIndex.get(`${r.first_name}|${r.last_name}`.toUpperCase().trim());
                    return (
                      <TableRow key={r.row_no}>
                        <TableCell className="text-xs text-muted-foreground">{r.row_no}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm font-medium">
                          {r.last_name}, {r.first_name}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.rank}
                          {r.rank && !knownRanks.has(r.rank) && (
                            <Badge variant="outline" className="ml-2 text-[10px]">new</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.unit || "—"}
                          {r.unit && !existingChildUnits.has(r.unit.toUpperCase().trim()) && targetUnit && (
                            <Badge variant="outline" className="ml-2 text-[10px]">new</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{r.shift || "—"}</TableCell>
                        <TableCell className="text-sm">{r.phone || "—"}</TableCell>
                        <TableCell className="text-xs">{r.email_preview || "—"}</TableCell>
                        <TableCell>
                          {r.outcome === "skipped" ? (
                            <Badge variant="destructive" className="text-[10px]">{r.reason ?? "Skipped"}</Badge>
                          ) : hit ? (
                            <Badge variant="secondary" className="text-[10px]">Updates existing</Badge>
                          ) : (
                            <Badge className="text-[10px]">New staff</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {filteredRows.length > 400 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing the first 400 of {filteredRows.length} rows.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent imports</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staff list has been imported yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Retired</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h: any) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-sm">{h.file_name}</TableCell>
                      <TableCell className="text-xs">{formatDateTime(h.created_at)}</TableCell>
                      <TableCell className="text-sm">{h.total_rows}</TableCell>
                      <TableCell className="text-sm">{h.new_count}</TableCell>
                      <TableCell className="text-sm">{h.matched_count}</TableCell>
                      <TableCell className="text-sm">{h.retired_count}</TableCell>
                      <TableCell>
                        <Badge variant={h.status === "committed" ? "secondary" : "outline"} className="text-[10px]">
                          {h.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
