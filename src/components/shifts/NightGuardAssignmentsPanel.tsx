import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardList, Trash2, RefreshCw, Search, Loader2, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface Props {
  nightGuardStaff: { id: string; first_name: string; last_name: string; staff_id: string }[];
  shifts: { id: string; name: string; pattern: string }[];
}

const PAGE_SIZE = 15;

export default function NightGuardAssignmentsPanel({ nightGuardStaff, shifts }: Props) {
  const queryClient = useQueryClient();
  const [filterDate, setFilterDate] = useState("");
  const [filterGuard, setFilterGuard] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTargetId, setReassignTargetId] = useState("");
  const [reassignSearch, setReassignSearch] = useState("");
  const [page, setPage] = useState(0);

  const nightGuardIds = useMemo(() => nightGuardStaff.map(s => s.id), [nightGuardStaff]);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["night-guard-assignments", filterDate],
    queryFn: async () => {
      if (nightGuardIds.length === 0) return [];
      let query = supabase
        .from("shift_assignments")
        .select("id, profile_id, shift_id, start_date, end_date, profiles:profile_id(first_name, last_name, staff_id), shifts:shift_id(name)")
        .in("profile_id", nightGuardIds)
        .order("start_date", { ascending: false })
        .limit(500);
      if (filterDate) query = query.eq("start_date", filterDate);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: nightGuardIds.length > 0,
  });

  const filtered = useMemo(() => {
    if (!filterGuard.trim()) return assignments;
    const q = filterGuard.toLowerCase();
    return assignments.filter((a: any) => {
      const p = a.profiles;
      return p?.first_name?.toLowerCase().includes(q) ||
        p?.last_name?.toLowerCase().includes(q) ||
        p?.staff_id?.toLowerCase().includes(q);
    });
  }, [assignments, filterGuard]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // Reset page when filters change
  useMemo(() => { setPage(0); }, [filterDate, filterGuard]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((a: any) => a.id)));
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("shift_assignments").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["night-guard-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      setSelectedIds(new Set());
      setDeleteConfirmOpen(false);
      toast.success(`${count} assignment${count !== 1 ? "s" : ""} removed`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reassignMutation = useMutation({
    mutationFn: async ({ ids, newProfileId }: { ids: string[]; newProfileId: string }) => {
      let updated = 0;
      for (const id of ids) {
        const { error } = await supabase.from("shift_assignments").update({ profile_id: newProfileId }).eq("id", id);
        if (error) throw error;
        updated++;
      }
      return updated;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["night-guard-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      setSelectedIds(new Set());
      setReassignOpen(false);
      setReassignTargetId("");
      setReassignSearch("");
      toast.success(`${count} assignment${count !== 1 ? "s" : ""} reassigned`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredReassignGuards = useMemo(() => {
    if (!reassignSearch.trim()) return nightGuardStaff;
    const q = reassignSearch.toLowerCase();
    return nightGuardStaff.filter(p =>
      p.first_name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q) ||
      p.staff_id.toLowerCase().includes(q)
    );
  }, [nightGuardStaff, reassignSearch]);

  // Export helpers
  const buildExportRows = () =>
    filtered.map((a: any) => [
      `${a.profiles?.last_name}, ${a.profiles?.first_name}`,
      a.profiles?.staff_id ?? "",
      a.shifts?.name ?? "—",
      format(new Date(a.start_date + "T00:00:00"), "dd MMM yyyy"),
    ]);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Night Guard Assignments", 14, 16);
    if (filterDate) doc.setFontSize(10), doc.text(`Date: ${format(new Date(filterDate + "T00:00:00"), "dd MMM yyyy")}`, 14, 23);
    autoTable(doc, {
      head: [["Guard", "Staff ID", "Shift", "Date"]],
      body: buildExportRows(),
      startY: filterDate ? 28 : 22,
    });
    doc.save(`night_guard_assignments${filterDate ? `_${filterDate}` : ""}.pdf`);
    toast.success("PDF downloaded");
  };

  const exportCSV = () => {
    const header = ["Guard", "Staff ID", "Shift", "Date"];
    const rows = [header, ...buildExportRows()];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `night_guard_assignments${filterDate ? `_${filterDate}` : ""}.csv`;
    a.click();
    toast.success("CSV downloaded");
  };

  if (nightGuardStaff.length === 0) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-secondary text-base">
            <ClipboardList className="h-5 w-5 text-primary" />
            Night Guard Assignments
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            {selectedIds.size > 0 && (
              <>
                <Button variant="outline" size="sm" className="gap-1 text-primary" onClick={() => setReassignOpen(true)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Reassign ({selectedIds.size})
                </Button>
                <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={() => setDeleteConfirmOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove ({selectedIds.size})
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1" disabled={filtered.length === 0}>
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={exportPDF}>PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={exportCSV}>CSV</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-3 flex-wrap">
          <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-40 h-8 text-xs" placeholder="Filter by date" />
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search guard..." value={filterGuard} onChange={e => setFilterGuard(e.target.value)} className="pl-7 h-8 text-xs" />
          </div>
          {filterDate && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilterDate("")}>Clear date</Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">No assignments found</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="text-xs">Guard</TableHead>
                <TableHead className="text-xs">Staff ID</TableHead>
                <TableHead className="text-xs">Shift</TableHead>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((a: any) => (
                <TableRow key={a.id} className={selectedIds.has(a.id) ? "bg-accent/30" : ""}>
                  <TableCell><Checkbox checked={selectedIds.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} /></TableCell>
                  <TableCell className="text-xs">{a.profiles?.last_name}, {a.profiles?.first_name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] font-mono">{a.profiles?.staff_id}</Badge></TableCell>
                  <TableCell className="text-xs">{a.shifts?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{format(new Date(a.start_date + "T00:00:00"), "dd MMM yyyy")}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setSelectedIds(new Set([a.id])); setReassignOpen(true); }}>
                        <RefreshCw className="h-3 w-3 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setSelectedIds(new Set([a.id])); setDeleteConfirmOpen(true); }}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Pagination + count */}
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">
            {filtered.length} assignment{filtered.length !== 1 ? "s" : ""}
            {filtered.length > PAGE_SIZE && ` · Page ${safePage + 1} of ${totalPages}`}
          </p>
          {totalPages > 1 && (
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selectedIds.size} assignment{selectedIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the selected night guard shift assignments.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(Array.from(selectedIds))} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reassign dialog */}
      <Dialog open={reassignOpen} onOpenChange={(v) => { setReassignOpen(v); if (!v) { setReassignTargetId(""); setReassignSearch(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reassign {selectedIds.size} Assignment{selectedIds.size !== 1 ? "s" : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>New Guard</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name or staff ID..." value={reassignSearch} onChange={e => setReassignSearch(e.target.value)} className="pl-8 h-9 text-sm" />
              </div>
            </div>
            <ScrollArea className="max-h-[200px] rounded-md border p-2">
              <div className="space-y-1">
                {filteredReassignGuards.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No guards match</p>
                ) : (
                  filteredReassignGuards.map(p => (
                    <label key={p.id} className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 cursor-pointer text-sm ${reassignTargetId === p.id ? "bg-accent" : "hover:bg-accent/50"}`} onClick={() => setReassignTargetId(p.id)}>
                      <Checkbox checked={reassignTargetId === p.id} onCheckedChange={() => setReassignTargetId(reassignTargetId === p.id ? "" : p.id)} />
                      <span className="truncate flex-1">{p.last_name}, {p.first_name}</span>
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0">{p.staff_id}</Badge>
                    </label>
                  ))
                )}
              </div>
            </ScrollArea>
            <Button
              onClick={() => reassignMutation.mutate({ ids: Array.from(selectedIds), newProfileId: reassignTargetId })}
              disabled={reassignMutation.isPending || !reassignTargetId}
              className="w-full font-bold"
            >
              {reassignMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Reassigning...</> : `Reassign to Selected Guard`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
