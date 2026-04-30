import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { softDelete } from "@/lib/recycle-bin";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StaffCombobox } from "@/components/ui/staff-combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { FileText, Wrench, Award, Plus, Pencil, Trash2, AlertTriangle, CheckCircle2, Clock, Search } from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import { toast } from "sonner";
import { ComplianceFileInput, FileLinkButton, type ComplianceFile } from "@/components/compliance/ComplianceFileInput";
import { ComplianceBulkUploadDialog } from "@/components/compliance/ComplianceBulkUploadDialog";
import { ComplianceBulkAuditDialog } from "@/components/compliance/ComplianceBulkAuditDialog";
import { Upload } from "lucide-react";

function getExpiryBadge(expiryDate: string | null) {
  if (!expiryDate) return <Badge variant="outline" className="text-xs">No expiry</Badge>;
  const days = differenceInDays(new Date(expiryDate), new Date());
  if (days < 0) return <Badge variant="destructive" className="text-xs">Expired</Badge>;
  if (days <= 30) return <Badge className="bg-amber-100 text-amber-800 text-xs">Expires in {days}d</Badge>;
  if (days <= 90) return <Badge className="bg-yellow-100 text-yellow-800 text-xs">{days}d left</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 text-xs">Valid</Badge>;
}

const EMPTY_FILE: ComplianceFile = { file_path: null, file_name: null, file_size: null, file_type: null };

// Hook: current user's own profile id (for self-service uploads)
function useOwnProfileId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["own-profile-id", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return (data?.id as string) ?? null;
    },
  });
}

