import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAudit } from "@/lib/admin-audit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ShieldCheck, CheckCircle2, Ban, History, Search, RefreshCw } from "lucide-react";
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

export default function StaffAccountApprovals() {
  const { user, isAdminOrSupervisor, loading } = useAuthContext();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"pending" | "active" | "disabled">("pending");
  const [actionTarget, setActionTarget] = useState<{ row: ProfileRow; mode: "approve" | "disable" | "enable" } | null>(null);
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
    if (!q) return byTab;
    return byTab.filter((p) => {
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      return name.includes(q) || (p.staff_id ?? "").toLowerCase().includes(q) || (p.unit ?? "").toLowerCase().includes(q);
    });
  }, [profiles.data, search, tab]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminOrSupervisor) return <Navigate to="/dashboard" replace />;

  const counts = {
    pending: (profiles.data ?? []).filter((p) => p.login_enabled === false && !p.account_locked).length,
    active: (profiles.data ?? []).filter((p) => p.login_enabled === true && !p.account_locked).length,
    disabled: (profiles.data ?? []).filter((p) => p.account_locked === true).length,
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
          <CardDescription>Filter by status and search by name, staff ID, or unit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full sm:w-auto">
              <TabsList>
                <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
                <TabsTrigger value="active">Active ({counts.active})</TabsTrigger>
                <TabsTrigger value="disabled">Disabled ({counts.disabled})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, staff ID, unit…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="rounded-lg border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
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
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No accounts in this view.</TableCell></TableRow>
                ) : filtered.map((p) => {
                  const name = `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() || "—";
                  const isPending = p.login_enabled === false && !p.account_locked;
                  const isDisabled = p.account_locked === true;
                  return (
                    <TableRow key={p.id}>
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

      {auditFor && (
        <AuditDialog row={auditFor} onClose={() => setAuditFor(null)} />
      )}
    </div>
  );
}

function ActionDialog({ row, mode, onClose, onDone }: { row: ProfileRow; mode: "approve" | "disable" | "enable"; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const requiresReason = mode === "disable";
  const title = mode === "approve" ? "Approve account" : mode === "disable" ? "Disable account" : "Re-enable account";
  const verb = mode === "approve" ? "approved_account" : mode === "disable" ? "disabled_account" : "reenabled_account";

  const submit = async () => {
    if (requiresReason && reason.trim().length < 4) {
      toast.error("Please provide a reason (min 4 characters)");
      return;
    }
    setBusy(true);
    try {
      const update: Partial<ProfileRow> =
        mode === "approve"
          ? { login_enabled: true }
          : mode === "disable"
          ? { login_enabled: false, status: "disabled" as ProfileRow["status"] }
          : { login_enabled: true, status: "active" as ProfileRow["status"] };
      const { error } = await supabase.from("profiles").update(update).eq("id", row.id);
      if (error) throw error;
      await logAdminAudit(
        "staff_account",
        verb,
        {
          staff_id: row.staff_id,
          name: `${row.last_name ?? ""} ${row.first_name ?? ""}`.trim(),
          previous: { login_enabled: row.login_enabled, status: row.status },
          next: update,
          reason: reason.trim() || null,
        },
        row.id,
      );
      toast.success(mode === "approve" ? "Account approved" : mode === "disable" ? "Account disabled" : "Account re-enabled");
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update account";
      toast.error(msg);
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
          <Button
            onClick={submit}
            disabled={busy}
            variant={mode === "disable" ? "destructive" : "default"}
          >
            {busy ? "Saving…" : title}
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
