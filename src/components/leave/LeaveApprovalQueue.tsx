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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { format, differenceInDays } from "date-fns";
import {
  Search, CheckCircle2, XCircle, Clock, FileText, Download, MoreHorizontal,
  Pencil, Trash2, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { ApprovalAuditTrail } from "@/components/audit/ApprovalAuditTrail";
import { generateLeaveLetter, downloadPdf } from "@/lib/branded-letter-pdf";
import { LeaveEditDialog } from "./LeaveEditDialog";
import { softDelete } from "@/lib/recycle-bin";

export function LeaveApprovalQueue() {
  const { user, isAdmin, isOic, isAdminOrSupervisor } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [editRequest, setEditRequest] = useState<any>(null);
  const [deleteRequest, setDeleteRequest] = useState<any>(null);
  const [comments, setComments] = useState("");

  /** Role-based capabilities — server-side triggers/RLS enforce the same rules. */
  const canReview = isAdminOrSupervisor;                 // approve / reject
  const canEditPending = isAdminOrSupervisor;            // edit while pending
  const canDelete = isAdmin || isOic;                    // soft delete (Recycle Bin)
  const canRevert = isAdmin;                             // put a decided request back to pending

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
        .select("*, profiles!leave_requests_profile_id_fkey(first_name, last_name, staff_id, shift_group), approver:profiles!leave_requests_approved_by_fkey(first_name, last_name, staff_id)")
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "pending" | "approved" | "rejected");
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const decisionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approved" | "rejected" | "pending" }) => {
      if (action === "rejected" && !comments.trim()) {
        throw new Error("A comment is required when rejecting a request.");
      }
      const payload: Record<string, unknown> = { status: action };
      if (action !== "pending") {
        payload.approved_by = adminProfile?.id ?? null;
        payload.comments = comments || null;
      }
      const { error } = await supabase.from("leave_requests").update(payload as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["leave-admin-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["approval-audit"] });
      if (selectedRequest && action !== "pending") {
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
      toast.success(action === "pending" ? "Request reverted to pending" : `Leave request ${action}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Action failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (r: any) => {
      await softDelete({
        table: "leave_requests",
        id: r.id,
        label: `${r.type} leave — ${r.profiles?.last_name ?? ""}, ${r.profiles?.first_name ?? ""}`.trim(),
        context: `${format(new Date(r.start_date), "dd/MM/yyyy")} – ${format(new Date(r.end_date), "dd/MM/yyyy")} · ${r.status}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["leave-admin-dashboard"] });
      setDeleteRequest(null);
      toast.success("Request moved to the Recycle Bin");
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
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

  const downloadLetter = (r: any) => {
    const days = differenceInDays(new Date(r.end_date), new Date(r.start_date)) + 1;
    const doc = generateLeaveLetter({
      staffName: `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim(),
      staffId: r.profiles?.staff_id ?? "—",
      type: r.type,
      startDate: r.start_date,
      endDate: r.end_date,
      days,
      status: r.status,
      reason: r.reason ?? undefined,
      comments: r.comments ?? undefined,
      reference: `LV-${r.id.slice(0, 8).toUpperCase()}`,
    });
    downloadPdf(doc, `leave-${r.profiles?.staff_id ?? r.id.slice(0, 6)}.pdf`);
  };

  const decidedBy = (r: any) => {
    if (r.status === "pending") return null;
    const name = r.approver ? `${r.approver.first_name ?? ""} ${r.approver.last_name ?? ""}`.trim() : "";
    const when = r.decided_at ? format(new Date(r.decided_at), "dd/MM/yyyy HH:mm") : null;
    if (!name && !when) return null;
    return `${r.status === "approved" ? "Approved" : "Rejected"} by ${name || "—"}${when ? ` — ${when}` : ""}`;
  };

  return (
    <div className="space-y-4">
      {/* Summary — clickable status filters */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { key: "pending", label: "Pending", value: pendingCount, Icon: Clock, tone: "text-amber-600" },
          { key: "approved", label: "Approved", value: requests.filter((r: any) => r.status === "approved").length, Icon: CheckCircle2, tone: "text-emerald-600" },
          { key: "rejected", label: "Rejected", value: requests.filter((r: any) => r.status === "rejected").length, Icon: XCircle, tone: "text-destructive" },
        ] as const).map(({ key, label, value, Icon, tone }) => (
          <Card
            key={key}
            role="button"
            tabIndex={0}
            aria-pressed={statusFilter === key}
            onClick={() => setStatusFilter(key)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setStatusFilter(key); } }}
            className={`cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${statusFilter === key ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`h-8 w-8 ${tone}`} />
              <div>
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
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
        <div className="rounded-lg border overflow-x-auto">
          <Table className="min-w-[700px]">
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
                  const isPending = r.status === "pending";
                  const showMenu = canReview || canEditPending || canDelete;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.profiles?.last_name}, {r.profiles?.first_name}</div>
                        <div className="text-xs text-muted-foreground">{r.profiles?.staff_id}</div>
                      </TableCell>
                      <TableCell className="capitalize">{r.type}</TableCell>
                      <TableCell className="hidden sm:table-cell text-xs">
                        {format(new Date(r.start_date), "dd/MM/yyyy")} – {format(new Date(r.end_date), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{days}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={statusColor(r.status)}>{r.status}</Badge>
                        {decidedBy(r) && (
                          <div className="text-[11px] text-muted-foreground mt-1">{decidedBy(r)}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {isPending && canReview && (
                            <Button
                              variant="outline"
                              size="sm"
                              title="Review request"
                              onClick={() => { setSelectedRequest(r); setComments(r.comments ?? ""); }}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                          {!isPending && (
                            <Button variant="outline" size="sm" title="Download letter" onClick={() => downloadLetter(r)}>
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          {showMenu && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" aria-label="Request actions">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {isPending && canEditPending && (
                                  <DropdownMenuItem onClick={() => setEditRequest(r)}>
                                    <Pencil className="h-4 w-4 mr-2" /> Edit
                                  </DropdownMenuItem>
                                )}
                                {isPending && canReview && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => { setSelectedRequest(r); setComments(r.comments ?? ""); }}
                                    >
                                      <CheckCircle2 className="h-4 w-4 mr-2" /> Approve / Reject
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {!isPending && canRevert && (
                                  <DropdownMenuItem
                                    onClick={() => { setComments(""); decisionMutation.mutate({ id: r.id, action: "pending" }); }}
                                  >
                                    <RotateCcw className="h-4 w-4 mr-2" /> Revert to pending
                                  </DropdownMenuItem>
                                )}
                                {canDelete && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteRequest(r)}>
                                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
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
                  <p className="font-medium">{format(new Date(selectedRequest.start_date), "dd/MM/yyyy")}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">To:</span>
                  <p className="font-medium">{format(new Date(selectedRequest.end_date), "dd/MM/yyyy")}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Days:</span>
                  <p className="font-medium">{differenceInDays(new Date(selectedRequest.end_date), new Date(selectedRequest.start_date)) + 1}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <Badge variant="secondary" className={statusColor(selectedRequest.status)}>{selectedRequest.status}</Badge>
                  {decidedBy(selectedRequest) && (
                    <p className="text-xs text-muted-foreground mt-1">{decidedBy(selectedRequest)}</p>
                  )}
                </div>
              </div>
              {selectedRequest.reason && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Reason:</span>
                  <p className="mt-1 p-2 bg-muted rounded text-foreground">{selectedRequest.reason}</p>
                </div>
              )}
              <div>
                <Label htmlFor="leave-review-comments">Comments (required when rejecting)</Label>
                <Textarea
                  id="leave-review-comments"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={2}
                  placeholder="Add officer comments..."
                />
              </div>
              <div className="border-t pt-3">
                <h4 className="text-sm font-semibold mb-1">Approval History</h4>
                <ApprovalAuditTrail entityType="leave_request" entityId={selectedRequest.id} />
              </div>
              {canReview && selectedRequest.status === "pending" && (
                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-1"
                    onClick={() => decisionMutation.mutate({ id: selectedRequest.id, action: "approved" })}
                    disabled={decisionMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 gap-1"
                    onClick={() => decisionMutation.mutate({ id: selectedRequest.id, action: "rejected" })}
                    disabled={decisionMutation.isPending}
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <LeaveEditDialog request={editRequest} onClose={() => setEditRequest(null)} />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteRequest} onOpenChange={(open) => { if (!open) setDeleteRequest(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this leave / pass request?</AlertDialogTitle>
            <AlertDialogDescription>
              The request will be moved to the Recycle Bin (restorable by Admin / OIC) and the deletion is
              recorded in the audit trail. It is not permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (deleteRequest) deleteMutation.mutate(deleteRequest); }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Move to Recycle Bin"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
