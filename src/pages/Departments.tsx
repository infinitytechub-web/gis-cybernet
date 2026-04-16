import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, Plus, Pencil, Trash2, Search, Shield, Stamp, FileSearch, Lock, Crosshair,
  ShieldAlert, ClipboardCheck, Package, Briefcase, Users, Award, Megaphone, BarChart3,
  CalendarCheck, Clock, CalendarDays, CalendarOff, Calendar as CalendarIcon, ArrowRightLeft,
  Activity, Contact, LayoutDashboard, Heart, Stethoscope, Eye, Download, Printer,
} from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { downloadBlob } from "@/lib/download-utils";
import { format as fmtDate } from "date-fns";
import { toast } from "sonner";

const ICON_REGISTRY: Record<string, React.ComponentType<{ className?: string }>> = {
  Building2, Shield, Stamp, FileSearch, Lock, Crosshair, ShieldAlert, ClipboardCheck,
  Package, Briefcase, Users, Award, Megaphone, BarChart3, CalendarCheck, Clock,
  CalendarDays, CalendarOff, Calendar: CalendarIcon, ArrowRightLeft, Activity, Contact,
  LayoutDashboard, Heart, Stethoscope,
};
const ICON_OPTIONS = Object.keys(ICON_REGISTRY);

const DEPT_COLORS = [
  { border: "border-blue-300 dark:border-blue-700", bg: "bg-blue-50/50 dark:bg-blue-950/20", icon: "text-blue-600 dark:text-blue-400" },
  { border: "border-emerald-300 dark:border-emerald-700", bg: "bg-emerald-50/50 dark:bg-emerald-950/20", icon: "text-emerald-600 dark:text-emerald-400" },
  { border: "border-purple-300 dark:border-purple-700", bg: "bg-purple-50/50 dark:bg-purple-950/20", icon: "text-purple-600 dark:text-purple-400" },
  { border: "border-amber-300 dark:border-amber-700", bg: "bg-amber-50/50 dark:bg-amber-950/20", icon: "text-amber-600 dark:text-amber-400" },
  { border: "border-rose-300 dark:border-rose-700", bg: "bg-rose-50/50 dark:bg-rose-950/20", icon: "text-rose-600 dark:text-rose-400" },
  { border: "border-cyan-300 dark:border-cyan-700", bg: "bg-cyan-50/50 dark:bg-cyan-950/20", icon: "text-cyan-600 dark:text-cyan-400" },
  { border: "border-indigo-300 dark:border-indigo-700", bg: "bg-indigo-50/50 dark:bg-indigo-950/20", icon: "text-indigo-600 dark:text-indigo-400" },
  { border: "border-orange-300 dark:border-orange-700", bg: "bg-orange-50/50 dark:bg-orange-950/20", icon: "text-orange-600 dark:text-orange-400" },
];

