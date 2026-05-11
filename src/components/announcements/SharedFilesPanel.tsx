import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uploadSecureFile } from "@/lib/secure-upload";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { FileUp, Globe, Building2, Trash2, Download, Loader2, FileText, Power, Search, X, ShieldCheck, Eye, ScrollText, UserCircle2, Pencil, Send } from "lucide-react";
import { StaffCombobox } from "@/components/ui/staff-combobox";
import { toast } from "sonner";
import { format } from "date-fns";
import { softDelete } from "@/lib/recycle-bin";
import { logFileAudit } from "@/lib/announcement-file-audit";
import { FileAuditTrailDialog } from "./FileAuditTrailDialog";

const fmtSize = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

export function SharedFilesPanel() {
  const { isAdminOrSupervisor, user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deptId, setDeptId] = useState<string>("global");
  const [audienceMode, setAudienceMode] = useState<"global" | "department" | "individual">("global");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [retention, setRetention] = useState<string>("default"); // default | 7 | 30 | 90 | 365 | never
  const [uploading, setUploading] = useState(false);

  // Edit / re-share state
  const [editing, setEditing] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAudienceMode, setEditAudienceMode] = useState<"global" | "department" | "individual">("global");
  const [editDeptId, setEditDeptId] = useState<string>("global");
  const [editTargetUserId, setEditTargetUserId] = useState<string>("");
  const [editRetention, setEditRetention] = useState<string>("default");
  const [editReshare, setEditReshare] = useState<boolean>(true);
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = (f: any) => {
    setEditing(f);
    setEditTitle(f.title ?? "");
    setEditDescription(f.description ?? "");
    if (f.target_user_id) {
      setEditAudienceMode("individual");
      setEditTargetUserId(f.target_user_id);
      setEditDeptId("global");
    } else if (f.department_id) {
      setEditAudienceMode("department");
      setEditDeptId(f.department_id);
      setEditTargetUserId("");
    } else {
      setEditAudienceMode("global");
      setEditDeptId("global");
      setEditTargetUserId("");
    }
    if (f.expires_at == null && f.retention_days == null) setEditRetention("default");
    else if (f.expires_at == null) setEditRetention("never");
    else if (f.retention_days && [7, 30, 90, 365].includes(f.retention_days)) setEditRetention(String(f.retention_days));
    else setEditRetention("never");
    setEditReshare(true);
  };

  const closeEdit = () => {
    setEditing(null);
    setSavingEdit(false);
  };

  // Filters
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterUploader, setFilterUploader] = useState<string>("all");
  const [filterCommandOnly, setFilterCommandOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["announcement-files", isAdminOrSupervisor],
    queryFn: async () => {
      let q = supabase
        .from("announcement_files")
        .select("*, departments(name)")
        .order("created_at", { ascending: false });
      if (!isAdminOrSupervisor) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const uploaderIds = Array.from(new Set(files.map((f: any) => f.uploaded_by).filter(Boolean)));

  const { data: uploaderMap = {} } = useQuery({
    queryKey: ["announcement-file-uploaders", uploaderIds.sort().join(",")],
    enabled: uploaderIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, staff_id")
        .in("user_id", uploaderIds as string[]);
      const map: Record<string, { name: string; staff_id: string | null }> = {};
      for (const p of data ?? []) {
        const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.staff_id || "Unknown";
        map[p.user_id] = { name, staff_id: p.staff_id };
      }
      return map;
    },
  });

  const { data: commandUserIds = new Set<string>() } = useQuery({
    queryKey: ["command-tier-user-ids"],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "oic", "2ic", "staff_officer", "supervisor"]);
      return new Set((data ?? []).map((r: any) => r.user_id));
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ["share-file-staff-list"],
    enabled: isAdminOrSupervisor && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, first_name, last_name, staff_id")
        .not("user_id", "is", null)
        .order("last_name");
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: p.user_id as string,
        first_name: p.first_name ?? "",
        last_name: p.last_name ?? "",
        staff_id: p.staff_id ?? "",
      }));
    },
  });

  const filteredFiles = files.filter((f: any) => {
    // Search by file name / title / description
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [f.title, f.filename, f.description ?? "", uploaderMap[f.uploaded_by]?.name ?? ""]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    // Department / audience
    if (filterDept === "global" && f.department_id !== null) return false;
    if (filterDept !== "all" && filterDept !== "global" && f.department_id !== filterDept) return false;
    // Uploader
    if (filterUploader !== "all" && f.uploaded_by !== filterUploader) return false;
    // Command tier visibility
    if (filterCommandOnly && !(commandUserIds as Set<string>).has(f.uploaded_by)) return false;
    // Date range
    const created = new Date(f.created_at).getTime();
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      if (created < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1;
      if (created > to) return false;
    }
    return true;
  });

  const uploaderOptions = uploaderIds
    .map((id) => ({ id: id as string, name: uploaderMap[id as string]?.name ?? "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filtersActive =
    !!search.trim() || filterDept !== "all" || filterUploader !== "all" ||
    filterCommandOnly || !!dateFrom || !!dateTo;

  const clearFilters = () => {
    setSearch(""); setFilterDept("all"); setFilterUploader("all");
    setFilterCommandOnly(false); setDateFrom(""); setDateTo("");
  };

  const reset = () => {
    setTitle(""); setDescription("");
    setAudienceMode("global"); setDeptId("global"); setTargetUserId("");
    setFile(null); setRetention("default");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Compute SHA-256 of the selected file (matches the hash uploadSecureFile uses)
  const computeSha256 = async (f: File): Promise<string> => {
    const buf = await f.arrayBuffer();
    const h = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  // Duplicate-detection state
  const [duplicateMatches, setDuplicateMatches] = useState<any[] | null>(null);
  const [pendingSha, setPendingSha] = useState<string | null>(null);

  const upload = async (opts: { skipDuplicateCheck?: boolean } = {}) => {
    if (!file || !title.trim() || !user) return;
    if (audienceMode === "individual" && !targetUserId) {
      toast.error("Select a staff member to share with");
      return;
    }
    setUploading(true);
    try {
      // 1) Hash locally and look for duplicates (same filename + checksum) before
      //    uploading to storage, so we don't waste bandwidth or quota on a re-share.
      const sha = pendingSha ?? (await computeSha256(file));
      if (!opts.skipDuplicateCheck) {
        const { data: matches } = await supabase
          .from("announcement_files")
          .select("id, title, filename, created_at, is_active, department_id, target_user_id, uploaded_by, departments(name)")
          .eq("sha256", sha)
          .eq("filename", file.name)
          .order("created_at", { ascending: false })
          .limit(5);
        if (matches && matches.length > 0) {
          setPendingSha(sha);
          setDuplicateMatches(matches);
          setUploading(false);
          return;
        }
      }

      const { path, verdict } = await uploadSecureFile(file, { maxMb: 25 });
      let expires_at: string | null = null;
      let retention_days: number | null = null;
      if (retention !== "default" && retention !== "never") {
        retention_days = parseInt(retention, 10);
        expires_at = new Date(Date.now() + retention_days * 86400_000).toISOString();
      } else if (retention === "never") {
        retention_days = null;
        expires_at = null;
      }
      const resolvedDept =
        audienceMode === "department" && deptId !== "global" ? deptId : null;
      const resolvedTarget = audienceMode === "individual" ? targetUserId : null;
      const { data: inserted, error } = await (supabase.from("announcement_files") as any).insert({
        title: title.trim(),
        description: description.trim() || null,
        department_id: resolvedDept,
        target_user_id: resolvedTarget,
        storage_path: path,
        filename: file.name,
        size_bytes: file.size,
        mime_type: file.type || null,
        sha256: sha,
        scan_action: verdict,
        uploaded_by: user.id,
        expires_at,
        retention_days,
      }).select("id").single();
      if (error) throw error;
      await logFileAudit(inserted?.id ?? null, "upload", {
        title: title.trim(),
        filename: file.name,
        size_bytes: file.size,
        audience: audienceMode,
        department_id: resolvedDept,
        target_user_id: resolvedTarget,
        retention_days,
        duplicate_override: !!opts.skipDuplicateCheck,
      });
      toast.success(opts.skipDuplicateCheck ? "Duplicate file re-shared" : "File shared");
      qc.invalidateQueries({ queryKey: ["announcement-files"] });
      setDuplicateMatches(null);
      setPendingSha(null);
      reset();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (f: any) => {
    try {
      const { data, error } = await supabase.storage
        .from("secure-uploads")
        .createSignedUrl(f.storage_path, 60);
      if (error) throw error;
      await supabase.rpc("increment_announcement_file_downloads", { _file_id: f.id });
      await logFileAudit(f.id, "download", { filename: f.filename });
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      qc.invalidateQueries({ queryKey: ["announcement-files"] });
    } catch (e: any) {
      toast.error(e.message ?? "Download failed");
    }
  };

  const handlePreview = async (f: any) => {
    try {
      const { data, error } = await supabase.storage
        .from("secure-uploads")
        .createSignedUrl(f.storage_path, 60);
      if (error) throw error;
      await logFileAudit(f.id, "preview", { filename: f.filename });
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e.message ?? "Preview failed");
    }
  };

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("announcement_files").update({ is_active }).eq("id", id);
      if (error) throw error;
      await logFileAudit(id, "permission_change", { field: "is_active", value: is_active });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcement-files"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await logFileAudit(id, "delete", {});
      await softDelete({ table: "announcement_files", id, label: "Shared file" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcement-files"] });
      toast.success("File removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveEdit = async () => {
    if (!editing || !editTitle.trim()) return;
    if (editAudienceMode === "individual" && !editTargetUserId) {
      toast.error("Select a staff member to share with");
      return;
    }
    if (editAudienceMode === "department" && (editDeptId === "global" || !editDeptId)) {
      toast.error("Select a department");
      return;
    }
    setSavingEdit(true);
    try {
      let expires_at: string | null = null;
      let retention_days: number | null = null;
      if (editRetention !== "default" && editRetention !== "never") {
        retention_days = parseInt(editRetention, 10);
        expires_at = new Date(Date.now() + retention_days * 86400_000).toISOString();
      }
      const resolvedDept =
        editAudienceMode === "department" && editDeptId !== "global" ? editDeptId : null;
      const resolvedTarget = editAudienceMode === "individual" ? editTargetUserId : null;

      const patch: Record<string, any> = {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        department_id: resolvedDept,
        target_user_id: resolvedTarget,
        expires_at,
        retention_days,
      };
      if (editReshare) patch.is_active = true;

      const { error } = await (supabase.from("announcement_files") as any)
        .update(patch)
        .eq("id", editing.id);
      if (error) throw error;

      await logFileAudit(editing.id, "permission_change", {
        action: editReshare ? "edit_and_reshare" : "edit",
        title: patch.title,
        audience: editAudienceMode,
        department_id: resolvedDept,
        target_user_id: resolvedTarget,
        retention_days,
        reshared: editReshare,
      });

      qc.invalidateQueries({ queryKey: ["announcement-files"] });
      toast.success(editReshare ? "File updated and re-shared" : "File updated");
      closeEdit();
    } catch (e: any) {
      toast.error(e.message ?? "Update failed");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Shared Files
          </CardTitle>
          <CardDescription>
            Files distributed to all staff or specific departments.
            {isAdminOrSupervisor && " Files are virus-scanned before sharing."}
          </CardDescription>
        </div>
        {isAdminOrSupervisor && (
          <div className="flex items-center gap-2">
            <FileAuditTrailDialog />
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <FileUp className="h-4 w-4" /> Share File
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Share a file</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Title</Label>
                  <Input placeholder="e.g. Q1 Operational Briefing" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Description (optional)</Label>
                  <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Share File Audience</Label>
                  <Select
                    value={audienceMode}
                    onValueChange={(v: "global" | "department" | "individual") => {
                      setAudienceMode(v);
                      if (v === "global") { setDeptId("global"); setTargetUserId(""); }
                      if (v === "department") setTargetUserId("");
                      if (v === "individual") setDeptId("global");
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">All Staff</SelectItem>
                      <SelectItem value="department">Specific Department</SelectItem>
                      <SelectItem value="individual">Individual Staff Member</SelectItem>
                    </SelectContent>
                  </Select>
                  {audienceMode === "department" && (
                    <Select value={deptId === "global" ? "" : deptId} onValueChange={setDeptId}>
                      <SelectTrigger><SelectValue placeholder="Select a department…" /></SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {audienceMode === "individual" && (
                    <StaffCombobox
                      staff={staffList}
                      value={targetUserId}
                      onValueChange={setTargetUserId}
                      placeholder="Search staff by name or ID…"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">File (max 25 MB)</Label>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*,text/plain"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file && (
                    <p className="text-[11px] text-muted-foreground">
                      {file.name} — {fmtSize(file.size)}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Supported: PDF, Word (.doc/.docx), Excel (.xls/.xlsx), CSV, PowerPoint, images.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Retention / expiry</Label>
                  <Select value={retention} onValueChange={setRetention}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Use system default policy</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="365">1 year</SelectItem>
                      <SelectItem value="never">Never expires</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full gap-1.5"
                  onClick={upload}
                  disabled={!file || !title.trim() || uploading || (audienceMode === "individual" && !targetUserId) || (audienceMode === "department" && (deptId === "global" || !deptId))}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                  Upload &amp; Share
                </Button>
              </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search file name, title, uploader…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 h-9 text-xs"
              />
            </div>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All audiences</SelectItem>
                <SelectItem value="global">All Staff (global)</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterUploader} onValueChange={setFilterUploader}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Uploader" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All uploaders</SelectItem>
                {uploaderOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 h-9">
              <Label className="text-xs flex items-center gap-1.5 cursor-pointer">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Command tier only
              </Label>
              <Switch checked={filterCommandOnly} onCheckedChange={setFilterCommandOnly} />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-[150px] text-xs" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-[150px] text-xs" />
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              {filteredFiles.length} of {files.length} file{files.length === 1 ? "" : "s"}
              {filtersActive && (
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={clearFilters}>
                  <X className="h-3 w-3" /> Clear
                </Button>
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No shared files yet.</p>
        ) : filteredFiles.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No files match the current filters.</p>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table style={{ minWidth: 700 }}>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead className="hidden sm:table-cell">Audience</TableHead>
                  <TableHead className="hidden lg:table-cell">Uploader</TableHead>
                  <TableHead className="hidden md:table-cell">Size</TableHead>
                  <TableHead className="hidden md:table-cell text-center">Downloads</TableHead>
                  <TableHead className="hidden lg:table-cell">Shared</TableHead>
                  <TableHead className="hidden lg:table-cell">Expires</TableHead>
                  {isAdminOrSupervisor && <TableHead className="text-center w-[70px]">Active</TableHead>}
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFiles.map((f: any) => {
                  const uploader = uploaderMap[f.uploaded_by];
                  const isCmd = (commandUserIds as Set<string>).has(f.uploaded_by);
                  return (
                    <TableRow key={f.id} className={!f.is_active ? "opacity-50" : ""}>
                      <TableCell>
                        <div className="font-medium text-sm">{f.title}</div>
                        <div className="text-[11px] text-muted-foreground line-clamp-1">{f.filename}</div>
                        {f.description && (
                          <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{f.description}</div>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className="gap-1 text-xs">
                          {f.department_id ? (
                            <><Building2 className="h-3 w-3" />{f.departments?.name ?? "Department"}</>
                          ) : (
                            <><Globe className="h-3 w-3" />All Staff</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs">
                        <div className="flex items-center gap-1.5">
                          <span>{uploader?.name ?? "—"}</span>
                          {isCmd && (
                            <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5 border-primary/40 text-primary">
                              <ShieldCheck className="h-2.5 w-2.5" /> CMD
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {fmtSize(f.size_bytes)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-center text-xs">
                        {f.download_count}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {format(new Date(f.created_at), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs">
                        {f.expires_at ? (
                          (() => {
                            const ms = new Date(f.expires_at).getTime() - Date.now();
                            const days = Math.ceil(ms / 86400_000);
                            const cls = ms <= 0 ? "text-destructive" : days <= 7 ? "text-amber-600" : "text-muted-foreground";
                            return (
                              <span className={cls} title={format(new Date(f.expires_at), "PPpp")}>
                                {ms <= 0 ? "Expired" : `${days}d`}
                              </span>
                            );
                          })()
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      {isAdminOrSupervisor && (
                        <TableCell className="text-center">
                          <Switch
                            checked={f.is_active}
                            onCheckedChange={(v) => toggleActive.mutate({ id: f.id, is_active: v })}
                          />
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Preview"
                            onClick={() => handlePreview(f)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Download"
                            onClick={() => handleDownload(f)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          {isAdminOrSupervisor && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Edit & re-share"
                              onClick={() => openEdit(f)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {isAdminOrSupervisor && (
                            <FileAuditTrailDialog
                              fileId={f.id}
                              trigger={
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Audit trail">
                                  <ScrollText className="h-3.5 w-3.5" />
                                </Button>
                              }
                            />
                          )}
                          {isAdminOrSupervisor && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove shared file?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Staff will no longer see "{f.title}". You can restore from the recycle bin.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => remove.mutate(f.id)}>Remove</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) closeEdit(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit shared file</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{editing.filename}</span>
                {" — "}{fmtSize(editing.size_bytes)}
                <p className="mt-0.5">Shared {format(new Date(editing.created_at), "dd MMM yyyy")}.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Title</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description (optional)</Label>
                <Textarea rows={2} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Audience</Label>
                <Select
                  value={editAudienceMode}
                  onValueChange={(v: "global" | "department" | "individual") => {
                    setEditAudienceMode(v);
                    if (v === "global") { setEditDeptId("global"); setEditTargetUserId(""); }
                    if (v === "department") setEditTargetUserId("");
                    if (v === "individual") setEditDeptId("global");
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">All Staff</SelectItem>
                    <SelectItem value="department">Specific Department</SelectItem>
                    <SelectItem value="individual">Individual Staff Member</SelectItem>
                  </SelectContent>
                </Select>
                {editAudienceMode === "department" && (
                  <Select value={editDeptId === "global" ? "" : editDeptId} onValueChange={setEditDeptId}>
                    <SelectTrigger><SelectValue placeholder="Select a department…" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {editAudienceMode === "individual" && (
                  <StaffCombobox
                    staff={staffList}
                    value={editTargetUserId}
                    onValueChange={setEditTargetUserId}
                    placeholder="Search staff by name or ID…"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Retention / expiry</Label>
                <Select value={editRetention} onValueChange={setEditRetention}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Use system default policy</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                    <SelectItem value="never">Never expires</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Choosing a duration restarts the expiry timer from now.
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <Label className="text-xs flex items-center gap-1.5 cursor-pointer">
                  <Send className="h-3.5 w-3.5 text-primary" />
                  Re-share to audience (re-activate & notify)
                </Label>
                <Switch checked={editReshare} onCheckedChange={setEditReshare} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={closeEdit} disabled={savingEdit}>
                  Cancel
                </Button>
                <Button
                  className="gap-1.5"
                  onClick={saveEdit}
                  disabled={savingEdit || !editTitle.trim()}
                >
                  {savingEdit
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : (editReshare ? <Send className="h-4 w-4" /> : <Pencil className="h-4 w-4" />)}
                  {editReshare ? "Save & re-share" : "Save changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default SharedFilesPanel;
