import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Crown, ShieldCheck, UserCog, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ROLE_LABEL, COMMAND_TIER_ROLES, roleLabel } from "@/lib/role-labels";
import type { AppRole } from "@/lib/types";

type Holder = { user_id: string; first_name?: string | null; last_name?: string | null; email?: string | null; staff_id?: string | null };
type Candidate = Holder;

export default function CommandRoles() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [assignRole, setAssignRole] = useState<AppRole | null>(null);
  const [search, setSearch] = useState("");

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
        ? await supabase.from("profiles").select("id, first_name, last_name, email, staff_id").in("id", ids)
        : { data: [] as any[] };
      const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const map: Partial<Record<AppRole, Holder[]>> = {};
      for (const r of roles ?? []) {
        const p: any = byId.get(r.user_id) ?? {};
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
        .select("id, first_name, last_name, email, staff_id, user_id")
        .not("user_id", "is", null)
        .order("last_name");
      if (error) throw error;
      return (data ?? []).filter((p: any) => p.user_id) as any[];
    },
    enabled: isAdmin,
  });

  const assignMut = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      // Replace the user's role row with the new command-tier role
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["command-roles-holders"] });
      qc.invalidateQueries({ queryKey: ["command-roster"] });
      qc.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast.success("Role assigned");
      setAssignRole(null);
      setSearch("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to assign role"),
  });

  const removeMut = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "staff" as AppRole });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["command-roles-holders"] });
      qc.invalidateQueries({ queryKey: ["command-roster"] });
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

  const filteredCandidates = candidates.filter((c: Candidate) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(c.first_name ?? "").toLowerCase().includes(q) ||
      String(c.last_name ?? "").toLowerCase().includes(q) ||
      String(c.email ?? "").toLowerCase().includes(q) ||
      String(c.staff_id ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
          <Crown className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Command-Tier Roles</h1>
          <p className="text-xs text-muted-foreground">
            Assign or change the holder of each command-tier role. Changes apply immediately.
          </p>
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
                              removeMut.mutate({ userId: h.user_id });
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
                  onClick={() => { setAssignRole(role); setSearch(""); }}
                >
                  <UserCog className="h-3.5 w-3.5" />
                  Assign / change holder
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!assignRole} onOpenChange={(v) => !v && setAssignRole(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign — {assignRole ? (ROLE_LABEL[assignRole] ?? roleLabel(assignRole)) : ""}</DialogTitle>
            <DialogDescription>
              Pick the staff member to receive this role. Their previous role will be replaced.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, or staff ID…"
                className="pl-8"
                autoFocus
              />
            </div>
            <ScrollArea className="h-[320px] rounded border">
              <ul className="divide-y">
                {filteredCandidates.length === 0 && (
                  <li className="p-4 text-center text-xs text-muted-foreground italic">No matching staff</li>
                )}
                {filteredCandidates.map((c: any) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 p-2 hover:bg-muted/40">
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">
                        {`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{c.staff_id ?? c.email}</div>
                    </div>
                    <Button
                      size="sm"
                      disabled={assignMut.isPending}
                      onClick={() => assignRole && assignMut.mutate({ userId: c.user_id, role: assignRole })}
                    >
                      {assignMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Assign"}
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignRole(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
