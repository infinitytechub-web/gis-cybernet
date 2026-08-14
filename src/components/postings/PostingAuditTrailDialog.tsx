import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ScrollText } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  postingId: string | null;
}

const TRACKED_FIELDS = [
  "status", "effective_date", "from_department_id", "to_department_id",
  "reason", "approved_by", "rejection_reason", "notes",
];

export function PostingAuditTrailDialog({ open, onOpenChange, postingId }: Props) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["posting-audit", postingId],
    enabled: open && !!postingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_audit_log")
        .select("id, action, created_at, performed_by, details")
        .eq("entity_type", "postings_transfers")
        .eq("entity_id", postingId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const actorIds = Array.from(new Set(rows.map((r: any) => r.performed_by).filter(Boolean)));
  const { data: actors = {} } = useQuery({
    queryKey: ["audit-actors", actorIds.sort().join(",")],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id")
        .in("id", actorIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => {
        map[p.id] = `${p.last_name ?? ""}, ${p.first_name ?? ""} (${p.staff_id ?? "—"})`;
      });
      return map;
    },
  });

  function diffFields(row: any): Array<{ field: string; before: any; after: any }> {
    const d = row.details ?? {};
    if (row.action === "updated" && d.old && d.new) {
      return TRACKED_FIELDS
        .filter((f) => JSON.stringify(d.old[f]) !== JSON.stringify(d.new[f]))
        .map((f) => ({ field: f, before: d.old[f], after: d.new[f] }));
    }
    if (row.action === "created") {
      return TRACKED_FIELDS
        .filter((f) => d[f] !== undefined && d[f] !== null)
        .map((f) => ({ field: f, before: null, after: d[f] }));
    }
    if (row.action === "deleted") {
      return TRACKED_FIELDS
        .filter((f) => d[f] !== undefined && d[f] !== null)
        .map((f) => ({ field: f, before: d[f], after: null }));
    }
    return [];
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScrollText className="h-4 w-4" /> Audit Trail</DialogTitle>
          <DialogDescription>Every change recorded for this posting/transfer record.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit entries.</p>
          ) : (
            rows.map((r: any) => {
              const diffs = diffFields(r);
              return (
                <div key={r.id} className="border rounded-md p-3 text-sm space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={r.action === "deleted" ? "destructive" : r.action === "created" ? "default" : "secondary"}>
                      {r.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(r.created_at), "dd/MM/yyyy HH:mm:ss")}
                    </span>
                    <span className="text-xs ml-auto">
                      by {actors[r.performed_by] ?? r.performed_by?.slice(0, 8) ?? "system"}
                    </span>
                  </div>
                  {diffs.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No tracked field changes.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead><tr className="text-left text-muted-foreground"><th>Field</th><th>Before</th><th>After</th></tr></thead>
                      <tbody>
                        {diffs.map((d) => (
                          <tr key={d.field} className="border-t">
                            <td className="font-mono py-1">{d.field}</td>
                            <td className="text-destructive py-1">{d.before == null ? "—" : String(d.before)}</td>
                            <td className="text-success py-1">{d.after == null ? "—" : String(d.after)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
