/**
 * Deactivate / reactivate a staff record.
 *
 * The record is never deleted: the status moves to Partially Active, Inactive,
 * Interdicted or Retired with a required reason and effective date, sign-in is
 * switched off for Retired and Interdicted, and the change is written to the
 * immutable deactivation history plus the system audit trail. All of that
 * happens server-side in `staff_set_status`.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/ui/date-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DATE_FORMAT_HINT } from "@/lib/date-format";
import {
  DEACTIVATION_STATUSES, STAFF_STATUS_LABELS, staffStatusLabel,
} from "@/lib/staff-status";

export type DeactivateTarget = {
  id: string;
  name: string;
  staffId?: string | null;
  status: string;
};

export function DeactivateStaffDialog({
  target,
  mode,
  onOpenChange,
}: {
  target: DeactivateTarget | null;
  /** "deactivate" picks a new status; "reactivate" returns the record to Active. */
  mode: "deactivate" | "reactivate";
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [newStatus, setNewStatus] = useState<string>("inactive");
  const [reason, setReason] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const reset = () => {
    setNewStatus("inactive");
    setReason("");
    setEffectiveDate(format(new Date(), "yyyy-MM-dd"));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("No staff record selected");
      if (!reason.trim()) throw new Error("A reason is required");
      const { error } = await supabase.rpc("staff_set_status", {
        _profile_id: target.id,
        _new_status: mode === "reactivate" ? "active" : newStatus,
        _reason: reason.trim(),
        _effective_date: effectiveDate || format(new Date(), "yyyy-MM-dd"),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        mode === "reactivate"
          ? "Staff member reactivated"
          : `Status changed to ${staffStatusLabel(newStatus)}`,
      );
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["staff-roster"] });
      onOpenChange(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "reactivate" ? "Reactivate" : "Deactivate"} {target?.name}
          </DialogTitle>
          <DialogDescription>
            {target?.staffId ? `${target.staffId} — ` : ""}
            currently {staffStatusLabel(target?.status)}. The record is kept in the
            system; only the status changes and the reason is recorded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {mode === "deactivate" && (
            <div>
              <Label htmlFor="deact-status">New status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger id="deact-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEACTIVATION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{STAFF_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(newStatus === "retired" || newStatus === "interdicted") && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Sign-in will be switched off while the officer is {STAFF_STATUS_LABELS[newStatus].toLowerCase()}.
                </p>
              )}
            </div>
          )}
          <div>
            <Label htmlFor="deact-date">Effective date ({DATE_FORMAT_HINT})</Label>
            <DateInput
              id="deact-date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="deact-reason">Reason (required)</Label>
            <Textarea
              id="deact-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Recorded in the audit trail"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={mode === "reactivate" ? "default" : "destructive"}
            disabled={mutation.isPending || !reason.trim()}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {mode === "reactivate" ? "Reactivate" : "Deactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeactivateStaffDialog;
