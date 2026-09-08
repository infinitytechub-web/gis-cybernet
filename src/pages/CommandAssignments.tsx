import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronsUp,
  History,
  Loader2,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DIRECTORY_ACTIONS,
  DIRECTORY_ACTION_LABELS,
  DIRECTORY_LEVEL_LABELS,
  DIRECTORY_SCOPE_LABELS,
  DirectoryLevel,
  DirectoryScope,
  directoryLevelOfUnitType,
} from "@/hooks/useDirectoryPermissions";
import { roleLabel } from "@/lib/role-labels";

interface RankRow {
  id: string;
  name: string;
  level: number | null;
}

interface RankChangeRow {
  id: string;
  profile_id: string;
  from_rank_id: string | null;
  to_rank_id: string | null;
  from_role: string | null;
  to_role: string | null;
  to_level: string | null;
  direction: string;
  reason: string | null;
  effective_date: string;
  created_at: string;
}

interface UnitRow {
  id: string;
  name: string;
  type: string | null;
  parent_id: string | null;
}

interface OfficerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  staff_id: string | null;
  ranks?: { name: string | null } | null;
  rank_id: string | null;
  user_id: string | null;
  shift_group: string | null;
  org_unit_id: string | null;
}

interface RightsRow {
  level: string | null;
  scope: string;
  assigned: boolean;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_download: boolean;
  can_print: boolean;
  can_vault: boolean;
}

interface TransferRow {
  id: string;
  profile_id: string;
  from_org_unit_id: string | null;
  to_org_unit_id: string | null;
  to_level: string | null;
  from_shift_group: string | null;
  to_shift_group: string | null;
  reason: string | null;
  effective_date: string;
  created_at: string;
}

const SHIFTS = ["A", "B", "C", "D"] as const;
const UNCHANGED = "__unchanged__";
const FLAG_KEY = {
  view: "can_view",
  create: "can_create",
  edit: "can_edit",
  delete: "can_delete",
  download: "can_download",
  print: "can_print",
  vault: "can_vault",
} as const;

const officerName = (o?: OfficerRow | null) =>
  o ? [o.first_name, o.last_name].filter(Boolean).join(" ") || o.staff_id || "—" : "—";

/** Small tick/cross grid used for the "rights after the move" preview. */
function RightsGrid({ rights }: { rights: RightsRow | null }) {
  if (!rights) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {DIRECTORY_ACTIONS.map((action) => {
        const on = !!rights[FLAG_KEY[action]];
        return (
          <Badge
            key={action}
            variant={on ? "default" : "secondary"}
            className="gap-1 font-normal"
          >
            {on ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {DIRECTORY_ACTION_LABELS[action]}
          </Badge>
        );
      })}
    </div>
  );
}

