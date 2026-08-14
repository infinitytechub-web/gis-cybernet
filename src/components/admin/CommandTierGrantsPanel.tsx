import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { KeyRound, Loader2, Plus, ShieldCheck, Trash2, UserCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

/**
 * Command-tier capability grants.
 *
 * Command-tier features are no longer reserved for the Admin/OIC/2IC trio alone:
 * any staff member can be explicitly authorized for a single capability by an
 * Admin, the OIC or the 2IC. The database function `has_command_capability()`
 * enforces the same rule server-side, so the UI is never the security boundary.
 */
export const COMMAND_CAPABILITIES: { value: string; label: string; hint: string }[] = [
  { value: "*", label: "All command capabilities", hint: "Full command-tier oversight" },
  { value: "detention", label: "Holding / Detention Center", hint: "Custody + bail records" },
  { value: "reports", label: "Reports & approvals", hint: "Review and approve submitted reports" },
  { value: "attendance", label: "Attendance oversight", hint: "Windows, edits and compliance" },
  { value: "roster", label: "Duty roster & rotations", hint: "Build, publish and deploy rosters" },
  { value: "staff_admin", label: "Staff administration", hint: "Staff records and approvals" },
  { value: "inventory", label: "Stores & inventory", hint: "Inventory and issuance oversight" },
  { value: "gps", label: "GPS & mapping", hint: "Live tracking and route history" },
];

const capLabel = (v: string) => COMMAND_CAPABILITIES.find((c) => c.value === v)?.label ?? v;

type Profile = { user_id: string; first_name: string | null; last_name: string | null; staff_id: string | null; email: string | null };

export function CommandTierGrantsPanel() {
  const { user, canManageCommandTier, isAdmin } = useAuth();
  const canManage = canManageCommandTier || isAdmin;
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Profile | null>(null);
  const [capability, setCapability] = useState<string>("detention");
  const [reason, setReason] = useState("");
  const [expires, setExpires] = useState("");
  const [search, setSearch] = useState("");

  const { data: grants = [], isLoading } = useQuery({
    queryKey: ["command-tier-grants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("command_tier_grants")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["command-grant-candidates"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, staff_id, email")
        .not("user_id", "is", null)
        .order("last_name");
      if (error) throw error;
      return (data ?? []).filter((p: any) => p.user_id) as Profile[];
    },
  });

  const nameByUser = useMemo(() => {
    const m = new Map<string, string>();
    staff.forEach((s) => m.set(s.user_id, `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.email || s.user_id));
    return m;
  }, [staff]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? staff.filter((s) =>
          `${s.first_name ?? ""} ${s.last_name ?? ""}`.toLowerCase().includes(q) ||
          String(s.staff_id ?? "").toLowerCase().includes(q) ||
          String(s.email ?? "").toLowerCase().includes(q))
      : staff;
    return list.slice(0, 60);
  }, [staff, search]);

  const grantMut = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Select a staff member");
      let grantedByName: string | null = user?.email ?? null;
      if (user?.id) {
        const { data: me } = await supabase.from("profiles").select("first_name, last_name").eq("user_id", user.id).maybeSingle();
        if (me) grantedByName = `${me.first_name ?? ""} ${me.last_name ?? ""}`.trim() || grantedByName;
      }
      const { error } = await supabase.from("command_tier_grants").insert({
        user_id: target.user_id,
        capability,
        reason: reason.trim() || null,
        granted_by: user!.id,
        granted_by_name: grantedByName,
        expires_at: expires ? new Date(expires).toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["command-tier-grants"] });
      toast.success("Capability granted — recorded in the audit trail");
      setOpen(false); setTarget(null); setReason(""); setExpires(""); setSearch("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to grant capability"),
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("command_tier_grants")
        .update({ revoked_at: new Date().toISOString(), revoked_by: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["command-tier-grants"] });
      toast.success("Grant revoked");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to revoke grant"),
  });

  const isActive = (g: any) => !g.revoked_at && (!g.expires_at || new Date(g.expires_at) > new Date());

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" /> Command capability grants
          </CardTitle>
          <CardDescription>
            Authorize an individual staff member for a specific command-tier capability without changing their role.
            Enforced server-side; every grant and revocation is audited.
          </CardDescription>
        </div>
        {canManage && (
          <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Grant capability
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading grants…
          </div>
        ) : grants.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No capability grants yet. Command-tier features remain limited to command-tier role holders.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Capability</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Granted by</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grants.map((g: any) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{nameByUser.get(g.user_id) ?? g.user_id.slice(0, 8)}</TableCell>
                      <TableCell>{capLabel(g.capability)}</TableCell>
                      <TableCell>
                        {isActive(g) ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600"><ShieldCheck className="mr-1 h-3 w-3" />Active</Badge>
                        ) : (
                          <Badge variant="outline">{g.revoked_at ? "Revoked" : "Expired"}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{g.granted_by_name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {g.expires_at ? format(new Date(g.expires_at), "dd/MM/yyyy") : "No expiry"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && isActive(g) && (
                          <Button size="sm" variant="ghost" disabled={revokeMut.isPending}
                            onClick={() => revokeMut.mutate(g.id)}>
                            <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" /> Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Grant command capability</DialogTitle>
            <DialogDescription>
              The staff member keeps their current role and gains only the selected capability.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Staff member</Label>
              {target ? (
                <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-emerald-600" />
                    {`${target.first_name ?? ""} ${target.last_name ?? ""}`.trim() || target.email}
                    {target.staff_id && <span className="text-muted-foreground">· {target.staff_id}</span>}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setTarget(null)}>Change</Button>
                </div>
              ) : (
                <Command className="rounded-md border">
                  <CommandInput placeholder="Search by name, staff ID or email…" value={search} onValueChange={setSearch} />
                  <CommandList className="max-h-56">
                    <CommandEmpty>No staff found.</CommandEmpty>
                    <CommandGroup>
                      {matches.map((s) => (
                        <CommandItem key={s.user_id} value={`${s.first_name} ${s.last_name} ${s.staff_id}`} onSelect={() => setTarget(s)}>
                          <span className="font-medium">{`${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.email}</span>
                          {s.staff_id && <span className="ml-2 text-xs text-muted-foreground">{s.staff_id}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              )}
            </div>

            <div className="space-y-2">
              <Label>Capability</Label>
              <Select value={capability} onValueChange={setCapability}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMMAND_CAPABILITIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label} — {c.hint}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="grant-expires">Expires (optional)</Label>
                <Input id="grant-expires" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grant-reason">Reason</Label>
                <Input id="grant-reason" value={reason} maxLength={200} placeholder="Why is this authorized?"
                  onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!target || grantMut.isPending} onClick={() => grantMut.mutate()} className="gap-2">
              {grantMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Grant capability
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
