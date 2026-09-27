import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PagedSection } from "@/components/ui/paged-section";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Wrench } from "lucide-react";

type Issue = { issue: string; profile_id: string | null; staff_id: string | null; full_name: string | null; detail: string };

const LABELS: Record<string, string> = {
  duplicate_staff_id: "Duplicate staff ID",
  duplicate_ghana_card: "Duplicate Ghana Card",
  duplicate_name_dob: "Possible duplicate",
  stale_assignment: "Stale assignment",
  orphan_org_unit: "Missing command",
  orphan_position_holder: "Orphaned position",
};
const FIXABLE = new Set(["stale_assignment", "orphan_org_unit", "orphan_position_holder"]);

/** Super Admin-only reconciliation: preview issues, apply approved safe fixes, run integrity check. */
export function StaffReconciliationPanel() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const issues = useQuery({
    queryKey: ["staff-reconcile-preview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reconcile_staff_records_preview");
      if (error) throw error;
      return (data ?? []) as Issue[];
    },
  });
  const integrity = useQuery({
    queryKey: ["staff-integrity"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("staff_integrity_check");
      if (error) throw error;
      return data as Record<string, number | string>;
    },
  });

  const apply = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("reconcile_staff_records_apply", {
      _profile_ids: [...selected], _reason: reason.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Clean-up applied", { description: JSON.stringify(data) });
    setSelected(new Set()); setReason("");
    qc.invalidateQueries({ queryKey: ["staff-reconcile-preview"] });
    qc.invalidateQueries({ queryKey: ["staff-integrity"] });
  };

  const rows = issues.data ?? [];
  const i = integrity.data;
  const problems = i ? ["deleted_still_active_status", "deleted_holding_positions", "deleted_future_duties", "deleted_with_rights", "orphan_postings"].reduce((s, k) => s + Number(i[k] ?? 0), 0) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" /> Record reconciliation</CardTitle>
        <CardDescription>Find duplicates, stale assignments and orphaned records. Duplicates are listed for review only and are never merged automatically.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {integrity.isLoading ? "Checking integrity…" : i ? (
            <>
              <span>Active {i.active_staff} · Deleted {i.deleted_staff} · Archived {i.archived_records}</span>
              <Badge variant={problems ? "destructive" : "secondary"}>{problems ? `${problems} integrity issue(s)` : "Integrity OK"}</Badge>
            </>
          ) : <span className="text-destructive">Integrity check unavailable</span>}
          <Button size="sm" variant="outline" onClick={() => { issues.refetch(); integrity.refetch(); }}>Re-run checks</Button>
        </div>

        {issues.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No issues found.</p>
        ) : (
          <PagedSection items={rows} searchText={(r) => `${r.staff_id ?? ""} ${r.full_name ?? ""} ${r.issue}`}>
            {(page) => (
              <div className="overflow-x-auto">
                <Table className="min-w-[700px]">
                  <TableHeader><TableRow><TableHead className="w-10" /><TableHead>Issue</TableHead><TableHead>Staff</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {page.map((r, idx) => {
                      const key = r.profile_id ?? "";
                      const fixable = FIXABLE.has(r.issue) && !!r.profile_id;
                      return (
                        <TableRow key={`${r.issue}-${key}-${idx}`}>
                          <TableCell>
                            {fixable && (
                              <Checkbox aria-label="Select for clean-up" checked={selected.has(key)} onCheckedChange={(v) => {
                                const n = new Set(selected); v ? n.add(key) : n.delete(key); setSelected(n);
                              }} />
                            )}
                          </TableCell>
                          <TableCell><Badge variant={FIXABLE.has(r.issue) ? "outline" : "secondary"}>{LABELS[r.issue] ?? r.issue}</Badge></TableCell>
                          <TableCell>{r.full_name || "—"} <span className="text-muted-foreground">{r.staff_id ?? ""}</span></TableCell>
                          <TableCell className="text-sm">{r.detail}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </PagedSection>
        )}

        <div className="space-y-2">
          <Textarea placeholder="Reason for clean-up (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button disabled={busy || reason.trim().length < 4} onClick={apply}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply clean-up ({selected.size} selected + orphaned positions)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
