import { useEffect, useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router-dom";
import { BarChart3, ChevronDown, ChevronRight, FileDown, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { commandDashboardPath } from "@/lib/regional-commands";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ORG_UNIT_TYPE_LABELS, type OrgUnitType } from "@/lib/org-hierarchy";
import { buildHierarchyTree, buildHierarchyWordHtml, flattenedIds, moveWithinSiblings, visibleNodes, type HierarchyNode, type HierarchyUnit } from "@/lib/command-hierarchy";
import { downloadBlob } from "@/lib/download-utils";
import { logAdminAudit } from "@/lib/admin-audit";

function HierarchyRow({ node, sortable, collapsed, onToggle }: {
  node: HierarchyNode;
  sortable: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id, disabled: !sortable });
  const color = node.brand_color ?? "145 63% 30%";
  const pending = node.activation_status !== "active";
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 bg-card ${isDragging ? "z-10 opacity-80 shadow-md" : ""}`}
      role="treeitem" aria-expanded={node.children.length ? !collapsed : undefined} aria-level={node.depth + 1}>
      <span style={{ width: node.depth * 18 }} aria-hidden />
      {node.children.length ? (
        <button type="button" onClick={onToggle} aria-label={`${collapsed ? "Expand" : "Collapse"} ${node.name}`}
          className="rounded p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      ) : <span className="w-5" aria-hidden />}
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `hsl(${color})`, opacity: pending ? 0.4 : 1 }} aria-hidden />
      {pending || !node.is_active ? (
        <span className={`min-w-0 flex-1 truncate text-sm ${node.depth === 0 ? "font-bold" : ""}`}>{node.name}</span>
      ) : (
        <Link to={commandDashboardPath(node.id)}
          className={`min-w-0 flex-1 truncate text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded ${node.depth === 0 ? "font-bold" : ""}`}>
          {node.name}
        </Link>
      )}
      <span className="hidden sm:inline text-xs text-muted-foreground">{ORG_UNIT_TYPE_LABELS[node.type as OrgUnitType] ?? node.type}</span>
      {pending && <Badge variant="outline" className="text-[10px]">Pending</Badge>}
      {!node.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
      {!pending && node.is_active && (
        <Link to={commandDashboardPath(node.id)} aria-label={`Open ${node.name} dashboard`}
          className="rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BarChart3 className="h-4 w-4" />
        </Link>
      )}
      {sortable && (
        <span {...attributes} {...listeners} aria-label={`Drag to reorder ${node.name}`}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted">
          <GripVertical className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}

export default function HierarchyView({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const chId = useId();
  const [roots, setRoots] = useState<HierarchyNode[] | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const units = useQuery({
    queryKey: ["org-units-hierarchy"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_units")
        .select("id, name, code, type, parent_id, is_active, authorised_strength, display_order, activation_status, brand_color")
        .order("display_order", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as HierarchyUnit[];
    },
    refetchInterval: 60_000,
  });

  useEffect(() => { setRoots(null); }, [units.data]);
  useEffect(() => {
    const ch = supabase.channel(`org-hierarchy-${chId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "org_units" }, () => qc.invalidateQueries({ queryKey: ["org-units-hierarchy"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, chId]);

  const tree = useMemo(() => roots ?? (units.data ? buildHierarchyTree(units.data) : []), [roots, units.data]);
  const visible = useMemo(() => visibleNodes(tree, collapsed), [tree, collapsed]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const toggle = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const next = moveWithinSiblings(tree, String(e.active.id), String(e.over.id));
    if (!next) {
      toast.info("You can only reorder entries within the same level — moving an entry under another command would change reporting lines.");
      return;
    }
    setRoots([...next]);
    setSaving(true);
    const { error } = await supabase.rpc("save_command_order", { _ids: flattenedIds(next) });
    setSaving(false);
    if (error) {
      setRoots(null);
      toast.error(`Order not saved: ${error.message}`);
      return;
    }
    toast.success("Hierarchy display order saved");
    qc.invalidateQueries({ queryKey: ["org-units-hierarchy"] });
    qc.invalidateQueries({ queryKey: ["regional-commands"] });
  };

  const exportWord = () => {
    const html = buildHierarchyWordHtml(tree, new Date());
    downloadBlob(new Blob([html], { type: "application/msword" }), `command-hierarchy-${new Date().toISOString().slice(0, 10)}.doc`);
    void logAdminAudit("command_hierarchy", "exported_word", { nodes: flattenedIds(tree).length });
  };

  if (units.isLoading) return <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}</div>;
  if (units.error) return <Alert variant="destructive"><AlertDescription>Could not load the command hierarchy. {(units.error as Error).message}</AlertDescription></Alert>;
  if (!tree.length) return <p className="text-center text-sm text-muted-foreground py-8">No units are available for your account.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {isAdmin
            ? "Drag the handle to reorder entries at the same level. This only changes the display order, never assignments."
            : "The full command hierarchy. Display order is set by administrators."}
          {saving ? " Saving…" : ""}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setCollapsed(new Set(flattenedIds(tree)))}>Collapse all</Button>
          <Button size="sm" variant="ghost" onClick={() => setCollapsed(new Set())}>Expand all</Button>
          <Button size="sm" variant="outline" onClick={exportWord}><FileDown className="h-3 w-3 mr-1" />Export to Word</Button>
        </div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((n) => n.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1" role="tree" aria-label="Command hierarchy">
            {visible.map((n) => (
              <HierarchyRow key={n.id} node={n} sortable={isAdmin} collapsed={collapsed.has(n.id)} onToggle={() => toggle(n.id)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