function buildDepartmentDocHTML(dept: any) {
  const Icon = ICON_REGISTRY[dept.icon] ?? Building2;
  const iconSvg = renderToStaticMarkup(
    // @ts-ignore lucide accepts these props
    <Icon width={56} height={56} stroke="#1e3a8a" strokeWidth={1.6} />
  );
  const created = dept.created_at ? fmtDate(new Date(dept.created_at), "dd MMM yyyy") : "—";
  const safe = (s?: string | null) => (s ?? "—").toString().replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>${safe(dept.name)} — Department Profile</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;margin:0;padding:32px;background:#fff}
  .sheet{max-width:780px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
  .header{display:flex;align-items:center;gap:20px;padding:24px 28px;background:linear-gradient(135deg,#f0f9ff,#eef2ff);border-bottom:2px solid #1e3a8a}
  .icon-box{width:80px;height:80px;background:#fff;border:2px solid #1e3a8a;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  h1{margin:0;font-size:24px;color:#0f172a}
  .sub{margin:4px 0 0;color:#475569;font-size:13px}
  .body{padding:24px 28px}
  .section{margin-bottom:20px}
  .label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:600;margin-bottom:6px}
  .value{font-size:14px;color:#0f172a;line-height:1.55}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding-top:16px;border-top:1px dashed #e5e7eb}
  .footer{padding:16px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:11px;color:#64748b;display:flex;justify-content:space-between}
  .stamp{font-weight:700;color:#1e3a8a;letter-spacing:.05em}
  @media print{body{padding:0}.sheet{border:none}}
</style></head>
<body>
  <div class="sheet">
    <div class="header">
      <div class="icon-box">${iconSvg}</div>
      <div>
        <h1>${safe(dept.name)}</h1>
        <p class="sub">Ghana Immigration Service — Departmental Profile</p>
      </div>
    </div>
    <div class="body">
      <div class="section">
        <div class="label">Description</div>
        <div class="value">${safe(dept.description) || "<em>No description provided.</em>"}</div>
      </div>
      <div class="meta">
        <div><div class="label">Department ID</div><div class="value">${safe(dept.id)}</div></div>
        <div><div class="label">Created</div><div class="value">${created}</div></div>
        <div><div class="label">Icon</div><div class="value">${safe(dept.icon || "Building2")}</div></div>
        <div><div class="label">Status</div><div class="value">Active</div></div>
      </div>
    </div>
    <div class="footer">
      <span class="stamp">GIS · ASC</span>
      <span>Generated ${fmtDate(new Date(), "dd MMM yyyy HH:mm")}</span>
    </div>
  </div>
</body></html>`;
}

function viewDepartmentDoc(dept: any) {
  const html = buildDepartmentDocHTML(dept);
  const w = window.open("", "_blank");
  if (!w) { toast.error("Please allow pop-ups to view"); return; }
  w.document.write(html); w.document.close();
}

function downloadDepartmentDoc(dept: any) {
  const html = buildDepartmentDocHTML(dept);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  downloadBlob(blob, `Department_${(dept.name || "department").replace(/\s+/g, "_")}.html`);
  toast.success("Download started");
}

function printDepartmentDoc(dept: any) {
  const html = buildDepartmentDocHTML(dept);
  const w = window.open("", "_blank");
  if (!w) { toast.error("Please allow pop-ups to print"); return; }
  w.document.write(html); w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}

export default function Departments() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<any>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string>("Building2");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "newest" | "oldest">("name-asc");

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? departments.filter((d: any) =>
          (d.name || "").toLowerCase().includes(q) ||
          (d.description || "").toLowerCase().includes(q)
        )
      : [...departments];
    list.sort((a: any, b: any) => {
      switch (sortBy) {
        case "name-desc": return (b.name || "").localeCompare(a.name || "");
        case "newest": return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "oldest": return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        default: return (a.name || "").localeCompare(b.name || "");
      }
    });
    return list;
  }, [departments, search, sortBy]);

  const openCreate = () => {
    setEditingDept(null);
    setName("");
    setDescription("");
    setIcon("Building2");
    setDialogOpen(true);
  };

  const openEdit = (dept: any) => {
    setEditingDept(dept);
    setName(dept.name);
    setDescription(dept.description || "");
    setIcon(dept.icon || "Building2");
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      const payload: any = {
        name: name.trim(),
        description: description.trim() || null,
        icon: icon || "Building2",
      };
      if (editingDept) {
        const { error } = await supabase.from("departments").update(payload).eq("id", editingDept.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("departments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setDialogOpen(false);
      toast.success(editingDept ? "Department updated" : "Department created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Department deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const PreviewIcon = ICON_REGISTRY[icon] ?? Building2;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-secondary">Departments</h1>
        {isAdmin && (
          <Button onClick={openCreate} className="gap-1 w-full sm:w-auto">
            <Plus className="h-4 w-4" /> Add Department
          </Button>
        )}
      </div>

      {/* Search + Sort dropdown */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search departments by name or description…"
            className="pl-9"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="sm:w-48"><SelectValue placeholder="Sort by" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name-asc">Name (A → Z)</SelectItem>
            <SelectItem value="name-desc">Name (Z → A)</SelectItem>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed rounded-md">
          No departments match your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d: any, idx: number) => {
            const dc = DEPT_COLORS[idx % DEPT_COLORS.length];
            const Icon = ICON_REGISTRY[d.icon] ?? Building2;
            return (
              <Card key={d.id} className={`${dc.border} ${dc.bg}`}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 ${dc.icon}`} />
                    <CardTitle className="text-base">{d.name}</CardTitle>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete "{d.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone. Staff assigned to this department will lose their department assignment.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(d.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{d.description || "No description"}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDept ? "Edit Department" : "Add Department"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Department name" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" rows={2} />
            </div>
            <div>
              <Label>Icon</Label>
              <div className="flex items-center gap-2">
                <Select value={icon} onValueChange={setIcon}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Pick an icon" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {ICON_OPTIONS.map((key) => {
                      const I = ICON_REGISTRY[key];
                      return (
                        <SelectItem key={key} value={key}>
                          <span className="inline-flex items-center gap-2">
                            <I className="h-4 w-4" />
                            <span>{key}</span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <div className="h-10 w-10 flex items-center justify-center rounded-md border bg-muted">
                  <PreviewIcon className="h-5 w-5 text-secondary" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">This icon appears on cards and printable reports.</p>
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name.trim()} className="w-full">
              {saveMutation.isPending ? "Saving…" : editingDept ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
