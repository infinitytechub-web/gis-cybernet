import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Users, Check, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ROLE_LABEL, COMMAND_TIER_ROLES, roleLabel } from "@/lib/role-labels";
import type { AppRole } from "@/lib/types";

type Profile = {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  staff_id: string | null;
  email: string | null;
  department_id: string | null;
};

type Step = "select" | "preview";

type RowState = {
  profile: Profile;
  fromRole: AppRole | null;
  toRole: AppRole;
  confirmed: boolean;
  status: "idle" | "saving" | "ok" | "error";
  error?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function BulkCommandRoleAssignDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("select");
  const [search, setSearch] = useState("");
  const [bulkRole, setBulkRole] = useState<AppRole>("supervisor");
  const [picked, setPicked] = useState<Map<string, boolean>>(new Map());
  const [rows, setRows] = useState<RowState[]>([]);
  const [running, setRunning] = useState(false);

  const { data: profiles = [] } = useQuery({
    queryKey: ["bulk-cmd-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, first_name, last_name, staff_id, email, department_id")
        .not("user_id", "is", null)
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    enabled: open,
  });

  const { data: currentRoles = new Map<string, AppRole>() } = useQuery({
    queryKey: ["bulk-cmd-current-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      const m = new Map<string, AppRole>();
      (data ?? []).forEach((r: any) => m.set(r.user_id, r.role));
      return m;
    },
    enabled: open,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) =>
      `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase().includes(q) ||
      (p.staff_id ?? "").toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q)
    );
  }, [profiles, search]);

  const reset = () => {
    setStep("select"); setSearch(""); setBulkRole("supervisor");
    setPicked(new Map()); setRows([]); setRunning(false);
  };

  const close = () => { onOpenChange(false); setTimeout(reset, 200); };

  const toPreview = () => {
    const selected = profiles.filter((p) => picked.get(p.user_id));
    if (selected.length === 0) {
      toast.error("Select at least one staff member"); return;
    }
    setRows(selected.map((p) => ({
      profile: p,
      fromRole: currentRoles.get(p.user_id) ?? null,
      toRole: bulkRole,
      confirmed: true,
      status: "idle",
    })));
    setStep("preview");
  };

  const writeAudit = async (r: RowState) => {
    const name = `${r.profile.first_name ?? ""} ${r.profile.last_name ?? ""}`.trim() || r.profile.email || undefined;
    await supabase.from("command_role_audit").insert({
      target_user_id: r.profile.user_id,
      target_staff_id: r.profile.staff_id ?? null,
      target_name: name ?? null,
      from_role: r.fromRole as any,
      to_role: r.toRole as any,
      action: r.fromRole ? "change" : "assign",
      changed_by: user?.id ?? null,
      changed_by_name: user?.email ?? null,
    });
  };

  const commitMut = useMutation({
    mutationFn: async () => {
      setRunning(true);
      // Process sequentially so per-row status updates render predictably.
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r.confirmed) continue;
        if (r.fromRole === r.toRole) {
          setRows((prev) => prev.map((x, idx) => idx === i ? { ...x, status: "ok" } : x));
          continue;
        }
        setRows((prev) => prev.map((x, idx) => idx === i ? { ...x, status: "saving" } : x));
        try {
          const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", r.profile.user_id);
          if (delErr) throw delErr;
          const { error: insErr } = await supabase.from("user_roles").insert({ user_id: r.profile.user_id, role: r.toRole });
          if (insErr) throw insErr;
          await writeAudit(r);
          setRows((prev) => prev.map((x, idx) => idx === i ? { ...x, status: "ok" } : x));
        } catch (e: any) {
          setRows((prev) => prev.map((x, idx) => idx === i ? { ...x, status: "error", error: e?.message ?? "Failed" } : x));
        }
      }
    },
    onSettled: () => {
      setRunning(false);
      qc.invalidateQueries({ queryKey: ["command-roles-holders"] });
      qc.invalidateQueries({ queryKey: ["command-roster"] });
      qc.invalidateQueries({ queryKey: ["admin-user-roles"] });
      qc.invalidateQueries({ queryKey: ["command-role-audit"] });
      qc.invalidateQueries({ queryKey: ["command-role-audit-page"] });
      const errors = rows.filter((r) => r.status === "error").length;
      const ok = rows.filter((r) => r.status === "ok").length;
      if (errors === 0) toast.success(`${ok} role assignment${ok === 1 ? "" : "s"} saved`);
      else toast.warning(`${ok} saved · ${errors} failed — see preview`);
    },
  });

  const allDone = rows.length > 0 && rows.every((r) => r.status === "ok" || !r.confirmed);
  const confirmedCount = rows.filter((r) => r.confirmed).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else onOpenChange(v); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Bulk assign command-tier role
          </DialogTitle>
          <DialogDescription>
            {step === "select"
              ? "Pick a target role and the staff who should receive it. Existing roles on those staff will be replaced."
              : "Review every change. Tick the rows to commit, then save. Each row is processed individually."}
          </DialogDescription>
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground mb-1 block">Target role for selection</label>
                <Select value={bulkRole} onValueChange={(v) => setBulkRole(v as AppRole)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMMAND_TIER_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABEL[r] ?? roleLabel(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground mb-1 block">Search staff</label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, staff ID, or email" className="h-8 text-xs" />
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{Array.from(picked.values()).filter(Boolean).length} selected · {filtered.length} shown</span>
              {Array.from(picked.values()).some(Boolean) && (
                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setPicked(new Map())}>
                  Clear selection
                </Button>
              )}
            </div>
            <ScrollArea className="h-[340px] rounded border">
              <ul className="divide-y">
                {filtered.length === 0 && (
                  <li className="p-4 text-center text-xs italic text-muted-foreground">No matching staff.</li>
                )}
                {filtered.map((p) => {
                  const checked = !!picked.get(p.user_id);
                  const cur = currentRoles.get(p.user_id);
                  return (
                    <li key={p.user_id} className="flex items-center gap-3 p-2 hover:bg-muted/40">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setPicked((prev) => {
                            const m = new Map(prev);
                            if (v) m.set(p.user_id, true); else m.delete(p.user_id);
                            return m;
                          });
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">
                          {`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || "—"}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {p.staff_id ?? p.email}
                          {cur && <> · current: <Badge variant="outline" className="text-[9px] py-0">{roleLabel(cur)}</Badge></>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-sm">Confirm each change</AlertTitle>
              <AlertDescription className="text-xs">
                Untick any row to skip it. Each row writes its own audit entry. Rows where the role doesn't change are skipped automatically.
              </AlertDescription>
            </Alert>
            <ScrollArea className="h-[360px] rounded border">
              <ul className="divide-y">
                {rows.map((r, idx) => {
                  const noChange = r.fromRole === r.toRole;
                  return (
                    <li key={r.profile.user_id} className="flex items-center gap-3 p-2">
                      <Checkbox
                        checked={r.confirmed && !noChange}
                        disabled={noChange || running}
                        onCheckedChange={(v) => setRows((prev) => prev.map((x, i) => i === idx ? { ...x, confirmed: !!v } : x))}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">
                          {`${r.profile.first_name ?? ""} ${r.profile.last_name ?? ""}`.trim() || r.profile.email}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1 flex-wrap">
                          <span>{r.profile.staff_id ?? "—"}</span>
                          <span>·</span>
                          {r.fromRole ? <Badge variant="outline" className="text-[9px] py-0">{roleLabel(r.fromRole)}</Badge> : <span className="italic">none</span>}
                          <span>→</span>
                          <Badge variant="outline" className="text-[9px] py-0 border-emerald-500/40">{roleLabel(r.toRole)}</Badge>
                          {noChange && <Badge variant="secondary" className="text-[9px] py-0">no change</Badge>}
                        </div>
                        {r.error && <div className="text-[10px] text-destructive truncate">{r.error}</div>}
                      </div>
                      <div className="w-20 text-right">
                        {r.status === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin inline" />}
                        {r.status === "ok" && <Badge className="bg-emerald-600 text-[9px]"><Check className="h-3 w-3 mr-0.5" />Saved</Badge>}
                        {r.status === "error" && <Badge className="bg-destructive text-[9px]"><X className="h-3 w-3 mr-0.5" />Failed</Badge>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
            <div className="text-[11px] text-muted-foreground">
              {confirmedCount} confirmed · {rows.filter((r) => r.fromRole === r.toRole).length} unchanged
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={running}>Close</Button>
          {step === "select" && (
            <Button onClick={toPreview} disabled={Array.from(picked.values()).filter(Boolean).length === 0}>
              Preview ({Array.from(picked.values()).filter(Boolean).length})
            </Button>
          )}
          {step === "preview" && !allDone && (
            <>
              <Button variant="ghost" onClick={() => setStep("select")} disabled={running}>Back</Button>
              <Button onClick={() => commitMut.mutate()} disabled={running || confirmedCount === 0}>
                {running ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save {confirmedCount} change{confirmedCount === 1 ? "" : "s"}
              </Button>
            </>
          )}
          {step === "preview" && allDone && (
            <Button onClick={close}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
