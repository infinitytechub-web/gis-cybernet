import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function Attendance() {
  const today = new Date().toISOString().split("T")[0];

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["attendance", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendances")
        .select("*, profiles(first_name, last_name, staff_id)")
        .eq("date", today)
        .order("check_in", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "present": return "bg-emerald-100 text-emerald-800";
      case "late": return "bg-amber-100 text-amber-800";
      case "absent": return "bg-red-100 text-red-800";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-secondary">Attendance</h1>
        <Badge variant="outline">{format(new Date(), "PPP")}</Badge>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No attendance records for today</TableCell>
                </TableRow>
              ) : (
                records.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.profiles?.last_name}, {r.profiles?.first_name}
                    </TableCell>
                    <TableCell>{r.check_in ? format(new Date(r.check_in), "HH:mm") : "—"}</TableCell>
                    <TableCell>{r.check_out ? format(new Date(r.check_out), "HH:mm") : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusColor(r.status)}>{r.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
