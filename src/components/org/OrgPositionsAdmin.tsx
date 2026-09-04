/**
 * POSITIONS REGISTER — the establishment: who holds which appointment, at which
 * command. Administrators (admin / OIC / 2IC per the RLS policy on
 * `org_positions`) can create, search, filter, edit and delete positions;
 * everyone else sees the register read-only.
 *
 * Rows come from the `org_position_roster` report, which resolves the holder's
 * name and rank and the full command path, and is already scoped to the
 * caller's reach.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgUnits } from "@/hooks/useOrgScope";
import { CommandPicker } from "@/components/org/CommandPicker";
import { QuickScroll } from "@/components/ui/quick-scroll";
import { descendantIds } from "@/lib/org-hierarchy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StaffCombobox } from "@/components/ui/staff-combobox";
import { Crown, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

/** Establishment levels, in the same order as the command hierarchy. */
export const POSITION_LEVELS = [
  "directorate",
  "management_member",
  "regional_commander",
  "commandant",
  "commanding_officer",
  "sector_commander",
  "departmental_head",
  "sectional_head",
  "unit_head",
  "control_head",
] as const;

export type PositionLevel = (typeof POSITION_LEVELS)[number];

export const POSITION_LEVEL_LABELS: Record<PositionLevel, string> = {
  directorate: "Directorate",
  management_member: "Management Member",
  regional_commander: "Regional Commander",
  commandant: "Commandant",
  commanding_officer: "Commanding Officer",
  sector_commander: "Sector Commander",
  departmental_head: "Departmental Head",
  sectional_head: "Sectional Head",
  unit_head: "Unit Head",
  control_head: "Control Head",
};

export interface PositionRow {
  id: string;
  title: string;
  position_level: PositionLevel;
  org_unit_id: string | null;
  org_unit_name: string | null;
  command_path: string | null;
  holder_profile_id: string | null;
  holder_name: string | null;
  holder_rank: string | null;
  holder_staff_id: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  is_active: boolean;
  is_vacant: boolean;
}

/** Shared read hook so the HR hub and this panel never disagree. */
export function useOrgPositions() {
  return useQuery({
    queryKey: ["org-positions"],
    staleTime: 60_000,
    queryFn: async (): Promise<PositionRow[]> => {
      const { data, error } = await supabase.rpc("org_position_roster");
      if (error) throw error;
      return (data ?? []) as unknown as PositionRow[];
    },
  });
}

const emptyForm = {
  id: "",
  title: "",
  position_level: "unit_head" as PositionLevel,
  org_unit_id: null as string | null,
  holder_profile_id: null as string | null,
  start_date: "",
  end_date: "",
  notes: "",
  is_active: true,
};