export default function CommandAssignments() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"unassigned" | "all">("unassigned");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [targetUnit, setTargetUnit] = useState<string>("");
  const [targetShift, setTargetShift] = useState<string>(UNCHANGED);
  const [reason, setReason] = useState("");
  const [targetRank, setTargetRank] = useState<string>(UNCHANGED);
  const [targetRole, setTargetRole] = useState<string>(UNCHANGED);
  const [direction, setDirection] = useState<"promotion" | "demotion" | "lateral">("promotion");
  const [rankReason, setRankReason] = useState("");


  const { data: units = [] } = useQuery({
    queryKey: ["command-assignments", "units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_units")
        .select("id, name, type, parent_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as UnitRow[];
    },
  });

  const { data: officers = [], isLoading } = useQuery({
    queryKey: ["command-assignments", "officers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, first_name, last_name, staff_id, shift_group, org_unit_id, rank_id, user_id, ranks(name)",
        )
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as OfficerRow[];
    },
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ["command-assignments", "transfers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("command_transfers")
        .select(
          "id, profile_id, from_org_unit_id, to_org_unit_id, to_level, from_shift_group, to_shift_group, reason, effective_date, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as TransferRow[];
    },
  });

  const { data: ranks = [] } = useQuery({
    queryKey: ["command-assignments", "ranks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ranks")
        .select("id, name, level")
        .order("level", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RankRow[];
    },
  });

  /** Roles that the directory matrix knows about — those are the ones with rights. */
  const { data: matrixRoles = [] } = useQuery({
    queryKey: ["command-assignments", "matrix-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("directory_permissions").select("role");
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => r.role as string))).sort();
    },
  });

  const { data: roleByUser = {} } = useQuery({
    queryKey: ["command-assignments", "roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      const m: Record<string, string> = {};
      for (const r of data ?? []) if (!m[r.user_id]) m[r.user_id] = r.role as string;
      return m;
    },
  });

  const { data: rankChanges = [] } = useQuery({
    queryKey: ["command-assignments", "rank-changes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("command_rank_changes")
        .select(
          "id, profile_id, from_rank_id, to_rank_id, from_role, to_role, to_level, direction, reason, effective_date, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as RankChangeRow[];
    },
  });


  const unitById = useMemo(() => {
    const m = new Map<string, UnitRow>();
    for (const u of units) m.set(u.id, u);
    return m;
  }, [units]);

  const officerById = useMemo(() => {
    const m = new Map<string, OfficerRow>();
    for (const o of officers) m.set(o.id, o);
    return m;
  }, [officers]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return officers.filter((o) => {
      if (tab === "unassigned" && o.org_unit_id) return false;
      if (!q) return true;
      const name = `${o.first_name ?? ""} ${o.last_name ?? ""} ${o.staff_id ?? ""}`.toLowerCase();
      return name.includes(q);
    });
  }, [officers, tab, search]);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((k) => selected[k]),
    [selected],
  );
  const unassignedCount = officers.filter((o) => !o.org_unit_id).length;

  const previewId = selectedIds[0] ?? null;
  const previewOfficer = previewId ? officerById.get(previewId) ?? null : null;

  /** Rights recalculated for the first selected officer at their current command. */
  const beforeRights = useQuery({
    queryKey: ["command-rights", previewId, previewOfficer?.org_unit_id ?? null],
    enabled: !!previewId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("directory_rights_at_unit", {
        _profile_id: previewId!,
        _org_unit_id: previewOfficer?.org_unit_id ?? null,
      });
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as RightsRow | null;
    },
  });

  /** Rights recalculated for the destination command, before anything is saved. */
  const afterRights = useQuery({
    queryKey: ["command-rights", previewId, "target", targetUnit || null],
    enabled: !!previewId && !!targetUnit,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("directory_rights_at_unit", {
        _profile_id: previewId!,
        _org_unit_id: targetUnit,
      });
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as RightsRow | null;
    },
  });

  const move = useMutation({
    mutationFn: async (clear: boolean) => {
      if (!selectedIds.length) throw new Error("Select at least one officer");
      if (!clear && !targetUnit) throw new Error("Choose a command first");
      const { data, error } = await supabase.rpc("command_move_officers", {
        _profile_ids: selectedIds,
        _to_org_unit_id: clear ? null : targetUnit,
        _shift_group: !clear && targetShift !== UNCHANGED ? targetShift : null,
        _reason: reason.trim() || null,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (count, clear) => {
      if (count === 0) {
        toast.info("Those officers are already posted there — nothing changed");
      } else {
        toast.success(
          clear
            ? `${count} officer(s) removed from their command`
            : `${count} officer(s) moved — portal and directory rights recalculated`,
        );
      }
      setSelected({});
      setReason("");
      // Rights follow the posting, so refresh everything that reads it.
      qc.invalidateQueries({ queryKey: ["command-assignments"] });
      qc.invalidateQueries({ queryKey: ["command-rights"] });
      qc.invalidateQueries({ queryKey: ["my-directory-level"] });
      qc.invalidateQueries({ queryKey: ["directory-permissions"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not move the officers"),
  });

  const allChecked = rows.length > 0 && rows.every((r) => selected[r.id]);
  const targetUnitRow = targetUnit ? unitById.get(targetUnit) ?? null : null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Building2}
        title="Command Matrix"
        subtitle="Post and move officers between commands — portal access and directory rights are recalculated from the posting"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Move officers between commands
          </CardTitle>
          <CardDescription>
            An officer with no command sees nothing in the staff portal. Moving an officer here
            immediately re-reads their rights from Settings → Directory Matrix at the level of their
            new command — nothing else needs changing. Every move is kept in the history below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <p className="text-xs text-muted-foreground mb-1">Move to command</p>
              <Select value={targetUnit} onValueChange={setTargetUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a command" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} — {DIRECTORY_LEVEL_LABELS[directoryLevelOfUnitType(u.type)]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[170px]">
              <p className="text-xs text-muted-foreground mb-1">Shift group (optional)</p>
              <Select value={targetShift} onValueChange={setTargetShift}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNCHANGED}>Leave unchanged</SelectItem>
                  {SHIFTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      Shift {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!selectedIds.length || move.isPending}
              onClick={() => move.mutate(false)}
              className="gap-1"
            >
              {move.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Move {selectedIds.length ? `(${selectedIds.length})` : ""}
            </Button>
            <Button
              variant="outline"
              disabled={!selectedIds.length || move.isPending}
              onClick={() => move.mutate(true)}
            >
              Remove posting
            </Button>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Reason / remarks (optional)</p>
            <Textarea
              rows={2}
              placeholder="e.g. Posted to Regional Command on redeployment"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {previewOfficer && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Rights recalculated for {officerName(previewOfficer)}
                {selectedIds.length > 1 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    (first of {selectedIds.length} selected)
                  </span>
                )}
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Now —{" "}
                    {previewOfficer.org_unit_id
                      ? unitById.get(previewOfficer.org_unit_id)?.name ?? "current command"
                      : "not assigned"}
                  </p>
                  {beforeRights.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RightsGrid rights={beforeRights.data ?? null} />
                      <p className="text-xs text-muted-foreground">
                        Scope:{" "}
                        {DIRECTORY_SCOPE_LABELS[
                          (beforeRights.data?.scope ?? "none") as DirectoryScope
                        ]}
                      </p>
                    </>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                    <ArrowRight className="h-3 w-3" />
                    After the move — {targetUnitRow?.name ?? "choose a command"}
                  </p>
                  {!targetUnit ? (
                    <p className="text-sm text-muted-foreground">
                      Pick a destination command to preview the new rights.
                    </p>
                  ) : afterRights.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RightsGrid rights={afterRights.data ?? null} />
                      <p className="text-xs text-muted-foreground">
                        Level:{" "}
                        {targetUnitRow
                          ? DIRECTORY_LEVEL_LABELS[
                              directoryLevelOfUnitType(targetUnitRow.type) as DirectoryLevel
                            ]
                          : "—"}{" "}
                        · Scope:{" "}
                        {DIRECTORY_SCOPE_LABELS[
                          (afterRights.data?.scope ?? "none") as DirectoryScope
                        ]}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "unassigned" | "all")}>
              <TabsList>
                <TabsTrigger value="unassigned">
                  Not assigned
                  <Badge variant="secondary" className="ml-2">{unassignedCount}</Badge>
                </TabsTrigger>
                <TabsTrigger value="all">All officers</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search name or staff ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allChecked}
                      aria-label="Select all listed officers"
                      onCheckedChange={(v) => {
                        const next: Record<string, boolean> = {};
                        if (v) for (const r of rows) next[r.id] = true;
                        setSelected(next);
                      }}
                    />
                  </TableHead>
                  <TableHead>Officer</TableHead>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Current command</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Shift</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading officers…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      {tab === "unassigned"
                        ? "Every officer has a command."
                        : "No officers match your search."}
                    </TableCell>
                  </TableRow>
                )}
                {rows.slice(0, 300).map((o) => {
                  const unit = o.org_unit_id ? unitById.get(o.org_unit_id) : null;
                  return (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Checkbox
                          checked={!!selected[o.id]}
                          aria-label={`Select ${officerName(o)}`}
                          onCheckedChange={(v) =>
                            setSelected((prev) => ({ ...prev, [o.id]: !!v }))
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium">{officerName(o)}</TableCell>
                      <TableCell>{o.staff_id ?? "—"}</TableCell>
                      <TableCell>{o.ranks?.name ?? "—"}</TableCell>
                      <TableCell>
                        {unit ? unit.name : <Badge variant="destructive">Not assigned</Badge>}
                      </TableCell>
                      <TableCell>
                        {unit ? DIRECTORY_LEVEL_LABELS[directoryLevelOfUnitType(unit.type)] : "—"}
                      </TableCell>
                      <TableCell>{o.shift_group ? `Shift ${o.shift_group}` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {rows.length > 300 && (
            <p className="text-xs text-muted-foreground">
              Showing the first 300 of {rows.length}. Narrow the search to reach the rest.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> Recent moves
          </CardTitle>
          <CardDescription>
            Permanent record of command changes — entries cannot be edited or removed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Officer</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>New level</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No command moves recorded yet.
                    </TableCell>
                  </TableRow>
                )}
                {transfers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{format(new Date(t.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell className="font-medium">
                      {officerName(officerById.get(t.profile_id))}
                    </TableCell>
                    <TableCell>
                      {t.from_org_unit_id
                        ? unitById.get(t.from_org_unit_id)?.name ?? "—"
                        : "Not assigned"}
                    </TableCell>
                    <TableCell>
                      {t.to_org_unit_id
                        ? unitById.get(t.to_org_unit_id)?.name ?? "—"
                        : "Posting removed"}
                    </TableCell>
                    <TableCell>
                      {t.to_level
                        ? DIRECTORY_LEVEL_LABELS[t.to_level as DirectoryLevel] ?? t.to_level
                        : "—"}
                    </TableCell>
                    <TableCell>{t.to_shift_group ? `Shift ${t.to_shift_group}` : "—"}</TableCell>
                    <TableCell className="max-w-[240px] truncate">{t.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
