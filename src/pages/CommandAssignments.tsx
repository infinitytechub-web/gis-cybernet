import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Loader2, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DIRECTORY_LEVEL_LABELS,
  directoryLevelOfUnitType,
} from "@/hooks/useDirectoryPermissions";

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
  rank: string | null;
  shift_group: string | null;
  org_unit_id: string | null;
}

const SHIFTS = ["A", "B", "C", "D"] as const;
const UNASSIGNED = "__none__";

export default function CommandAssignments() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"unassigned" | "all">("unassigned");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [targetUnit, setTargetUnit] = useState<string>("");
  const [targetShift, setTargetShift] = useState<string>(UNASSIGNED);

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
        .select("id, first_name, last_name, staff_id, rank, shift_group, org_unit_id")
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as OfficerRow[];
    },
  });

  const unitById = useMemo(() => {
    const m = new Map<string, UnitRow>();
    for (const u of units) m.set(u.id, u);
    return m;
  }, [units]);

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

  const assign = useMutation({
    mutationFn: async (clear: boolean) => {
      if (!selectedIds.length) throw new Error("Select at least one officer");
      if (!clear && !targetUnit) throw new Error("Choose a command first");
      const patch: Record<string, string | null> = {
        org_unit_id: clear ? null : targetUnit,
      };
      if (!clear && targetShift !== UNASSIGNED) patch.shift_group = targetShift;
      const { error } = await supabase
        .from("profiles")
        .update(patch as never)
        .in("id", selectedIds);
      if (error) throw error;
      return selectedIds.length;
    },
    onSuccess: (count, clear) => {
      toast.success(
        clear
          ? `${count} officer(s) removed from their command`
          : `${count} officer(s) assigned`,
      );
      setSelected({});
      qc.invalidateQueries({ queryKey: ["command-assignments"] });
      qc.invalidateQueries({ queryKey: ["my-directory-level"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not update assignments"),
  });

  const allChecked = rows.length > 0 && rows.every((r) => selected[r.id]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Building2}
        title="Command Assignments"
        subtitle="Post each officer to a command — the portal and the directory matrix both read this posting"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Assign officers
          </CardTitle>
          <CardDescription>
            An officer with no command sees nothing in the staff portal, and the directory matrix has
            no level to check for them. Assigning a command here is a separate step from switching
            permissions on in Settings → Directory Matrix.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <p className="text-xs text-muted-foreground mb-1">Command</p>
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
                  <SelectItem value={UNASSIGNED}>Leave unchanged</SelectItem>
                  {SHIFTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      Shift {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!selectedIds.length || assign.isPending}
              onClick={() => assign.mutate(false)}
              className="gap-1"
            >
              {assign.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Assign {selectedIds.length ? `(${selectedIds.length})` : ""}
            </Button>
            <Button
              variant="outline"
              disabled={!selectedIds.length || assign.isPending}
              onClick={() => assign.mutate(true)}
            >
              Remove posting
            </Button>
          </div>

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
                          aria-label={`Select ${o.first_name ?? ""} ${o.last_name ?? ""}`}
                          onCheckedChange={(v) =>
                            setSelected((prev) => ({ ...prev, [o.id]: !!v }))
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {[o.first_name, o.last_name].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell>{o.staff_id ?? "—"}</TableCell>
                      <TableCell>{o.rank ?? "—"}</TableCell>
                      <TableCell>
                        {unit ? (
                          unit.name
                        ) : (
                          <Badge variant="destructive">Not assigned</Badge>
                        )}
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
    </div>
  );
}
