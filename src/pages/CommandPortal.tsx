import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Building2,
  CalendarOff,
  ClipboardCheck,
  Download,
  FolderLock,
  Layers,
  Loader2,
  Printer,
  Package,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DIRECTORY_LEVEL_LABELS, DIRECTORY_SCOPE_LABELS, type DirectoryLevel, type DirectoryScope } from "@/hooks/useDirectoryPermissions";
import { downloadBlob } from "@/lib/download-utils";
import { OfficerLeavePanel } from "@/components/command/OfficerLeavePanel";
import { OfficerStoresPanel } from "@/components/command/OfficerStoresPanel";
import { ApprovedLeaveCalendarWidget } from "@/components/leave/ApprovedLeaveCalendarWidget";

interface CommandContext {
  profile_id: string | null;
  org_unit_id: string | null;
  unit_name: string | null;
  unit_code: string | null;
  unit_type: string | null;
  level: string | null;
  scope: string | null;
  shift_group: string | null;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_download: boolean;
  can_print: boolean;
  can_vault: boolean;
}

interface CommandOfficer {
  id: string;
  staff_id: string | null;
  first_name: string | null;
  last_name: string | null;
  rank_name: string | null;
  department_name: string | null;
  shift_group: string | null;
  status: string | null;
  photo_url: string | null;
  org_unit_id: string | null;
  unit_name: string | null;
  is_self: boolean;
}

type Section = "overview" | "officers" | "leave" | "stores" | "approvals" | "shifts" | "documents";

const SECTIONS: { key: Section; label: string; icon: typeof Users }[] = [
  { key: "overview", label: "Command overview", icon: Building2 },
  { key: "officers", label: "Command officers", icon: Users },
  { key: "leave", label: "My leave", icon: CalendarOff },
  { key: "stores", label: "My stores", icon: Package },
  { key: "approvals", label: "Leave approvals", icon: ClipboardCheck },
  { key: "shifts", label: "Shift groups", icon: Layers },
  { key: "documents", label: "Command documents", icon: FolderLock },
];

function officerName(o: CommandOfficer) {
  return [o.last_name, o.first_name].filter(Boolean).join(", ") || "—";
}

/**
 * Command Portal — a self-contained workspace for one command.
 *
 * Everything shown here comes from `my_command_officers()`, which resolves the
 * signed-in officer's own posting server-side and returns nothing at all when
 * they have no command or no View switch. The page never queries `profiles`
 * directly, so the command boundary cannot be widened from the browser.
 */
