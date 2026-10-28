import { useEffect, useId, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MapPin, GripVertical, Lock, AlertTriangle, RefreshCw, FileDown, LayoutGrid, ListTree, Play, Pause } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { commandDashboardPath, reorder, splitCommandName, type RegionalCommandCard } from "@/lib/regional-commands";
import { buildCommandsWordHtml } from "@/lib/command-hierarchy";
import { downloadBlob } from "@/lib/download-utils";
import { logAdminAudit } from "@/lib/admin-audit";
import HierarchyView from "@/components/command/HierarchyView";
import { formatDateTime } from "@/lib/date-format";

const GhanaOutline = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 60 80" className={className} aria-hidden="true">
    <path d="M18 2 L44 3 L46 14 L50 22 L48 34 L52 46 L50 58 L54 66 L40 72 L26 78 L12 74 L8 62 L12 50 L8 38 L12 26 L10 14 Z" fill="currentColor" />
  </svg>
);

function CommandCard({ c, index, sortable, onOpen, onToggleActivation }: { c: RegionalCommandCard; index: number; sortable: boolean; onOpen: () => void; onToggleActivation?: (c: RegionalCommandCard) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id, disabled: !sortable });
  const color = c.brand_color ?? "145 63% 30%";
  const { title, subtitle } = splitCommandName(c.name);
  const pending = c.activation_status !== "active";
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, ["--cc" as string]: color }}
      className={`relative ${isDragging ? "z-10 opacity-80" : ""}`}>
      <button type="button" onClick={onOpen} disabled={!c.can_open}
        aria-label={`${c.name}${pending ? ", pending activation" : ""}`}
        className="group w-full h-full min-h-[118px] rounded-xl border-2 text-left p-3 pb-4 transition shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
        style={{ background: `hsl(${color} / 0.10)`, borderColor: `hsl(${color} / 0.35)`, borderBottomColor: `hsl(${color})`, borderBottomWidth: 4, opacity: pending ? 0.6 : 1 }}>
        <span className="absolute left-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg rounded-br-2xl text-lg font-bold text-primary-foreground" style={{ background: `hsl(${color})` }}>{index + 1}</span>
        <GhanaOutline className="absolute right-3 top-3 h-12 w-9 opacity-15" />
        <div className="flex flex-col items-center pt-1">
          <MapPin className="h-6 w-6" style={{ color: `hsl(${color})` }} aria-hidden />
          <span className="mt-1 text-center font-bold leading-tight" style={{ color: `hsl(${color})` }}>{title}</span>
          {subtitle && <span className="text-center text-sm font-medium text-foreground/80">{subtitle}</span>}
          <span className="mt-2 flex flex-wrap justify-center gap-1">
            {pending ? <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" />Pending activation</Badge>
              : <Badge variant="secondary">Active</Badge>}
            {c.is_own && <Badge>Your command</Badge>}
            {c.staff_count != null && <Badge variant="outline">{c.staff_count} staff</Badge>}
          </span>
        </div>
      </button>
      {sortable && (
        <span {...attributes} {...listeners} aria-label={`Drag to reorder ${c.name}`}
          className="absolute right-1 bottom-1 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted">
          <GripVertical className="h-4 w-4" />
        </span>
      )}
      {onToggleActivation && (
        <span className="absolute left-1 bottom-1">
          <Button type="button" size="sm" variant={pending ? "default" : "outline"} className="h-7 px-2 text-xs"
            aria-label={pending ? `Activate ${c.name}` : `Pause ${c.name}`}
            onClick={(e) => { e.stopPropagation(); onToggleActivation(c); }}>
            {pending ? <><Play className="h-3 w-3 mr-1" />Activate</> : <><Pause className="h-3 w-3 mr-1" />Pause</>}
          </Button>
        </span>
      )}
    </div>
  );
}

