/**
 * BIO-DATA COMPLETENESS — personnel records broken into the eight structured
 * modules (identity, contact, family, education, employment, medical, bank,
 * verification) so HR can see at a glance which records are ready for
 * verification and reporting and which are still missing information.
 *
 * The medical and bank columns show only whether the module has been filled in
 * — never the values themselves — so this panel is safe for HR staff who are
 * not cleared to read restricted fields.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrgUnits } from "@/hooks/useOrgScope";
import { CommandPicker } from "@/components/org/CommandPicker";
import { QuickScroll } from "@/components/ui/quick-scroll";
import { descendantIds } from "@/lib/org-hierarchy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, Download, Search, X } from "lucide-react";
import { downloadBlob } from "@/lib/download-utils";
import { csvCell } from "@/lib/csv-safe";

interface CompletenessRow {
  profile_id: string;
  staff_id: string | null;
  full_name: string;
  rank_name: string | null;
  department_name: string | null;
  org_unit_id: string | null;
  org_unit_name: string | null;
  status: string | null;
  has_identity: boolean;
  has_contact: boolean;
  has_family: boolean;
  has_education: boolean;
  has_employment: boolean;
  has_medical: boolean;
  has_bank: boolean;
  has_verification: boolean;
  modules_complete: number;
  completeness_pct: number;
}

const MODULES: { key: keyof CompletenessRow; label: string; short: string }[] = [
  { key: "has_identity", label: "Identity", short: "ID" },
  { key: "has_contact", label: "Contact", short: "Contact" },
  { key: "has_family", label: "Family", short: "Family" },
  { key: "has_education", label: "Education", short: "Educ." },
  { key: "has_employment", label: "Employment", short: "Empl." },
  { key: "has_medical", label: "Medical", short: "Medical" },
  { key: "has_bank", label: "Bank / salary", short: "Bank" },
  { key: "has_verification", label: "Verification", short: "Verified" },
];

function Flag({ on }: { on: boolean }) {
  return on ? (
    <Check className="mx-auto h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-label="Complete" />
  ) : (
    <X className="mx-auto h-4 w-4 text-destructive" aria-label="Missing" />
  );
}

export function BioDataCompletenessPanel() {
  const { data: units = [] } = useOrgUnits();
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState<string>("all");

  const query = useQuery({
    queryKey: ["hr-biodata-completeness"],
    staleTime: 60_000,
    queryFn: async (): Promise<CompletenessRow[]> => {
      const { data, error } = await supabase.rpc("hr_biodata_completeness");
      if (error) throw error;
      return (data ?? []) as unknown as CompletenessRow[];
    },
  });

  const scopeIds = useMemo(
    () => (unitFilter ? new Set(descendantIds(units, unitFilter)) : null),
    [unitFilter, units],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (query.data ?? []).filter((r) => {
      if (scopeIds && (!r.org_unit_id || !scopeIds.has(r.org_unit_id))) return false;
      if (moduleFilter !== "all" && r[moduleFilter as keyof CompletenessRow] === true) return false;
      if (!q) return true;
      return [r.full_name, r.staff_id, r.rank_name, r.department_name, r.org_unit_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [query.data, search, scopeIds, moduleFilter]);

  const avg = rows.length
    ? Math.round(rows.reduce((s, r) => s + Number(r.completeness_pct || 0), 0) / rows.length)
    : 0;
  const fullyComplete = rows.filter((r) => Number(r.modules_complete) === 8).length;

  const exportCsv = () => {
    const header = [
      "Staff ID", "Name", "Rank", "Department", "Command",
      ...MODULES.map((m) => m.label), "Modules complete", "Completeness %",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        r.staff_id ?? "", r.full_name, r.rank_name ?? "", r.department_name ?? "", r.org_unit_name ?? "",
        ...MODULES.map((m) => (r[m.key] ? "Yes" : "No")),
        String(r.modules_complete), String(r.completeness_pct),
      ].map(csvCell).join(","));
    }
    downloadBlob(
      new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }),
      `biodata-completeness-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Personnel record completeness</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} record{rows.length === 1 ? "" : "s"} · {fullyComplete} fully
            complete · {avg}% average across the eight modules.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Export
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={avg} aria-label="Average completeness" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              className="pl-9"
              placeholder="Search name, ID, rank or command…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search personnel records"
            />
          </div>
          <CommandPicker units={units} value={unitFilter} onChange={setUnitFilter} />
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger aria-label="Show records missing a module">
              <SelectValue placeholder="All records" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All records</SelectItem>
              {MODULES.map((m) => (
                <SelectItem key={m.key} value={m.key}>Missing {m.label.toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Command</TableHead>
                {MODULES.map((m) => (
                  <TableHead key={m.key} className="text-center">{m.short}</TableHead>
                ))}
                <TableHead className="text-right">Complete</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground">Loading records…</TableCell>
                </TableRow>
              )}
              {!query.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground">No records match these filters.</TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.profile_id}>
                  <TableCell>
                    <Link to={`/staff/${r.profile_id}`} className="font-medium text-primary hover:underline">
                      {r.rank_name ? `${r.rank_name} ` : ""}{r.full_name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {r.staff_id ?? "—"}{r.department_name ? ` · ${r.department_name}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">{r.org_unit_name ?? "—"}</TableCell>
                  {MODULES.map((m) => (
                    <TableCell key={m.key} className="text-center">
                      <Flag on={Boolean(r[m.key])} />
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <Badge variant={Number(r.modules_complete) === 8 ? "default" : "outline"}>
                      {r.completeness_pct}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <QuickScroll label="records list" threshold={600} />
        </div>
      </CardContent>
    </Card>
  );
}
