import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSummaryBar } from "@/components/frontdesk/FilterSummaryBar";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Edit } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { createNotification } from "@/lib/notifications";

const PROCESSING_STATUSES = ["submitted", "under_review"];
const ALL_STATUSES = ["submitted", "under_review", "approved", "rejected"];

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    submitted: "bg-blue-100 text-blue-800",
    under_review: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };
  return <Badge className={colors[status] || ""}>{status.replace("_", " ")}</Badge>;
}

export default function ProcessingVisaExtensions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ status: "submitted", notes: "" });

  const { data: extensions = [], isLoading } = useQuery({
    queryKey: ["visa-extensions-processing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visa_extensions")
        .select("*")
        .in("status", PROCESSING_STATUSES)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editId) return;
      const existing = extensions.find((e: any) => e.id === editId);
      const { error } = await supabase.from("visa_extensions")
        .update({ status: form.status, notes: form.notes, processed_by: user?.id })
        .eq("id", editId);
      if (error) throw error;

      if (existing && existing.status !== form.status && (form.status === "approved" || form.status === "rejected")) {
        const { data: roledUsers } = await supabase
          .from("user_roles").select("user_id").in("role", ["admin", "front_desk"]);
        if (roledUsers) {
          const uniqueUserIds = [...new Set(roledUsers.map((r) => r.user_id))];
          await Promise.all(uniqueUserIds.map((uid) =>
            createNotification({
              userId: uid,
              title: `Visa Extension ${form.status === "approved" ? "Approved" : "Rejected"}`,
              message: `Visa extension for ${existing.applicant_name} (${existing.passport_number}) has been ${form.status}.`,
              type: "visa",
              referenceId: editId,
            })
          ));
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visa-extensions-processing"] });
      qc.invalidateQueries({ queryKey: ["visa-extensions"] });
      toast.success("Extension updated");
      setEditId(null);
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openReview = (ext: any) => {
    setForm({ status: ext.status, notes: ext.notes || "" });
    setEditId(ext.id);
    setOpen(true);
  };

  const filtered = extensions.filter((e: any) => {
    const matchesSearch = e.applicant_name.toLowerCase().includes(search.toLowerCase()) ||
      e.passport_number.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const hasActiveFilters = search || statusFilter !== "all";
  const clearAllFilters = () => { setSearch(""); setStatusFilter("all"); };
  const activeFiltersList = [
    ...(search ? [{ label: "Search", value: `"${search}"`, onClear: () => setSearch("") }] : []),
    ...(statusFilter !== "all" ? [{ label: "Status", value: statusFilter.replace("_", " "), onClear: () => setStatusFilter("all") }] : []),
  ];

  return (
    <div className="space-y-4 mt-4">
      {hasActiveFilters && (
        <FilterSummaryBar filters={activeFiltersList} totalResults={filtered.length} onClearAll={clearAllFilters} />
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search extensions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Pending</SelectItem>
            {PROCESSING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ").replace(/^\w/, c => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) setEditId(null); setOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Review Visa Extension</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-3">
            <div><Label>Update Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Processing Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Updating..." : "Update Extension"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Passport</TableHead>
              <TableHead>Current Expiry</TableHead>
              <TableHead>Requested Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No extensions pending processing</TableCell></TableRow>
            ) : filtered.map((ext: any) => (
              <TableRow key={ext.id}>
                <TableCell className="font-medium">{ext.applicant_name}</TableCell>
                <TableCell>{ext.passport_number}</TableCell>
                <TableCell>{format(new Date(ext.current_visa_expiry), "dd MMM yyyy")}</TableCell>
                <TableCell>{format(new Date(ext.requested_extension_date), "dd MMM yyyy")}</TableCell>
                <TableCell>{statusBadge(ext.status)}</TableCell>
                <TableCell className="text-sm">{format(new Date(ext.created_at), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => openReview(ext)} title="Review">
                    <Edit className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></CardContent></Card>
    </div>
  );
}