export function OrgPositionsAdmin() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const { data: units = [] } = useOrgUnits();
  const positionsQuery = useOrgPositions();

  const canManage = role === "admin" || role === "oic" || role === "2ic";

  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string | null>(null);
  const [vacancyFilter, setVacancyFilter] = useState<"all" | "filled" | "vacant">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const scopeIds = useMemo(
    () => (unitFilter ? new Set(descendantIds(units, unitFilter)) : null),
    [unitFilter, units],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (positionsQuery.data ?? []).filter((p) => {
      if (levelFilter !== "all" && p.position_level !== levelFilter) return false;
      if (scopeIds && (!p.org_unit_id || !scopeIds.has(p.org_unit_id))) return false;
      if (vacancyFilter === "vacant" && !p.is_vacant) return false;
      if (vacancyFilter === "filled" && p.is_vacant) return false;
      if (!q) return true;
      return [
        p.title,
        POSITION_LEVEL_LABELS[p.position_level],
        p.org_unit_name,
        p.command_path,
        p.holder_name,
        p.holder_rank,
        p.holder_staff_id,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [positionsQuery.data, search, levelFilter, scopeIds, vacancyFilter]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        position_level: form.position_level,
        org_unit_id: form.org_unit_id,
        holder_profile_id: form.holder_profile_id,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      };
      if (!payload.title) throw new Error("A position title is required");
      if (form.id) {
        const { error } = await supabase.from("org_positions").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("org_positions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Position updated" : "Position created");
      setDialogOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["org-positions"] });
    },
    onError: (e: Error) => toast.error(e.message || "You are not permitted to change positions"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("org_positions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Position removed");
      qc.invalidateQueries({ queryKey: ["org-positions"] });
    },
    onError: (e: Error) => toast.error(e.message || "You are not permitted to remove positions"),
  });

  const openCreate = () => {
    setForm({ ...emptyForm, org_unit_id: unitFilter });
    setDialogOpen(true);
  };

  const openEdit = (p: PositionRow) => {
    setForm({
      id: p.id,
      title: p.title,
      position_level: p.position_level,
      org_unit_id: p.org_unit_id,
      holder_profile_id: p.holder_profile_id,
      start_date: p.start_date ?? "",
      end_date: p.end_date ?? "",
      notes: p.notes ?? "",
      is_active: p.is_active,
    });
    setDialogOpen(true);
  };

  const vacant = rows.filter((r) => r.is_vacant).length;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            Positions &amp; appointment holders
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} position{rows.length === 1 ? "" : "s"} · {vacant} vacant.
            Directorate, Management, Regional Commanders, Commandants, Commanding
            Officers, Sector Commanders, Departmental, Sectional and Unit Heads.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New position
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              className="pl-9"
              placeholder="Search position, holder or command…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search positions"
            />
          </div>
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger aria-label="Filter by level">
              <SelectValue placeholder="All levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {POSITION_LEVELS.map((l) => (
                <SelectItem key={l} value={l}>{POSITION_LEVEL_LABELS[l]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CommandPicker units={units} value={unitFilter} onChange={setUnitFilter} />
          <Select value={vacancyFilter} onValueChange={(v) => setVacancyFilter(v as typeof vacancyFilter)}>
            <SelectTrigger aria-label="Filter by vacancy">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Filled and vacant</SelectItem>
              <SelectItem value="filled">Filled only</SelectItem>
              <SelectItem value="vacant">Vacant only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="relative overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Position</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Command</TableHead>
                <TableHead>Holder</TableHead>
                <TableHead>Since</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {positionsQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground">
                    Loading positions…
                  </TableCell>
                </TableRow>
              )}
              {!positionsQuery.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground">
                    No positions match these filters yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((p) => (
                <TableRow key={p.id} className={p.is_active ? "" : "opacity-60"}>
                  <TableCell className="font-medium">
                    {p.title}
                    {!p.is_active && <Badge variant="outline" className="ml-2">Inactive</Badge>}
                  </TableCell>
                  <TableCell>{POSITION_LEVEL_LABELS[p.position_level]}</TableCell>
                  <TableCell className="max-w-[260px]">
                    <span className="block truncate">{p.org_unit_name ?? "—"}</span>
                    {p.command_path && (
                      <span className="block truncate text-xs text-muted-foreground">{p.command_path}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.is_vacant ? (
                      <Badge variant="destructive">Vacant</Badge>
                    ) : (
                      <span>
                        {p.holder_rank ? `${p.holder_rank} ` : ""}
                        {p.holder_name}
                        {p.holder_staff_id ? (
                          <span className="block text-xs text-muted-foreground">{p.holder_staff_id}</span>
                        ) : null}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{p.start_date ?? "—"}</TableCell>
                  {canManage && (
                    <TableCell className="space-x-1 text-right">
                      <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Edit {p.title}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => remove.mutate(p.id)}
                        disabled={remove.isPending}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Remove {p.title}</span>
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <QuickScroll label="positions list" threshold={600} />
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[min(36rem,95vw)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit position" : "New position"}</DialogTitle>
            <DialogDescription>
              Positions belong to a command; the holder is optional so vacancies
              can be tracked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pos-title">Position title</Label>
              <Input
                id="pos-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Sector Commander, Amasaman"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pos-level">Level</Label>
                <Select
                  value={form.position_level}
                  onValueChange={(v) => setForm({ ...form, position_level: v as PositionLevel })}
                >
                  <SelectTrigger id="pos-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITION_LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>{POSITION_LEVEL_LABELS[l]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pos-unit">Command</Label>
                <CommandPicker
                  id="pos-unit"
                  units={units}
                  value={form.org_unit_id}
                  onChange={(v) => setForm({ ...form, org_unit_id: v })}
                  placeholder="Select a command"
                  allLabel="Not tied to a command"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pos-holder">Holder (leave empty for a vacancy)</Label>
              <StaffCombobox
                id="pos-holder"
                value={form.holder_profile_id ?? ""}
                onChange={(v) => setForm({ ...form, holder_profile_id: v || null })}
                placeholder="Search staff by name or ID"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pos-start">Held since</Label>
                <Input
                  id="pos-start"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pos-end">Ended on</Label>
                <Input
                  id="pos-end"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pos-notes">Notes</Label>
              <Textarea
                id="pos-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save position"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
