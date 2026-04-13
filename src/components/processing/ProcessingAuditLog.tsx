import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function ProcessingAuditLog() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["processing-audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("front_desk_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4 mt-4">
      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Entity Type</TableHead>
              <TableHead>Entity ID</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No audit log entries</TableCell></TableRow>
            ) : logs.map((log: any) => (
              <TableRow key={log.id}>
                <TableCell><Badge variant="outline">{log.action}</Badge></TableCell>
                <TableCell>{log.entity_type}</TableCell>
                <TableCell className="text-xs font-mono">{log.entity_id.slice(0, 8)}…</TableCell>
                <TableCell className="text-sm">{format(new Date(log.created_at), "dd MMM yyyy HH:mm")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></CardContent></Card>
    </div>
  );
}