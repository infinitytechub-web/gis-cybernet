import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Trash2, RotateCcw, Search, AlertTriangle, FileX2, ShieldAlert, Lock, Eraser,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  emptyRecycleBin, purgeExpiredRecycleBin, purgeRecycleBinEntry, restoreRecycleBinEntry,
} from "@/lib/recycle-bin";

const TABLE_LABELS: Record<string, string> = {
  announcements: "Announcement",
  holidays: "Holiday",
  departments: "Department",
  staff_documents: "Staff Document",
  command_vault_files: "Command Vault File",
  report_uploads: "Report",
  report_schedules: "Report Schedule",
  procurement_documents: "Procurement Document",
  shift_assignments: "Shift Assignment",
  misd_unit_assignments: "MISD Unit Assignment",
  certifications: "Certification",
  equipment_issuance: "Equipment Issuance",
  inventory_items: "Inventory Item",
  inventory_categories: "Inventory Category",
  inventory_suppliers: "Supplier",
  detention_records: "Detention Record",
  enforcement_operations: "Enforcement Operation",
  operations: "Operation",
  cyber_incidents: "Cyber Incident",
  cyber_investigations: "Cyber Investigation",
  cyber_threat_intel: "Threat Intel",
  leave_requests: "Leave Request",
  postings_transfers: "Posting / Transfer",
  visa_applications: "Visa Application",
  visa_extensions: "Visa Extension",
  passport_applications: "Passport Application",
  official_applications: "Official Application",
  enquiry_applications: "Enquiry",
  front_desk_audit_log: "Front Desk Audit",
  night_guard_activity_log: "Night Guard Activity",
  platform_sync_history: "Platform Sync",
};

interface BinRow {
  id: string;
  table_name: string;
  record_id: string;
  display_label: string | null;
  display_context: string | null;
  deleted_by: string | null;
  deleted_by_name: string | null;
  deleted_at: string;
  expires_at: string;
  storage_paths: any;
  snapshot: any;
}

