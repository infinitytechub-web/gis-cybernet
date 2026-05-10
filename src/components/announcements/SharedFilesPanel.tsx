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
import { FileUp, Globe, Building2, Trash2, Download, Loader2, FileText, Power, Search, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { softDelete } from "@/lib/recycle-bin";

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
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

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
    setTitle(""); setDescription(""); setDeptId("global"); setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const upload = async () => {
    if (!file || !title.trim() || !user) return;
    setUploading(true);
    try {
      const { path, sha, verdict } = await uploadSecureFile(file, { maxMb: 25 });
      const { error } = await supabase.from("announcement_files").insert({
        title: title.trim(),
        description: description.trim() || null,
        department_id: deptId === "global" ? null : deptId,
        storage_path: path,
        filename: file.name,
        size_bytes: file.size,
        mime_type: file.type || null,
        sha256: sha,
        scan_action: verdict,
        uploaded_by: user.id,
      });
      if (error) throw error;
      toast.success("File shared");
      qc.invalidateQueries({ queryKey: ["announcement-files"] });
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
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      qc.invalidateQueries({ queryKey: ["announcement-files"] });
    } catch (e: any) {
      toast.error(e.message ?? "Download failed");
    }
  };

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("announcement_files").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcement-files"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await softDelete({ table: "announcement_files", id, label: "Shared file" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcement-files"] });
      toast.success("File removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

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
                  <Label className="text-xs">Audience</Label>
                  <Select value={deptId} onValueChange={setDeptId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">All Staff</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">File (max 25 MB)</Label>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file && (
                    <p className="text-[11px] text-muted-foreground">
                      {file.name} — {fmtSize(file.size)}
                    </p>
                  )}
                </div>
                <Button
                  className="w-full gap-1.5"
                  onClick={upload}
                  disabled={!file || !title.trim() || uploading}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                  Upload &amp; Share
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No shared files yet.</p>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table style={{ minWidth: 700 }}>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead className="hidden sm:table-cell">Audience</TableHead>
                  <TableHead className="hidden md:table-cell">Size</TableHead>
                  <TableHead className="hidden md:table-cell text-center">Downloads</TableHead>
                  <TableHead className="hidden lg:table-cell">Shared</TableHead>
                  {isAdminOrSupervisor && <TableHead className="text-center w-[70px]">Active</TableHead>}
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((f: any) => (
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
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {fmtSize(f.size_bytes)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-center text-xs">
                      {f.download_count}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {format(new Date(f.created_at), "dd MMM yyyy")}
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
                          title="Download"
                          onClick={() => handleDownload(f)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
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
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SharedFilesPanel;
