/**
 * RESTRICTED-SECTION ACCESS TRAIL
 *
 * Append-only record of every look at, and change to, the Medical & welfare and
 * Bank / salary sections of the Personnel Bio-Data form. Reads are limited by
 * the database to authorised personnel; nobody can edit or remove entries.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Eye, Loader2, Pencil, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { formatDateTime } from "@/lib/date-format";

type LogRow = {
  id: string;
  profile_id: string | null;
  section: string;
  action: string;
  actor_label: string | null;
  changed_fields: string[] | null;
  user_agent: string | null;
  created_at: string;
};

const SECTION_LABEL: Record<string, string> = {
  medical: "E · Medical & welfare",
  bank: "I · Bank / salary",
};

export function RestrictedAccessAuditPanel() {
  const [section, setSection] = useState("all");
  const [action, setAction] = useState("all");
  const [search, setSearch] = useState("");

  const logs = useQuery({
    queryKey: ["biodata-restricted-log", section, action],
    queryFn: async () => {
      let q = supabase
        .from("biodata_restricted_access_log")
        .select("id, profile_id, section, action, actor_label, changed_fields, user_agent, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (section !== "all") q = q.eq("section", section);
      if (action !== "all") q = q.eq("action", action);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const profileIds = useMemo(
    () => [...new Set((logs.data ?? []).map((r) => r.profile_id).filter(Boolean) as string[])],
    [logs.data],
  );

  const names = useQuery({
    queryKey: ["biodata-restricted-log-names", profileIds],
    enabled: profileIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id")
        .in("id", profileIds);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const p of data ?? []) {
        map.set(p.id, `${[p.last_name, p.first_name].filter(Boolean).join(" ")} (${p.staff_id ?? "—"})`);
      }
      return map;
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = logs.data ?? [];
    if (!q) return list;
    return list.filter((r) => {
      const who = (names.data?.get(r.profile_id ?? "") ?? "").toLowerCase();
      return who.includes(q) || (r.actor_label ?? "").toLowerCase().includes(q);
    });
  }, [logs.data, names.data, search]);

  const viewCount = (logs.data ?? []).filter((r) => r.action === "view").length;
  const editCount = (logs.data ?? []).filter((r) => r.action === "edit").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" aria-hidden="true" />
              Restricted section access trail
            </CardTitle>
            <CardDescription>
              Who looked at, or changed, medical &amp; welfare and bank / salary details. Entries
              cannot be edited or removed. Showing the latest 500.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => logs.refetch()} disabled={logs.isFetching}>
            {logs.isFetching
              ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              : <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1"><Eye className="h-3 w-3" aria-hidden="true" /> {viewCount} views</Badge>
          <Badge variant="outline" className="gap-1"><Pencil className="h-3 w-3" aria-hidden="true" /> {editCount} changes</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="log-section">Section</Label>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger id="log-section"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All restricted sections</SelectItem>
                <SelectItem value="medical">Medical &amp; welfare</SelectItem>
                <SelectItem value="bank">Bank / salary</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="log-action">Activity</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger id="log-action"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Views and changes</SelectItem>
                <SelectItem value="view">Views only</SelectItem>
                <SelectItem value="edit">Changes only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="log-search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="log-search"
                className="pl-9"
                placeholder="Staff member or who accessed"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {logs.isError && (
          <Alert variant="destructive">
            <AlertTitle>Not available</AlertTitle>
            <AlertDescription>
              You are not authorised to read this trail, or it could not be loaded.
            </AlertDescription>
          </Alert>
        )}

        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Staff record</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Accessed by</TableHead>
                <TableHead>Fields</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!logs.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    No access recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</TableCell>
                  <TableCell className="text-sm">
                    {names.data?.get(r.profile_id ?? "") ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">{SECTION_LABEL[r.section] ?? r.section}</TableCell>
                  <TableCell>
                    <Badge variant={r.action === "edit" ? "default" : "secondary"} className="gap-1">
                      {r.action === "edit"
                        ? <Pencil className="h-3 w-3" aria-hidden="true" />
                        : <Eye className="h-3 w-3" aria-hidden="true" />}
                      {r.action === "edit" ? "Changed" : "Viewed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{r.actor_label ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {(r.changed_fields ?? []).join(", ") || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default RestrictedAccessAuditPanel;
