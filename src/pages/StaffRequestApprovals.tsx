import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock3,
  CalendarRange,
  Filter,
  ClipboardEdit,
  CalendarClock,
  RefreshCw,
  History,
  ChevronDown,
  ChevronUp,
  Ban,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Navigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { DateInput } from "@/components/ui/date-input";

type Status = "pending" | "approved" | "rejected" | "cancelled";

type StaffMini = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  staff_id: string | null;
};

type ShiftChangeRequest = {
  id: string;
  profile_id: string;
  requested_by: string;
  affected_date: string;
  request_type: string;
  current_shift_id: string | null;
  target_shift_id: string | null;
  custom_start_time: string | null;
  custom_end_time: string | null;
  reason: string;
  status: Status;
  reviewed_at: string | null;
  review_comment: string | null;
  created_at: string;
  profiles?: StaffMini | null;
  current_shift?: { name: string } | null;
  target_shift?: { name: string } | null;
};

type AttendanceEditRequest = {
  id: string;
  attendance_id: string | null;
  profile_id: string;
  affected_date: string;
  field: "check_in" | "check_out" | "both";
  current_check_in: string | null;
  current_check_out: string | null;
  proposed_check_in: string | null;
  proposed_check_out: string | null;
  reason: string;
  status: Status;
  reviewed_at: string | null;
  review_comment: string | null;
  created_at: string;
  profiles?: StaffMini | null;
};

type AnyRequest =
  | ({ kind: "shift" } & ShiftChangeRequest)
  | ({ kind: "attendance" } & AttendanceEditRequest);

const STATUS_TONE: Record<Status, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function staffName(p?: StaffMini | null) {
  if (!p) return "Unknown staff";
  const n = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return n || p.staff_id || "Staff";
}

