import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDirectoryPermissions } from "@/hooks/useDirectoryPermissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, RotateCcw, Search, ShieldAlert, Loader2, Download } from "lucide-react";
import { csvCell } from "@/lib/csv-safe";
import { triggerDownload } from "@/lib/download-utils";
import { logAdminAudit } from "@/lib/admin-audit";
import { DeletionInsightsPanel } from "@/components/staff/DeletionInsightsPanel";
import { StaffReconciliationPanel } from "@/components/staff/StaffReconciliationPanel";

interface DeletedProfile {
  id: string;
  staff_id: string | null;
  first_name: string | null;
  last_name: string | null;
  rank_id: string | null;
  department_id: string | null;
  deleted_at: string | null;
  deletion_reason: string | null;
}

export default function DeletedRecords() {
  const { isAdmin } = useAuth();
  const dirPerms = useDirectoryPermissions();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<DeletedProfile | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<DeletedProfile | null>(null);
  const [purgeReason, setPurgeReason] = useState("");
  const [busy, setBusy] = useState(false);

  const allowed = isAdmin || dirPerms.canDelete;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["deleted-staff-records"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, staff_id, first_name, last_name, rank_id, department_id, deleted_at, deletion_reason")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DeletedProfile[];
    },
  });

  const { data: ranks = [] } = useQuery({
    queryKey: ["ranks-lookup"],
    enabled: allowed,
    queryFn: async () => {
      const { data } = await supabase.from("ranks").select("id, name");
      return data ?? [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-lookup"],
    enabled: allowed,
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name");
      return data ?? [];
    },
  });

  const rankName = useMemo(() => {
    const m = new Map(ranks.map((r: any) => [r.id, r.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [ranks]);

  const deptName = useMemo(() => {
    const m = new Map(departments.map((d: any) => [d.id, d.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [departments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.staff_id, r.first_name, r.last_name, r.deletion_reason]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const fullName = (r: DeletedProfile) =>
    `${r.last_name ?? ""} ${r.first_name ?? ""}`.trim() || "Unnamed record";

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const ids = filtered.map((r) => r.id);
      let events: any[] = [];
      let q = supabase
        .from("system_audit_log")
        .select("action, entity_id, created_at, details")
        .in("action", ["soft_deleted_staff", "restored_staff", "purged_staff"])
        .order("created_at", { ascending: false })
        .limit(2000);
      if (search.trim()) q = q.in("entity_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const { data, error } = await q;
      if (error) throw error;
      events = data ?? [];
      const head = ["Section", "Staff ID", "Name", "Rank", "Department", "Action", "When (UTC)", "Reason"];
      const lines = [head.map(csvCell).join(",")];
      filtered.forEach((r) => lines.push([
        "Deleted record", r.staff_id, fullName(r), rankName(r.rank_id), deptName(r.department_id),
        "soft_deleted", r.deleted_at, r.deletion_reason,
      ].map(csvCell).join(",")));
      events.forEach((e) => lines.push([
        "Activity", e.details?.staff_id, e.details?.name, "", "", e.action, e.created_at, e.details?.reason,
      ].map(csvCell).join(",")));
      const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
      triggerDownload(url, `deleted-records-${new Date().toISOString().slice(0, 10)}.csv`);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      logAdminAudit("deleted_records_report", "exported", { rows: filtered.length, events: events.length, search });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const doRestore = async () => {
    if (!restoreTarget) return;
    setBusy(true);
    const { error } = await supabase.rpc("restore_deleted_staff", { _id: restoreTarget.id });
    setBusy(false);
    if (error) {
      toast({ title: "Restore failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Record restored", description: `${fullName(restoreTarget)} is active again.` });
    setRestoreTarget(null);
    qc.invalidateQueries({ queryKey: ["deleted-staff-records"] });
  };

  const doPurge = async () => {
    if (!purgeTarget) return;
    if (purgeReason.trim().length < 4) {
      toast({ title: "Reason required", description: "Give a reason of at least 4 characters.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("purge_deleted_staff", { _id: purgeTarget.id, _reason: purgeReason.trim() });
    setBusy(false);
    if (error) {
      toast({ title: "Purge refused", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Record purged", description: `${fullName(purgeTarget)} was permanently removed.` });
    setPurgeTarget(null);
    setPurgeReason("");
    qc.invalidateQueries({ queryKey: ["deleted-staff-records"] });
  };

  if (!allowed) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
            <ShieldAlert className="h-5 w-5" />
            You do not have permission to manage deleted staff records.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <DeletionInsightsPanel />
      {isAdmin && <StaffReconciliationPanel />}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Deleted Records
          </CardTitle>
          <CardDescription>
            Staff records that were soft-deleted. Restore returns the record to active use; Purge permanently removes it
            and is refused while the officer appears in protected audit history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              Export CSV
            </Button>
          </div>
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by name, staff ID or reason…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Deleted</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No deleted records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.staff_id ?? "—"}</TableCell>
                      <TableCell className="font-medium">{fullName(r)}</TableCell>
                      <TableCell>{rankName(r.rank_id)}</TableCell>
                      <TableCell>{deptName(r.department_id)}</TableCell>
                      <TableCell className="text-xs">
                        {r.deleted_at ? new Date(r.deleted_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs" title={r.deletion_reason ?? ""}>
                        {r.deletion_reason ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setRestoreTarget(r)}>
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                            Restore
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => { setPurgeTarget(r); setPurgeReason(""); }}>
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Purge
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this record?</AlertDialogTitle>
            <AlertDialogDescription>
              {restoreTarget ? fullName(restoreTarget) : ""} will become visible and active again. You may need to
              re-enable their sign-in separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doRestore} disabled={busy}>
              {busy ? "Restoring…" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!purgeTarget} onOpenChange={(open) => { if (!open) { setPurgeTarget(null); setPurgeReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently purge this record?</DialogTitle>
            <DialogDescription>
              {purgeTarget ? fullName(purgeTarget) : ""} will be permanently removed. This cannot be undone, and the
              purge is refused while the officer appears in protected audit history.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for permanent purge (required)…"
            value={purgeReason}
            onChange={(e) => setPurgeReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPurgeTarget(null); setPurgeReason(""); }} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doPurge} disabled={busy || purgeReason.trim().length < 4}>
              {busy ? "Purging…" : "Purge permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
