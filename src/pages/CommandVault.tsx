import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StaffCombobox } from "@/components/ui/staff-combobox";
import { Upload, Download, Trash2, FileText, Search, Eye, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { triggerDownload } from "@/lib/download-utils";
import { format } from "date-fns";
import { Navigate } from "react-router-dom";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "staff_list", label: "Staff List" },
  { value: "personnel_file", label: "Personnel File" },
  { value: "appointment", label: "Appointment / Posting" },
  { value: "discipline", label: "Disciplinary Record" },
  { value: "investigation", label: "Investigation" },
  { value: "directive", label: "Command Directive" },
  { value: "other", label: "Other" },
];

const CATEGORY_BADGE: Record<string, string> = {
  general: "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
  staff_list: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  personnel_file: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  appointment: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  discipline: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  investigation: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  directive: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300",
};

export default function CommandVault() {
  const { user, isAdmin, isOic, is2ic, role, loading } = useAuth();
  const allowed = isAdmin || isOic || is2ic || role === "staff_officer";
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [meta, setMeta] = useState({
    title: "",
    category: "staff_list",
    description: "",
    related_profile_id: "",
  });

  // Fetch staff for the optional "related officer" combobox
  const { data: staff = [] } = useQuery({
    queryKey: ["cv-staff-options"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id")
        .order("last_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["command-vault", search, categoryFilter],
    enabled: allowed,
    queryFn: async () => {
      let q = supabase
        .from("command_vault_files")
        .select("*, profiles:related_profile_id (id, first_name, last_name, staff_id)")
        .order("created_at", { ascending: false });
      if (categoryFilter !== "all") q = q.eq("category", categoryFilter);
      const { data, error } = await q;
      if (error) throw error;
      const list = data ?? [];
      if (!search) return list;
      const s = search.toLowerCase();
      return list.filter((d: any) => {
        const officer = d.profiles ? `${d.profiles.first_name} ${d.profiles.last_name} ${d.profiles.staff_id}` : "";
        return `${d.title} ${d.description ?? ""} ${d.file_name} ${officer}`.toLowerCase().includes(s);
      });
    },
  });

  const startUpload = useCallback((files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File must be 20 MB or less");
      return;
    }
    setPendingFile(file);
    setMeta((m) => ({ ...m, title: m.title || file.name.replace(/\.[^.]+$/, "") }));
    setMetaOpen(true);
  }, []);

  const confirmUpload = async () => {
    if (!pendingFile || !user) return;
    if (!meta.title.trim()) {
      toast.error("A title is required");
      return;
    }
    setUploading(true);
    try {
      const safeName = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${meta.category}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("command-vault")
        .upload(path, pendingFile, { contentType: pendingFile.type || "application/octet-stream" });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from("command_vault_files").insert({
        title: meta.title.trim(),
        category: meta.category,
        description: meta.description.trim() || null,
        related_profile_id: meta.related_profile_id || null,
        file_path: path,
        file_name: pendingFile.name,
        file_size: pendingFile.size,
        file_type: pendingFile.type || "application/octet-stream",
        uploaded_by: user.id,
      });
      if (dbErr) {
        await supabase.storage.from("command-vault").remove([path]);
        throw dbErr;
      }
      toast.success("File added to vault");
      setMetaOpen(false);
      setPendingFile(null);
      setMeta({ title: "", category: "staff_list", description: "", related_profile_id: "" });
      qc.invalidateQueries({ queryKey: ["command-vault"] });
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const downloadFile = async (d: any) => {
    const { data, error } = await supabase.storage.from("command-vault").createSignedUrl(d.file_path, 60);
    if (error || !data) return toast.error("Download failed");
    triggerDownload(data.signedUrl, d.file_name || "file");
  };

  const viewFile = async (d: any) => {
    const { data, error } = await supabase.storage.from("command-vault").createSignedUrl(d.file_path, 300);
    if (error || !data) return toast.error("Could not open file");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const deleteFile = async (d: any) => {
    if (!confirm(`Delete "${d.title}"? This cannot be undone.`)) return;
    if (d.file_path) await supabase.storage.from("command-vault").remove([d.file_path]);
    const { error } = await supabase.from("command_vault_files").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("File removed");
    qc.invalidateQueries({ queryKey: ["command-vault"] });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) startUpload(e.dataTransfer.files);
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-secondary">Command Vault</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 mr-1" /> Restricted — visible only to Admin, Command OIC, 2IC and Staff Officer
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="gap-1">
          <FileText className="h-3 w-3" /> {files.length} file{files.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-lg">Staff List & Confidential Files</CardTitle>
              <CardDescription>Upload staff lists, personnel records, directives and other confidential documents.</CardDescription>
            </div>
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Upload className="h-4 w-4 mr-1" /> {uploading ? "Uploading…" : "Upload File"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
              onChange={(e) => e.target.files && startUpload(e.target.files)}
            />
          </div>

          <div className="flex gap-2 items-center flex-wrap mt-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by title, description, officer…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
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
            <p className="text-xs text-muted-foreground mt-1">PDF, Word, Excel, CSV, images — up to 20 MB</p>
          </div>

          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Loading…</p>
          ) : files.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No files in the vault yet</p>
          ) : (
            <div className="rounded-lg border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title / File</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="hidden md:table-cell">Related Officer</TableHead>
                    <TableHead className="hidden lg:table-cell">Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium truncate max-w-[260px]">{d.title}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[260px]">{d.file_name}</div>
                            {d.description && <div className="text-xs text-muted-foreground/80 truncate max-w-[260px]">{d.description}</div>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={CATEGORY_BADGE[d.category] || ""}>
                          {CATEGORIES.find((c) => c.value === d.category)?.label || d.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {d.profiles ? (
                          <div>
                            <div className="font-medium">{d.profiles.first_name} {d.profiles.last_name}</div>
                            <div className="text-xs font-mono text-muted-foreground">{d.profiles.staff_id}</div>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {format(new Date(d.created_at), "dd MMM yyyy, HH:mm")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" onClick={() => viewFile(d)} title="View"><Eye className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => downloadFile(d)} title="Download"><Download className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteFile(d)} title="Delete">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={metaOpen} onOpenChange={(o) => { if (!uploading) setMetaOpen(o); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>File Details</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-xs bg-muted p-2 rounded">
              <span className="font-medium">File:</span> {pendingFile?.name} ({((pendingFile?.size || 0) / 1024).toFixed(1)} KB)
            </div>
            <div>
              <Label>Title *</Label>
              <Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} placeholder="e.g. ASC Staff List — Q2 2026" />
            </div>
            <div>
              <Label>Category *</Label>
              <Select value={meta.category} onValueChange={(v) => setMeta({ ...meta, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Related Officer (optional)</Label>
              <StaffCombobox
                staff={staff as any}
                value={meta.related_profile_id}
                onValueChange={(v) => setMeta({ ...meta, related_profile_id: v })}
                placeholder="Search and link an officer…"
                includeAllOption
                allOptionLabel="No officer linked"
              />
            </div>
            <div>
              <Label>Description / Notes</Label>
              <Textarea
                rows={3}
                value={meta.description}
                onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                placeholder="Context, source, retention notes…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetaOpen(false)} disabled={uploading}>Cancel</Button>
            <Button onClick={confirmUpload} disabled={uploading}>{uploading ? "Uploading…" : "Save & Upload"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
