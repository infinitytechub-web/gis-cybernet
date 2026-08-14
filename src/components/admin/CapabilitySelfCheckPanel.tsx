import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, ChevronsUpDown, Loader2, MinusCircle, RefreshCw, ShieldQuestion } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { COMMAND_CAPABILITIES } from "@/components/admin/CommandTierGrantsPanel";

type Profile = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  staff_id: string | null;
  email: string | null;
};

type ReportRow = {
  capability: string;
  effective: boolean;
  source: string;
  expires_at: string | null;
  roles: string[] | null;
  is_command_tier: boolean;
  authority_level: number | null;
};

const displayName = (p: Profile) =>
  `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || p.user_id.slice(0, 8);

const capLabel = (v: string) => COMMAND_CAPABILITIES.find((c) => c.value === v)?.label ?? v;

const sourceLabel = (row: ReportRow) => {
  if (!row.effective) return "—";
  if (row.source === "role_tier") return "Role tier";
  if (row.source === "grant") {
    return row.expires_at
      ? `Individual grant (expires ${format(new Date(row.expires_at), "dd/MM/yyyy")})`
      : "Individual grant (no expiry)";
  }
  return "—";
};

/**
 * Read-only capability inspector. Every verdict comes from the database
 * (`command_capability_report`), which calls the same `has_command_capability`
 * checks the rest of the system enforces — the UI never decides access here.
 */
export function CapabilitySelfCheckPanel() {
  const { user } = useAuth();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!targetId && user?.id) setTargetId(user.id);
  }, [user?.id, targetId]);

  const { data: staff = [] } = useQuery({
    queryKey: ["capability-check-staff"],
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

  const target = useMemo(() => staff.find((s) => s.user_id === targetId) ?? null, [staff, targetId]);

  const { data: rows = [], isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["command-capability-report", targetId],
    enabled: !!targetId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("command_capability_report", { _target: targetId! });
      if (error) throw error;
      return (data ?? []) as ReportRow[];
    },
  });

  const summary = rows[0];
  const roles = summary?.roles ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldQuestion className="h-4 w-4 text-primary" /> Capability check
          </CardTitle>
          <CardDescription>
            Verify an account's effective command-tier permissions before assigning new grants. Read-only — nothing is
            changed, and results come from the same server-side checks the system enforces.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-[240px] justify-between">
                <span className="truncate">{target ? displayName(target) : "Select staff…"}</span>
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="end">
              <Command>
                <CommandInput placeholder="Search name, staff ID or email…" />
                <CommandList>
                  <CommandEmpty>No staff found.</CommandEmpty>
                  <CommandGroup>
                    {user?.id && (
                      <CommandItem value="my account self" onSelect={() => { setTargetId(user.id); setPickerOpen(false); }}>
                        My account
                      </CommandItem>
                    )}
                    {staff.map((s) => (
                      <CommandItem
                        key={s.user_id}
                        value={`${displayName(s)} ${s.staff_id ?? ""} ${s.email ?? ""}`}
                        onSelect={() => { setTargetId(s.user_id); setPickerOpen(false); }}
                      >
                        <span className="truncate">{displayName(s)}</span>
                        {s.staff_id && <span className="ml-2 text-xs text-muted-foreground">{s.staff_id}</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={!targetId || isFetching} className="gap-1.5">
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Re-check
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="py-4 text-sm text-destructive">
            {(error as any)?.message ?? "Unable to run the capability check."}
          </p>
        ) : isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking capabilities…
          </div>
        ) : !summary ? (
          <p className="py-6 text-sm text-muted-foreground">Select a staff account to inspect its permissions.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border bg-muted/40 p-3 text-sm">
              <div>
                <span className="text-muted-foreground">Roles: </span>
                {roles.length ? (
                  <span className="inline-flex flex-wrap gap-1 align-middle">
                    {roles.map((r) => (
                      <Badge key={r} variant="secondary" className="text-[11px]">{r}</Badge>
                    ))}
                  </span>
                ) : (
                  <span className="font-medium">none</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Command tier: </span>
                <span className="font-medium">{summary.is_command_tier ? "yes" : "no"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Authority level: </span>
                <span className="font-medium">{summary.authority_level ?? 0}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Capability</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.capability}>
                        <TableCell className="font-medium">{capLabel(row.capability)}</TableCell>
                        <TableCell>
                          {row.effective ? (
                            <Badge className="bg-success text-success-foreground hover:bg-success">
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Allowed
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              <MinusCircle className="mr-1 h-3 w-3" /> Not allowed
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{sourceLabel(row)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
