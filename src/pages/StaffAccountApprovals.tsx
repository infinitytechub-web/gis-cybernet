import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAudit } from "@/lib/admin-audit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ShieldCheck, CheckCircle2, Ban, History, Search, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type ProfileRow = {
  id: string;
  staff_id: string | null;
  first_name: string | null;
  last_name: string | null;
  rank_id: string | null;
  department_id: string | null;
  shift_group: string | null;
  unit: string | null;
  login_enabled: boolean | null;
  status: string | null;
  account_locked: boolean | null;
  created_at: string;
  ranks?: { name: string | null } | null;
  departments?: { name: string | null } | null;
};

type AuditRow = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  performed_by: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type Tab = "pending" | "active" | "disabled";
type ActionMode = "approve" | "disable" | "enable";

const KEEP = "__keep__";

function useLookups() {
  const ranks = useQuery({
    queryKey: ["ranks-lookup"],
    queryFn: async () => (await supabase.from("ranks").select("id, name").order("name")).data ?? [],
  });
  const depts = useQuery({
    queryKey: ["departments-lookup"],
    queryFn: async () => (await supabase.from("departments").select("id, name").order("name")).data ?? [],
  });
  return { ranks: ranks.data ?? [], depts: depts.data ?? [] };
}

export default function StaffAccountApprovals() {
  const { user, isAdmin, isAdminOrSupervisor, loading } = useAuthContext();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("pending");
  const [rankFilter, setRankFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { ranks: rankList, depts: deptList } = useLookups();
  const [actionTarget, setActionTarget] = useState<{ row: ProfileRow; mode: ActionMode } | null>(null);
  const [bulkMode, setBulkMode] = useState<ActionMode | null>(null);
  const [auditFor, setAuditFor] = useState<ProfileRow | null>(null);

  const profiles = useQuery({
    queryKey: ["staff-account-approvals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, staff_id, first_name, last_name, rank_id, department_id, shift_group, unit, login_enabled, status, account_locked, created_at, ranks(name), departments(name)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as ProfileRow[];
    },
    enabled: !!user && isAdminOrSupervisor,
  });

  const filtered = useMemo(() => {
    const list = profiles.data ?? [];
    const q = search.trim().toLowerCase();
    const byTab = list.filter((p) => {
      if (tab === "pending") return p.login_enabled === false && !p.account_locked;
      if (tab === "active") return p.login_enabled === true && !p.account_locked;
      return p.account_locked === true;
    });
    return byTab.filter((p) => {
      if (rankFilter === "__none__") { if (p.rank_id) return false; }
      else if (rankFilter !== "all" && p.rank_id !== rankFilter) return false;
      if (deptFilter === "__none__") { if (p.department_id) return false; }
      else if (deptFilter !== "all" && p.department_id !== deptFilter) return false;
      if (!q) return true;
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      return name.includes(q) || (p.staff_id ?? "").toLowerCase().includes(q) || (p.unit ?? "").toLowerCase().includes(q);
    });
  }, [profiles.data, search, tab, rankFilter, deptFilter]);

  // Pool scoped to current tab + search (ignores rank/dept filters) — used to compute live option counts
  const scopedPool = useMemo(() => {
    const list = profiles.data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((p) => {
      const tabOk =
        tab === "pending" ? p.login_enabled === false && !p.account_locked
        : tab === "active" ? p.login_enabled === true && !p.account_locked
        : p.account_locked === true;
      if (!tabOk) return false;
      if (!q) return true;
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      return name.includes(q) || (p.staff_id ?? "").toLowerCase().includes(q) || (p.unit ?? "").toLowerCase().includes(q);
    });
  }, [profiles.data, tab, search]);

  const rankCounts = useMemo(() => {
    const m = new Map<string, number>();
    let none = 0;
    for (const p of scopedPool) {
      if (deptFilter === "__none__") { if (p.department_id) continue; }
      else if (deptFilter !== "all" && p.department_id !== deptFilter) continue;
      if (p.rank_id) m.set(p.rank_id, (m.get(p.rank_id) ?? 0) + 1);
      else none++;
    }
    return { byId: m, none, total: scopedPool.length };
  }, [scopedPool, deptFilter]);

  const deptCounts = useMemo(() => {
    const m = new Map<string, number>();
    let none = 0;
    for (const p of scopedPool) {
      if (rankFilter === "__none__") { if (p.rank_id) continue; }
      else if (rankFilter !== "all" && p.rank_id !== rankFilter) continue;
      if (p.department_id) m.set(p.department_id, (m.get(p.department_id) ?? 0) + 1);
      else none++;
    }
    return { byId: m, none, total: scopedPool.length };
  }, [scopedPool, rankFilter]);

  // Reset selection when filters change
  useEffect(() => { setSelected(new Set()); }, [tab, search, rankFilter, deptFilter]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminOrSupervisor) return <Navigate to="/dashboard" replace />;

  const counts = {
    pending: (profiles.data ?? []).filter((p) => p.login_enabled === false && !p.account_locked).length,
    active: (profiles.data ?? []).filter((p) => p.login_enabled === true && !p.account_locked).length,
    disabled: (profiles.data ?? []).filter((p) => p.account_locked === true).length,
  };

  const selectedRows = filtered.filter((p) => selected.has(p.id));
  const allOnPageSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const someOnPageSelected = filtered.some((p) => selected.has(p.id));

  const togglePage = (checked: boolean) => {
    const next = new Set(selected);
    if (checked) filtered.forEach((p) => next.add(p.id));
    else filtered.forEach((p) => next.delete(p.id));
    setSelected(next);
  };
  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id); else next.delete(id);
    setSelected(next);
  };

  const onBulkDone = () => {
    setBulkMode(null);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["staff-account-approvals"] });
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Staff Account Approvals
          </h1>
          <p className="text-sm text-muted-foreground">
            Review pending profiles, approve account access, or disable accounts. Every action is recorded in the audit log.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => profiles.refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Account directory</CardTitle>
          <CardDescription>Filter by status and search by name, staff ID, or unit. Select rows to perform bulk actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:flex-wrap">
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full sm:w-auto">
              <TabsList>
                <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
                <TabsTrigger value="active">Active ({counts.active})</TabsTrigger>
                <TabsTrigger value="disabled">Disabled ({counts.disabled})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1 min-w-[180px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, staff ID, unit…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={rankFilter} onValueChange={setRankFilter}>
              <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Rank" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all"><CountedOption label="All ranks" count={rankCounts.total} /></SelectItem>
                {rankCounts.none > 0 && (
                  <SelectItem value="__none__"><CountedOption label="— No rank set —" count={rankCounts.none} /></SelectItem>
                )}
                {rankList
                  .filter((r) => (rankCounts.byId.get(r.id) ?? 0) > 0 || rankFilter === r.id)
                  .map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <CountedOption label={r.name ?? "—"} count={rankCounts.byId.get(r.id) ?? 0} />
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-full sm:w-[220px]"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all"><CountedOption label="All departments" count={deptCounts.total} /></SelectItem>
                {deptCounts.none > 0 && (
                  <SelectItem value="__none__"><CountedOption label="— No department set —" count={deptCounts.none} /></SelectItem>
                )}
                {deptList
                  .filter((d) => (deptCounts.byId.get(d.id) ?? 0) > 0 || deptFilter === d.id)
                  .map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      <CountedOption label={d.name ?? "—"} count={deptCounts.byId.get(d.id) ?? 0} />
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {(rankFilter !== "all" || deptFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setRankFilter("all"); setDeptFilter("all"); }}>
                Clear filters
              </Button>
            )}
          </div>

          {(rankFilter !== "all" || deptFilter !== "all" || search) && (
            <div className="text-xs text-muted-foreground">
              Showing {filtered.length} of {counts[tab]} {tab} account{counts[tab] === 1 ? "" : "s"}
            </div>
          )}

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <span className="text-xs font-medium">{selected.size} selected</span>
              <div className="flex-1" />
              {tab === "pending" && (
                <Button size="sm" variant="default" onClick={() => setBulkMode("approve")}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Bulk approve
                </Button>
              )}
              {tab === "active" && (
                <Button size="sm" variant="destructive" onClick={() => setBulkMode("disable")}>
                  <Ban className="h-3.5 w-3.5 mr-1" /> Bulk disable
                </Button>
              )}
              {tab === "disabled" && (
                <Button size="sm" variant="outline" onClick={() => setBulkMode("enable")}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Bulk re-enable
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}

          <div className="rounded-lg border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                      onCheckedChange={(c) => togglePage(c === true)}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="w-16">Shift</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No accounts in this view.</TableCell></TableRow>
                ) : filtered.map((p) => {
                  const name = `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() || "—";
                  const isPending = p.login_enabled === false && !p.account_locked;
                  const isDisabled = p.account_locked === true;
                  return (
                    <TableRow key={p.id} data-state={selected.has(p.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(p.id)}
                          onCheckedChange={(c) => toggleOne(p.id, c === true)}
                          aria-label={`Select ${name}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.staff_id ?? "—"}</TableCell>
                      <TableCell className="text-xs font-medium">{name}</TableCell>
                      <TableCell className="text-xs">{p.ranks?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{p.departments?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{p.shift_group ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={isDisabled ? "destructive" : isPending ? "outline" : "default"}
                          className="text-[10px]"
                        >
                          {isDisabled ? "disabled" : isPending ? "pending" : "active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {isPending && (
                            <Button size="sm" variant="default" onClick={() => setActionTarget({ row: p, mode: "approve" })}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                            </Button>
                          )}
                          {!isPending && !isDisabled && (
                            <Button size="sm" variant="ghost" onClick={() => setActionTarget({ row: p, mode: "disable" })}>
                              <Ban className="h-3.5 w-3.5 mr-1 text-destructive" /> Disable
                            </Button>
                          )}
                          {isDisabled && (
                            <Button size="sm" variant="outline" onClick={() => setActionTarget({ row: p, mode: "enable" })}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Re-enable
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setAuditFor(p)} title="View audit log">
                            <History className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {actionTarget && (
        <ActionDialog
          row={actionTarget.row}
          mode={actionTarget.mode}
          onClose={() => setActionTarget(null)}
          onDone={() => {
            setActionTarget(null);
            qc.invalidateQueries({ queryKey: ["staff-account-approvals"] });
          }}
        />
      )}

      {bulkMode && (
        <BulkDialog
          rows={selectedRows}
          mode={bulkMode}
          onClose={() => setBulkMode(null)}
          onDone={onBulkDone}
        />
      )}

      {auditFor && (
        <AuditDialog row={auditFor} onClose={() => setAuditFor(null)} />
      )}
    </div>
  );
}

function CountedOption({ label, count }: { label: string; count: number }) {
  return (
    <span className="flex items-center justify-between gap-3 w-full">
      <span className="truncate">{label}</span>
      <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
    </span>
  );
}

function actionVerb(mode: ActionMode) {
  return mode === "approve" ? "approved_account" : mode === "disable" ? "disabled_account" : "reenabled_account";
}

function actionTitle(mode: ActionMode) {
  return mode === "approve" ? "Approve account" : mode === "disable" ? "Disable account" : "Re-enable account";
}

async function applyAction(
  row: ProfileRow,
  mode: ActionMode,
  reason: string,
  overrides: { rank_id?: string | null; department_id?: string | null } = {},
) {
  const update: { login_enabled: boolean; account_locked: boolean; rank_id?: string; department_id?: string } =
    mode === "approve"
      ? { login_enabled: true, account_locked: false }
      : mode === "disable"
      ? { login_enabled: false, account_locked: true }
      : { login_enabled: true, account_locked: false };
  if (mode === "approve") {
    if (overrides.rank_id) update.rank_id = overrides.rank_id;
    if (overrides.department_id) update.department_id = overrides.department_id;
  }
  const { error } = await supabase.from("profiles").update(update).eq("id", row.id);
  if (error) throw error;
  await logAdminAudit(
    "staff_account",
    actionVerb(mode),
    {
      staff_id: row.staff_id,
      name: `${row.last_name ?? ""} ${row.first_name ?? ""}`.trim(),
      previous: {
        login_enabled: row.login_enabled,
        account_locked: row.account_locked,
        rank_id: row.rank_id,
        department_id: row.department_id,
      },
      next: update,
      reason: reason.trim() || null,
    },
    row.id,
  );
}

function ActionDialog({ row, mode, onClose, onDone }: { row: ProfileRow; mode: ActionMode; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [rankId, setRankId] = useState<string>(KEEP);
  const [deptId, setDeptId] = useState<string>(KEEP);
  const [busy, setBusy] = useState(false);
  const { ranks, depts } = useLookups();

  const requiresReason = mode === "disable";
  const title = actionTitle(mode);

  const submit = async () => {
    if (requiresReason && reason.trim().length < 4) {
      toast.error("Please provide a reason (min 4 characters)");
      return;
    }
    setBusy(true);
    try {
      await applyAction(row, mode, reason, {
        rank_id: rankId !== KEEP ? rankId : null,
        department_id: deptId !== KEEP ? deptId : null,
      });
      toast.success(mode === "approve" ? "Account approved" : mode === "disable" ? "Account disabled" : "Account re-enabled");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {`${row.last_name ?? ""} ${row.first_name ?? ""}`.trim()} · {row.staff_id ?? "no staff ID"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {mode === "approve" && (
            <>
              <div>
                <Label className="text-xs">Rank / Designation</Label>
                <Select value={rankId} onValueChange={setRankId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={KEEP}>Keep current ({row.ranks?.name ?? "none"})</SelectItem>
                    {ranks.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Department</Label>
                <Select value={deptId} onValueChange={setDeptId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={KEEP}>Keep current ({row.departments?.name ?? "none"})</SelectItem>
                    {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div>
            <Label className="text-xs">Reason {requiresReason ? "(required)" : "(optional)"}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={mode === "disable" ? "e.g. Transferred out of unit" : "Notes for the audit log"}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} variant={mode === "disable" ? "destructive" : "default"}>
            {busy ? "Saving…" : title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkDialog({ rows, mode, onClose, onDone }: { rows: ProfileRow[]; mode: ActionMode; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [rankId, setRankId] = useState<string>(KEEP);
  const [deptId, setDeptId] = useState<string>(KEEP);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; failed: number }>({ done: 0, failed: 0 });
  const { ranks, depts } = useLookups();

  const requiresReason = mode === "disable";
  const title =
    mode === "approve" ? `Bulk approve ${rows.length} account${rows.length === 1 ? "" : "s"}`
    : mode === "disable" ? `Bulk disable ${rows.length} account${rows.length === 1 ? "" : "s"}`
    : `Bulk re-enable ${rows.length} account${rows.length === 1 ? "" : "s"}`;

  const submit = async () => {
    if (rows.length === 0) { onClose(); return; }
    if (requiresReason && reason.trim().length < 4) {
      toast.error("Please provide a reason (min 4 characters)");
      return;
    }
    setBusy(true);
    setProgress({ done: 0, failed: 0 });
    let done = 0, failed = 0;
    for (const r of rows) {
      try {
        await applyAction(r, mode, reason, {
          rank_id: rankId !== KEEP ? rankId : null,
          department_id: deptId !== KEEP ? deptId : null,
        });
        done++;
      } catch {
        failed++;
      }
      setProgress({ done, failed });
    }
    setBusy(false);
    if (failed === 0) toast.success(`${done} account${done === 1 ? "" : "s"} updated`);
    else toast.warning(`${done} updated · ${failed} failed`);
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            One audit reason will be recorded against every selected account.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border bg-muted/30 px-3 py-2 max-h-32 overflow-y-auto text-xs space-y-0.5">
            {rows.slice(0, 50).map((r) => (
              <div key={r.id} className="font-mono">
                {r.staff_id ?? "—"} · {`${r.last_name ?? ""} ${r.first_name ?? ""}`.trim() || "—"}
              </div>
            ))}
            {rows.length > 50 && <div className="text-muted-foreground">…and {rows.length - 50} more</div>}
          </div>

          {mode === "approve" && (
            <>
              <div>
                <Label className="text-xs">Apply rank to all (optional)</Label>
                <Select value={rankId} onValueChange={setRankId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={KEEP}>Keep each account's current rank</SelectItem>
                    {ranks.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Apply department to all (optional)</Label>
                <Select value={deptId} onValueChange={setDeptId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={KEEP}>Keep each account's current department</SelectItem>
                    {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div>
            <Label className="text-xs">Reason {requiresReason ? "(required)" : "(optional)"}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={mode === "disable" ? "e.g. End of contract — batch off-boarding" : "Shared notes for the audit log"}
              rows={3}
            />
          </div>

          {busy && (
            <div className="text-xs text-muted-foreground">
              Processing… {progress.done}/{rows.length} {progress.failed > 0 ? `· ${progress.failed} failed` : ""}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || rows.length === 0} variant={mode === "disable" ? "destructive" : "default"}>
            {busy ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuditDialog({ row, onClose }: { row: ProfileRow; onClose: () => void }) {
  const audit = useQuery({
    queryKey: ["staff-account-audit", row.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_audit_log")
        .select("id, entity_type, entity_id, action, performed_by, details, created_at")
        .eq("entity_type", "staff_account")
        .eq("entity_id", row.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Audit log</DialogTitle>
          <DialogDescription>
            {`${row.last_name ?? ""} ${row.first_name ?? ""}`.trim()} · {row.staff_id ?? "no staff ID"}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border max-h-[60vh] overflow-y-auto">
          {audit.isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (audit.data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No actions recorded for this account yet.</div>
          ) : (
            <ul className="divide-y">
              {(audit.data ?? []).map((a) => {
                const reason = (a.details as { reason?: string } | null)?.reason;
                return (
                  <li key={a.id} className="p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{a.action}</span>
                      <span className="text-muted-foreground">{format(new Date(a.created_at), "PP p")}</span>
                    </div>
                    {reason && <div className="text-muted-foreground">Reason: {reason}</div>}
                    <pre className="bg-muted/40 rounded p-2 overflow-x-auto text-[11px]">
                      {JSON.stringify(a.details, null, 2)}
                    </pre>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
