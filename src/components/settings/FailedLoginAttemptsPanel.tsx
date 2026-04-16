import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Unlock, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface AttemptRow {
  staff_id: string;
  attempts: number;
  last_attempt: string;
  is_manual_lock: boolean;
}

export function FailedLoginAttemptsPanel() {
  const queryClient = useQueryClient();

  const { data: lockedAccounts = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["failed-login-attempts"],
    queryFn: async (): Promise<AttemptRow[]> => {
      // Get failed attempts in last 60 seconds
      const cutoff = new Date(Date.now() - 60_000).toISOString();
      const { data: attempts, error: aErr } = await supabase
        .from("failed_login_attempts")
        .select("staff_id, attempted_at")
        .gte("attempted_at", cutoff);
      if (aErr) throw aErr;

      // Get manually-locked profiles
      const { data: lockedProfiles, error: pErr } = await supabase
        .from("profiles")
        .select("staff_id")
        .eq("account_locked", true);
      if (pErr) throw pErr;

      // Aggregate failed attempts by staff_id
      const attemptMap = new Map<string, { count: number; last: string }>();
      attempts?.forEach((a) => {
        const existing = attemptMap.get(a.staff_id);
        if (!existing || a.attempted_at > existing.last) {
          attemptMap.set(a.staff_id, {
            count: (existing?.count ?? 0) + 1,
            last: a.attempted_at,
          });
        } else {
          existing.count += 1;
        }
      });

      const rows: AttemptRow[] = [];
      const seen = new Set<string>();

      // Locked from rate limit (5+ attempts)
      attemptMap.forEach((v, staff_id) => {
        if (v.count >= 5) {
          rows.push({ staff_id, attempts: v.count, last_attempt: v.last, is_manual_lock: false });
          seen.add(staff_id);
        }
      });

      // Manually locked
      lockedProfiles?.forEach((p) => {
        if (!seen.has(p.staff_id)) {
          rows.push({ staff_id: p.staff_id, attempts: 0, last_attempt: "", is_manual_lock: true });
        }
      });

      return rows.sort((a, b) => a.staff_id.localeCompare(b.staff_id));
    },
    refetchInterval: 15000,
  });

  const unlockMutation = useMutation({
    mutationFn: async ({ staff_id, isManual }: { staff_id: string; isManual: boolean }) => {
      // Always clear failed attempts
      const { error: rpcErr } = await supabase.rpc("admin_reset_failed_attempts", { _staff_id: staff_id });
      if (rpcErr) throw rpcErr;

      // If manually locked, also unlock the profile
      if (isManual) {
        const { error: pErr } = await supabase
          .from("profiles")
          .update({ account_locked: false })
          .eq("staff_id", staff_id);
        if (pErr) throw pErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["failed-login-attempts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast.success("Account unlocked");
    },
    onError: (e: any) => toast.error(e.message || "Failed to unlock"),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-destructive" /> Locked Accounts
            </CardTitle>
            <CardDescription>
              Accounts currently locked due to failed login attempts (5+ within 60s) or manual admin lock.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : lockedAccounts.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            ✓ No locked accounts. All staff can currently sign in.
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Lock Type</TableHead>
                  <TableHead>Failed Attempts</TableHead>
                  <TableHead>Last Attempt</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lockedAccounts.map((row) => (
                  <TableRow key={row.staff_id}>
                    <TableCell className="font-mono text-xs">{row.staff_id}</TableCell>
                    <TableCell>
                      {row.is_manual_lock ? (
                        <Badge variant="outline" className="text-destructive border-destructive/30 gap-1">
                          <ShieldAlert className="h-3 w-3" /> Manual Lock
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-chart-4 border-chart-4/30 gap-1">
                          Rate Limit
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.is_manual_lock ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <Badge variant="secondary">{row.attempts}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.last_attempt
                        ? formatDistanceToNow(new Date(row.last_attempt), { addSuffix: true })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() =>
                          unlockMutation.mutate({ staff_id: row.staff_id, isManual: row.is_manual_lock })
                        }
                        disabled={unlockMutation.isPending}
                      >
                        <Unlock className="h-3.5 w-3.5" /> Unlock
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
  );
}
