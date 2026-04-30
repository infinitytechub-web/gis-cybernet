import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { History, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { format } from "date-fns";

interface AuditRow {
  id: string;
  batch_id: string;
  performed_by: string;
  target_profile_id: string;
  kind: "documents" | "certifications";
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  outcome: "uploaded" | "failed";
  error_message: string | null;
  created_at: string;
  performer: { first_name: string | null; last_name: string | null; staff_id: string | null } | null;
  target: { first_name: string | null; last_name: string | null; staff_id: string | null } | null;
}

export function ComplianceBulkAuditDialog() {
  const [open, setOpen] = useState(false);

  const { data: rows = [], isFetching, refetch } = useQuery({
    queryKey: ["compliance-upload-audit"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_upload_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const base = (data ?? []) as unknown as AuditRow[];
      const userIds = Array.from(new Set(base.map((r) => r.performed_by)));
      const profileIds = Array.from(new Set(base.map((r) => r.target_profile_id)));
      const [performersRes, targetsRes] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("user_id, first_name, last_name, staff_id").in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        profileIds.length
          ? supabase.from("profiles").select("id, first_name, last_name, staff_id").in("id", profileIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const performerMap = new Map((performersRes.data ?? []).map((p: any) => [p.user_id, p]));
      const targetMap = new Map((targetsRes.data ?? []).map((p: any) => [p.id, p]));
      return base.map((r) => ({
        ...r,
        performer: performerMap.get(r.performed_by) ?? null,
        target: targetMap.get(r.target_profile_id) ?? null,
      }));
    },
  });

  // Group by batch
  const grouped = rows.reduce<Record<string, AuditRow[]>>((acc, r) => {
    (acc[r.batch_id] ||= []).push(r);
    return acc;
  }, {});

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-1">
        <History className="h-4 w-4" /> Upload history
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk upload audit log</DialogTitle>
            <DialogDescription>
              Records who uploaded each file, when, the target staff member, and the outcome.
              Showing the most recent 200 entries you have access to.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end mb-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1">
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>

          {rows.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10">
              {isFetching ? "Loading..." : "No bulk uploads recorded yet."}
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([batchId, items]) => {
                const first = items[0];
                const ok = items.filter((i) => i.outcome === "uploaded").length;
                const failed = items.filter((i) => i.outcome === "failed").length;
                return (
                  <div key={batchId} className="rounded-lg border">
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/40 text-xs">
                      <Badge variant="outline" className="capitalize">{first.kind}</Badge>
                      <span className="font-medium">
                        {first.performer
                          ? `${first.performer.last_name ?? ""}, ${first.performer.first_name ?? ""} (${first.performer.staff_id ?? "—"})`
                          : first.performed_by.slice(0, 8)}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span>
                        {first.target
                          ? `${first.target.last_name ?? ""}, ${first.target.first_name ?? ""} (${first.target.staff_id ?? "—"})`
                          : first.target_profile_id.slice(0, 8)}
                      </span>
                      <span className="text-muted-foreground ml-auto">
                        {format(new Date(first.created_at), "dd MMM yyyy HH:mm")}
                      </span>
                      <Badge className="bg-emerald-100 text-emerald-800">{ok} uploaded</Badge>
                      {failed > 0 && <Badge variant="destructive">{failed} failed</Badge>}
                    </div>
                    <div className="overflow-x-auto">
                      <Table className="min-w-[700px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>File</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead>Outcome</TableHead>
                            <TableHead>Detail</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="text-xs font-medium truncate max-w-[260px]" title={r.file_name}>{r.file_name}</TableCell>
                              <TableCell className="text-xs">{r.file_size != null ? `${(r.file_size / 1024).toFixed(0)} KB` : "—"}</TableCell>
                              <TableCell>
                                {r.outcome === "uploaded" ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 gap-1"><CheckCircle2 className="h-3 w-3" /> Uploaded</Badge>
                                ) : (
                                  <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Failed</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground truncate max-w-[300px]" title={r.error_message ?? ""}>
                                {r.error_message ?? r.file_type ?? "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
