// Portfolio CRUD tab — admins add/rename/delete portfolios used in the
// Staff form's Appointment & Portfolios picker. Shows assignee count per row.

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Plus, Pencil, Trash2, Loader2, Save, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface Portfolio {
  id: string;
  name: string;
  description: string | null;
  created_at?: string;
}

export function PortfoliosTab() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Portfolio | null>(null);

  const { data: portfolios = [], isLoading } = useQuery({
    queryKey: ["portfolios-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolios")
        .select("id, name, description, created_at")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Portfolio[];
    },
  });

  const { data: counts = {} } = useQuery({
    queryKey: ["portfolio-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_portfolios")
        .select("portfolio_id");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.portfolio_id] = (map[r.portfolio_id] ?? 0) + 1;
      return map;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("portfolios")
        .insert({ name: newName.trim(), description: newDesc.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolios-admin"] });
      qc.invalidateQueries({ queryKey: ["portfolios"] });
      setNewName(""); setNewDesc("");
      toast.success("Portfolio created");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not create portfolio"),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const { error } = await supabase
        .from("portfolios")
        .update({ name: editName.trim(), description: editDesc.trim() || null })
        .eq("id", editingId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolios-admin"] });
      qc.invalidateQueries({ queryKey: ["portfolios"] });
      setEditingId(null);
      toast.success("Portfolio updated");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not update portfolio"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("portfolios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolios-admin"] });
      qc.invalidateQueries({ queryKey: ["portfolios"] });
      qc.invalidateQueries({ queryKey: ["portfolio-counts"] });
      setDeleteTarget(null);
      toast.success("Portfolio deleted");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not delete portfolio"),
  });

  const startEdit = (p: Portfolio) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditDesc(p.description ?? "");
  };

  const totalAssignees = useMemo(
    () => Object.values(counts).reduce((a, b) => a + b, 0),
    [counts]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" /> Portfolio Management
        </CardTitle>
        <CardDescription>
          Create the portfolios that command-tier users can assign to staff in the
          Staff form's Appointment &amp; Portfolios section. {portfolios.length} portfolios &middot; {totalAssignees} active assignments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdmin && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="text-sm font-medium">Add a new portfolio</div>
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <Input
                placeholder="Portfolio name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Input
                placeholder="Short description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
              <Button
                onClick={() => create.mutate()}
                disabled={!newName.trim() || create.isPending}
              >
                {create.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Plus className="h-4 w-4 mr-1" /> Add</>}
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-24 text-center">Assignees</TableHead>
                {isAdmin && <TableHead className="w-40 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && portfolios.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No portfolios yet.</TableCell></TableRow>
              )}
              {portfolios.map((p) => {
                const isEditing = editingId === p.id;
                const assignees = counts[p.id] ?? 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      {isEditing ? (
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                      ) : (
                        <span className="font-medium">{p.name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Textarea
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          rows={2}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">{p.description ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={assignees > 0 ? "default" : "outline"}>{assignees}</Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" onClick={() => update.mutate()} disabled={!editName.trim() || update.isPending}>
                              {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="h-3.5 w-3.5 mr-1" /> Save</>}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="outline" onClick={() => startEdit(p)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm" variant="outline"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(p)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete portfolio?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove "{deleteTarget?.name}" and unassign it from{" "}
              {deleteTarget ? counts[deleteTarget.id] ?? 0 : 0} staff member(s). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