export default function CommandPortal() {
  const { user, isAdmin, isAdminOrSupervisor } = useAuth();
  const [section, setSection] = useState<Section>("overview");
  const [search, setSearch] = useState("");

  const ctxQuery = useQuery({
    queryKey: ["command-portal-context", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<CommandContext | null> => {
      const { data, error } = await supabase.rpc("my_command_context");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as CommandContext[];
      return rows[0] ?? null;
    },
  });

  const officersQuery = useQuery({
    queryKey: ["command-portal-officers", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<CommandOfficer[]> => {
      const { data, error } = await supabase.rpc("my_command_officers");
      if (error) throw new Error(error.message);
      return (data ?? []) as CommandOfficer[];
    },
  });

  const ctx = ctxQuery.data ?? null;
  const officers = officersQuery.data ?? [];
  const loading = ctxQuery.isLoading || officersQuery.isLoading;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return officers;
    return officers.filter((o) =>
      [o.staff_id, o.first_name, o.last_name, o.rank_name, o.department_name, o.unit_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [officers, search]);

  const byShift = useMemo(() => {
    const map = new Map<string, CommandOfficer[]>();
    for (const o of officers) {
      const key = o.shift_group || "Unassigned";
      map.set(key, [...(map.get(key) ?? []), o]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [officers]);

  const activeCount = officers.filter((o) => o.status === "active").length;

  const exportCsv = () => {
    const head = ["Staff ID", "Name", "Rank", "Department", "Shift", "Status", "Command"];
    const rows = filtered.map((o) => [
      o.staff_id ?? "",
      officerName(o),
      o.rank_name ?? "",
      o.department_name ?? "",
      o.shift_group ?? "",
      o.status ?? "",
      o.unit_name ?? "",
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    downloadBlob(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `command-officers-${ctx?.unit_code || "command"}.csv`,
    );
  };

  const denied = !loading && !isAdmin && (!ctx?.org_unit_id || !ctx?.can_view);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Command Portal</h1>
        <p className="text-sm text-muted-foreground">
          {ctx?.unit_name
            ? `${ctx.unit_name}${ctx.unit_code ? ` (${ctx.unit_code})` : ""} — officers of your own command only`
            : "Officers of your own command only"}
        </p>
      </header>

      {(ctxQuery.error || officersQuery.error) && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            Your command records could not be loaded. Please refresh the page.
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your command…
        </div>
      )}

      {denied && (
        <Card className="border-destructive/40">
          <CardHeader className="flex flex-row items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <CardTitle className="text-base">No command records available</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {!ctx?.org_unit_id
              ? "You are not posted to a command yet. An administrator must assign you to a command before this portal shows any officers."
              : "Your role is not permitted to view staff records at your command's level. An administrator can enable this in the directory permission matrix."}
          </CardContent>
        </Card>
      )}

      {!loading && !denied && (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          {/* Command-only sidebar: nothing outside this command is reachable here. */}
          <nav aria-label="Command sections" className="lg:sticky lg:top-4 lg:self-start">
            <Card>
              <CardContent className="space-y-1 p-2">
                <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {ctx?.unit_name ?? "My command"}
                </p>
                {SECTIONS.map((s) => {
                  const disabled = s.key === "documents" && !ctx?.can_vault;
                  if (s.key === "approvals" && !isAdminOrSupervisor) return null;
                  return (
                    <Button
                      key={s.key}
                      variant={section === s.key ? "secondary" : "ghost"}
                      size="sm"
                      disabled={disabled}
                      className="w-full justify-start gap-2"
                      onClick={() => setSection(s.key)}
                    >
                      <s.icon className="h-4 w-4" />
                      <span className="truncate">{s.label}</span>
                    </Button>
                  );
                })}
              </CardContent>
            </Card>
          </nav>

          <div className="min-w-0 space-y-4">
            {section === "overview" && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "Officers in scope", value: officers.length },
                    { label: "Active", value: activeCount },
                    { label: "Shift groups", value: byShift.length },
                    { label: "Hierarchy level", value: DIRECTORY_LEVEL_LABELS[(ctx?.level ?? "unit") as DirectoryLevel] ?? ctx?.level ?? "—" },
                  ].map((m) => (
                    <Card key={m.label}>
                      <CardHeader className="pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground">{m.label}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-2xl font-bold">{m.value}</CardContent>
                    </Card>
                  ))}
                  <Card className="sm:col-span-2 xl:col-span-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Your access in this command</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">
                        Scope: {DIRECTORY_SCOPE_LABELS[(ctx?.scope ?? "none") as DirectoryScope] ?? ctx?.scope}
                      </Badge>
                      {ctx?.shift_group && <Badge variant="outline">Shift {ctx.shift_group}</Badge>}
                      {(
                        [
                          ["View", ctx?.can_view],
                          ["Create", ctx?.can_create],
                          ["Edit", ctx?.can_edit],
                          ["Delete", ctx?.can_delete],
                          ["Download", ctx?.can_download],
                          ["Print", ctx?.can_print],
                          ["Document vault", ctx?.can_vault],
                        ] as [string, boolean | undefined][]
                      ).map(([label, on]) => (
                        <Badge key={label} variant={on ? "default" : "secondary"}>
                          {label}: {on ? "yes" : "no"}
                        </Badge>
                      ))}
                    </CardContent>
                  </Card>
                </div>
                <ApprovedLeaveCalendarWidget />
              </div>
            )}

            {section === "officers" && (
              <Card>
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">
                    Command officers <span className="text-muted-foreground">({filtered.length})</span>
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search this command"
                        className="w-48 pl-8"
                      />
                    </div>
                    {ctx?.can_download && (
                      <Button variant="outline" size="sm" onClick={exportCsv}>
                        <Download className="h-4 w-4" /> Export
                      </Button>
                    )}
                    {ctx?.can_print && (
                      <Button variant="outline" size="sm" onClick={() => window.print()}>
                        <Printer className="h-4 w-4" /> Print
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Rank</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Shift</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Command</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((o) => (
                        <TableRow key={o.id} className={o.is_self ? "bg-muted/40" : undefined}>
                          <TableCell className="font-mono text-xs">{o.staff_id ?? "—"}</TableCell>
                          <TableCell className="font-medium">
                            {officerName(o)}
                            {o.is_self && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                          </TableCell>
                          <TableCell>{o.rank_name ?? "—"}</TableCell>
                          <TableCell>{o.department_name ?? "—"}</TableCell>
                          <TableCell>{o.shift_group ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant={o.status === "active" ? "default" : "secondary"}>{o.status ?? "—"}</Badge>
                          </TableCell>
                          <TableCell>{o.unit_name ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                            No officers match your command scope.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {section === "shifts" && (
              <div className="grid gap-3 md:grid-cols-2">
                {byShift.map(([shift, list]) => (
                  <Card key={shift}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Shift {shift} <span className="text-muted-foreground">({list.length})</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      {list.map((o) => (
                        <div key={o.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{officerName(o)}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{o.rank_name ?? "—"}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
                {byShift.length === 0 && (
                  <p className="text-sm text-muted-foreground">No shift groups in your command yet.</p>
                )}
              </div>
            )}

            {section === "leave" && <OfficerLeavePanel />}

            {section === "stores" && <OfficerStoresPanel />}

            {section === "approvals" && isAdminOrSupervisor && (
              <Card>
                <CardHeader><CardTitle className="text-base">Leave approval queue</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>Review requests from officers inside your authorized command scope.</p>
                  <Button asChild size="sm"><Link to="/leave/approvals"><ClipboardCheck className="h-4 w-4" /> Open approval queue</Link></Button>
                </CardContent>
              </Card>
            )}

            {section === "documents" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Command documents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Document vault access is granted for your command. Files remain restricted to
                    your own command's scope.
                  </p>
                  <Button asChild size="sm">
                    <Link to="/command-vault">
                      <FolderLock className="h-4 w-4" /> Open command vault
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
