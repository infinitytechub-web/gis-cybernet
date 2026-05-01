import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Unlock, Loader2, History } from "lucide-react";
import { format } from "date-fns";
import { UnlockAccountDialog } from "@/components/staff/UnlockAccountDialog";

interface LockedRow {
  id: string;
  staff_id: string | null;
  first_name: string | null;
  last_name: string | null;
  account_locked: boolean;
  login_enabled: boolean;
  user_id: string | null;
}

interface UnlockAuditRow {
  id: string;
  target_staff_id: string | null;
  target_full_name: string | null;
  unlocked_by_name: string | null;
  reason: string;
  created_at: string;
}

export function LockedAccountsPanel() {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<LockedRow | null>(null);

  const { data: locked = [], isLoading } = useQuery({
    queryKey: ["locked-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, staff_id, first_name, last_name, account_locked, login_enabled, user_id")
        .or("account_locked.eq.true,login_enabled.eq.false")
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as LockedRow[];
    },
  });

  const { data: auditTrail = [], isLoading: auditLoading } = useQuery({
    queryKey: ["account-unlock-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_unlock_audit")
        .select("id, target_staff_id, target_full_name, unlocked_by_name, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as UnlockAuditRow[];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["locked-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["account-unlock-audit"] });
    queryClient.invalidateQueries({ queryKey: ["staff"] });
    queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-destructive" /> Locked Accounts</CardTitle>
          <CardDescription>
            Accounts currently locked or with login disabled. Click <strong>Unlock</strong> to clear the lock — a reason and audit entry are required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : locked.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No locked accounts. ✅</div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locked.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.staff_id ?? "—"}</TableCell>
                      <TableCell className="font-medium">{r.last_name}, {r.first_name}</TableCell>
                      <TableCell className="space-x-1">
                        {r.account_locked && <Badge variant="outline" className="border-destructive/40 text-destructive">Locked</Badge>}
                        {!r.login_enabled && <Badge variant="outline" className="border-amber-400 text-amber-700">Login disabled</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setTarget(r)}>
                          <Unlock className="h-3.5 w-3.5 text-emerald-600" /> Unlock
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Recent Unlock Audit</CardTitle>
          <CardDescription>Last 50 admin unlock actions. Permanent record — not editable.</CardDescription>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : auditTrail.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No unlock actions recorded yet.</div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Unlocked by</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditTrail.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {format(new Date(row.created_at), "yyyy-MM-dd HH:mm")}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{row.target_full_name ?? "—"}</div>
                        <div className="font-mono text-xs text-muted-foreground">{row.target_staff_id ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-sm">{row.unlocked_by_name ?? "—"}</TableCell>
                      <TableCell className="text-sm max-w-[420px] whitespace-pre-wrap">{row.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {target && (
        <UnlockAccountDialog
          open={!!target}
          onOpenChange={(o) => { if (!o) setTarget(null); }}
          profileId={target.id}
          staffId={target.staff_id}
          fullName={`${target.last_name ?? ""}, ${target.first_name ?? ""}`.trim()}
          onUnlocked={refresh}
        />
      )}
    </div>
  );
}
