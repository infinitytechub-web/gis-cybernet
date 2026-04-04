import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function Roles() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [level, setLevel] = useState("0");

  const { data: ranks = [], isLoading } = useQuery({
    queryKey: ["ranks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ranks").select("*").order("level", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: staffCounts = {} } = useQuery({
    queryKey: ["ranks-staff-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("rank_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data?.forEach((p) => { if (p.rank_id) counts[p.rank_id] = (counts[p.rank_id] || 0) + 1; });
      return counts;
    },
  });

  const openCreate = () => {
    setEditing(null);
    setName("");
    setAbbreviation("");
    setLevel("0");
    setDialogOpen(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setName(r.name);
    setAbbreviation(r.abbreviation);
    setLevel(String(r.level));
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !abbreviation.trim()) throw new Error("Name and abbreviation required");
      const payload = { name: name.trim(), abbreviation: abbreviation.trim().toUpperCase(), level: parseInt(level) || 0 };
      if (editing) {
        const { error } = await supabase.from("ranks").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ranks").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ranks"] });
      setDialogOpen(false);
      toast.success(editing ? "Rank updated" : "Rank created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ranks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ranks"] });
      toast.success("Rank deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold text-secondary">GIS Rank Structure</h1>
        </div>
        <p className="text-sm text-muted-foreground">Official Ghana Immigration Service ranking hierarchy — {ranks.length} ranks</p>
        {isAdmin && (
          <Button onClick={openCreate} className="gap-1">
            <Plus className="h-4 w-4" /> Add Rank
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Level</TableHead>
                <TableHead>Rank</TableHead>
                <TableHead>Abbreviation</TableHead>
                <TableHead className="text-center">Staff</TableHead>
                {isAdmin && <TableHead className="w-[80px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranks.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">{r.level}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="secondary">{r.abbreviation}</Badge></TableCell>
                  <TableCell className="text-center text-muted-foreground">{staffCounts[r.id] || 0}</TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}>
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
                              <AlertDialogTitle>Delete "{r.name}"?</AlertDialogTitle>
                              <AlertDialogDescription>This will remove the rank. Staff with this rank will lose their rank assignment.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(r.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Rank" : "Add Rank"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Superintendent" />
            </div>
            <div>
              <Label>Abbreviation</Label>
              <Input value={abbreviation} onChange={(e) => setAbbreviation(e.target.value)} placeholder="e.g. SUPT" />
            </div>
            <div>
              <Label>Level (higher = senior)</Label>
              <Input type="number" value={level} onChange={(e) => setLevel(e.target.value)} />
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name.trim() || !abbreviation.trim()} className="w-full">
              {saveMutation.isPending ? "Saving..." : editing ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
