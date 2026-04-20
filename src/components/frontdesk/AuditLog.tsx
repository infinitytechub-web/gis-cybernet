import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { softDelete } from "@/lib/recycle-bin";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Filter, X, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const PAGE_SIZE = 20;

export default function AuditLog() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  // Filters
  const [filterAction, setFilterAction] = useState("all");
  const [filterEntity, setFilterEntity] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [page, setPage] = useState(0);

  // Edit state
  const [editLog, setEditLog] = useState<any>(null);
  const [editAction, setEditAction] = useState("");
  const [editEntityType, setEditEntityType] = useState("");
  const [editApplicantName, setEditApplicantName] = useState("");
  const [editStatus, setEditStatus] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["front-desk-audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("front_desk_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const filtered = logs.filter((log: any) => {
    if (filterAction !== "all" && log.action !== filterAction) return false;
    if (filterEntity !== "all" && log.entity_type !== filterEntity) return false;
    if (filterDateFrom && new Date(log.created_at) < new Date(filterDateFrom + "T00:00:00")) return false;
    if (filterDateTo && new Date(log.created_at) > new Date(filterDateTo + "T23:59:59")) return false;
    return true;
  });

  const hasActiveFilters = filterAction !== "all" || filterEntity !== "all" || filterDateFrom || filterDateTo;

  const clearFilters = () => {
    setFilterAction("all");
    setFilterEntity("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedLogs = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filters change
  const handleFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(0);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editLog) return;
      const { error } = await supabase
        .from("front_desk_audit_log")
        .update({
          action: editAction,
          entity_type: editEntityType,
          details: { applicant_name: editApplicantName || null, status: editStatus || null },
        })
        .eq("id", editLog.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["front-desk-audit-log"] });
      setEditLog(null);
      toast.success("Audit log updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await softDelete({ table: "front_desk_audit_log", id, label: "Audit log entry" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["front-desk-audit-log"] });
      toast.success("Audit log deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (log: any) => {
    setEditLog(log);
    setEditAction(log.action);
    setEditEntityType(log.entity_type);
    setEditApplicantName(log.details?.applicant_name || "");
    setEditStatus(log.details?.status || "");
  };

  const actionColor = (action: string) => {
    if (action === "create") return "bg-green-100 text-green-800";
    if (action === "update") return "bg-blue-100 text-blue-800";
    if (action === "delete") return "bg-red-100 text-red-800";
    return "";
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" /> Filters
            </div>
            <div className="min-w-[130px]">
              <Label className="text-xs">Action</Label>
              <Select value={filterAction} onValueChange={handleFilterChange(setFilterAction)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="create">Create</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[150px]">
              <Label className="text-xs">Entity Type</Label>
              <Select value={filterEntity} onValueChange={handleFilterChange(setFilterEntity)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="visa_application">Visa Application</SelectItem>
                  <SelectItem value="visa_extension">Visa Extension</SelectItem>
                  <SelectItem value="passport_application">Passport Application</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setPage(0); }} className="h-8 text-xs w-[140px]" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); setPage(0); }} className="h-8 text-xs w-[140px]" min={filterDateFrom} />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1 text-xs">
                <X className="h-3 w-3" /> Clear
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{filtered.length} entries</span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity Type</TableHead>
              <TableHead>Applicant</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin && <TableHead className="w-20">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-8 text-muted-foreground">
                {hasActiveFilters ? "No entries match the current filters" : "No audit entries yet"}
              </TableCell></TableRow>
            ) : paginatedLogs.map((log: any) => (
              <TableRow key={log.id}>
                <TableCell className="text-sm">{format(new Date(log.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                <TableCell><Badge className={actionColor(log.action)}>{log.action}</Badge></TableCell>
                <TableCell><Badge variant="outline">{log.entity_type.replace("_", " ")}</Badge></TableCell>
                <TableCell>{log.details?.applicant_name || "—"}</TableCell>
                <TableCell>{log.details?.status || "—"}</TableCell>
                {isAdmin && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(log)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete audit log entry?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(log.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-xs text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs px-2">Page {page + 1} of {totalPages}</span>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      </CardContent></Card>

      {/* Edit Dialog */}
      <Dialog open={!!editLog} onOpenChange={(o) => !o && setEditLog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Audit Log Entry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Action</Label>
              <Select value={editAction} onValueChange={setEditAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="create">Create</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Entity Type</Label>
              <Select value={editEntityType} onValueChange={setEditEntityType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="visa_application">Visa Application</SelectItem>
                  <SelectItem value="visa_extension">Visa Extension</SelectItem>
                  <SelectItem value="passport_application">Passport Application</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Applicant Name</Label>
              <Input value={editApplicantName} onChange={(e) => setEditApplicantName(e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <Input value={editStatus} onChange={(e) => setEditStatus(e.target.value)} />
            </div>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="w-full">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
