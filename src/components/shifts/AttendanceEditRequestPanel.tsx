import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ClipboardEdit, CheckCircle2, XCircle, Clock3, Hourglass } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Attendance = {
  id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
};

type EditRequest = {
  id: string;
  attendance_id: string | null;
  affected_date: string;
  field: "check_in" | "check_out" | "both";
  current_check_in: string | null;
  current_check_out: string | null;
  proposed_check_in: string | null;
  proposed_check_out: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewed_at: string | null;
  review_comment: string | null;
  created_at: string;
};

interface Props {
  profileId: string;
  userId: string;
  attendances: Attendance[];
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AttendanceEditRequestPanel({ profileId, userId, attendances }: Props) {
  const queryClient = useQueryClient();
  const [selectedAttId, setSelectedAttId] = useState<string>("");
  const [field, setField] = useState<"check_in" | "check_out" | "both">("check_in");
  const [proposedIn, setProposedIn] = useState("");
  const [proposedOut, setProposedOut] = useState("");
  const [reason, setReason] = useState("");

  const recentAtts = useMemo(
    () =>
      [...attendances]
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 30),
    [attendances],
  );

  const selectedAtt = useMemo(
    () => recentAtts.find((a) => a.id === selectedAttId) ?? null,
    [recentAtts, selectedAttId],
  );

  useEffect(() => {
    if (selectedAtt) {
      setProposedIn(toLocalInputValue(selectedAtt.check_in));
      setProposedOut(toLocalInputValue(selectedAtt.check_out));
    }
  }, [selectedAttId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["attendance-edit-requests", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_edit_requests")
        .select("id, attendance_id, affected_date, field, current_check_in, current_check_out, proposed_check_in, proposed_check_out, reason, status, reviewed_at, review_comment, created_at")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as EditRequest[];
    },
  });

  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel(`attendance-edit-requests-${profileId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_edit_requests", filter: `profile_id=eq.${profileId}` },
        () => queryClient.invalidateQueries({ queryKey: ["attendance-edit-requests", profileId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId, queryClient]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!selectedAtt) throw new Error("Select a day to edit");
      if (!reason.trim() || reason.trim().length < 5) throw new Error("Please provide a brief reason (5+ characters)");
      if ((field === "check_in" || field === "both") && !proposedIn) throw new Error("Provide proposed check-in time");
      if ((field === "check_out" || field === "both") && !proposedOut) throw new Error("Provide proposed check-out time");

      const proposedInIso = proposedIn ? new Date(proposedIn).toISOString() : null;
      const proposedOutIso = proposedOut ? new Date(proposedOut).toISOString() : null;

      const { data, error } = await supabase
        .from("attendance_edit_requests")
        .insert({
          attendance_id: selectedAtt.id,
          profile_id: profileId,
          requested_by: userId,
          affected_date: selectedAtt.date,
          field,
          current_check_in: selectedAtt.check_in,
          current_check_out: selectedAtt.check_out,
          proposed_check_in: field === "check_out" ? null : proposedInIso,
          proposed_check_out: field === "check_in" ? null : proposedOutIso,
          reason: reason.trim().slice(0, 1000),
        })
        .select("id");
      if (error) throw error;
      // If the BEFORE INSERT dedupe trigger merged into an existing pending
      // request, the insert returns no rows.
      return { merged: !data || data.length === 0 };
    },
    onSuccess: ({ merged }) => {
      toast.success(
        merged
          ? "Updated your existing pending request for this day"
          : "Edit request submitted for review",
      );
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["attendance-edit-requests", profileId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to submit request"),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("attendance_edit_requests")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request cancelled");
      queryClient.invalidateQueries({ queryKey: ["attendance-edit-requests", profileId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Cancel failed"),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardEdit className="h-4 w-4 text-primary" />
          Request attendance time edit
        </CardTitle>
        <CardDescription>
          Made a mistake on a check-in or check-out? Submit a correction for supervisor approval.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Day to edit</Label>
            <Select value={selectedAttId} onValueChange={setSelectedAttId}>
              <SelectTrigger><SelectValue placeholder="Select a day from recent attendance" /></SelectTrigger>
              <SelectContent>
                {recentAtts.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No attendance records found.</div>
                ) : (
                  recentAtts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {format(parseISO(a.date), "EEE, dd MMM yyyy")}
                      {a.check_in ? ` · in ${format(parseISO(a.check_in), "HH:mm")}` : ""}
                      {a.check_out ? ` · out ${format(parseISO(a.check_out), "HH:mm")}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Field to correct</Label>
            <Select value={field} onValueChange={(v) => setField(v as typeof field)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="check_in">Check-in time</SelectItem>
                <SelectItem value="check_out">Check-out time</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(field === "check_in" || field === "both") && (
            <div>
              <Label className="text-xs">Proposed check-in</Label>
              <Input
                type="datetime-local"
                value={proposedIn}
                onChange={(e) => setProposedIn(e.target.value)}
              />
            </div>
          )}
          {(field === "check_out" || field === "both") && (
            <div>
              <Label className="text-xs">Proposed check-out</Label>
              <Input
                type="datetime-local"
                value={proposedOut}
                onChange={(e) => setProposedOut(e.target.value)}
              />
            </div>
          )}
        </div>
        <div>
          <Label className="text-xs">Reason</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 1000))}
            placeholder="Explain why the recorded time was incorrect (e.g. forgot to check out, system delay, etc.)."
            rows={3}
          />
          <div className="text-[10px] text-muted-foreground mt-1">{reason.length}/1000</div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || !selectedAttId} className="gap-2">
            <ClipboardEdit className="h-4 w-4" />
            {submit.isPending ? "Submitting..." : "Submit for approval"}
          </Button>
        </div>

        <div className="border-t pt-4">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-muted-foreground" />
            Recent edit requests
          </div>
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="text-xs text-muted-foreground">No edit requests yet.</div>
          ) : (
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="rounded-md border p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-medium">
                      {format(parseISO(r.affected_date), "EEE, dd MMM yyyy")} · {r.field.replace("_", "-")}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-muted-foreground">
                    {r.proposed_check_in && (
                      <span>Proposed in: <span className="font-mono">{format(parseISO(r.proposed_check_in), "HH:mm")}</span> </span>
                    )}
                    {r.proposed_check_out && (
                      <span>· Proposed out: <span className="font-mono">{format(parseISO(r.proposed_check_out), "HH:mm")}</span></span>
                    )}
                  </div>
                  <div className="text-muted-foreground italic line-clamp-2">"{r.reason}"</div>
                  {r.review_comment && (
                    <div className="text-muted-foreground">Reviewer: {r.review_comment}</div>
                  )}
                  {r.status === "pending" && (
                    <div className="pt-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => cancel.mutate(r.id)}>
                        Cancel request
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: EditRequest["status"] }) {
  const map = {
    pending: { icon: Clock3, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
    approved: { icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
    rejected: { icon: XCircle, cls: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30" },
    cancelled: { icon: XCircle, cls: "bg-muted text-muted-foreground border-border" },
  } as const;
  const { icon: Icon, cls } = map[status];
  return (
    <Badge variant="outline" className={cn("gap-1 capitalize", cls)}>
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  );
}
