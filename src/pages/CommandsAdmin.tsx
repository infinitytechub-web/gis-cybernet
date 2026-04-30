import { useEffect, useMemo, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import {
  Crown, Pencil, Plus, Trash2, ExternalLink, Pin, GripVertical,
  Save, RotateCcw, ArrowDownAZ, ArrowUp, ArrowDown, Minus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
};

const empty: FormState = { name: "", slug: "", description: "", pinned: false };

/** A single sortable row in either the Pinned or Alphabetical list. */
function SortableRow({
  cmd, onEdit, onDelete, onOpen,
}: {
  cmd: ConfidentialityCommand;
  onEdit: (c: ConfidentialityCommand) => void;
  onDelete: (c: ConfidentialityCommand) => void;
  onOpen: (c: ConfidentialityCommand) => void;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: cmd.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border bg-card px-2 py-2 ${
        isDragging ? "ring-2 ring-primary shadow-lg" : "hover:bg-muted/40"
      }`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground touch-none"
        aria-label={`Drag ${cmd.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {cmd.pinned ? (
        <Pin className="h-3.5 w-3.5 text-amber-600 shrink-0" />
      ) : (
        <Crown className="h-3.5 w-3.5 text-[hsl(220,80%,40%)] shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{cmd.name}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          <code>{cmd.slug}</code>
          {cmd.description ? <span className="ml-2">· {cmd.description}</span> : null}
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => onOpen(cmd)} title="Open workspace">
          <ExternalLink className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onEdit(cmd)} title="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDelete(cmd)} title="Delete">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export default function CommandsAdmin() {
  const { isAdmin } = useAuth();
  const { data: serverCommands = [], isLoading } = useConfidentialityCommands();
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Local working copy for drag-and-drop preview before saving.
  const [pinnedDraft, setPinnedDraft] = useState<ConfidentialityCommand[]>([]);
  const [unpinnedDraft, setUnpinnedDraft] = useState<ConfidentialityCommand[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  // Sync draft with server on data change (only when not actively reordering).
  useEffect(() => {
    setPinnedDraft(serverCommands.filter((c) => c.pinned));
    setUnpinnedDraft(serverCommands.filter((c) => !c.pinned));
  }, [serverCommands]);

  // Detect dirty state by comparing current draft order with server order.
  const isDirty = useMemo(() => {
    const serverPinned = serverCommands.filter((c) => c.pinned).map((c) => c.id).join(",");
    const serverUn = serverCommands.filter((c) => !c.pinned).map((c) => c.id).join(",");
    return (
      pinnedDraft.map((c) => c.id).join(",") !== serverPinned ||
      unpinnedDraft.map((c) => c.id).join(",") !== serverUn
    );
  }, [pinnedDraft, unpinnedDraft, serverCommands]);

  // Build a per-list diff for the confirmation dialog.
  type DiffRow = { id: string; name: string; oldIdx: number | null; newIdx: number | null; delta: number | null };
  const buildDiff = (
    serverList: ConfidentialityCommand[],
    draftList: ConfidentialityCommand[],
  ): DiffRow[] => {
    const oldIndexById = new Map(serverList.map((c, i) => [c.id, i]));
    return draftList.map((c, newIdx) => {
      const oldIdx = oldIndexById.has(c.id) ? oldIndexById.get(c.id)! : null;
      const delta = oldIdx == null ? null : oldIdx - newIdx; // positive = moved up
      return { id: c.id, name: c.name, oldIdx, newIdx, delta };
    });
  };
  const pinnedDiff = useMemo(
    () => buildDiff(serverCommands.filter((c) => c.pinned), pinnedDraft),
    [serverCommands, pinnedDraft],
  );
  const unpinnedDiff = useMemo(
    () => buildDiff(serverCommands.filter((c) => !c.pinned), unpinnedDraft),
    [serverCommands, unpinnedDraft],
  );
  const movedCount =
    pinnedDiff.filter((r) => (r.delta ?? 0) !== 0).length +
    unpinnedDiff.filter((r) => (r.delta ?? 0) !== 0).length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Editor state
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConfidentialityCommand | null>(null);
  const [confirmOrderOpen, setConfirmOrderOpen] = useState(false);

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
      description: c.description ?? "", pinned: c.pinned,
    });
    setOpen(true);
  };

  const handleDragEnd = (list: "pinned" | "unpinned") => (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    if (list === "pinned") {
      setPinnedDraft((items) => {
        const oldIdx = items.findIndex((i) => i.id === active.id);
        const newIdx = items.findIndex((i) => i.id === over.id);
        if (oldIdx < 0 || newIdx < 0) return items;
        return arrayMove(items, oldIdx, newIdx);
      });
    } else {
      setUnpinnedDraft((items) => {
        const oldIdx = items.findIndex((i) => i.id === active.id);
        const newIdx = items.findIndex((i) => i.id === over.id);
        if (oldIdx < 0 || newIdx < 0) return items;
        return arrayMove(items, oldIdx, newIdx);
      });
    }
  };

  const resetOrder = () => {
    setPinnedDraft(serverCommands.filter((c) => c.pinned));
    setUnpinnedDraft(serverCommands.filter((c) => !c.pinned));
  };

  const sortAlphabetically = () => {
    setUnpinnedDraft((items) => [...items].sort((a, b) => a.name.localeCompare(b.name)));
  };

  const persistOrder = async () => {
    setSavingOrder(true);
    try {
      // sort_hint = (index + 1) * 10 within each group, so subsequent moves leave room.
      const updates = [
        ...pinnedDraft.map((c, i) => ({ id: c.id, sort_hint: (i + 1) * 10 })),
        ...unpinnedDraft.map((c, i) => ({ id: c.id, sort_hint: (i + 1) * 10 })),
      ];
      // Run in parallel batches.
      const results = await Promise.all(
        updates.map((u) =>
          supabase.from("confidentiality_commands" as any)
            .update({ sort_hint: u.sort_hint }).eq("id", u.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      toast({ title: "Order saved", description: `${updates.length} commands updated.` });
      qc.invalidateQueries({ queryKey: ["confidentiality-commands"] });
    } catch (e: any) {
      toast({ title: "Could not save order", description: e.message, variant: "destructive" });
    } finally {
      setSavingOrder(false);
    }
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
          .update({ name, slug, description: form.description || null, pinned: form.pinned })
          .eq("id", form.id);
        if (error) throw error;
        toast({ title: "Command updated" });
      } else {
        const { error } = await supabase
          .from("confidentiality_commands" as any)
          .insert({ name, slug, description: form.description || null, pinned: form.pinned });
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
            Drag to reorder. Pinned commands always appear first; the rest follow in the order shown.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <>
              <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-700">
                Unsaved order
              </Badge>
              <Button variant="ghost" size="sm" onClick={resetOrder} disabled={savingOrder}>
                <RotateCcw className="h-4 w-4 mr-1" /> Reset
              </Button>
              <Button size="sm" onClick={() => setConfirmOrderOpen(true)} disabled={savingOrder}>
                <Save className="h-4 w-4 mr-1" /> Save order
              </Button>
            </>
          )}
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" /> New command
          </Button>
        </div>
      </div>

      {/* Pinned list */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Pin className="h-4 w-4 text-amber-600" /> Pinned
            </CardTitle>
            <CardDescription>Always shown first in the menu.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-4">Loading…</div>
          ) : pinnedDraft.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">No pinned commands.</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd("pinned")}>
              <SortableContext items={pinnedDraft.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {pinnedDraft.map((c) => (
                    <SortableRow
                      key={c.id} cmd={c}
                      onEdit={openEdit} onDelete={setDeleteTarget}
                      onOpen={(x) => navigate(`/command/${x.slug}`)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* Unpinned / alphabetical list */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">All other commands</CardTitle>
            <CardDescription>Drag to reorder, or reset to alphabetical.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={sortAlphabetically}>
            <ArrowDownAZ className="h-4 w-4 mr-1" /> Sort A–Z
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-4">Loading…</div>
          ) : unpinnedDraft.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">No commands yet.</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd("unpinned")}>
              <SortableContext items={unpinnedDraft.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {unpinnedDraft.map((c) => (
                    <SortableRow
                      key={c.id} cmd={c}
                      onEdit={openEdit} onDelete={setDeleteTarget}
                      onOpen={(x) => navigate(`/command/${x.slug}`)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* Editor dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit command" : "New command"}</DialogTitle>
            <DialogDescription>
              The slug is used in the URL (e.g. <code>/command/your-slug</code>). Leave blank to auto-generate.
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
                <p className="text-xs text-muted-foreground">Pinned commands appear before the rest.</p>
              </div>
              <Switch id="cmd-pinned" checked={form.pinned}
                onCheckedChange={(v) => setForm({ ...form, pinned: v })} />
            </div>
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
