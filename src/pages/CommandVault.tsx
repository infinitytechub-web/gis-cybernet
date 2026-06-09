import { useCallback, useMemo, useRef, useState } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StaffCombobox } from "@/components/ui/staff-combobox";
import {
  Upload, Download, Trash2, FileText, Search, Eye, Lock, ShieldCheck, Pencil,
  BarChart3, CalendarDays, UserCircle2, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { triggerDownload } from "@/lib/download-utils";
import { softDelete } from "@/lib/recycle-bin";
import { format } from "date-fns";
import { Navigate } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, CartesianGrid,
} from "recharts";

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
  const { user, isAdmin, isOic, is2ic, isAdminOrSupervisor, role, loading } = useAuth();
  const allowed = isAdminOrSupervisor || isAdmin || isOic || is2ic || role === "staff_officer";
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

  // Preview state
  const [preview, setPreview] = useState<{ url: string; file: any } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [csvText, setCsvText] = useState<string | null>(null);

  // Edit + delete state
  const [editing, setEditing] = useState<any>(null);
  const [editForm, setEditForm] = useState({ title: "", category: "general", description: "", related_profile_id: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

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

      // Enrich with uploader profile (separate fetch — uploaded_by references auth.users.id)
      const uploaderIds = Array.from(new Set(list.map((d: any) => d.uploaded_by).filter(Boolean)));
      let uploaderMap = new Map<string, any>();
      if (uploaderIds.length) {
        const { data: ups } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, staff_id")
          .in("user_id", uploaderIds);
        uploaderMap = new Map((ups ?? []).map((p: any) => [p.user_id, p]));
      }
      const enriched = list.map((d: any) => ({ ...d, uploader: uploaderMap.get(d.uploaded_by) || null }));

      if (!search) return enriched;
      const s = search.toLowerCase();
      return enriched.filter((d: any) => {
        const officer = d.profiles ? `${d.profiles.first_name} ${d.profiles.last_name} ${d.profiles.staff_id}` : "";
        const up = d.uploader ? `${d.uploader.first_name} ${d.uploader.last_name} ${d.uploader.staff_id}` : "";
        return `${d.title} ${d.description ?? ""} ${d.file_name} ${officer} ${up}`.toLowerCase().includes(s);
      });
    },
  });

  // Aggregate stats (always computed from full file list independent of filters? — use filtered list so it matches current view)
  const stats = useMemo(() => {
    const total = files.length;
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let thisMonth = 0;
    const monthCounts = new Map<string, number>();
    const uploaderCounts = new Map<string, { name: string; count: number }>();
    const hourCounts = new Array(24).fill(0);
    let lastUpload: string | null = null;

    for (const f of files as any[]) {
      const d = new Date(f.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
      if (key === thisMonthKey) thisMonth += 1;
      hourCounts[d.getHours()] += 1;
      if (!lastUpload || new Date(lastUpload) < d) lastUpload = f.created_at;

      const uid = f.uploaded_by || "unknown";
      const name = f.uploader
        ? `${f.uploader.first_name} ${f.uploader.last_name}`
        : "Unknown uploader";
      const cur = uploaderCounts.get(uid);
      uploaderCounts.set(uid, { name, count: (cur?.count ?? 0) + 1 });
    }

    // Last 6 months series (chronological)
    const series: { label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      series.push({ label: format(d, "MMM yy"), count: monthCounts.get(key) ?? 0 });
    }

    const topUploaders = Array.from(uploaderCounts.entries())
      .map(([uid, v]) => ({ uid, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Peak upload hour (formatted)
    let peakHour = -1;
    let peakHourCount = 0;
    hourCounts.forEach((c, h) => { if (c > peakHourCount) { peakHourCount = c; peakHour = h; } });
    const peakHourLabel = peakHour < 0
      ? "—"
      : `${String(peakHour).padStart(2, "0")}:00 – ${String((peakHour + 1) % 24).padStart(2, "0")}:00`;

    return {
      total, thisMonth, series, topUploaders,
      peakHourLabel, peakHourCount,
      lastUpload,
      uniqueUploaders: uploaderCounts.size,
    };
  }, [files]);

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
    setPreview({ url: "", file: d });
    setPreviewLoading(true);
    setCsvText(null);
    const { data, error } = await supabase.storage.from("command-vault").createSignedUrl(d.file_path, 300);
    if (error || !data) {
      setPreview(null);
      setPreviewLoading(false);
      return toast.error("Could not open file");
    }
    setPreview({ url: data.signedUrl, file: d });
    // Inline-load CSV/text content for proper preview
    const ft = (d.file_type || "").toLowerCase();
    const fn = (d.file_name || "").toLowerCase();
    if (ft.startsWith("text/") || ft === "text/csv" || fn.endsWith(".csv") || fn.endsWith(".txt")) {
      try {
        const res = await fetch(data.signedUrl);
        const text = await res.text();
        setCsvText(text);
      } catch {
        setCsvText(null);
      }
    }
    setPreviewLoading(false);
  };

  const openEdit = (d: any) => {
    setEditing(d);
    setEditForm({
      title: d.title ?? "",
      category: d.category ?? "general",
      description: d.description ?? "",
      related_profile_id: d.related_profile_id ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editForm.title.trim()) { toast.error("A title is required"); return; }
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("command_vault_files")
        .update({
          title: editForm.title.trim(),
          category: editForm.category,
          description: editForm.description.trim() || null,
          related_profile_id: editForm.related_profile_id || null,
        })
        .eq("id", editing.id);
      if (error) throw error;
      toast.success("File details updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["command-vault"] });
    } catch (e: any) {
      toast.error(e.message || "Update failed");
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await softDelete({
        table: "command_vault_files",
        id: deleting.id,
        label: deleting.title || deleting.file_name,
        context: deleting.file_name,
        storagePaths: deleting.file_path ? [{ bucket: "command-vault", path: deleting.file_path }] : [],
      });
      toast.success("File moved to Recycle Bin");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["command-vault"] });
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    } finally {
      setDeletingBusy(false);
    }
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

      {/* ======= Statistical Dashboard ======= */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Vault Analytics</CardTitle>
                <CardDescription className="text-xs">
                  Summary of upload activity {categoryFilter !== "all" || search ? "(matches current filters)" : "(all records)"}
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile
              icon={<FileText className="h-4 w-4" />}
              label="Total Files"
              value={stats.total.toString()}
              tone="primary"
            />
            <KpiTile
              icon={<CalendarDays className="h-4 w-4" />}
              label="Uploaded This Month"
              value={stats.thisMonth.toString()}
              sub={format(new Date(), "MMMM yyyy")}
              tone="emerald"
            />
            <KpiTile
              icon={<UserCircle2 className="h-4 w-4" />}
              label="Unique Uploaders"
              value={stats.uniqueUploaders.toString()}
              tone="violet"
            />
            <KpiTile
              icon={<Clock className="h-4 w-4" />}
              label="Peak Upload Hour"
              value={stats.peakHourLabel}
              sub={stats.peakHourCount > 0 ? `${stats.peakHourCount} file${stats.peakHourCount === 1 ? "" : "s"}` : ""}
              tone="amber"
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Monthly trend */}
            <div className="lg:col-span-2 rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Uploads — Last 6 Months</h3>
                <Badge variant="outline" className="text-[10px]">By month</Badge>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.series} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <ReTooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top uploaders */}
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Top Uploaders</h3>
                <Badge variant="outline" className="text-[10px]">Top 5</Badge>
              </div>
              {stats.topUploaders.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No uploads yet</p>
              ) : (
                <ul className="space-y-2">
                  {stats.topUploaders.map((u, i) => {
                    const pct = stats.total > 0 ? Math.round((u.count / stats.total) * 100) : 0;
                    return (
                      <li key={u.uid} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium truncate flex items-center gap-1.5">
                            <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                            {u.name}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {u.count} <span className="text-muted-foreground">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {stats.lastUpload && (
                <p className="text-[11px] text-muted-foreground mt-3 pt-2 border-t">
                  Last upload: {format(new Date(stats.lastUpload), "dd MMM yyyy, HH:mm")}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
              <Input placeholder="Search by title, description, officer, uploader…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
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
                    <TableHead className="hidden md:table-cell">Uploaded By</TableHead>
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
                      <TableCell className="hidden md:table-cell text-sm">
                        {d.uploader ? (
                          <div>
                            <div className="font-medium">{d.uploader.first_name} {d.uploader.last_name}</div>
                            <div className="text-xs font-mono text-muted-foreground">{d.uploader.staff_id}</div>
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
                          <Button size="icon" variant="ghost" onClick={() => openEdit(d)} title="Edit"><Pencil className="h-4 w-4 text-amber-600" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleting(d)} title="Delete">
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

      {/* Upload metadata dialog */}
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

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o && !savingEdit) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-amber-600" /> Edit File Details
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="text-xs bg-muted p-2 rounded">
                <span className="font-medium">File:</span> {editing.file_name}
                <span className="mx-2 text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  Uploaded {format(new Date(editing.created_at), "dd MMM yyyy, HH:mm")}
                </span>
              </div>
              <div>
                <Label>Title *</Label>
                <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
              </div>
              <div>
                <Label>Category *</Label>
                <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
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
                  value={editForm.related_profile_id}
                  onValueChange={(v) => setEditForm({ ...editForm, related_profile_id: v })}
                  placeholder="Search and link an officer…"
                  includeAllOption
                  allOptionLabel="No officer linked"
                />
              </div>
              <div>
                <Label>Description / Notes</Label>
                <Textarea
                  rows={3}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={savingEdit}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Saving…" : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o && !deletingBusy) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-semibold">{deleting?.title}</span> and its underlying file from the vault. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
              disabled={deletingBusy}
            >
              {deletingBusy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Inline preview pane */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) { setPreview(null); setCsvText(null); } }}>
        <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center justify-between gap-3 flex-wrap">
              <span className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{preview?.file?.title || preview?.file?.file_name}</span>
              </span>
              <div className="flex gap-2">
                {preview?.url && (
                  <>
                    <Button variant="outline" size="sm" asChild>
                      <a href={preview.url} target="_blank" rel="noopener noreferrer">
                        <Eye className="h-4 w-4 mr-1" /> Open in new tab
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => preview && downloadFile(preview.file)}>
                      <Download className="h-4 w-4 mr-1" /> Download
                    </Button>
                  </>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-muted/30 min-h-[60vh]">
            {previewLoading || !preview?.url ? (
              <div className="h-[60vh] flex items-center justify-center text-sm text-muted-foreground">
                Loading preview…
              </div>
            ) : (
              <PreviewContent file={preview.file} url={preview.url} csvText={csvText} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ===== Inline preview renderer ===== */
function PreviewContent({ file, url, csvText }: { file: any; url: string; csvText: string | null }) {
  const ft = (file.file_type || "").toLowerCase();
  const fn = (file.file_name || "").toLowerCase();
  const isImage = ft.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/.test(fn);
  const isPdf = ft === "application/pdf" || fn.endsWith(".pdf");
  const isCsv = ft === "text/csv" || fn.endsWith(".csv");
  const isText = ft.startsWith("text/") || fn.endsWith(".txt");
  const isOffice = /(officedocument|msword|ms-excel|ms-powerpoint)/.test(ft) ||
    /\.(docx?|xlsx?|pptx?)$/.test(fn);

  if (isImage) {
    return (
      <div className="flex items-center justify-center p-4 min-h-[60vh]">
        <img src={url} alt={file.file_name} loading="lazy" decoding="async" className="max-w-full max-h-[80vh] rounded shadow-md object-contain" />
      </div>
    );
  }
  if (isPdf) {
    return <iframe src={url} title={file.file_name} className="w-full h-[80vh] border-0" />;
  }
  if (isCsv && csvText !== null) {
    const rows = csvText.split(/\r?\n/).filter((r) => r.length > 0).slice(0, 500).map((r) => r.split(","));
    const header = rows[0] || [];
    const body = rows.slice(1);
    return (
      <div className="p-4 overflow-auto">
        <div className="text-xs text-muted-foreground mb-2">
          Showing first {body.length} row{body.length === 1 ? "" : "s"} ({header.length} column{header.length === 1 ? "" : "s"}).
        </div>
        <div className="rounded border bg-card overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>{header.map((h, i) => <th key={i} className="text-left px-2 py-1.5 font-semibold border-b">{h}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, i) => (
                <tr key={i} className="odd:bg-muted/20">
                  {r.map((c, j) => <td key={j} className="px-2 py-1 border-b border-border/40 align-top">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  if (isText && csvText !== null) {
    return <pre className="p-4 text-xs whitespace-pre-wrap break-words">{csvText}</pre>;
  }
  if (isOffice) {
    const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
    return <iframe src={officeUrl} title={file.file_name} className="w-full h-[80vh] border-0" />;
  }
  return (
    <div className="p-8 text-center text-sm text-muted-foreground space-y-2">
      <FileText className="h-10 w-10 mx-auto opacity-40" />
      <p>Preview not available for this file type.</p>
      <Button variant="outline" size="sm" asChild>
        <a href={url} target="_blank" rel="noopener noreferrer">Open in new tab</a>
      </Button>
    </div>
  );
}

/* ===== Small KPI tile (themed via tokens) ===== */
function KpiTile({
  icon, label, value, sub, tone = "primary",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "primary" | "emerald" | "violet" | "amber";
}) {
  const toneClasses: Record<string, string> = {
    primary: "border-primary/20 bg-primary/5 text-primary",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
    violet: "border-violet-500/20 bg-violet-500/5 text-violet-700 dark:text-violet-300",
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300",
  };
  return (
    <div className={cn("rounded-lg border p-3", toneClasses[tone])}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-90">
        {icon}<span>{label}</span>
      </div>
      <div className="mt-1 text-xl font-bold text-foreground tabular-nums truncate">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </div>
  );
}
