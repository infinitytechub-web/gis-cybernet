import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, Download, Trash2, FileText, Search, Eye, FolderLock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { triggerDownload } from "@/lib/download-utils";
import { softDelete } from "@/lib/recycle-bin";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { BulkActionBar } from "@/components/shared/BulkActionBar";

const DOC_TYPES = [
  { value: "ghana_card", label: "Ghana Card" },
  { value: "passport", label: "Passport" },
  { value: "driver_license", label: "Driver's License" },
  { value: "birth_certificate", label: "Birth Certificate" },
  { value: "academic", label: "Academic Certificate" },
  { value: "professional", label: "Professional Certificate" },
  { value: "medical", label: "Medical Record" },
  { value: "appointment_letter", label: "Appointment Letter" },
  { value: "other", label: "Other" },
];

const STATUS_BADGE: Record<string, string> = {
  valid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  expired: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
};

interface Props {
  profileId: string;
  /** Whether the current viewer can upload/edit (own profile or admin) */
  canManage?: boolean;
}

export function StaffDocumentVault({ profileId, canManage = false }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [meta, setMeta] = useState({
    document_type: "ghana_card",
    document_number: "",
    issue_date: "",
    expiry_date: "",
    issuing_authority: "",
    notes: "",
  });

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["staff-doc-vault", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_documents")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = docs.filter((d: any) => {
    if (typeFilter !== "all" && d.document_type !== typeFilter) return false;
    if (search) {
      const hay = `${d.document_type} ${d.document_number || ""} ${d.file_name || ""} ${d.notes || ""}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const startUpload = useCallback((files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File must be 20 MB or less");
      return;
    }
    setPendingFile(file);
    setMetaOpen(true);
  }, []);

  const confirmUpload = async () => {
    if (!pendingFile || !user) return;
    setUploading(true);
    try {
      const safeName = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${profileId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("staff-documents")
        .upload(path, pendingFile, { contentType: pendingFile.type || "application/octet-stream" });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from("staff_documents").insert({
        profile_id: profileId,
        document_type: meta.document_type,
        document_number: meta.document_number || null,
        issue_date: meta.issue_date || null,
        expiry_date: meta.expiry_date || null,
        issuing_authority: meta.issuing_authority || null,
        notes: meta.notes || null,
        status: meta.expiry_date && new Date(meta.expiry_date) < new Date() ? "expired" : "valid",
        file_path: path,
        file_name: pendingFile.name,
        file_size: pendingFile.size,
        file_type: pendingFile.type || "application/octet-stream",
        uploaded_by: user.id,
      });
      if (dbErr) {
        await supabase.storage.from("staff-documents").remove([path]);
        throw dbErr;
      }
      toast.success("Document uploaded");
      setMetaOpen(false);
      setPendingFile(null);
      setMeta({ document_type: "ghana_card", document_number: "", issue_date: "", expiry_date: "", issuing_authority: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["staff-doc-vault", profileId] });
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const downloadDoc = async (d: any) => {
    if (!d.file_path) return toast.error("No file attached to this record");
    const { data, error } = await supabase.storage.from("staff-documents").createSignedUrl(d.file_path, 60);
    if (error || !data) return toast.error("Download failed");
    triggerDownload(data.signedUrl, d.file_name || "document");
  };

  const viewDoc = async (d: any) => {
    if (!d.file_path) return toast.error("No file attached");
    const { data, error } = await supabase.storage.from("staff-documents").createSignedUrl(d.file_path, 300);
    if (error || !data) return toast.error("Could not open file");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const deleteDoc = async (d: any) => {
    if (!confirm(`Move ${d.file_name || d.document_type} to the Recycle Bin?`)) return;
    try {
      await softDelete({
        table: "staff_documents",
        id: d.id,
        label: d.file_name || d.document_type,
        context: d.document_number || undefined,
        storagePaths: d.file_path ? [{ bucket: "staff-documents", path: d.file_path }] : [],
      });
      toast.success("Document moved to Recycle Bin");
      qc.invalidateQueries({ queryKey: ["staff-doc-vault", profileId] });
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  };

  const bulk = useBulkSelection(filtered as { id: string }[]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const bulkDeleteDocs = async () => {
    if (bulk.count === 0) return;
    setBulkDeleting(true);
    try {
      const toDelete = (filtered as any[]).filter((d) => bulk.isSelected(d.id));
      let success = 0;
      for (const d of toDelete) {
        try {
          await softDelete({
            table: "staff_documents",
            id: d.id,
            label: d.file_name || d.document_type,
            context: d.document_number || undefined,
            storagePaths: d.file_path ? [{ bucket: "staff-documents", path: d.file_path }] : [],
          });
          success++;
        } catch (e: any) {
          toast.error(`Failed: ${d.file_name || d.document_type} — ${e.message}`);
        }
      }
      if (success > 0) toast.success(`${success} document${success === 1 ? "" : "s"} moved to Recycle Bin`);
      bulk.clear();
      qc.invalidateQueries({ queryKey: ["staff-doc-vault", profileId] });
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) startUpload(e.dataTransfer.files);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FolderLock className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Document Vault</CardTitle>
              <CardDescription>Securely store IDs, certificates, and personal records</CardDescription>
            </div>
          </div>
          {canManage && (
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} size="sm">
              <Upload className="h-4 w-4 mr-1" /> {uploading ? "Uploading…" : "Upload Document"}
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
            onChange={(e) => e.target.files && startUpload(e.target.files)}
          />
        </div>
        <div className="flex gap-2 items-center flex-wrap mt-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search title, number, notes…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {canManage && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center mb-4 transition-colors cursor-pointer",
              dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/20"
            )}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Drop a file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, Word, Excel, images — up to 20 MB</p>
          </div>
        )}

        {canManage && (
          <div className="mb-2">
            <BulkActionBar
              count={bulk.count}
              itemLabel="document"
              onClear={bulk.clear}
              onConfirmDelete={bulkDeleteDocs}
              deleting={bulkDeleting}
              destructiveLabel="Move selected to Recycle Bin"
            />
          </div>
        )}

        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground text-sm">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">No documents on file</p>
        ) : (
          <div className="rounded-lg border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {canManage && (
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={bulk.allVisibleSelected ? true : bulk.someVisibleSelected ? "indeterminate" : false}
                        onCheckedChange={bulk.toggleAllVisible}
                        aria-label="Select all visible documents"
                      />
                    </TableHead>
                  )}
                  <TableHead>Document</TableHead>
                  <TableHead className="hidden sm:table-cell">Number</TableHead>
                  <TableHead className="hidden md:table-cell">Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d: any) => (
                  <TableRow key={d.id} data-state={bulk.isSelected(d.id) ? "selected" : undefined}>
                    {canManage && (
                      <TableCell>
                        <Checkbox
                          checked={bulk.isSelected(d.id)}
                          onCheckedChange={() => bulk.toggle(d.id)}
                          aria-label={`Select ${d.file_name || d.document_type}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <div className="font-medium capitalize">{(DOC_TYPES.find(t => t.value === d.document_type)?.label) || d.document_type.replace(/_/g, " ")}</div>
                          {d.file_name && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{d.file_name}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-xs">{d.document_number || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs">{d.expiry_date ? format(new Date(d.expiry_date), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_BADGE[d.status] || ""}>{d.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {d.file_path && (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => viewDoc(d)} title="View"><Eye className="h-4 w-4" /></Button>
                            {canManage && (
                              <Button size="icon" variant="ghost" onClick={() => downloadDoc(d)} title="Download"><Download className="h-4 w-4" /></Button>
                            )}
                          </>
                        )}
                        {canManage && (
                          <Button size="icon" variant="ghost" onClick={() => deleteDoc(d)} title="Delete">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={metaOpen} onOpenChange={(o) => { if (!uploading) setMetaOpen(o); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Document Details</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="text-xs bg-muted p-2 rounded">
                <span className="font-medium">File:</span> {pendingFile?.name} ({((pendingFile?.size || 0) / 1024).toFixed(1)} KB)
              </div>
              <div>
                <Label>Document Type *</Label>
                <Select value={meta.document_type} onValueChange={(v) => setMeta({ ...meta, document_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Document Number</Label>
                <Input value={meta.document_number} onChange={(e) => setMeta({ ...meta, document_number: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Issue Date</Label>
                  <Input type="date" value={meta.issue_date} onChange={(e) => setMeta({ ...meta, issue_date: e.target.value })} />
                </div>
                <div>
                  <Label>Expiry Date</Label>
                  <Input type="date" value={meta.expiry_date} onChange={(e) => setMeta({ ...meta, expiry_date: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Issuing Authority</Label>
                <Input value={meta.issuing_authority} onChange={(e) => setMeta({ ...meta, issuing_authority: e.target.value })} />
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMetaOpen(false)} disabled={uploading}>Cancel</Button>
              <Button onClick={confirmUpload} disabled={uploading}>{uploading ? "Uploading…" : "Save & Upload"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
