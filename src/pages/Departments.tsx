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
  Activity, Contact, LayoutDashboard, Heart, Stethoscope,
} from "lucide-react";
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
