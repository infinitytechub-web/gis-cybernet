import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarDays, Clock, PlaneTakeoff } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const db = supabase as any;

export function OfficerLeavePanel() {
  const year = new Date().getFullYear();
  const { data: balances = [], isLoading: balancesLoading } = useQuery({
    queryKey: ["command-portal-my-leave-balances", year],
    queryFn: async () => {
      const { data, error } = await db.rpc("my_leave_balances", { _year: year });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: requests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ["command-portal-my-leave-requests"],
    queryFn: async () => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles").select("id").eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return [];
      const { data, error } = await supabase.from("leave_requests")
        .select("id, type, start_date, end_date, status, comments")
        .eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-lg font-semibold">My leave</h2><p className="text-sm text-muted-foreground">Your balances and recent requests only.</p></div>
        <div className="flex gap-2"><Button asChild size="sm"><Link to="/leave"><PlaneTakeoff className="h-4 w-4" /> Request leave</Link></Button><Button asChild size="sm" variant="outline"><Link to="/leave/calendar"><CalendarDays className="h-4 w-4" /> Calendar</Link></Button></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {balancesLoading ? <p className="text-sm text-muted-foreground">Loading balances…</p> : balances.map((row: any) => (
          <Card key={row.leave_type}><CardHeader className="pb-1"><CardTitle className="text-sm capitalize">{String(row.leave_type).replaceAll("_", " ")}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{Number(row.days_remaining)}</div><p className="text-xs text-muted-foreground">remaining · {Number(row.days_taken)} approved · {Number(row.days_pending)} pending</p></CardContent></Card>
        ))}
      </div>
      <Card><CardHeader><CardTitle className="text-base">Recent requests</CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Dates</TableHead><TableHead>Status</TableHead><TableHead>Comments</TableHead></TableRow></TableHeader><TableBody>
        {requestsLoading ? <TableRow><TableCell colSpan={4}>Loading requests…</TableCell></TableRow> : requests.map((row: any) => <TableRow key={row.id}><TableCell className="capitalize">{row.type}</TableCell><TableCell>{format(new Date(`${row.start_date}T00:00:00`), "dd/MM/yyyy")} – {format(new Date(`${row.end_date}T00:00:00`), "dd/MM/yyyy")}</TableCell><TableCell><Badge variant={row.status === "approved" ? "default" : "secondary"}>{row.status}</Badge></TableCell><TableCell>{row.comments || "—"}</TableCell></TableRow>)}
        {!requestsLoading && requests.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No leave requests yet.</TableCell></TableRow>}
      </TableBody></Table></CardContent></Card>
    </div>
  );
}