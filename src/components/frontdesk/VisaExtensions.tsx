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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Edit } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { createNotification } from "@/lib/notifications";

const STATUSES = ["submitted", "under_review", "approved", "rejected"];

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    submitted: "bg-blue-100 text-blue-800",
    under_review: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };
  return <Badge className={colors[status] || ""}>{status.replace("_", " ")}</Badge>;
}

export default function VisaExtensions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    applicant_name: "", passport_number: "", current_visa_expiry: "",
    requested_extension_date: "", reason: "", notes: "", status: "submitted",
  });

  const { data: extensions = [], isLoading } = useQuery({
    queryKey: ["visa-extensions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("visa_extensions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, processed_by: user?.id };

      let previousStatus: string | null = null;
      if (editId) {
        const existing = extensions.find((e: any) => e.id === editId);
        previousStatus = existing?.status ?? null;
        const { error } = await supabase.from("visa_extensions").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("visa_extensions").insert(payload);
        if (error) throw error;
      }

      if (editId && previousStatus !== form.status && (form.status === "approved" || form.status === "rejected")) {
        const { data: roledUsers } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "front_desk"]);

        if (roledUsers) {
          const uniqueUserIds = [...new Set(roledUsers.map((r) => r.user_id))];
          const statusLabel = form.status === "approved" ? "Approved" : "Rejected";
          await Promise.all(
            uniqueUserIds.map((uid) =>
              createNotification({
                userId: uid,
                title: `Visa Extension ${statusLabel}`,
                message: `Visa extension for ${form.applicant_name} (${form.passport_number}) has been ${form.status}.`,
                type: "visa",
                referenceId: editId,
              })
            )
          );
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visa-extensions"] });
      toast.success(editId ? "Extension updated" : "Extension request created");
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => {
    setForm({ applicant_name: "", passport_number: "", current_visa_expiry: "", requested_extension_date: "", reason: "", notes: "", status: "submitted" });
    setEditId(null);
    setOpen(false);
  };

  const openEdit = (ext: any) => {
    setForm({
      applicant_name: ext.applicant_name, passport_number: ext.passport_number,
      current_visa_expiry: ext.current_visa_expiry, requested_extension_date: ext.requested_extension_date,
      reason: ext.reason || "", notes: ext.notes || "", status: ext.status,
    });
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
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ").replace(/^\w/, c => c.toUpperCase())}</SelectItem>)}
          </SelectContent>
        </Select>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); setOpen(v); }}>
          <DialogTrigger asChild>
            <Button className="gap-1"><Plus className="h-4 w-4" /> New Extension</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? "Edit" : "New"} Visa Extension</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Applicant Name *</Label><Input value={form.applicant_name} onChange={(e) => setForm({ ...form, applicant_name: e.target.value })} required /></div>
                <div><Label>Passport Number *</Label><Input value={form.passport_number} onChange={(e) => setForm({ ...form, passport_number: e.target.value })} required /></div>
                <div><Label>Current Visa Expiry *</Label><Input type="date" value={form.current_visa_expiry} onChange={(e) => setForm({ ...form, current_visa_expiry: e.target.value })} required /></div>
                <div><Label>Requested Extension Date *</Label><Input type="date" value={form.requested_extension_date} onChange={(e) => setForm({ ...form, requested_extension_date: e.target.value })} required /></div>
              </div>
              <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} /></div>
              {editId && (
                <div><Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Submit Request"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Passport</TableHead>
              <TableHead>Current Expiry</TableHead>
              <TableHead>Requested Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No extensions found</TableCell></TableRow>
            ) : filtered.map((ext: any) => (
              <TableRow key={ext.id}>
                <TableCell className="font-medium">{ext.applicant_name}</TableCell>
                <TableCell>{ext.passport_number}</TableCell>
                <TableCell>{format(new Date(ext.current_visa_expiry), "dd MMM yyyy")}</TableCell>
                <TableCell>{format(new Date(ext.requested_extension_date), "dd MMM yyyy")}</TableCell>
                <TableCell>{statusBadge(ext.status)}</TableCell>
                <TableCell className="text-sm">{format(new Date(ext.created_at), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(ext)}>
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