export default function RecycleBin() {
  const { isAdmin, isOic, loading } = useAuth();
  const allowed = isAdmin || isOic;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [confirmRestore, setConfirmRestore] = useState<BinRow | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<BinRow | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [working, setWorking] = useState(false);

  // Auto-purge anything past expiry whenever the page is opened.
  useEffect(() => {
    if (!allowed) return;
    purgeExpiredRecycleBin()
      .then(() => qc.invalidateQueries({ queryKey: ["recycle-bin"] }))
      .catch(() => undefined);
  }, [allowed, qc]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["recycle-bin"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recycle_bin")
        .select("*")
        .is("restored_at", null)
        .is("purged_at", null)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BinRow[];
    },
  });

  const tableOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.table_name));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (tableFilter !== "all" && r.table_name !== tableFilter) return false;
    if (!search) return true;
    const hay = `${r.display_label ?? ""} ${r.display_context ?? ""} ${TABLE_LABELS[r.table_name] ?? r.table_name} ${r.deleted_by_name ?? ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  const stats = useMemo(() => {
    const expiringSoon = rows.filter((r) => {
      const days = (new Date(r.expires_at).getTime() - Date.now()) / 86400000;
      return days <= 7;
    }).length;
    return { total: rows.length, types: tableOptions.length, expiringSoon };
  }, [rows, tableOptions]);

  const doRestore = async () => {
    if (!confirmRestore) return;
    setWorking(true);
    try {
      await restoreRecycleBinEntry(confirmRestore.id);
      toast.success("Item restored");
      setConfirmRestore(null);
      qc.invalidateQueries({ queryKey: ["recycle-bin"] });
    } catch (e: any) {
      toast.error(e.message || "Restore failed");
    } finally {
      setWorking(false);
    }
  };

  const doPurge = async () => {
    if (!confirmPurge) return;
    setWorking(true);
    try {
      await purgeRecycleBinEntry(confirmPurge.id);
      toast.success("Permanently deleted");
      setConfirmPurge(null);
      qc.invalidateQueries({ queryKey: ["recycle-bin"] });
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    } finally {
      setWorking(false);
    }
  };

  const doEmpty = async () => {
    setWorking(true);
    try {
      await emptyRecycleBin();
      toast.success("Recycle bin emptied");
      setConfirmEmpty(false);
      qc.invalidateQueries({ queryKey: ["recycle-bin"] });
    } catch (e: any) {
      toast.error(e.message || "Empty failed");
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
            <Trash2 className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-secondary">Recycle Bin</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 mr-1" />
              Restricted — visible only to Admin and Command OIC. Items auto-delete after 30 days.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="gap-1">
            <FileX2 className="h-3 w-3" /> {stats.total} item{stats.total === 1 ? "" : "s"}
          </Badge>
          {stats.expiringSoon > 0 && (
            <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" /> {stats.expiringSoon} expiring soon
            </Badge>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-lg">Recently Deleted</CardTitle>
              <CardDescription>
                Restore mistakenly deleted items, or remove them permanently.
                File attachments are kept until the item is purged.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmEmpty(true)}
              disabled={rows.length === 0 || working}
            >
              <Eraser className="h-4 w-4 mr-1" /> Empty Bin
            </Button>
          </div>

          <div className="flex gap-2 items-center flex-wrap mt-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, type or who deleted it…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {tableOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TABLE_LABELS[t] ?? t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShieldAlert className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">The recycle bin is empty.</p>
              <p className="text-xs mt-1">Deleted items appear here for 30 days before they are removed for good.</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden md:table-cell">Deleted By</TableHead>
                    <TableHead className="hidden md:table-cell">When</TableHead>
                    <TableHead className="hidden lg:table-cell">Auto-purge</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const expiresIn = formatDistanceToNowStrict(new Date(r.expires_at), { addSuffix: true });
                    const isExpiringSoon = (new Date(r.expires_at).getTime() - Date.now()) / 86400000 <= 7;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="min-w-0">
                            <div className="font-medium truncate max-w-[280px]">
                              {r.display_label || `Untitled (${r.record_id.slice(0, 8)}…)`}
                            </div>
                            {r.display_context && (
                              <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                                {r.display_context}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {TABLE_LABELS[r.table_name] ?? r.table_name}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {r.deleted_by_name || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {format(new Date(r.deleted_at), "dd/MM/yyyy, HH:mm")}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs">
                          <span className={isExpiringSoon ? "text-amber-700 dark:text-amber-300 font-medium" : "text-muted-foreground"}>
                            {expiresIn}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                              onClick={() => setConfirmRestore(r)}
                              disabled={working}
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Restore
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setConfirmPurge(r)}
                              title="Delete permanently"
                              disabled={working}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore confirmation */}
      <AlertDialog open={!!confirmRestore} onOpenChange={(o) => { if (!o && !working) setConfirmRestore(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will put <span className="font-semibold">{confirmRestore?.display_label || "the item"}</span> back into{" "}
              <span className="font-semibold">{TABLE_LABELS[confirmRestore?.table_name ?? ""] ?? confirmRestore?.table_name}</span>
              {" "}with its original details.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doRestore} disabled={working}>
              {working ? "Restoring…" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent delete confirmation */}
      <AlertDialog open={!!confirmPurge} onOpenChange={(o) => { if (!o && !working) setConfirmPurge(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{confirmPurge?.display_label || "This item"}</span> and any attached files
              will be removed for good. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={doPurge}
              disabled={working}
            >
              {working ? "Deleting…" : "Delete forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Empty bin confirmation */}
      <AlertDialog open={confirmEmpty} onOpenChange={(o) => { if (!o && !working) setConfirmEmpty(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty the recycle bin?</AlertDialogTitle>
            <AlertDialogDescription>
              All <span className="font-semibold">{rows.length}</span> item{rows.length === 1 ? "" : "s"} will be
              permanently deleted, along with any attached files. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={doEmpty}
              disabled={working}
            >
              {working ? "Emptying…" : "Empty bin"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