export default function RegionalCommands() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const chId = useId();
  const [order, setOrder] = useState<RegionalCommandCard[] | null>(null);
  const [view, setView] = useState<"cards" | "hierarchy">("cards");
  const [activationTarget, setActivationTarget] = useState<RegionalCommandCard | null>(null);
  const [activationReason, setActivationReason] = useState("");
  const [activationSaving, setActivationSaving] = useState(false);

  const cards = useQuery({
    queryKey: ["regional-commands"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("regional_commands_overview");
      if (error) throw error;
      return (data ?? []) as RegionalCommandCard[];
    },
    refetchInterval: 60_000,
  });
  const mine = useQuery({
    queryKey: ["my-command-assignment"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_command_assignment");
      if (error) throw error;
      return data as { status: string; region_id?: string };
    },
    enabled: !isAdmin,
  });
  const unmapped = useQuery({
    queryKey: ["unmapped-staff"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("unmapped_staff_assignments");
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
  });

  useEffect(() => { setOrder(null); }, [cards.data]);
  useEffect(() => {
    const ch = supabase.channel(`regional-cmd-${chId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "org_units" }, () => qc.invalidateQueries({ queryKey: ["regional-commands"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, chId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const list = order ?? cards.data ?? [];

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const prev = list;
    const next = reorder(list, String(e.active.id), String(e.over.id));
    setOrder(next);
    const { error } = await supabase.rpc("save_command_order", { _ids: next.map((c) => c.id) });
    if (error) { setOrder(prev); toast.error(`Order not saved: ${error.message}`); return; }
    toast.success("Card order saved");
    qc.invalidateQueries({ queryKey: ["regional-commands"] });
  };

  const exportWord = () => {
    const html = buildCommandsWordHtml(list, new Date());
    downloadBlob(new Blob([html], { type: "application/msword" }), `regional-commands-${new Date().toISOString().slice(0, 10)}.doc`);
    void logAdminAudit("regional_commands", "exported_word", { rows: list.length });
  };

  const open = (c: RegionalCommandCard) => {
    if (!c.can_open) { toast.info(`${c.name} is pending activation.`); return; }
    navigate(commandDashboardPath(c.id));
  };

  const submitActivation = async () => {
    if (!activationTarget) return;
    const reason = activationReason.trim();
    if (!reason) { toast.error("A reason is required."); return; }
    const next = activationTarget.activation_status === "active" ? "pending" : "active";
    setActivationSaving(true);
    const { error } = await supabase.rpc("set_command_activation", { _unit: activationTarget.id, _status: next, _reason: reason });
    setActivationSaving(false);
    if (error) { toast.error(`Could not update ${activationTarget.name}: ${error.message}`); return; }
    toast.success(`${activationTarget.name} is now ${next === "active" ? "active" : "paused"}.`);
    setActivationTarget(null);
    setActivationReason("");
    qc.invalidateQueries({ queryKey: ["regional-commands"] });
  };

  const status = mine.data?.status;

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border bg-primary px-4 py-5 text-center text-primary-foreground shadow">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wide">REGIONAL COMMANDS <span className="text-secondary">LIST</span></h1>
        <p className="mt-1 text-sm italic opacity-80">Friendship With Vigilance</p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{cards.dataUpdatedAt ? `Last updated ${formatDateTime(new Date(cards.dataUpdatedAt))}` : ""}</span>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-md border" role="tablist" aria-label="View">
            <Button size="sm" variant={view === "cards" ? "secondary" : "ghost"} role="tab" aria-selected={view === "cards"} onClick={() => setView("cards")}>
              <LayoutGrid className="h-3 w-3 mr-1" />Cards
            </Button>
            <Button size="sm" variant={view === "hierarchy" ? "secondary" : "ghost"} role="tab" aria-selected={view === "hierarchy"} onClick={() => setView("hierarchy")}>
              <ListTree className="h-3 w-3 mr-1" />Full hierarchy
            </Button>
          </div>
          {view === "cards" && <Button size="sm" variant="outline" onClick={exportWord} disabled={!list.length}><FileDown className="h-3 w-3 mr-1" />Export to Word</Button>}
          <Button size="sm" variant="outline" onClick={() => cards.refetch()}><RefreshCw className="h-3 w-3 mr-1" />Refresh</Button>
          <Button size="sm" variant="ghost" asChild><Link to={isAdmin ? "/dashboard" : "/portal"}>Skip to my dashboard</Link></Button>
        </div>
      </div>

      {!isAdmin && status && status !== "ok" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Your command assignment needs review</AlertTitle>
          <AlertDescription>
            {status === "conflict" ? "More than one staff record is linked to your account." : status === "unassigned" ? "You are not assigned to a command yet." : "Your unit is not linked to a regional command."} Please contact an administrator.
          </AlertDescription>
        </Alert>
      )}

      {cards.isLoading && <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-xl" />)}</div>}
      {cards.error && <Alert variant="destructive"><AlertDescription>Could not load commands. {(cards.error as Error).message}</AlertDescription></Alert>}
      {!cards.isLoading && !cards.error && list.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No command is available for your account.</p>}

      {view === "hierarchy" ? (
        <HierarchyView isAdmin={isAdmin} />
      ) : (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={list.map((c) => c.id)} strategy={rectSortingStrategy}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            {list.map((c, i) => <CommandCard key={c.id} c={c} index={isAdmin ? i : (c.display_order ?? 1) - 1} sortable={isAdmin} onOpen={() => open(c)} onToggleActivation={isAdmin ? setActivationTarget : undefined} />)}
          </div>
        </SortableContext>
      </DndContext>
      )}

      {isAdmin && (unmapped.data?.length ?? 0) > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{unmapped.data!.length} staff need a command assignment review</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 max-h-40 overflow-y-auto text-xs space-y-0.5">
              {unmapped.data!.slice(0, 25).map((s) => <li key={s.profile_id}>{s.full_name || "Unnamed"} — {s.reason}</li>)}
            </ul>
            <Link to="/command-assignments" className="text-xs underline">Open Command Matrix</Link>
          </AlertDescription>
        </Alert>
      )}

      <Dialog open={!!activationTarget} onOpenChange={(openState) => { if (!openState) { setActivationTarget(null); setActivationReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activationTarget?.activation_status === "active" ? "Pause" : "Activate"} {activationTarget?.name}</DialogTitle>
            <DialogDescription>
              {activationTarget?.activation_status === "active"
                ? "Pausing closes this command's dashboard to staff until it is reactivated. This is audited."
                : "Activating opens this regional command so assigned staff can open its dashboard. This is audited."}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={activationReason} onChange={(e) => setActivationReason(e.target.value)}
            placeholder="Reason for this change (required)" aria-label="Reason" rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActivationTarget(null); setActivationReason(""); }} disabled={activationSaving}>Cancel</Button>
            <Button onClick={submitActivation} disabled={activationSaving || !activationReason.trim()}>
              {activationSaving ? "Saving…" : activationTarget?.activation_status === "active" ? "Pause command" : "Activate command"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-center text-[11px] tracking-widest text-muted-foreground">SECURE BORDERS • SAFE COMMUNITIES • A STRONGER GHANA</p>
    </div>
  );
}
