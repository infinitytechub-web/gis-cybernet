import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useConfidentialityCommands, type ConfidentialityCommand } from "@/hooks/useConfidentialityCommands";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Crown, Pencil, Plus, Trash2, ExternalLink, Pin } from "lucide-react";
import { useNavigate } from "react-router-dom";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

type FormState = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  pinned: boolean;
  sort_hint: number;
};

const empty: FormState = { name: "", slug: "", description: "", pinned: false, sort_hint: 0 };

export default function CommandsAdmin() {
  const { isAdmin } = useAuth();
  const { data: commands = [], isLoading } = useConfidentialityCommands();
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConfidentialityCommand | null>(null);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Restricted</CardTitle>
            <CardDescription>Only administrators can manage commands.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (c: ConfidentialityCommand) => {
    setForm({
      id: c.id, name: c.name, slug: c.slug,
      description: c.description ?? "", pinned: c.pinned, sort_hint: c.sort_hint,
    });
    setOpen(true);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) { toast({ title: "Name is required", variant: "destructive" }); return; }
    const slug = (form.slug.trim() || slugify(name));
    if (!slug) { toast({ title: "Could not derive a URL slug", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (form.id) {
        const { error } = await supabase
          .from("confidentiality_commands" as any)
          .update({ name, slug, description: form.description || null, pinned: form.pinned, sort_hint: form.sort_hint })
          .eq("id", form.id);
        if (error) throw error;
        toast({ title: "Command updated" });
      } else {
        const { error } = await supabase
          .from("confidentiality_commands" as any)
          .insert({ name, slug, description: form.description || null, pinned: form.pinned, sort_hint: form.sort_hint });
        if (error) throw error;
        toast({ title: "Command created" });
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["confidentiality-commands"] });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase
        .from("confidentiality_commands" as any)
        .delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "Command deleted" });
      qc.invalidateQueries({ queryKey: ["confidentiality-commands"] });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Crown className="h-6 w-6 text-amber-600" />
            Commands
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage the list of commands shown under <span className="font-medium">Confidentiality</span>.
            Each command opens the operational dashboard scoped to that command's name.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> New command
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All commands</CardTitle>
          <CardDescription>
            Pinned commands always appear first; the rest are listed alphabetically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                ) : commands.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No commands yet.</TableCell></TableRow>
                ) : commands.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {c.pinned && <Pin className="h-3.5 w-3.5 text-amber-600" />}
                        <span className="font-medium">{c.name}</span>
                      </div>
                      {c.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{c.description}</div>
                      )}
                    </TableCell>
                    <TableCell><code className="text-xs">{c.slug}</code></TableCell>
                    <TableCell>
                      {c.pinned ? <Badge variant="secondary">Pinned</Badge> : <span className="text-xs text-muted-foreground">A–Z</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/command/${c.slug}`)}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(c)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Editor dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit command" : "New command"}</DialogTitle>
            <DialogDescription>
              The slug is used in the URL (e.g. <code>/command/your-slug</code>). Leave it blank to auto-generate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cmd-name">Name</Label>
              <Input id="cmd-name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.id ? form.slug : slugify(e.target.value) })} />
            </div>
            <div>
              <Label htmlFor="cmd-slug">Slug</Label>
              <Input id="cmd-slug" value={form.slug}
                onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} />
            </div>
            <div>
              <Label htmlFor="cmd-desc">Description (optional)</Label>
              <Textarea id="cmd-desc" rows={2} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="cmd-pinned">Pin to top</Label>
                <p className="text-xs text-muted-foreground">Pinned commands appear before alphabetical entries.</p>
              </div>
              <Switch id="cmd-pinned" checked={form.pinned}
                onCheckedChange={(v) => setForm({ ...form, pinned: v })} />
            </div>
            {form.pinned && (
              <div>
                <Label htmlFor="cmd-order">Pinned order</Label>
                <Input id="cmd-order" type="number" value={form.sort_hint}
                  onChange={(e) => setForm({ ...form, sort_hint: Number(e.target.value) || 0 })} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete command?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will be removed from the Confidentiality menu. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