export default function StaffRequestApprovals() {
  const { user, isAdminOrSupervisor, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"shift" | "attendance">("shift");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("pending");
  const [from, setFrom] = useState<string>(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");

  // Review dialog state
  const [review, setReview] = useState<{
    open: boolean;
    action: "approve" | "reject";
    req: AnyRequest | null;
    comment: string;
  }>({ open: false, action: "approve", req: null, comment: "" });

  // ============ Shift change requests ============
  const shiftQuery = useQuery({
    queryKey: ["staff-approvals", "shift", statusFilter, from, to],
    enabled: !!user && isAdminOrSupervisor,
    queryFn: async () => {
      let q = supabase
        .from("shift_change_requests")
        .select(
          "id, profile_id, requested_by, affected_date, request_type, current_shift_id, target_shift_id, custom_start_time, custom_end_time, reason, status, reviewed_at, review_comment, created_at, profiles:profile_id(id, first_name, last_name, staff_id), current_shift:current_shift_id(name), target_shift:target_shift_id(name)",
        )
        .gte("affected_date", from)
        .lte("affected_date", to)
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ShiftChangeRequest[];
    },
  });

  // ============ Attendance edit requests ============
  const attQuery = useQuery({
    queryKey: ["staff-approvals", "attendance", statusFilter, from, to],
    enabled: !!user && isAdminOrSupervisor,
    queryFn: async () => {
      let q = supabase
        .from("attendance_edit_requests")
        .select(
          "id, attendance_id, profile_id, affected_date, field, current_check_in, current_check_out, proposed_check_in, proposed_check_out, reason, status, reviewed_at, review_comment, created_at, profiles:profile_id(id, first_name, last_name, staff_id)",
        )
        .gte("affected_date", from)
        .lte("affected_date", to)
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AttendanceEditRequest[];
    },
  });

  // Realtime invalidation
  useEffect(() => {
    if (!isAdminOrSupervisor) return;
    const ch = supabase
      .channel("staff-approvals-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_change_requests" },
        () => queryClient.invalidateQueries({ queryKey: ["staff-approvals", "shift"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_edit_requests" },
        () => queryClient.invalidateQueries({ queryKey: ["staff-approvals", "attendance"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [isAdminOrSupervisor, queryClient]);

  // Filter by search
  const shiftRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shiftQuery.data ?? [];
    return (shiftQuery.data ?? []).filter((r) => {
      const n = staffName(r.profiles).toLowerCase();
      return n.includes(q) || (r.profiles?.staff_id ?? "").toLowerCase().includes(q) || r.reason.toLowerCase().includes(q);
    });
  }, [shiftQuery.data, search]);

  const attRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return attQuery.data ?? [];
    return (attQuery.data ?? []).filter((r) => {
      const n = staffName(r.profiles).toLowerCase();
      return n.includes(q) || (r.profiles?.staff_id ?? "").toLowerCase().includes(q) || r.reason.toLowerCase().includes(q);
    });
  }, [attQuery.data, search]);

  // ============ Review mutation ============
  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (!review.req) throw new Error("No request selected");
      const isReject = review.action === "reject";
      if (isReject && review.comment.trim().length < 5) {
        throw new Error("A reason of at least 5 characters is required to reject");
      }
      const table = review.req.kind === "shift" ? "shift_change_requests" : "attendance_edit_requests";
      // Concurrency safeguard: only update if still pending. If another supervisor
      // already actioned it, the row count will be 0 and we surface a clear error.
      const { data, error } = await supabase
        .from(table)
        .update({
          status: isReject ? "rejected" : "approved",
          review_comment: review.comment.trim() || null,
        })
        .eq("id", review.req.id)
        .eq("status", "pending")
        .select("id, status, reviewed_by, reviewed_at");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("This request was already reviewed by another supervisor. Refreshing…");
      }
    },
    onSuccess: () => {
      toast.success(review.action === "approve" ? "Request approved" : "Request rejected");
      setReview({ open: false, action: "approve", req: null, comment: "" });
      queryClient.invalidateQueries({ queryKey: ["staff-approvals"] });
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Review failed");
      queryClient.invalidateQueries({ queryKey: ["staff-approvals"] });
    },
  });

  // Open review dialog after re-reading current status to avoid double-review races.
  const openReview = async (action: "approve" | "reject", req: AnyRequest) => {
    const table = req.kind === "shift" ? "shift_change_requests" : "attendance_edit_requests";
    const { data, error } = await supabase
      .from(table)
      .select("status")
      .eq("id", req.id)
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data || data.status !== "pending") {
      toast.error("This request is no longer pending — another reviewer just actioned it.");
      queryClient.invalidateQueries({ queryKey: ["staff-approvals"] });
      return;
    }
    setReview({ open: true, action, req, comment: "" });
  };

  if (authLoading) {
    return (
      <div className="container mx-auto p-6 space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!isAdminOrSupervisor) {
    return <Navigate to="/" replace />;
  }

  const pendingShift = (shiftQuery.data ?? []).filter((r) => r.status === "pending").length;
  const pendingAtt = (attQuery.data ?? []).filter((r) => r.status === "pending").length;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Staff Request Approvals
          </h1>
          <p className="text-sm text-muted-foreground">
            Review and action shift change and attendance edit requests from your staff.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            shiftQuery.refetch();
            attQuery.refetch();
          }}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            Filters
          </CardTitle>
          <CardDescription>Filter by status, affected date range, or staff name / reason.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | "all")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From (affected date)</Label>
            <DateInput  value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To (affected date)</Label>
            <DateInput  value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Search</Label>
            <Input
              placeholder="Name, staff ID or reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="shift" className="gap-2">
            <CalendarClock className="h-4 w-4" />
            Shift change
            {pendingShift > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{pendingShift}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-2">
            <ClipboardEdit className="h-4 w-4" />
            Attendance edit
            {pendingAtt > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{pendingAtt}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Shift change requests */}
        <TabsContent value="shift" className="mt-4">
          {shiftQuery.isLoading ? (
            <SkeletonList />
          ) : shiftRows.length === 0 ? (
            <EmptyState label="No shift change requests match these filters." />
          ) : (
            <div className="space-y-2">
              {shiftRows.map((r) => (
                <RequestCard
                  key={r.id}
                  kind="shift_change"
                  requestId={r.id}
                  status={r.status}
                  who={staffName(r.profiles)}
                  staffId={r.profiles?.staff_id ?? null}
                  affectedDate={r.affected_date}
                  reason={r.reason}
                  reviewComment={r.review_comment}
                  createdAt={r.created_at}
                  onApprove={() => openReview("approve", { kind: "shift", ...r })}
                  onReject={() => openReview("reject", { kind: "shift", ...r })}
                  details={
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>Type: <span className="font-medium capitalize text-foreground">{r.request_type}</span></div>
                      <div>
                        Current: {r.current_shift?.name ?? "—"} → Target: {r.target_shift?.name ??
                          (r.custom_start_time && r.custom_end_time
                            ? `${r.custom_start_time.slice(0,5)}–${r.custom_end_time.slice(0,5)}`
                            : "—")}
                      </div>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Attendance edit requests */}
        <TabsContent value="attendance" className="mt-4">
          {attQuery.isLoading ? (
            <SkeletonList />
          ) : attRows.length === 0 ? (
            <EmptyState label="No attendance edit requests match these filters." />
          ) : (
            <div className="space-y-2">
              {attRows.map((r) => (
                <RequestCard
                  key={r.id}
                  kind="attendance_edit"
                  requestId={r.id}
                  status={r.status}
                  who={staffName(r.profiles)}
                  staffId={r.profiles?.staff_id ?? null}
                  affectedDate={r.affected_date}
                  reason={r.reason}
                  reviewComment={r.review_comment}
                  createdAt={r.created_at}
                  onApprove={() => openReview("approve", { kind: "attendance", ...r })}
                  onReject={() => openReview("reject", { kind: "attendance", ...r })}
                  details={
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>Field: <span className="font-medium capitalize text-foreground">{r.field.replace("_","-")}</span></div>
                      <div className="font-mono">
                        {r.current_check_in && <>In {format(parseISO(r.current_check_in), "HH:mm")} </>}
                        {r.proposed_check_in && <>→ <span className="text-foreground">{format(parseISO(r.proposed_check_in), "HH:mm")}</span> </>}
                        {(r.current_check_out || r.proposed_check_out) && " · "}
                        {r.current_check_out && <>Out {format(parseISO(r.current_check_out), "HH:mm")} </>}
                        {r.proposed_check_out && <>→ <span className="text-foreground">{format(parseISO(r.proposed_check_out), "HH:mm")}</span></>}
                      </div>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Review dialog */}
      <Dialog open={review.open} onOpenChange={(open) => setReview((s) => ({ ...s, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {review.action === "approve" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              {review.action === "approve" ? "Approve request" : "Reject request"}
            </DialogTitle>
            <DialogDescription>
              {review.action === "approve"
                ? "Add an optional comment that will be sent to the requester."
                : "A reason is required and will be sent to the requester."}
            </DialogDescription>
          </DialogHeader>
          {review.req && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <div className="font-medium text-sm">{staffName(review.req.profiles)}</div>
              <div className="text-muted-foreground">
                {review.req.kind === "shift" ? "Shift change" : "Attendance edit"} · {format(parseISO(review.req.affected_date), "EEE, dd/MM/yyyy")}
              </div>
              <div className="italic">"{review.req.reason}"</div>
            </div>
          )}
          <div>
            <Label className="text-xs">
              {review.action === "reject" ? "Reason for rejection (required)" : "Comment (optional)"}
            </Label>
            <Textarea
              rows={4}
              value={review.comment}
              onChange={(e) => setReview((s) => ({ ...s, comment: e.target.value.slice(0, 500) }))}
              placeholder={
                review.action === "reject"
                  ? "Explain why this request is being rejected..."
                  : "Optional note for the requester..."
              }
            />
            <div className="text-[10px] text-muted-foreground mt-1">{review.comment.length}/500</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview((s) => ({ ...s, open: false }))}>
              Cancel
            </Button>
            <Button
              variant={review.action === "approve" ? "default" : "destructive"}
              onClick={() => reviewMutation.mutate()}
              disabled={reviewMutation.isPending}
              className="gap-2"
            >
              {review.action === "approve" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {reviewMutation.isPending
                ? "Submitting..."
                : review.action === "approve"
                  ? "Confirm approval"
                  : "Confirm rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-md" />
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
        <CalendarRange className="h-8 w-8 opacity-50" />
        {label}
      </CardContent>
    </Card>
  );
}

type HistoryEntry = {
  id: string;
  from_status: string | null;
  to_status: string;
  actor_name: string | null;
  comment: string | null;
  created_at: string;
};

function RequestCard({
  kind,
  requestId,
  status,
  who,
  staffId,
  affectedDate,
  reason,
  reviewComment,
  createdAt,
  details,
  onApprove,
  onReject,
}: {
  kind: "shift_change" | "attendance_edit";
  requestId: string;
  status: Status;
  who: string;
  staffId: string | null;
  affectedDate: string;
  reason: string;
  reviewComment: string | null;
  createdAt: string;
  details: React.ReactNode;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const isPending = status === "pending";

  const historyQuery = useQuery({
    queryKey: ["request-history", kind, requestId],
    enabled: showHistory,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_request_history")
        .select("id, from_status, to_status, actor_name, comment, created_at")
        .eq("request_kind", kind)
        .eq("request_id", requestId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HistoryEntry[];
    },
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="font-semibold text-sm">{who}{staffId ? <span className="text-muted-foreground font-normal"> · {staffId}</span> : null}</div>
            <div className="text-xs text-muted-foreground">
              For {format(parseISO(affectedDate), "EEE, dd/MM/yyyy")} · submitted {format(parseISO(createdAt), "dd MMM, HH:mm")}
            </div>
          </div>
          <Badge variant="outline" className={cn("capitalize gap-1", STATUS_TONE[status])}>
            {status === "pending" && <Clock3 className="h-3 w-3" />}
            {status === "approved" && <CheckCircle2 className="h-3 w-3" />}
            {status === "rejected" && <XCircle className="h-3 w-3" />}
            {status === "cancelled" && <Ban className="h-3 w-3" />}
            {status}
          </Badge>
        </div>
        {details}
        <div className="text-sm italic text-muted-foreground">"{reason}"</div>
        {reviewComment && (
          <div className="text-xs rounded bg-muted/40 border p-2">
            <span className="font-medium">Reviewer note: </span>{reviewComment}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowHistory((v) => !v)}
            className="h-7 px-2 gap-1.5 text-xs"
          >
            <History className="h-3.5 w-3.5" />
            Approval history
            {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>

          {isPending ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onReject} className="gap-1.5 text-red-600 hover:text-red-700">
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
              <Button size="sm" onClick={onApprove} className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </Button>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Ban className="h-3.5 w-3.5" />
              Already {status} — actions locked
            </div>
          )}
        </div>

        {showHistory && (
          <div className="mt-2 rounded-md border bg-muted/20 p-3">
            {historyQuery.isLoading ? (
              <div className="text-xs text-muted-foreground">Loading history…</div>
            ) : (historyQuery.data ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground">No history entries yet.</div>
            ) : (
              <ol className="relative ml-3 border-l border-border space-y-3">
                {(historyQuery.data ?? []).map((h) => (
                  <li key={h.id} className="pl-4 relative">
                    <span
                      className={cn(
                        "absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-background",
                        h.to_status === "approved" && "bg-emerald-500",
                        h.to_status === "rejected" && "bg-red-500",
                        h.to_status === "pending" && "bg-amber-500",
                        h.to_status === "cancelled" && "bg-muted-foreground",
                      )}
                    />
                    <div className="text-xs">
                      <span className="font-medium capitalize">
                        {h.from_status ? `${h.from_status} → ${h.to_status}` : `Submitted (${h.to_status})`}
                      </span>
                      <span className="text-muted-foreground"> · {format(parseISO(h.created_at), "dd/MM/yyyy, HH:mm")}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      by {h.actor_name || "System"}
                    </div>
                    {h.comment && (
                      <div className="text-xs mt-1 italic">"{h.comment}"</div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
