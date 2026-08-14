import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, differenceInDays } from "date-fns";
import { Inbox, Download, Clock, CheckCircle2, XCircle, FileText } from "lucide-react";
import { LeaveRequestForm } from "@/components/leave/LeaveRequestForm";
import { PostingRequestForm } from "@/components/postings/PostingRequestForm";
import { generateLeaveLetter, generatePostingLetter, downloadPdf } from "@/lib/branded-letter-pdf";

const statusColor = (s: string) =>
  s === "approved" ? "bg-emerald-100 text-emerald-800" :
  s === "rejected" ? "bg-red-100 text-red-800" :
  "bg-amber-100 text-amber-800";

export default function StaffPortal() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["my-profile-portal", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: leaves = [] } = useQuery({
    queryKey: ["my-leaves", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("profile_id", profile!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: postings = [] } = useQuery({
    queryKey: ["my-postings", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("postings_transfers")
        .select("*, from_dept:departments!postings_transfers_from_department_id_fkey(name), to_dept:departments!postings_transfers_to_department_id_fkey(name)")
        .eq("profile_id", profile!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const counts = {
    pending: leaves.filter((l: any) => l.status === "pending").length + postings.filter((p: any) => p.status === "pending").length,
    approved: leaves.filter((l: any) => l.status === "approved").length + postings.filter((p: any) => p.status === "approved").length,
    rejected: leaves.filter((l: any) => l.status === "rejected").length + postings.filter((p: any) => p.status === "rejected").length,
  };

  const fullName = profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Inbox className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-secondary">My Staff Portal</h1>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Clock className="h-7 w-7 text-amber-600" />
          <div><div className="text-2xl font-bold">{counts.pending}</div><div className="text-xs text-muted-foreground">Pending</div></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          <div><div className="text-2xl font-bold">{counts.approved}</div><div className="text-xs text-muted-foreground">Approved</div></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <XCircle className="h-7 w-7 text-destructive" />
          <div><div className="text-2xl font-bold">{counts.rejected}</div><div className="text-xs text-muted-foreground">Rejected</div></div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="leave" className="space-y-4">
        <TabsList>
          <TabsTrigger value="leave">Leave / Pass</TabsTrigger>
          <TabsTrigger value="posting">Posting / Transfer</TabsTrigger>
        </TabsList>

        <TabsContent value="leave" className="space-y-4">
          <LeaveRequestForm />

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> My Leave History</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded border overflow-auto" style={{ minWidth: 0 }}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead className="hidden sm:table-cell">Dates</TableHead>
                      <TableHead className="hidden sm:table-cell">Days</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-16">Letter</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaves.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No requests yet</TableCell></TableRow>
                    ) : leaves.map((r: any) => {
                      const days = differenceInDays(new Date(r.end_date), new Date(r.start_date)) + 1;
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="capitalize">{r.type}</TableCell>
                          <TableCell className="hidden sm:table-cell text-xs">{format(new Date(r.start_date), "dd/MM/yyyy")} – {format(new Date(r.end_date), "dd/MM/yyyy")}</TableCell>
                          <TableCell className="hidden sm:table-cell">{days}</TableCell>
                          <TableCell><Badge className={statusColor(r.status)} variant="secondary">{r.status}</Badge></TableCell>
                          <TableCell>
                            {(r.status === "approved" || r.status === "rejected") && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                title="Download letter"
                                onClick={() => {
                                  const doc = generateLeaveLetter({
                                    staffName: fullName,
                                    staffId: profile?.staff_id ?? "—",
                                    type: r.type, startDate: r.start_date, endDate: r.end_date, days,
                                    status: r.status, reason: r.reason ?? undefined, comments: r.comments ?? undefined,
                                    reference: `LV-${r.id.slice(0, 8).toUpperCase()}`,
                                  });
                                  downloadPdf(doc, `leave-${profile?.staff_id ?? "request"}.pdf`);
                                }}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="posting" className="space-y-4">
          <PostingRequestForm />
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> My Posting/Transfer History</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead className="hidden sm:table-cell">From → To</TableHead>
                      <TableHead className="hidden sm:table-cell">Effective</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-16">Letter</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {postings.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No requests yet</TableCell></TableRow>
                    ) : postings.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="capitalize">{r.type}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs">{r.from_dept?.name ?? "—"} → {r.to_dept?.name ?? "—"}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs">{format(new Date(r.effective_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell><Badge className={statusColor(r.status)} variant="secondary">{r.status}</Badge></TableCell>
                        <TableCell>
                          {(r.status === "approved" || r.status === "rejected") && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              title="Download letter"
                              onClick={() => {
                                const doc = generatePostingLetter({
                                  staffName: fullName,
                                  staffId: profile?.staff_id ?? "—",
                                  fromDepartment: r.from_dept?.name,
                                  toDepartment: r.to_dept?.name,
                                  effectiveDate: r.effective_date,
                                  status: r.status, comments: r.remarks ?? undefined,
                                  reference: `PT-${r.id.slice(0, 8).toUpperCase()}`,
                                });
                                downloadPdf(doc, `posting-${profile?.staff_id ?? "request"}.pdf`);
                              }}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
