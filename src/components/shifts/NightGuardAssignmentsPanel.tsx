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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardList, Trash2, RefreshCw, Search, Loader2, ChevronLeft, ChevronRight, Pencil, Check, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ExportMenu } from "@/components/ui/export-menu";

interface Props {
  nightGuardStaff: { id: string; first_name: string; last_name: string; staff_id: string }[];
  allStaff?: { id: string; first_name: string; last_name: string; staff_id: string }[];
  shifts: { id: string; name: string; pattern: string }[];
}

const PAGE_SIZE = 15;

export default function NightGuardAssignmentsPanel({ nightGuardStaff, allStaff = [], shifts }: Props) {
  const queryClient = useQueryClient();
  const [filterDate, setFilterDate] = useState("");
  const [filterGuard, setFilterGuard] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTargetId, setReassignTargetId] = useState("");
  const [reassignComboOpen, setReassignComboOpen] = useState(false);
  const [page, setPage] = useState(0);

  // Edit date state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");

  const staffList = allStaff.length > 0 ? allStaff : nightGuardStaff;
  const nightGuardIds = useMemo(() => nightGuardStaff.map(s => s.id), [nightGuardStaff]);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["night-guard-panel-assignments", filterDate],
    queryFn: async () => {
      let query = supabase
        .from("shift_assignments")
        .select("id, profile_id, shift_id, start_date, end_date, profiles:profile_id(first_name, last_name, staff_id), shifts:shift_id(name)")
        .order("start_date", { ascending: false })
        .limit(500);
      if (filterDate) query = query.eq("start_date", filterDate);
      // If we have night guard IDs, filter by them; otherwise show all
      if (nightGuardIds.length > 0) {
        query = query.in("profile_id", nightGuardIds);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
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
      queryClient.invalidateQueries({ queryKey: ["night-guard-panel-assignments"] });
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
      queryClient.invalidateQueries({ queryKey: ["night-guard-panel-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["night-guard-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      setSelectedIds(new Set());
      setReassignOpen(false);
      setReassignTargetId("");
      toast.success(`${count} assignment${count !== 1 ? "s" : ""} reassigned`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const editDateMutation = useMutation({
    mutationFn: async ({ id, newDate }: { id: string; newDate: string }) => {
      const { error } = await supabase.from("shift_assignments").update({ start_date: newDate, end_date: newDate }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["night-guard-panel-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["night-guard-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["shift-assignments"] });
      setEditingId(null);
      setEditDate("");
      toast.success("Assignment date updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selectedGuard = useMemo(() => staffList.find(g => g.id === reassignTargetId), [staffList, reassignTargetId]);

  // Export helpers
  const buildExportRows = () =>
    filtered.map((a: any) => [
      `${a.profiles?.last_name}, ${a.profiles?.first_name}`,
      a.profiles?.staff_id ?? "",
      a.shifts?.name ?? "—",
      format(new Date(a.start_date + "T00:00:00"), "dd MMM yyyy"),
    ]);

  if (nightGuardStaff.length === 0 && allStaff.length === 0) return null;


  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-[hsl(220,70%,25%)] text-base font-bold">
            <ClipboardList className="h-5 w-5 text-[hsl(220,70%,25%)] stroke-[2.5]" />
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
            <ExportMenu
              disabled={filtered.length === 0}
              getData={() => ({
                title: "Night Guard Assignments",
                filename: `night_guard_assignments${filterDate ? `_${filterDate}` : ""}`,
                headers: ["Guard", "Staff ID", "Shift", "Date"],
                rows: buildExportRows(),
                subtitle: filterDate ? `Date: ${format(new Date(filterDate + "T00:00:00"), "dd MMM yyyy")}` : undefined,
              })}
            />
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
                <TableHead className="text-xs w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((a: any) => (
                <TableRow key={a.id} className={selectedIds.has(a.id) ? "bg-accent/30" : ""}>
                  <TableCell><Checkbox checked={selectedIds.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} /></TableCell>
                  <TableCell className="text-xs">{a.profiles?.last_name}, {a.profiles?.first_name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] font-mono">{a.profiles?.staff_id}</Badge></TableCell>
                  <TableCell className="text-xs">{a.shifts?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {editingId === a.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="date"
                          value={editDate}
                          onChange={e => setEditDate(e.target.value)}
                          className="h-7 w-32 text-xs"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={!editDate || editDateMutation.isPending}
                          onClick={() => editDateMutation.mutate({ id: a.id, newDate: editDate })}
                        >
                          <Check className="h-3 w-3 text-primary" />
                        </Button>
                      </div>
                    ) : (
                      format(new Date(a.start_date + "T00:00:00"), "dd MMM yyyy")
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" title="Edit date" onClick={() => { setEditingId(a.id); setEditDate(a.start_date); }}>
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" title="Reassign" onClick={() => { setSelectedIds(new Set([a.id])); setReassignOpen(true); }}>
                        <RefreshCw className="h-3 w-3 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" title="Delete" onClick={() => { setSelectedIds(new Set([a.id])); setDeleteConfirmOpen(true); }}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

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

      {/* Reassign dialog with combobox search */}
      <Dialog open={reassignOpen} onOpenChange={(v) => { setReassignOpen(v); if (!v) { setReassignTargetId(""); setReassignComboOpen(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reassign {selectedIds.size} Assignment{selectedIds.size !== 1 ? "s" : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Search &amp; select new guard</Label>
              <Popover open={reassignComboOpen} onOpenChange={setReassignComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={reassignComboOpen}
                    className="w-full justify-between h-9 text-sm font-normal"
                  >
                    {selectedGuard
                      ? `${selectedGuard.last_name}, ${selectedGuard.first_name} (${selectedGuard.staff_id})`
                      : "Search by name or staff ID..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Type name or staff ID..." />
                    <CommandList>
                      <CommandEmpty>No staff found.</CommandEmpty>
                      <CommandGroup>
                        {staffList.map((g) => (
                          <CommandItem
                            key={g.id}
                            value={`${g.last_name} ${g.first_name} ${g.staff_id}`}
                            onSelect={() => {
                              setReassignTargetId(reassignTargetId === g.id ? "" : g.id);
                              setReassignComboOpen(false);
                            }}
                            className="flex items-center gap-2"
                          >
                            <Check className={cn("h-4 w-4", reassignTargetId === g.id ? "opacity-100" : "opacity-0")} />
                            <span className="flex-1 truncate">{g.last_name}, {g.first_name}</span>
                            <Badge variant="outline" className="text-[10px] font-mono shrink-0">{g.staff_id}</Badge>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <Button
              onClick={() => reassignMutation.mutate({ ids: Array.from(selectedIds), newProfileId: reassignTargetId })}
              disabled={reassignMutation.isPending || !reassignTargetId}
              className="w-full font-bold"
            >
              {reassignMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Reassigning...</> : "Reassign to Selected Guard"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
