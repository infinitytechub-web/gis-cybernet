/**
 * LEAVE BALANCE DASHBOARD
 *
 * Reads the `leave_balances` RPC, which returns one row per staff member per
 * leave type with the yearly allowance, days already approved, days pending and
 * days remaining. The RPC scopes visibility itself (staff see only themselves,
 * the command tier sees everyone), so no direct profile access happens here.
 *
 * Command tier can also edit the yearly allowances (leave_entitlements).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarCheck, IdCard, Search, Save, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const db = supabase as any;

const LEAVE_TYPES = ["annual", "sick", "compassionate", "pass", "study"] as const;
const TYPE_LABELS: Record<string, string> = {
  annual: "Annual leave",
  sick: "Sick leave",
  compassionate: "Compassionate leave",
  pass: "Pass",
  study: "Study leave",
};

type BalanceRow = {
  profile_id: string;
  staff_id: string | null;
  full_name: string | null;
  rank_name: string | null;
  department_name: string | null;
  unit: string | null;
  shift_group: string | null;
  leave_type: string;
  days_entitled: number;
  days_taken: number;
  days_pending: number;
  days_remaining: number;
};

type Entitlement = { id: string; leave_type: string; year: number; days: number };

const ALL = "all";

export function LeaveBalanceDashboard() {
  const { isAdminOrSupervisor } = useAuth();
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [type, setType] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["leave-balances", year],
    queryFn: async (): Promise<BalanceRow[]> => {
      const { data, error } = await db.rpc("leave_balances", { _year: year });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: entitlements = [] } = useQuery({
    queryKey: ["leave-entitlements", year],
    queryFn: async (): Promise<Entitlement[]> => {
      const { data, error } = await db
        .from("leave_entitlements")
        .select("id, leave_type, year, days")
        .eq("year", year);
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveEntitlement = useMutation({
    mutationFn: async (vars: { leaveType: string; days: number }) => {
      const { error } = await db
        .from("leave_entitlements")
        .upsert(
          { leave_type: vars.leaveType, year, days: vars.days },
          { onConflict: "leave_type,year" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Allowance saved");
      qc.invalidateQueries({ queryKey: ["leave-entitlements", year] });
      qc.invalidateQueries({ queryKey: ["leave-balances", year] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the allowance"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== ALL && r.leave_type !== type) return false;
      if (!q) return true;
      return `${r.full_name ?? ""} ${r.staff_id ?? ""} ${r.unit ?? ""}`.toLowerCase().includes(q);
    });
  }, [rows, type, search]);

  const totals = useMemo(() => {
    const t = { people: new Set<string>(), entitled: 0, taken: 0, pending: 0, remaining: 0 };
    filtered.forEach((r) => {
      t.people.add(r.profile_id);
      t.entitled += Number(r.days_entitled) || 0;
      t.taken += Number(r.days_taken) || 0;
      t.pending += Number(r.days_pending) || 0;
      t.remaining += Number(r.days_remaining) || 0;
    });
    return t;
  }, [filtered]);

  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-4 w-4 text-primary" aria-hidden="true" /> Leave balances
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="leave-balance-year">Year</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger id="leave-balance-year" className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="leave-balance-type">Leave type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="leave-balance-type" className="w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All leave types</SelectItem>
                  {LEAVE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[200px] flex-1 space-y-1">
              <Label htmlFor="leave-balance-search">Search staff</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="leave-balance-search"
                  className="pl-8"
                  placeholder="Name, staff ID or station"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
              Refresh
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Staff covered" value={totals.people.size} />
            <Stat label="Days allowed" value={totals.entitled} />
            <Stat label="Days approved" value={totals.taken} />
            <Stat label="Days awaiting decision" value={totals.pending} />
            <Stat label="Days remaining" value={totals.remaining} />
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Rank / station</TableHead>
                  <TableHead>Leave type</TableHead>
                  <TableHead className="text-right">Allowed</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="w-[180px]">Remaining</TableHead>
                  <TableHead>Bio-data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">Loading balances…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">No balances to show.</TableCell></TableRow>
                ) : (
                  filtered.slice(0, 500).map((r) => {
                    const entitled = Number(r.days_entitled) || 0;
                    const remaining = Number(r.days_remaining) || 0;
                    const pct = entitled ? Math.round((remaining / entitled) * 100) : 0;
                    return (
                      <TableRow key={`${r.profile_id}-${r.leave_type}`}>
                        <TableCell>
                          <div className="font-medium">{r.full_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.staff_id || "—"}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{r.rank_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.unit || r.department_name || "—"}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{TYPE_LABELS[r.leave_type] ?? r.leave_type}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{entitled}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(r.days_taken) || 0}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(r.days_pending) || 0}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={pct} className="h-2" />
                            <span className="tabular-nums text-xs">{remaining}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/staff/${r.profile_id}`}>
                              <IdCard className="mr-1 h-4 w-4" aria-hidden="true" /> Open record
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {isAdminOrSupervisor && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Yearly allowances · {year}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {LEAVE_TYPES.map((t) => {
                const current = entitlements.find((e) => e.leave_type === t);
                const key = `${t}-${year}`;
                const value = drafts[key] ?? String(current?.days ?? 0);
                return (
                  <div key={t} className="flex items-end gap-2 rounded-md border p-3">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`ent-${t}`}>{TYPE_LABELS[t]}</Label>
                      <Input
                        id={`ent-${t}`}
                        type="number"
                        min={0}
                        step={0.5}
                        value={value}
                        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => saveEntitlement.mutate({ leaveType: t, days: Number(value) || 0 })}
                      disabled={saveEntitlement.isPending}
                    >
                      <Save className="mr-1 h-4 w-4" aria-hidden="true" /> Save
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Allowances apply to every active staff member for the selected year. Days already approved are
              deducted automatically.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-2xl font-semibold leading-none tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
