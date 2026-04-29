import { useState } from "react";
import { createNotification, getUserIdFromProfileId } from "@/lib/notifications";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { format, differenceInDays } from "date-fns";
import { Search, CheckCircle2, XCircle, Clock, FileText } from "lucide-react";
import { toast } from "sonner";
import { ApprovalAuditTrail } from "@/components/audit/ApprovalAuditTrail";

export function LeaveApprovalQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [comments, setComments] = useState("");

  const { data: adminProfile } = useQuery({
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
    queryKey: ["leave-requests", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("leave_requests")
        .select("*, profiles(first_name, last_name, staff_id, shift_group)")
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "pending" | "approved" | "rejected");
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approved" | "rejected" }) => {
      const { error } = await supabase
        .from("leave_requests")
        .update({
          status: action,
          approved_by: adminProfile?.id ?? null,
          comments: comments || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["approval-audit"] });
      // Send notification to the staff member
      if (selectedRequest) {
        const userId = await getUserIdFromProfileId(selectedRequest.profile_id);
        if (userId) {
          await createNotification({
            userId,
            title: `Leave ${action === "approved" ? "Approved" : "Rejected"}`,
            message: `Your ${selectedRequest.type} leave request has been ${action}.${comments ? ` Comment: ${comments}` : ""}`,
            type: "leave",
            referenceId: selectedRequest.id,
          });
        }
      }
      setSelectedRequest(null);
      setComments("");
      toast.success(`Leave request ${action}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = requests.filter((r: any) => {
    const name = `${r.profiles?.last_name} ${r.profiles?.first_name} ${r.profiles?.staff_id}`.toLowerCase();
    return !search || name.includes(search.toLowerCase());
  });

  const pendingCount = requests.filter((r: any) => r.status === "pending").length;

  const statusColor = (s: string) => {
    switch (s) {
      case "approved": return "bg-emerald-100 text-emerald-800";
      case "rejected": return "bg-red-100 text-red-800";
      default: return "bg-amber-100 text-amber-800";
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-amber-600" />
            <div>
              <div className="text-2xl font-bold">{pendingCount}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <div>
              <div className="text-2xl font-bold">{requests.filter((r: any) => r.status === "approved").length}</div>
              <div className="text-xs text-muted-foreground">Approved</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="h-8 w-8 text-destructive" />
            <div>
              <div className="text-2xl font-bold">{requests.filter((r: any) => r.status === "rejected").length}</div>
              <div className="text-xs text-muted-foreground">Rejected</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden sm:table-cell">Dates</TableHead>
                <TableHead className="hidden sm:table-cell">Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No leave requests</TableCell>
                </TableRow>
              ) : (
                filtered.map((r: any) => {
                  const days = differenceInDays(new Date(r.end_date), new Date(r.start_date)) + 1;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.profiles?.last_name}, {r.profiles?.first_name}</div>
                        <div className="text-xs text-muted-foreground">{r.profiles?.staff_id}</div>
                      </TableCell>
                      <TableCell className="capitalize">{r.type}</TableCell>
                      <TableCell className="hidden sm:table-cell text-xs">
                        {format(new Date(r.start_date), "dd MMM")} – {format(new Date(r.end_date), "dd MMM yy")}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{days}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={statusColor(r.status)}>{r.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {r.status === "pending" ? (
                          <Button variant="outline" size="sm" onClick={() => { setSelectedRequest(r); setComments(""); }}>
                            <FileText className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Review dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => { if (!open) setSelectedRequest(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Leave Request</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Staff:</span>
                  <p className="font-medium">{selectedRequest.profiles?.last_name}, {selectedRequest.profiles?.first_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Type:</span>
                  <p className="font-medium capitalize">{selectedRequest.type}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">From:</span>
                  <p className="font-medium">{format(new Date(selectedRequest.start_date), "PPP")}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">To:</span>
                  <p className="font-medium">{format(new Date(selectedRequest.end_date), "PPP")}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Days:</span>
                  <p className="font-medium">{differenceInDays(new Date(selectedRequest.end_date), new Date(selectedRequest.start_date)) + 1}</p>
                </div>
              </div>
              {selectedRequest.reason && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Reason:</span>
                  <p className="mt-1 p-2 bg-muted rounded text-foreground">{selectedRequest.reason}</p>
                </div>
              )}
              <div>
                <Label>Comments (optional)</Label>
                <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} placeholder="Add admin comments..." />
              </div>
              <div className="border-t pt-3">
                <h4 className="text-sm font-semibold mb-1">Approval History</h4>
                <ApprovalAuditTrail entityType="leave_request" entityId={selectedRequest.id} />
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-1"
                  onClick={() => approveMutation.mutate({ id: selectedRequest.id, action: "approved" })}
                  disabled={approveMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" /> Approve
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 gap-1"
                  onClick={() => approveMutation.mutate({ id: selectedRequest.id, action: "rejected" })}
                  disabled={approveMutation.isPending}
                >
                  <XCircle className="h-4 w-4" /> Reject
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
