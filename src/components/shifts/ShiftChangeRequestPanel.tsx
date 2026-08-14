import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarIcon, Plus, AlertCircle, CheckCircle2, XCircle, Clock, Ban, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

type Shift = { id: string; name: string; start_time: string | null; end_time: string | null };

type RequestRow = {
  id: string;
  request_type: "change" | "override" | "swap";
  affected_date: string;
  current_shift_id: string | null;
  requested_shift_id: string | null;
  requested_start_time: string | null;
  requested_end_time: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewed_at: string | null;
  review_comment: string | null;
  created_at: string;
};

const STATUS_TONE: Record<RequestRow["status"], string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  cancelled: "bg-muted text-muted-foreground border-muted",
};

const STATUS_ICON: Record<RequestRow["status"], React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  cancelled: Ban,
};

interface Props {
  profileId: string;
  userId: string;
  shifts: Shift[];
  defaultDate?: Date;
  defaultCurrentShiftId?: string | null;
}

export function ShiftChangeRequestPanel({ profileId, userId, shifts, defaultDate, defaultCurrentShiftId }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["my-shift-tracker", "change-requests", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_change_requests" as any)
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as RequestRow[];
    },
  });

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`shift-change-requests-${profileId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_change_requests", filter: `profile_id=eq.${profileId}` },
        () => queryClient.invalidateQueries({ queryKey: ["my-shift-tracker", "change-requests", profileId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId, queryClient]);

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("shift_change_requests" as any)
        .update({ status: "cancelled" } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request cancelled");
      queryClient.invalidateQueries({ queryKey: ["my-shift-tracker", "change-requests", profileId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Cancel failed"),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Shift change / override requests
            </CardTitle>
            <CardDescription>
              Submit a request to your supervisor and track its approval status here.
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> New request
              </Button>
            </DialogTrigger>
            <NewRequestDialog
              profileId={profileId}
              userId={userId}
              shifts={shifts}
              defaultDate={defaultDate}
              defaultCurrentShiftId={defaultCurrentShiftId ?? null}
              onClose={() => setOpen(false)}
              onSuccess={() => {
                setOpen(false);
                queryClient.invalidateQueries({ queryKey: ["my-shift-tracker", "change-requests", profileId] });
              }}
            />
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            No requests yet. Submit one when you need to change or override an assigned shift.
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => {
              const Icon = STATUS_ICON[r.status];
              const reqShift = shifts.find((s) => s.id === r.requested_shift_id);
              const curShift = shifts.find((s) => s.id === r.current_shift_id);
              return (
                <div key={r.id} className="rounded-md border p-3 bg-card">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Badge variant="outline" className="capitalize">{r.request_type}</Badge>
                        <span>{format(parseISO(r.affected_date), "EEE, dd/MM/yyyy")}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {curShift?.name ?? "—"} →{" "}
                        {reqShift?.name ??
                          (r.requested_start_time && r.requested_end_time
                            ? `${r.requested_start_time.slice(0, 5)} – ${r.requested_end_time.slice(0, 5)}`
                            : "Custom")}
                      </div>
                      <div className="text-xs mt-1.5 text-foreground/80">{r.reason}</div>
                      {r.review_comment && (
                        <div className="text-xs mt-1.5 italic text-muted-foreground">
                          Reviewer: {r.review_comment}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("gap-1 capitalize border", STATUS_TONE[r.status])}>
                        <Icon className="h-3 w-3" /> {r.status}
                      </Badge>
                      {r.status === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cancelMutation.mutate(r.id)}
                          disabled={cancelMutation.isPending}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NewRequestDialog({
  profileId,
  userId,
  shifts,
  defaultDate,
  defaultCurrentShiftId,
  onClose,
  onSuccess,
}: {
  profileId: string;
  userId: string;
  shifts: Shift[];
  defaultDate?: Date;
  defaultCurrentShiftId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<"change" | "override" | "swap">("change");
  const [date, setDate] = useState<Date | undefined>(defaultDate ?? new Date());
  const [requestedShiftId, setRequestedShiftId] = useState<string>("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!date) return toast.error("Pick a date");
    if (!reason.trim() || reason.trim().length < 10) {
      return toast.error("Provide a reason (at least 10 characters)");
    }
    if (type !== "override" && !requestedShiftId) {
      return toast.error("Pick the requested shift");
    }
    if (type === "override" && (!startTime || !endTime)) {
      return toast.error("Provide override start and end times");
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("shift_change_requests" as any).insert({
        profile_id: profileId,
        requested_by: userId,
        request_type: type,
        affected_date: format(date, "yyyy-MM-dd"),
        current_shift_id: defaultCurrentShiftId,
        requested_shift_id: type === "override" ? null : requestedShiftId,
        requested_start_time: type === "override" ? startTime : null,
        requested_end_time: type === "override" ? endTime : null,
        reason: reason.trim(),
      } as any);
      if (error) throw error;
      toast.success("Request submitted to your supervisor");
      onSuccess();
    } catch (e: any) {
      toast.error(e?.message ?? "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>New shift change / override request</DialogTitle>
        <DialogDescription>
          Your supervisor will be notified and you'll see the outcome on your tracker.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="change">Change to another shift</SelectItem>
                <SelectItem value="override">Override (custom times)</SelectItem>
                <SelectItem value="swap">Swap with another staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Affected date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start", !date && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {date ? format(date, "dd/MM/yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={setDate} className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {type !== "override" ? (
          <div>
            <Label className="text-xs">Requested shift</Label>
            <Select value={requestedShiftId} onValueChange={setRequestedShiftId}>
              <SelectTrigger><SelectValue placeholder="Select a shift" /></SelectTrigger>
              <SelectContent>
                {shifts.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.start_time && s.end_time ? ` (${s.start_time.slice(0,5)}–${s.end_time.slice(0,5)})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Override start</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Override end</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
        )}

        <div>
          <Label className="text-xs">Reason (required)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Briefly explain why this change is needed…"
            rows={3}
          />
          <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Minimum 10 characters
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "Submitting…" : "Submit request"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
