import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Crown, ShieldCheck, UserCog, Loader2, History, Filter, X as XIcon, User as UserIcon, Users, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { BulkCommandRoleAssignDialog } from "@/components/admin/BulkCommandRoleAssignDialog";
import { toast } from "sonner";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ROLE_LABEL, COMMAND_TIER_ROLES, roleLabel } from "@/lib/role-labels";
import type { AppRole } from "@/lib/types";

type Holder = { user_id: string; first_name?: string | null; last_name?: string | null; email?: string | null; staff_id?: string | null };
type Candidate = Holder & { department_id?: string | null; office?: string | null; shift_group?: string | null; user_id: string };

export default function CommandRoles() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [assignRole, setAssignRole] = useState<AppRole | null>(null);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [officeFilter, setOfficeFilter] = useState<string>("all");
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-list-cmd"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").order("name");
      return data ?? [];
    },
    enabled: isAdmin,
  });

  const { data: holdersByRole = {} } = useQuery({
    queryKey: ["command-roles-holders"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", COMMAND_TIER_ROLES as any);
      if (error) throw error;
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, first_name, last_name, email, staff_id, user_id").in("user_id", ids)
        : { data: [] as any[] };
      const byUserId = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
      const map: Partial<Record<AppRole, Holder[]>> = {};
      for (const r of roles ?? []) {
        const p: any = byUserId.get(r.user_id) ?? {};
        const arr = map[r.role as AppRole] ?? [];
        arr.push({ user_id: r.user_id, first_name: p.first_name, last_name: p.last_name, email: p.email, staff_id: p.staff_id });
        map[r.role as AppRole] = arr;
      }
      return map;
    },
    enabled: isAdmin,
  });

  const { data: candidates = [] } = useQuery({
    queryKey: ["command-roles-candidates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, staff_id, user_id, department_id, office, shift_group")
        .not("user_id", "is", null)
        .order("last_name");
      if (error) throw error;
      return (data ?? []).filter((p: any) => p.user_id) as Candidate[];
    },
    enabled: isAdmin,
  });

  const { data: auditEntries = [] } = useQuery({
    queryKey: ["command-role-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("command_role_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
  });

  const officeOptions = useMemo(() => {
    const set = new Set<string>();
    candidates.forEach((c) => c.office && set.add(c.office));
    return Array.from(set).sort();
  }, [candidates]);

  const shiftOptions = useMemo(() => {
    const set = new Set<string>();
    candidates.forEach((c) => c.shift_group && set.add(c.shift_group));
    return Array.from(set).sort();
  }, [candidates]);

  // Lookup current role for a user (for audit before-change capture)
  const userIdToRole = useMemo(() => {
    const m = new Map<string, AppRole>();
    (Object.entries(holdersByRole) as [AppRole, Holder[]][]).forEach(([role, hs]) => {
      hs.forEach((h) => m.set(h.user_id, role));
    });
    return m;
  }, [holdersByRole]);

  const writeAudit = async (params: {
    targetUserId: string; targetStaffId?: string | null; targetName?: string;
    fromRole: AppRole | null; toRole: AppRole | null; action: "assign" | "remove" | "change";
  }) => {
    let changedByName: string | null = user?.email ?? null;
    if (user?.id) {
      const { data: me } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (me) changedByName = `${me.first_name ?? ""} ${me.last_name ?? ""}`.trim() || changedByName;
    }
    await supabase.from("command_role_audit").insert({
      target_user_id: params.targetUserId,
      target_staff_id: params.targetStaffId ?? null,
      target_name: params.targetName ?? null,
      from_role: params.fromRole as any,
      to_role: params.toRole as any,
      action: params.action,
      changed_by: user?.id ?? null,
      changed_by_name: changedByName,
    });
  };

  const assignMut = useMutation({
    mutationFn: async ({ userId, role, candidate }: { userId: string; role: AppRole; candidate: Candidate }) => {
      const previous = userIdToRole.get(userId) ?? null;
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
      await writeAudit({
        targetUserId: userId,
        targetStaffId: candidate.staff_id,
        targetName: `${candidate.first_name ?? ""} ${candidate.last_name ?? ""}`.trim() || candidate.email || undefined,
        fromRole: previous,
        toRole: role,
        action: previous ? "change" : "assign",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["command-roles-holders"] });
      qc.invalidateQueries({ queryKey: ["command-roster"] });
      qc.invalidateQueries({ queryKey: ["admin-user-roles"] });
      qc.invalidateQueries({ queryKey: ["command-role-audit"] });
      toast.success("Role assigned");
      setAssignRole(null);
      setSearch("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to assign role"),
  });

  const removeMut = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const holder = (holdersByRole[role] ?? []).find((h) => h.user_id === userId);
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "staff" as AppRole });
      if (error) throw error;
      await writeAudit({
        targetUserId: userId,
        targetStaffId: holder?.staff_id,
        targetName: holder ? `${holder.first_name ?? ""} ${holder.last_name ?? ""}`.trim() || holder.email || undefined : undefined,
        fromRole: role,
        toRole: "staff",
        action: "remove",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["command-roles-holders"] });
      qc.invalidateQueries({ queryKey: ["command-roster"] });
      qc.invalidateQueries({ queryKey: ["command-role-audit"] });
      toast.success("Role removed (demoted to Staff)");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove"),
  });

  if (!isAdmin) {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTitle>Admin only</AlertTitle>
        <AlertDescription>This page is restricted to administrators.</AlertDescription>
      </Alert>
    );
  }

  const newRoles = new Set<AppRole>(["head_of_administration", "chief_staff_officer"]);

  const filteredCandidates = candidates.filter((c) => {
    if (deptFilter !== "all" && c.department_id !== deptFilter) return false;
    if (officeFilter !== "all" && c.office !== officeFilter) return false;
    if (shiftFilter !== "all" && c.shift_group !== shiftFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(c.first_name ?? "").toLowerCase().includes(q) ||
      String(c.last_name ?? "").toLowerCase().includes(q) ||
      String(c.email ?? "").toLowerCase().includes(q) ||
      String(c.staff_id ?? "").toLowerCase().includes(q)
    );
  });

  const deptName = (id?: string | null) => departments.find((d: any) => d.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
            <Crown className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Command-Tier Roles</h1>
            <p className="text-xs text-muted-foreground">
              Assign or change the holder of each command-tier role. Every change is recorded in the audit trail.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="default" className="gap-1.5" onClick={() => setBulkOpen(true)}>
            <Users className="h-3.5 w-3.5" /> Bulk assign
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setHistoryOpen(true)}>
            <History className="h-3.5 w-3.5" /> Recent ({auditEntries.length})
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/command-role-audit"><ExternalLink className="h-3.5 w-3.5" /> Full audit log</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {COMMAND_TIER_ROLES.map((role) => {
          const holders = holdersByRole[role] ?? [];
          const isNew = newRoles.has(role);
          return (
            <Card
              key={role}
              className={isNew ? "border-emerald-400/60 bg-emerald-50/40 dark:bg-emerald-950/20" : ""}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      {ROLE_LABEL[role] ?? roleLabel(role)}
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                      {holders.length} holder{holders.length === 1 ? "" : "s"}
                    </CardDescription>
                  </div>
                  {isNew && <Badge className="text-[9px] bg-emerald-600 hover:bg-emerald-600">NEW</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {holders.length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">Vacant</p>
                ) : (
                  <ul className="space-y-1.5">
                    {holders.map((h) => (
                      <li key={h.user_id} className="flex items-center justify-between gap-2 text-xs rounded bg-muted/40 px-2 py-1.5">
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {(h.first_name || h.last_name) ? `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() : h.email ?? "—"}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">{h.staff_id ?? h.email}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Remove ${ROLE_LABEL[role]} from this user? They will be demoted to Staff.`)) {
                              removeMut.mutate({ userId: h.user_id, role });
                            }
                          }}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5"
                  onClick={() => { setAssignRole(role); setSearch(""); setDeptFilter("all"); setOfficeFilter("all"); setShiftFilter("all"); }}
                >
                  <UserCog className="h-3.5 w-3.5" />
                  Assign / change holder
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Assign dialog with filters */}
      <Dialog open={!!assignRole} onOpenChange={(v) => !v && setAssignRole(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign — {assignRole ? (ROLE_LABEL[assignRole] ?? roleLabel(assignRole)) : ""}</DialogTitle>
            <DialogDescription>
              Filter by department, office, or shift group, then pick the staff member to receive this role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Filter row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground flex items-center gap-1 mb-1"><Filter className="h-3 w-3" /> Department</label>
                <Select value={deptFilter} onValueChange={setDeptFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {departments.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground flex items-center gap-1 mb-1"><Filter className="h-3 w-3" /> Office shift</label>
                <Select value={officeFilter} onValueChange={setOfficeFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All offices</SelectItem>
                    {officeOptions.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground flex items-center gap-1 mb-1"><Filter className="h-3 w-3" /> Shift group</label>
                <Select value={shiftFilter} onValueChange={setShiftFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All shifts</SelectItem>
                    {shiftOptions.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Active filter chips */}
            {(deptFilter !== "all" || officeFilter !== "all" || shiftFilter !== "all") && (
              <div className="flex flex-wrap gap-1.5">
                {deptFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    Dept: {deptName(deptFilter)}
                    <button onClick={() => setDeptFilter("all")} className="ml-1 hover:text-destructive" aria-label="Clear department filter">
                      <XIcon className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {officeFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    Office: {officeFilter}
                    <button onClick={() => setOfficeFilter("all")} className="ml-1 hover:text-destructive" aria-label="Clear office filter">
                      <XIcon className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {shiftFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    Shift: {shiftFilter}
                    <button onClick={() => setShiftFilter("all")} className="ml-1 hover:text-destructive" aria-label="Clear shift filter">
                      <XIcon className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] px-1.5"
                  onClick={() => { setDeptFilter("all"); setOfficeFilter("all"); setShiftFilter("all"); }}
                >
                  Clear all
                </Button>
              </div>
            )}

            {/* Autocomplete combobox */}
            <Command
              className="rounded border"
              shouldFilter={true}
              filter={(value, search) => {
                // value is the synthetic search-blob we put on each CommandItem
                if (!search.trim()) return 1;
                const s = search.toLowerCase();
                return value.toLowerCase().includes(s) ? 1 : 0;
              }}
            >
              <CommandInput
                placeholder="Type a name, partial staff ID, or email…"
                value={search}
                onValueChange={setSearch}
                autoFocus
              />
              <div className="px-3 pt-1 text-[10px] text-muted-foreground">
                Showing {filteredCandidates.length} of {candidates.length} staff
                {assignMut.isPending && <span className="ml-2 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> assigning…</span>}
              </div>
              <CommandList className="max-h-[320px]">
                <CommandEmpty>No staff match these filters.</CommandEmpty>
                <CommandGroup heading="Staff">
                  {filteredCandidates.map((c) => {
                    const fullName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
                    const blob = [
                      fullName,
                      c.staff_id ?? "",
                      c.email ?? "",
                      deptName(c.department_id),
                      c.office ?? "",
                      c.shift_group ?? "",
                    ].filter(Boolean).join(" • ");
                    return (
                      <CommandItem
                        key={c.user_id}
                        value={blob}
                        onSelect={() => assignRole && assignMut.mutate({ userId: c.user_id, role: assignRole, candidate: c })}
                        disabled={assignMut.isPending}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <UserIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate">
                              {fullName || c.email || "—"}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {c.staff_id ?? c.email}
                              {c.department_id ? ` • ${deptName(c.department_id)}` : ""}
                              {c.office ? ` • ${c.office}` : ""}
                              {c.shift_group ? ` • Shift ${c.shift_group}` : ""}
                            </div>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[9px] shrink-0">Assign</Badge>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignRole(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit history dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Command-tier role audit trail</DialogTitle>
            <DialogDescription>Latest 200 changes. Records are immutable.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[440px] rounded border">
            <ul className="divide-y">
              {auditEntries.length === 0 && (
                <li className="p-6 text-center text-xs italic text-muted-foreground">No role changes yet.</li>
              )}
              {auditEntries.map((a: any) => (
                <li key={a.id} className="p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          a.action === "assign" ? "bg-emerald-600" :
                          a.action === "remove" ? "bg-destructive" :
                          "bg-amber-600"
                        }
                      >
                        {a.action.toUpperCase()}
                      </Badge>
                      <span className="font-medium">{a.target_name ?? a.target_user_id}</span>
                      {a.target_staff_id && <span className="text-[10px] text-muted-foreground">({a.target_staff_id})</span>}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {a.created_at ? format(new Date(a.created_at), "dd MMM yyyy HH:mm") : ""}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {a.from_role ? <Badge variant="outline" className="mr-1">{roleLabel(a.from_role)}</Badge> : <span className="italic">none</span>}
                    <span className="mx-1">→</span>
                    {a.to_role ? <Badge variant="outline">{roleLabel(a.to_role)}</Badge> : <span className="italic">none</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    By {a.changed_by_name ?? a.changed_by ?? "system"}
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