// ─── Documents Tab ───
function DocumentsTab() {
  const { isAdmin } = useAuth();
  const { data: ownProfileId } = useOwnProfileId();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [profileId, setProfileId] = useState("");
  const [docType, setDocType] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [authority, setAuthority] = useState("");
  const [notes, setNotes] = useState("");
  const [fileMeta, setFileMeta] = useState<ComplianceFile>(EMPTY_FILE);
  const [uploading, setUploading] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["staff-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_documents")
        .select("*, profiles(first_name, last_name, staff_id, user_id)")
        .order("expiry_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, first_name, last_name, staff_id").eq("status", "active").order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const docTypes = ["Passport", "National ID", "Service ID", "Visa", "Work Permit", "Driver's License", "Medical Certificate", "Other"];

  const canManageRow = (row: any) =>
    isAdmin || (ownProfileId && row.profile_id === ownProfileId);

  const openCreate = () => {
    setEditing(null);
    setProfileId(isAdmin ? "" : (ownProfileId ?? ""));
    setDocType(""); setDocNumber(""); setIssueDate(""); setExpiryDate(""); setAuthority(""); setNotes("");
    setFileMeta(EMPTY_FILE);
    setDialogOpen(true);
  };

  const openEdit = (d: any) => {
    setEditing(d); setProfileId(d.profile_id); setDocType(d.document_type); setDocNumber(d.document_number || "");
    setIssueDate(d.issue_date || ""); setExpiryDate(d.expiry_date || ""); setAuthority(d.issuing_authority || ""); setNotes(d.notes || "");
    setFileMeta({
      file_path: d.file_path ?? null,
      file_name: d.file_name ?? null,
      file_size: d.file_size ?? null,
      file_type: d.file_type ?? null,
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profileId || !docType) throw new Error("Staff and document type required");
      // Non-admins can only save records on their own profile
      if (!isAdmin && profileId !== ownProfileId) throw new Error("You can only manage your own documents");
      const status = expiryDate && isPast(new Date(expiryDate)) ? "expired" : "valid";
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
        profile_id: profileId,
        document_type: docType,
        document_number: docNumber || null,
        issue_date: issueDate || null,
        expiry_date: expiryDate || null,
        issuing_authority: authority || null,
        status,
        notes: notes || null,
        file_path: fileMeta.file_path,
        file_name: fileMeta.file_name,
        file_size: fileMeta.file_size,
        file_type: fileMeta.file_type,
        uploaded_by: fileMeta.file_path ? user?.id ?? null : null,
      };
      if (editing) {
        const { error } = await supabase.from("staff_documents").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("staff_documents").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["staff-documents"] }); setDialogOpen(false); toast.success(editing ? "Document updated" : "Document added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: any) => {
      if (row.file_path) {
        await supabase.storage.from("staff-documents").remove([row.file_path]).catch(() => {});
      }
      await softDelete({ table: "staff_documents", id: row.id, label: "Staff document" });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["staff-documents"] }); toast.success("Document deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const expiring = documents.filter((d: any) => d.expiry_date && differenceInDays(new Date(d.expiry_date), new Date()) <= 30 && differenceInDays(new Date(d.expiry_date), new Date()) >= 0).length;
  const expired = documents.filter((d: any) => d.expiry_date && isPast(new Date(d.expiry_date))).length;

  const filtered = documents.filter((d: any) => {
    const q = search.toLowerCase();
    const name = `${d.profiles?.last_name} ${d.profiles?.first_name} ${d.profiles?.staff_id} ${d.document_type}`.toLowerCase();
    return !search || name.includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20"><CardContent className="p-4 flex items-center gap-3"><FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" /><div><div className="text-2xl font-bold">{documents.length}</div><div className="text-xs text-muted-foreground">Total Documents</div></div></CardContent></Card>
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20"><CardContent className="p-4 flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" /><div><div className="text-2xl font-bold">{expiring}</div><div className="text-xs text-muted-foreground">Expiring Soon</div></div></CardContent></Card>
        <Card className="border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-950/20"><CardContent className="p-4 flex items-center gap-3"><Clock className="h-8 w-8 text-red-600 dark:text-red-400" /><div><div className="text-2xl font-bold">{expired}</div><div className="text-xs text-muted-foreground">Expired</div></div></CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search staff or document type..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" onClick={() => setBulkOpen(true)} className="gap-1" disabled={!isAdmin && !ownProfileId}>
          <Upload className="h-4 w-4" /> Bulk upload
        </Button>
        <Button onClick={openCreate} className="gap-1" disabled={!isAdmin && !ownProfileId}>
          <Plus className="h-4 w-4" /> Add Document
        </Button>
      </div>

      <ComplianceBulkUploadDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        kind="documents"
        isAdmin={isAdmin}
        ownProfileId={ownProfileId ?? null}
        profiles={profiles as any}
      />

      {isLoading ? <div className="text-center py-8 text-muted-foreground">Loading...</div> : (
        <div className="rounded-lg border overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden sm:table-cell">Number</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>File</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No documents found</TableCell></TableRow>
              ) : filtered.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell><div className="font-medium text-sm">{d.profiles?.last_name}, {d.profiles?.first_name}</div><div className="text-xs text-muted-foreground">{d.profiles?.staff_id}</div></TableCell>
                  <TableCell className="text-sm">{d.document_type}</TableCell>
                  <TableCell className="hidden sm:table-cell text-xs">{d.document_number || "—"}</TableCell>
                  <TableCell className="text-xs">{d.expiry_date ? format(new Date(d.expiry_date), "dd MMM yyyy") : "N/A"}</TableCell>
                  <TableCell>{getExpiryBadge(d.expiry_date)}</TableCell>
                  <TableCell><FileLinkButton filePath={d.file_path} fileName={d.file_name} /></TableCell>
                  <TableCell>
                    {canManageRow(d) ? (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete document?</AlertDialogTitle><AlertDialogDescription>This will permanently remove this document record{d.file_path ? " and the attached file" : ""}.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(d)}>Delete</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Document" : "Add Document"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Staff Member</Label>
              {isAdmin ? (
                <StaffCombobox staff={profiles as any} value={profileId} onValueChange={setProfileId} />
              ) : (
                <Input
                  value={(() => {
                    const p: any = (profiles as any[]).find((x) => x.id === profileId);
                    return p ? `${p.last_name}, ${p.first_name} (${p.staff_id})` : "Yourself";
                  })()}
                  disabled
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Document Type</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{docTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Document Number</Label><Input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} placeholder="e.g. G12345678" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Issue Date</Label><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
              <div><Label>Expiry Date</Label><Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div>
            </div>
            <div><Label>Issuing Authority</Label><Input value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="e.g. Ghana Immigration Service" /></div>
            <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
            <ComplianceFileInput
              profileId={profileId}
              subfolder="documents"
              value={fileMeta}
              onChange={setFileMeta}
              uploading={uploading}
              setUploading={setUploading}
            />
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || uploading || !profileId || !docType} className="w-full">{saveMutation.isPending ? "Saving..." : editing ? "Update" : "Add Document"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Equipment Tab ───
function EquipmentTab() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [profileId, setProfileId] = useState("");
  const [equipName, setEquipName] = useState("");
  const [serial, setSerial] = useState("");
  const [issuedDate, setIssuedDate] = useState("");
  const [returnedDate, setReturnedDate] = useState("");
  const [condition, setCondition] = useState("good");
  const [notes, setNotes] = useState("");

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ["equipment-issuance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_issuance")
        .select("*, profiles(first_name, last_name, staff_id)")
        .order("issued_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, first_name, last_name, staff_id").eq("status", "active").order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const conditions = ["new", "good", "fair", "poor", "damaged"];

  const openCreate = () => {
    setEditing(null); setProfileId(""); setEquipName(""); setSerial(""); setIssuedDate(""); setReturnedDate(""); setCondition("good"); setNotes("");
    setDialogOpen(true);
  };

  const openEdit = (e: any) => {
    setEditing(e); setProfileId(e.profile_id); setEquipName(e.equipment_name); setSerial(e.serial_number || "");
    setIssuedDate(e.issued_date); setReturnedDate(e.returned_date || ""); setCondition(e.condition); setNotes(e.notes || "");
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profileId || !equipName) throw new Error("Staff and equipment name required");
      const payload = { profile_id: profileId, equipment_name: equipName, serial_number: serial || null, issued_date: issuedDate || new Date().toISOString().split("T")[0], returned_date: returnedDate || null, condition, notes: notes || null };
      if (editing) {
        const { error } = await supabase.from("equipment_issuance").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("equipment_issuance").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["equipment-issuance"] }); setDialogOpen(false); toast.success(editing ? "Equipment updated" : "Equipment issued"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await softDelete({ table: "equipment_issuance", id, label: "Equipment issuance" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["equipment-issuance"] }); toast.success("Record deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const issued = equipment.filter((e: any) => !e.returned_date).length;

  const conditionColor = (c: string) => {
    switch (c) { case "new": case "good": return "bg-emerald-100 text-emerald-800"; case "fair": return "bg-amber-100 text-amber-800"; default: return "bg-red-100 text-red-800"; }
  };

  const filtered = equipment.filter((e: any) => {
    const q = search.toLowerCase();
    const text = `${e.profiles?.last_name} ${e.profiles?.first_name} ${e.equipment_name} ${e.serial_number}`.toLowerCase();
    return !search || text.includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/20"><CardContent className="p-4 flex items-center gap-3"><Wrench className="h-8 w-8 text-indigo-600 dark:text-indigo-400" /><div><div className="text-2xl font-bold">{equipment.length}</div><div className="text-xs text-muted-foreground">Total Records</div></div></CardContent></Card>
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20"><CardContent className="p-4 flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" /><div><div className="text-2xl font-bold">{issued}</div><div className="text-xs text-muted-foreground">Currently Issued</div></div></CardContent></Card>
        <Card className="border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20"><CardContent className="p-4 flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" /><div><div className="text-2xl font-bold">{equipment.length - issued}</div><div className="text-xs text-muted-foreground">Returned</div></div></CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search staff or equipment..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {isAdmin && <Button onClick={openCreate} className="gap-1"><Plus className="h-4 w-4" /> Issue Equipment</Button>}
      </div>

      {isLoading ? <div className="text-center py-8 text-muted-foreground">Loading...</div> : (
        <div className="rounded-lg border overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead className="hidden sm:table-cell">Serial No.</TableHead>
                <TableHead className="hidden sm:table-cell">Issued</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="w-[80px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-muted-foreground py-8">No equipment records</TableCell></TableRow>
              ) : filtered.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell><div className="font-medium text-sm">{e.profiles?.last_name}, {e.profiles?.first_name}</div><div className="text-xs text-muted-foreground">{e.profiles?.staff_id}</div></TableCell>
                  <TableCell className="font-medium text-sm">{e.equipment_name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-xs">{e.serial_number || "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell text-xs">{format(new Date(e.issued_date), "dd MMM yyyy")}</TableCell>
                  <TableCell><Badge variant="secondary" className={`text-xs ${conditionColor(e.condition)}`}>{e.condition}</Badge></TableCell>
                  <TableCell><Badge variant={e.returned_date ? "outline" : "default"} className="text-xs">{e.returned_date ? "Returned" : "Issued"}</Badge></TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete record?</AlertDialogTitle><AlertDialogDescription>This will permanently remove this equipment record.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(e.id)}>Delete</AlertDialogAction></AlertDialogFooter>
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
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Equipment Record" : "Issue Equipment"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Staff Member</Label>
              <StaffCombobox staff={profiles as any} value={profileId} onValueChange={setProfileId} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Equipment Name</Label><Input value={equipName} onChange={(e) => setEquipName(e.target.value)} placeholder="e.g. Body Camera" /></div>
              <div><Label>Serial Number</Label><Input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="e.g. BC-001" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Issued Date</Label><Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} /></div>
              <div><Label>Returned Date</Label><Input type="date" value={returnedDate} onChange={(e) => setReturnedDate(e.target.value)} /></div>
            </div>
            <div><Label>Condition</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{conditions.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !profileId || !equipName} className="w-full">{saveMutation.isPending ? "Saving..." : editing ? "Update" : "Issue Equipment"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Certifications Tab ───
function CertificationsTab() {
  const { isAdmin } = useAuth();
  const { data: ownProfileId } = useOwnProfileId();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [profileId, setProfileId] = useState("");
  const [certName, setCertName] = useState("");
  const [issuingBody, setIssuingBody] = useState("");
  const [dateObtained, setDateObtained] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [fileMeta, setFileMeta] = useState<ComplianceFile>(EMPTY_FILE);
  const [uploading, setUploading] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const { data: certifications = [], isLoading } = useQuery({
    queryKey: ["certifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certifications")
        .select("*, profiles(first_name, last_name, staff_id, user_id)")
        .order("expiry_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, first_name, last_name, staff_id").eq("status", "active").order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const canManageRow = (row: any) =>
    isAdmin || (ownProfileId && row.profile_id === ownProfileId);

  const openCreate = () => {
    setEditing(null);
    setProfileId(isAdmin ? "" : (ownProfileId ?? ""));
    setCertName(""); setIssuingBody(""); setDateObtained(""); setExpiryDate(""); setCertNumber(""); setNotes("");
    setFileMeta(EMPTY_FILE);
    setDialogOpen(true);
  };

  const openEdit = (c: any) => {
    setEditing(c); setProfileId(c.profile_id); setCertName(c.certification_name); setIssuingBody(c.issuing_body || "");
    setDateObtained(c.date_obtained || ""); setExpiryDate(c.expiry_date || ""); setCertNumber(c.certificate_number || ""); setNotes(c.notes || "");
    setFileMeta({
      file_path: (c as any).file_path ?? null,
      file_name: (c as any).file_name ?? null,
      file_size: (c as any).file_size ?? null,
      file_type: (c as any).file_type ?? null,
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profileId || !certName) throw new Error("Staff and certification name required");
      if (!isAdmin && profileId !== ownProfileId) throw new Error("You can only manage your own certifications");
      const status = expiryDate && isPast(new Date(expiryDate)) ? "expired" : "valid";
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
        profile_id: profileId,
        certification_name: certName,
        issuing_body: issuingBody || null,
        date_obtained: dateObtained || null,
        expiry_date: expiryDate || null,
        certificate_number: certNumber || null,
        status,
        notes: notes || null,
        file_path: fileMeta.file_path,
        file_name: fileMeta.file_name,
        file_size: fileMeta.file_size,
        file_type: fileMeta.file_type,
        uploaded_by: fileMeta.file_path ? user?.id ?? null : null,
      };
      if (editing) {
        const { error } = await supabase.from("certifications").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("certifications").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["certifications"] }); setDialogOpen(false); toast.success(editing ? "Certification updated" : "Certification added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: any) => {
      if (row.file_path) {
        await supabase.storage.from("staff-documents").remove([row.file_path]).catch(() => {});
      }
      await softDelete({ table: "certifications", id: row.id, label: "Certification" });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["certifications"] }); toast.success("Certification deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const expiring = certifications.filter((c: any) => c.expiry_date && differenceInDays(new Date(c.expiry_date), new Date()) <= 30 && differenceInDays(new Date(c.expiry_date), new Date()) >= 0).length;
  const expired = certifications.filter((c: any) => c.expiry_date && isPast(new Date(c.expiry_date))).length;

  const filtered = certifications.filter((c: any) => {
    const q = search.toLowerCase();
    const text = `${c.profiles?.last_name} ${c.profiles?.first_name} ${c.certification_name}`.toLowerCase();
    return !search || text.includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20"><CardContent className="p-4 flex items-center gap-3"><Award className="h-8 w-8 text-purple-600 dark:text-purple-400" /><div><div className="text-2xl font-bold">{certifications.length}</div><div className="text-xs text-muted-foreground">Total Certs</div></div></CardContent></Card>
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20"><CardContent className="p-4 flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" /><div><div className="text-2xl font-bold">{expiring}</div><div className="text-xs text-muted-foreground">Expiring Soon</div></div></CardContent></Card>
        <Card className="border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-950/20"><CardContent className="p-4 flex items-center gap-3"><Clock className="h-8 w-8 text-red-600 dark:text-red-400" /><div><div className="text-2xl font-bold">{expired}</div><div className="text-xs text-muted-foreground">Expired</div></div></CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search staff or certification..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" onClick={() => setBulkOpen(true)} className="gap-1" disabled={!isAdmin && !ownProfileId}>
          <Upload className="h-4 w-4" /> Bulk upload
        </Button>
        <Button onClick={openCreate} className="gap-1" disabled={!isAdmin && !ownProfileId}>
          <Plus className="h-4 w-4" /> Add Certification
        </Button>
      </div>

      <ComplianceBulkUploadDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        kind="certifications"
        isAdmin={isAdmin}
        ownProfileId={ownProfileId ?? null}
        profiles={profiles as any}
      />

      {isLoading ? <div className="text-center py-8 text-muted-foreground">Loading...</div> : (
        <div className="rounded-lg border overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Certification</TableHead>
                <TableHead className="hidden sm:table-cell">Issuing Body</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>File</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No certifications found</TableCell></TableRow>
              ) : filtered.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell><div className="font-medium text-sm">{c.profiles?.last_name}, {c.profiles?.first_name}</div><div className="text-xs text-muted-foreground">{c.profiles?.staff_id}</div></TableCell>
                  <TableCell className="font-medium text-sm">{c.certification_name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-xs">{c.issuing_body || "—"}</TableCell>
                  <TableCell className="text-xs">{c.expiry_date ? format(new Date(c.expiry_date), "dd MMM yyyy") : "N/A"}</TableCell>
                  <TableCell>{getExpiryBadge(c.expiry_date)}</TableCell>
                  <TableCell><FileLinkButton filePath={(c as any).file_path} fileName={(c as any).file_name} /></TableCell>
                  <TableCell>
                    {canManageRow(c) ? (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete certification?</AlertDialogTitle><AlertDialogDescription>This will permanently remove this certification record{(c as any).file_path ? " and the attached file" : ""}.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(c)}>Delete</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Certification" : "Add Certification"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Staff Member</Label>
              {isAdmin ? (
                <StaffCombobox staff={profiles as any} value={profileId} onValueChange={setProfileId} />
              ) : (
                <Input
                  value={(() => {
                    const p: any = (profiles as any[]).find((x) => x.id === profileId);
                    return p ? `${p.last_name}, ${p.first_name} (${p.staff_id})` : "Yourself";
                  })()}
                  disabled
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Certification Name</Label><Input value={certName} onChange={(e) => setCertName(e.target.value)} placeholder="e.g. First Aid" /></div>
              <div><Label>Certificate Number</Label><Input value={certNumber} onChange={(e) => setCertNumber(e.target.value)} /></div>
            </div>
            <div><Label>Issuing Body</Label><Input value={issuingBody} onChange={(e) => setIssuingBody(e.target.value)} placeholder="e.g. Ghana Red Cross" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date Obtained</Label><Input type="date" value={dateObtained} onChange={(e) => setDateObtained(e.target.value)} /></div>
              <div><Label>Expiry Date</Label><Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
            <ComplianceFileInput
              profileId={profileId}
              subfolder="certifications"
              value={fileMeta}
              onChange={setFileMeta}
              uploading={uploading}
              setUploading={setUploading}
            />
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || uploading || !profileId || !certName} className="w-full">{saveMutation.isPending ? "Saving..." : editing ? "Update" : "Add Certification"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ───
export default function Compliance() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-secondary">Compliance Management</h1>
          <p className="text-sm text-muted-foreground">
            Every staff member can upload and manage their own documents and certifications. Admins can manage all records.
          </p>
        </div>
        <ComplianceBulkAuditDialog />
      </div>
      <Tabs defaultValue="documents">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="documents" className="gap-1"><FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Documents</TabsTrigger>
          <TabsTrigger value="equipment" className="gap-1"><Wrench className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /> Equipment</TabsTrigger>
          <TabsTrigger value="certifications" className="gap-1"><Award className="h-4 w-4 text-purple-600 dark:text-purple-400" /> Certifications</TabsTrigger>
        </TabsList>
        <TabsContent value="documents"><DocumentsTab /></TabsContent>
        <TabsContent value="equipment"><EquipmentTab /></TabsContent>
        <TabsContent value="certifications"><CertificationsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
