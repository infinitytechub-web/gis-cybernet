import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardCheck, Download, FileSpreadsheet, FileText, Eye } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { downloadCSVString, downloadBlob } from "@/lib/download-utils";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type CoverageRow = {
  staff_profile_id: string;
  staff_id: string | null;
  first_name: string | null;
  last_name: string | null;
  rank_name: string | null;
  rank_level: number | null;
  department_name: string | null;
  has_appraisal: boolean;
  appraisal_status: string | null;
  total_score: number | null;
  duplicate_attempts: number;
  last_attempt_at: string | null;
};

type Filter = "all" | "missing" | "duplicates" | "completed";

export default function AppraisalCoverageReport() {
  const { isAdminOrSupervisor, isHoa, loading } = useAuthContext();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState<number | null>(today.getMonth() + 1);
  const [filter, setFilter] = useState<Filter>("missing");
  const [search, setSearch] = useState("");

  const periodLabel = month ? `${MONTHS[month - 1]} ${year}` : `Annual ${year}`;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["appraisal-coverage", year, month],
    enabled: isAdminOrSupervisor || isHoa,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("appraisal_coverage_report" as any, {
        _period_year: year,
        _period_month: month,
      });
      if (error) throw error;
      return (data ?? []) as CoverageRow[];
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "missing" && r.has_appraisal) return false;
      if (filter === "duplicates" && r.duplicate_attempts === 0) return false;
      if (filter === "completed" && !r.has_appraisal) return false;
      if (term) {
        const hay = `${r.first_name ?? ""} ${r.last_name ?? ""} ${r.staff_id ?? ""} ${r.department_name ?? ""} ${r.rank_name ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  const stats = useMemo(() => ({
    total: rows.length,
    completed: rows.filter((r) => r.has_appraisal).length,
    missing: rows.filter((r) => !r.has_appraisal).length,
    duplicates: rows.filter((r) => r.duplicate_attempts > 0).length,
  }), [rows]);

  if (!loading && !(isAdminOrSupervisor || isHoa)) {
    return <Navigate to="/appraisals" replace />;
  }

  function exportCSV() {
    const header = ["Staff ID","Last Name","First Name","Rank","Department","Has Appraisal","Status","Total Score","Duplicate Attempts","Last Attempt"];
    const lines = [header.join(",")];
    for (const r of filtered) {
      const cells = [
        r.staff_id ?? "",
        r.last_name ?? "",
        r.first_name ?? "",
        r.rank_name ?? "",
        r.department_name ?? "",
        r.has_appraisal ? "Yes" : "No",
        r.appraisal_status ?? "",
        r.total_score?.toString() ?? "",
        String(r.duplicate_attempts),
        r.last_attempt_at ? format(new Date(r.last_attempt_at), "yyyy-MM-dd HH:mm") : "",
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    }
    downloadCSVString(lines.join("\n"), `appraisal-coverage-${year}${month ? `-${String(month).padStart(2,"0")}` : "-annual"}.csv`);
  }

  function exportPDF() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(`Appraisal Coverage Report — ${periodLabel}`, 14, 14);
    doc.setFontSize(9);
    doc.text(
      `Total: ${stats.total} · Completed: ${stats.completed} · Missing: ${stats.missing} · Duplicate attempts: ${stats.duplicates}`,
      14, 20,
    );
    autoTable(doc, {
      startY: 24,
      head: [["Staff ID","Officer","Rank","Department","Status","Score","Dup. attempts"]],
      body: filtered.map((r) => [
        r.staff_id ?? "",
        `${r.last_name ?? ""}, ${r.first_name ?? ""}`,
        r.rank_name ?? "",
        r.department_name ?? "",
        r.has_appraisal ? (r.appraisal_status ?? "—") : "MISSING",
        r.total_score != null ? `${r.total_score}/35` : "—",
        String(r.duplicate_attempts),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [22, 92, 60] },
    });
    const blob = doc.output("blob");
    downloadBlob(blob, `appraisal-coverage-${year}${month ? `-${String(month).padStart(2,"0")}` : "-annual"}.pdf`);
  }

  return (
    <div className="space-y-4">
      <PageHeader icon={ClipboardCheck} title="Appraisal Coverage Report" subtitle="Officers missing appraisals or with duplicate attempts for a period." />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filters</CardTitle>
          <CardDescription className="text-xs">Period · {periodLabel}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Year</Label>
              <Input type="number" className="h-8 w-24" value={year} onChange={(e) => setYear(Number(e.target.value) || today.getFullYear())} />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Month</Label>
              <Select value={month ? String(month) : "annual"} onValueChange={(v) => setMonth(v === "annual" ? null : Number(v))}>
                <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Annual</SelectItem>
                  {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Filter</Label>
              <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="missing">Missing only</SelectItem>
                  <SelectItem value="duplicates">Duplicate attempts</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="all">All officers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <Label className="text-[10px] uppercase text-muted-foreground">Search</Label>
              <Input className="h-8" placeholder="Name, staff ID, dept…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={exportCSV} disabled={filtered.length === 0} className="gap-1"><FileSpreadsheet className="h-4 w-4" /> CSV</Button>
              <Button size="sm" variant="outline" onClick={exportPDF} disabled={filtered.length === 0} className="gap-1"><FileText className="h-4 w-4" /> PDF</Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">Total: {stats.total}</Badge>
            <Badge className="bg-emerald-100 text-emerald-900">Completed: {stats.completed}</Badge>
            <Badge className="bg-amber-100 text-amber-900">Missing: {stats.missing}</Badge>
            <Badge className="bg-rose-100 text-rose-900">Duplicate attempts: {stats.duplicates}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Officer</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Dup. attempts</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">Loading…</TableCell></TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">No matching officers.</TableCell></TableRow>
                )}
                {filtered.map((r) => (
                  <TableRow key={r.staff_profile_id}>
                    <TableCell className="text-xs">{r.staff_id ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.last_name ?? ""}, {r.first_name ?? ""}</TableCell>
                    <TableCell className="text-xs">{r.rank_name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.department_name ?? "—"}</TableCell>
                    <TableCell>
                      {r.has_appraisal ? (
                        <Badge className="bg-emerald-100 text-emerald-900">{r.appraisal_status ?? "completed"}</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-900">missing</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{r.total_score != null ? `${r.total_score} / 35` : "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.duplicate_attempts > 0 ? (
                        <Badge className="bg-rose-100 text-rose-900">{r.duplicate_attempts}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {r.has_appraisal && (
                        <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                          <Link to={`/appraisals/officer/${r.staff_profile_id}?year=${year}${month ? `&month=${month}` : ""}`}>
                            <Eye className="h-3.5 w-3.5 mr-1" /> View
                          </Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
