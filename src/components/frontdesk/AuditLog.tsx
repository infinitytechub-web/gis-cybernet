import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default function AuditLog() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["front-desk-audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("front_desk_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const actionColor = (action: string) => {
    if (action === "create") return "bg-green-100 text-green-800";
    if (action === "update") return "bg-blue-100 text-blue-800";
    if (action === "delete") return "bg-red-100 text-red-800";
    return "";
  };

  return (
    <div className="space-y-4 mt-4">
      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity Type</TableHead>
              <TableHead>Applicant</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No audit entries yet</TableCell></TableRow>
            ) : logs.map((log: any) => (
              <TableRow key={log.id}>
                <TableCell className="text-sm">{format(new Date(log.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                <TableCell><Badge className={actionColor(log.action)}>{log.action}</Badge></TableCell>
                <TableCell><Badge variant="outline">{log.entity_type.replace("_", " ")}</Badge></TableCell>
                <TableCell>{log.details?.applicant_name || "—"}</TableCell>
                <TableCell>{log.details?.status || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></CardContent></Card>
    </div>
  );
}
