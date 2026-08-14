import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, differenceInDays } from "date-fns";
import { FileText } from "lucide-react";

export function MyLeaveHistory() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["my-leave-requests", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("profile_id", profile!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "approved": return "bg-emerald-100 text-emerald-800";
      case "rejected": return "bg-red-100 text-red-800";
      default: return "bg-amber-100 text-amber-800";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-secondary">
          <FileText className="h-5 w-5 text-primary" />
          My Leave History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">No leave requests yet</div>
        ) : (
          <div className="rounded-lg border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r: any) => {
                  const days = differenceInDays(new Date(r.end_date), new Date(r.start_date)) + 1;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="capitalize">{r.type}</TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(r.start_date), "dd MMM")} – {format(new Date(r.end_date), "dd/MM/yy")}
                      </TableCell>
                      <TableCell>{days}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={statusColor(r.status)}>{r.status}</Badge>
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
