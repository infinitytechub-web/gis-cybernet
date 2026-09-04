/**
 * Clock in / clock out buttons for one row of the live duty schedule.
 *
 * All authorisation and the late / early logic live server-side in
 * `roster_clock_action`; this is only the trigger. Clocking another officer
 * opens a short dialog because the RPC requires a written reason in that case.
 */
import { useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useRosterClock, type ClockAction } from "@/hooks/useRosterClock";

interface Props {
  profileId: string;
  name: string;
  checkIn: string | null;
  checkOut: string | null;
  /** True when the row belongs to the signed-in officer. */
  isSelf: boolean;
  /** True when the signed-in officer may clock other people. */
  canClockOthers: boolean;
  /** Clocking is only offered for today. */
  enabled: boolean;
}

export function RosterClockCell({
  profileId, name, checkIn, checkOut, isSelf, canClockOthers, enabled,
}: Props) {
  const clock = useRosterClock();
  const [pending, setPending] = useState<ClockAction | null>(null);
  const [reason, setReason] = useState("");

  const allowed = enabled && (isSelf || canClockOthers);
  if (!allowed) return <span className="text-xs text-muted-foreground">—</span>;

  const run = async (action: ClockAction, withReason?: string) => {
    try {
      await clock.mutateAsync({ profileId, action, reason: withReason, name });
      setPending(null);
      setReason("");
    } catch {
      /* toast raised by the hook */
    }
  };

  const start = (action: ClockAction) => {
    if (isSelf) void run(action);
    else setPending(action);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs"
        disabled={clock.isPending || !!checkIn}
        onClick={() => start("check_in")}
      >
        <LogIn className="mr-1 h-3.5 w-3.5" aria-hidden /> In
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs"
        disabled={clock.isPending || !checkIn || !!checkOut}
        onClick={() => start("check_out")}
      >
        <LogOut className="mr-1 h-3.5 w-3.5" aria-hidden /> Out
      </Button>

      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) { setPending(null); setReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pending === "check_out" ? "Clock out" : "Clock in"} {name}</DialogTitle>
            <DialogDescription>
              You are recording this for another officer, so a reason is required for the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`clock-reason-${profileId}`}>Reason / remarks</Label>
            <Textarea
              id={`clock-reason-${profileId}`}
              rows={3}
              maxLength={500}
              value={reason}
              placeholder="e.g. Reported at post, radio check completed"
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPending(null); setReason(""); }}>Cancel</Button>
            <Button
              disabled={clock.isPending}
              onClick={() => {
                if (!reason.trim()) { toast.error("Enter a reason first"); return; }
                if (pending) void run(pending, reason);
              }}
            >
              {clock.isPending ? "Recording…" : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
