import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Eye, Edit } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { createNotification } from "@/lib/notifications";

const VISA_TYPES = ["tourist", "business", "work", "transit", "student", "diplomatic"];
const STATUSES = ["submitted", "under_review", "approved", "rejected", "collected"];

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    submitted: "bg-blue-100 text-blue-800",
    under_review: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    collected: "bg-gray-100 text-gray-800",
  };
  return <Badge className={colors[status] || ""}>{status.replace("_", " ")}</Badge>;
}

export default function VisaApplications() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    applicant_name: "", passport_number: "", nationality: "", visa_type: "tourist",
    purpose: "", entry_date: "", exit_date: "", notes: "", status: "submitted",
  });

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["visa-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visa_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        entry_date: form.entry_date || null,
        exit_date: form.exit_date || null,
        processed_by: user?.id,
      };

      // Detect status change for notifications
      let previousStatus: string | null = null;
      if (editId) {
        const existing = applications.find((a: any) => a.id === editId);
        previousStatus = existing?.status ?? null;
        const { error } = await supabase.from("visa_applications").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("visa_applications").insert(payload);
        if (error) throw error;
      }

      // Send in-app notifications to all admins & front_desk users when status changes to approved/rejected
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
                title: `Visa Application ${statusLabel}`,
                message: `Visa application for ${form.applicant_name} (${form.passport_number}) has been ${form.status}.`,
                type: "visa",
                referenceId: editId,
              })
            )
          );
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visa-applications"] });
      toast.success(editId ? "Application updated" : "Application created");
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => {
    setForm({ applicant_name: "", passport_number: "", nationality: "", visa_type: "tourist", purpose: "", entry_date: "", exit_date: "", notes: "", status: "submitted" });
    setEditId(null);
    setOpen(false);
  };

  const openEdit = (app: any) => {
    setForm({
      applicant_name: app.applicant_name, passport_number: app.passport_number,
      nationality: app.nationality, visa_type: app.visa_type,
      purpose: app.purpose || "", entry_date: app.entry_date || "",
      exit_date: app.exit_date || "", notes: app.notes || "", status: app.status,
    });
    setEditId(app.id);
    setOpen(true);
  };

  const filtered = applications.filter((a: any) =>
    a.applicant_name.toLowerCase().includes(search.toLowerCase()) ||
    a.passport_number.toLowerCase().includes(search.toLowerCase())
  );

  const summary = {
    total: applications.length,
    submitted: applications.filter((a: any) => a.status === "submitted").length,
    approved: applications.filter((a: any) => a.status === "approved").length,
    rejected: applications.filter((a: any) => a.status === "rejected").length,
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: summary.total, color: "text-primary" },
          { label: "Submitted", value: summary.submitted, color: "text-blue-600" },
          { label: "Approved", value: summary.approved, color: "text-green-600" },
          { label: "Rejected", value: summary.rejected, color: "text-red-600" },
        ].map((s) => (
          <Card key={s.label}><CardContent className="p-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </CardContent></Card>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or passport..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); setOpen(v); }}>
          <DialogTrigger asChild>
            <Button className="gap-1"><Plus className="h-4 w-4" /> New Application</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editId ? "Edit" : "New"} Visa Application</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Applicant Name *</Label><Input value={form.applicant_name} onChange={(e) => setForm({ ...form, applicant_name: e.target.value })} required /></div>
                <div><Label>Passport Number *</Label><Input value={form.passport_number} onChange={(e) => setForm({ ...form, passport_number: e.target.value })} required /></div>
                <div><Label>Nationality *</Label><Input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} required /></div>
                <div><Label>Visa Type</Label>
                  <Select value={form.visa_type} onValueChange={(v) => setForm({ ...form, visa_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{VISA_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Entry Date</Label><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></div>
                <div><Label>Exit Date</Label><Input type="date" value={form.exit_date} onChange={(e) => setForm({ ...form, exit_date: e.target.value })} /></div>
              </div>
              <div><Label>Purpose</Label><Textarea value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} rows={2} /></div>
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
                {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Submit Application"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Passport</TableHead>
                  <TableHead>Nationality</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No visa applications found</TableCell></TableRow>
                ) : filtered.map((app: any) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">{app.applicant_name}</TableCell>
                    <TableCell>{app.passport_number}</TableCell>
                    <TableCell>{app.nationality}</TableCell>
                    <TableCell><Badge variant="outline">{app.visa_type}</Badge></TableCell>
                    <TableCell>{statusBadge(app.status)}</TableCell>
                    <TableCell className="text-sm">{format(new Date(app.created_at), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(app)}>
                        <Edit className="h-4 w-4" />
                      </Button>
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
