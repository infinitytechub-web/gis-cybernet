import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { differenceInDays } from "date-fns";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { CheckCircle2, Clock, Download, FileText, XCircle } from "lucide-react";
import { generateLeaveLetter, downloadPdf } from "@/lib/branded-letter-pdf";

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const statusTone = (s: string) =>
  s === "approved"
    ? "bg-success/15 text-success"
    : s === "rejected"
      ? "bg-destructive/15 text-destructive"
      : "bg-warning/15 text-warning";

export function MyLeaveHistory() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, staff_id, first_name, last_name")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["my-leave-requests", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select(
          "id, type, status, start_date, end_date, reason, comments, created_at, decided_at, approver:profiles!leave_requests_approved_by_fkey(first_name, last_name)",
        )
        .eq("profile_id", profile!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const counts = useMemo(
    () => ({
      all: requests.length,
      pending: requests.filter((r: any) => r.status === "pending").length,
      approved: requests.filter((r: any) => r.status === "approved").length,
      rejected: requests.filter((r: any) => r.status === "rejected").length,
    }),
    [requests],
  );

  const rows = filter === "all" ? requests : requests.filter((r: any) => r.status === filter);
  const fullName = profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : "";

  const tiles: { key: StatusFilter; label: string; icon: typeof Clock; tone: string }[] = [
    { key: "all", label: "Total", icon: FileText, tone: "text-primary" },
    { key: "pending", label: "Pending", icon: Clock, tone: "text-warning" },
    { key: "approved", label: "Approved", icon: CheckCircle2, tone: "text-success" },
    { key: "rejected", label: "Rejected", icon: XCircle, tone: "text-destructive" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-secondary">
          <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
          My Leave History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((t) => {
            const Icon = t.icon;
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                aria-pressed={active}
                className={`rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${t.tone}`} aria-hidden="true" />
                  <span className="text-xl font-bold">{counts[t.key]}</span>
                </div>
                <span className="text-xs text-muted-foreground">{t.label}</span>
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="py-6 text-center text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            {counts.all === 0 ? "No leave requests yet" : `No ${filter} requests`}
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="w-16">Letter</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => {
                  const days = differenceInDays(new Date(r.end_date), new Date(r.start_date)) + 1;
                  const approver = r.approver
                    ? `${r.approver.first_name ?? ""} ${r.approver.last_name ?? ""}`.trim()
                    : "";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="capitalize font-medium">{r.type}</TableCell>
                      <TableCell className="text-xs">
                        {formatDate(r.start_date)} – {formatDate(r.end_date)}
                      </TableCell>
                      <TableCell>{days}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={statusTone(r.status)}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.status === "pending" ? (
                          <span>Awaiting review</span>
                        ) : (
                          <div className="space-y-0.5">
                            <div>{approver || "—"}</div>
                            <div>{r.decided_at ? formatDateTime(r.decided_at) : "—"}</div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[220px] text-xs text-muted-foreground truncate" title={r.comments ?? r.reason ?? ""}>
                        {r.comments ?? r.reason ?? "—"}
                      </TableCell>
                      <TableCell>
                        {r.status !== "pending" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Download letter"
                            aria-label={`Download ${r.status} letter`}
                            onClick={() => {
                              const doc = generateLeaveLetter({
                                staffName: fullName,
                                staffId: profile?.staff_id ?? "—",
                                type: r.type,
                                startDate: r.start_date,
                                endDate: r.end_date,
                                days,
                                status: r.status,
                                reason: r.reason ?? undefined,
                                comments: r.comments ?? undefined,
                                reference: `LV-${r.id.slice(0, 8).toUpperCase()}`,
                              });
                              downloadPdf(doc, `leave-${profile?.staff_id ?? "request"}.pdf`);
                            }}
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
