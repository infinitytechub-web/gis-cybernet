import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Building2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Departments() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<any>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const openCreate = () => {
    setEditingDept(null);
    setName("");
    setDescription("");
    setDialogOpen(true);
  };

  const openEdit = (dept: any) => {
    setEditingDept(dept);
    setName(dept.name);
    setDescription(dept.description || "");
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      if (editingDept) {
        const { error } = await supabase.from("departments").update({ name: name.trim(), description: description.trim() || null }).eq("id", editingDept.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("departments").insert({ name: name.trim(), description: description.trim() || null });
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-secondary">Departments</h1>
        {isAdmin && (
          <Button onClick={openCreate} className="gap-1">
            <Plus className="h-4 w-4" /> Add Department
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((d, idx) => {
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
            const dc = DEPT_COLORS[idx % DEPT_COLORS.length];
            return (
            <Card key={d.id} className={`${dc.border} ${dc.bg}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                  <Building2 className={`h-5 w-5 ${dc.icon}`} />
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
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name.trim()} className="w-full">
              {saveMutation.isPending ? "Saving..." : editingDept ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
