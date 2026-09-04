import { useState, useEffect, useMemo } from "react";
import { assertContactPhoneList } from "@/lib/ghana-phone";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiContactInput } from "@/components/ui/multi-contact-input";
import { FilterSummaryBar } from "@/components/frontdesk/FilterSummaryBar";
import { ContactPhoneInput } from "@/components/ui/contact-phone-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Edit } from "lucide-react";
import { toast } from "sonner";
import { RecordRowActions } from "@/components/shared/RecordRowActions";
import { format } from "date-fns";
import { createNotification } from "@/lib/notifications";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { FeeInput } from "@/components/ui/fee-input";
import { ApplicationDocuments } from "@/components/applications/ApplicationDocuments";
import { DateInput } from "@/components/ui/date-input";

const STATUSES = ["submitted", "under_review", "approved", "rejected"];
const PERMIT_TYPES = [
  { value: "residence_permit", label: "Residence Permit" },
  { value: "student_permit", label: "Student Permit" },
  { value: "visitors_permit", label: "Visitor's Permit" },
  { value: "work_permit", label: "Work Permit" },
];

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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const PAGE_SIZE = 25;

  // Debounce search input so pagination resets only after the user pauses typing.
  // The query key uses `debouncedSearch`, so keystrokes don't trigger server calls.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const channel = supabase
      .channel("frontdesk-ext-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "visa_extensions" }, () => {
        qc.invalidateQueries({ queryKey: ["visa-extensions"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    applicant_name: "", passport_number: "", current_visa_expiry: "",
    requested_extension_date: "", reason: "", notes: "", status: "submitted",
    phone: "", home_address: "", gender: "", marital_status: "", foreign_address: "",
    date_of_birth: "", next_of_kin: "", emergency_contact: "", street_name: "", nearest_landmark: "",
    nationality: "Ghanaian", permit_type: "", fee_charged: "",
  });

  // Keyset pagination against the Front Desk view, ordered by (created_at DESC, id DESC).
  // Cursor = { created_at, id } of the last row on the previous page.
  type Cursor = { created_at: string; id: string } | null;
  const {
    data: pages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryKey: ["visa-extensions", { search: debouncedSearch, statusFilter }],
    initialPageParam: null as Cursor,
    queryFn: async ({ pageParam }) => {
      let q = (supabase as any)
        .from("front_desk_visa_extensions_view")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE + 1);

      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (debouncedSearch) {
        const term = `%${debouncedSearch}%`;
        q = q.or(`applicant_name.ilike.${term},passport_number.ilike.${term}`);
      }
      if (pageParam) {
        // (created_at, id) < (cursor.created_at, cursor.id) in DESC order
        q = q.or(
          `created_at.lt.${pageParam.created_at},and(created_at.eq.${pageParam.created_at},id.lt.${pageParam.id})`
        );
      }

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const hasMore = rows.length > PAGE_SIZE;
      const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
      const last = items[items.length - 1];
      const nextCursor: Cursor = hasMore && last ? { created_at: last.created_at, id: last.id } : null;
      return { items, nextCursor };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const extensions = useMemo(
    () => (pages?.pages ?? []).flatMap((p) => p.items),
    [pages]
  );


  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        date_of_birth: form.date_of_birth || null,
        phone: assertContactPhoneList(form.phone, "Telephone"),
        emergency_contact: assertContactPhoneList(form.emergency_contact, "Emergency Contact"),
        nationality: form.nationality || null,
        permit_type: form.permit_type || null,
        fee_charged: form.fee_charged === "" ? null : Number(form.fee_charged),
        processed_by: user?.id,
      };

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
    setForm({ applicant_name: "", passport_number: "", current_visa_expiry: "", requested_extension_date: "", reason: "", notes: "", status: "submitted", phone: "", home_address: "", gender: "", marital_status: "", foreign_address: "", date_of_birth: "", next_of_kin: "", emergency_contact: "", street_name: "", nearest_landmark: "", nationality: "Ghanaian", permit_type: "", fee_charged: "" });
    setEditId(null);
    setOpen(false);
  };

  const openEdit = (ext: any) => {
    setForm({
      applicant_name: ext.applicant_name, passport_number: ext.passport_number,
      current_visa_expiry: ext.current_visa_expiry, requested_extension_date: ext.requested_extension_date,
      reason: ext.reason || "", notes: ext.notes || "", status: ext.status,
      phone: ext.phone || "", home_address: ext.home_address || "", gender: ext.gender || "",
      marital_status: ext.marital_status || "", foreign_address: ext.foreign_address || "",
      date_of_birth: ext.date_of_birth || "", next_of_kin: ext.next_of_kin || "",
      emergency_contact: ext.emergency_contact || "", street_name: ext.street_name || "",
      nearest_landmark: ext.nearest_landmark || "",
      nationality: ext.nationality || "Ghanaian", permit_type: ext.permit_type || "",
      fee_charged: ext.fee_charged != null ? String(ext.fee_charged) : "",
    });
    setEditId(ext.id);
    setOpen(true);
  };

  // Filtering is performed server-side via the keyset query above.
  const filtered = extensions;

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
                <div><Label>Date of Birth</Label><DateInput  value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
                <div><Label>Gender</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Marital Status</Label>
                  <Select value={form.marital_status} onValueChange={(v) => setForm({ ...form, marital_status: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="married">Married</SelectItem>
                      <SelectItem value="divorced">Divorced</SelectItem>
                      <SelectItem value="widowed">Widowed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2"><Label>Telephone Number(s)</Label><MultiContactInput mode="list" ghanaAware value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} /></div>
                <div className="col-span-2"><Label>Nationality *</Label><CountryCombobox value={form.nationality} onValueChange={(v) => setForm({ ...form, nationality: v })} required /></div>
                <div><Label>Permit Type *</Label>
                  <Select value={form.permit_type} onValueChange={(v) => setForm({ ...form, permit_type: v })}>
                    <SelectTrigger><SelectValue placeholder="Select permit" /></SelectTrigger>
                    <SelectContent>
                      {PERMIT_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Fee Charged (GHS)</Label>
                  <FeeInput value={form.fee_charged} onValueChange={(v) => setForm({ ...form, fee_charged: v })} />
                </div>
                <div><Label>Current Visa Expiry *</Label><DateInput  value={form.current_visa_expiry} onChange={(e) => setForm({ ...form, current_visa_expiry: e.target.value })} required /></div>
                <div><Label>Requested Extension Date *</Label><DateInput  value={form.requested_extension_date} onChange={(e) => setForm({ ...form, requested_extension_date: e.target.value })} required /></div>
              </div>
              <div><Label>Home Address</Label><Textarea value={form.home_address} onChange={(e) => setForm({ ...form, home_address: e.target.value })} rows={2} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Street Name</Label><Input value={form.street_name} onChange={(e) => setForm({ ...form, street_name: e.target.value })} /></div>
                <div><Label>Nearest Landmark</Label><Input value={form.nearest_landmark} onChange={(e) => setForm({ ...form, nearest_landmark: e.target.value })} /></div>
              </div>
              <div><Label>Foreign Address</Label><Textarea value={form.foreign_address} onChange={(e) => setForm({ ...form, foreign_address: e.target.value })} rows={2} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Next of Kin</Label><Input value={form.next_of_kin} onChange={(e) => setForm({ ...form, next_of_kin: e.target.value })} /></div>
                <div><Label>Emergency Contact (phone)</Label><ContactPhoneInput compact value={form.emergency_contact} onChange={(v) => setForm({ ...form, emergency_contact: v })} aria-label="Emergency contact phone number" /></div>
              </div>
              {editId && (
                <div><Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              {editId && <ApplicationDocuments recordType="visa_extension" recordId={editId} />}
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Submit Request"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table className="min-w-[700px]">
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
                <TableCell>{format(new Date(ext.current_visa_expiry), "dd/MM/yyyy")}</TableCell>
                <TableCell>{format(new Date(ext.requested_extension_date), "dd/MM/yyyy")}</TableCell>
                <TableCell>{statusBadge(ext.status)}</TableCell>
                <TableCell className="text-sm">{format(new Date(ext.created_at), "dd/MM/yyyy")}</TableCell>
                <TableCell>
                  <RecordRowActions
                    kind="visa_extension"
                    table="visa_extensions"
                    record={ext}
                    onEdit={() => openEdit(ext)}
                    invalidateKeys={[["visa-extensions"]]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></CardContent></Card>

      {hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
