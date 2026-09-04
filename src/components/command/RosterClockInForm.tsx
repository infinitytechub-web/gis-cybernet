/**
 * ROSTER CLOCK-IN FORM — a single form at the head of the staff roster for
 * marking today's attendance.
 *
 * Everything is decided server-side by `roster_clock_action`: it checks the
 * caller may act for the officer, reads the effective shift window and marks
 * the attendance row `present` or `late`. The result immediately refreshes the
 * roster's Attendance today column and the Command Dashboard "Staff attendance
 * today" KPI, so this form is the fastest path from parade to figures.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { StaffCombobox, type StaffOption } from "@/components/ui/staff-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck, LogIn, LogOut, AlertTriangle, Camera } from "lucide-react";
import { useRosterClock, validateClockPhoto, type ClockAction } from "@/hooks/useRosterClock";
import type { RosterMember } from "@/hooks/useStaffRoster";

interface Props {
  /** Roster members the signed-in officer is allowed to clock. */
  clockable: RosterMember[];
  /** True when the signed-in officer may clock other people. */
  canClockOthers: boolean;
  /** The signed-in officer's own roster row, pre-selected when present. */
  selfMember?: RosterMember | null;
  /** Today's roll-up for the scoped roster, echoed back so figures are visible. */
  summary: { strength: number; present: number; late: number; marked: number; rate: number | null };
}

const timeOf = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;

/** Splits a roster display name into the shape the staff combobox expects. */
function toOption(m: RosterMember): StaffOption {
  const parts = m.full_name.trim().split(/\s+/);
  return {
    id: m.id,
    first_name: parts.slice(0, -1).join(" ") || m.full_name,
    last_name: parts.length > 1 ? parts[parts.length - 1] : "",
    staff_id: m.staff_id ?? "—",
  };
}

export function RosterClockInForm({ clockable, canClockOthers, selfMember, summary }: Props) {
  const clock = useRosterClock();
  const [profileId, setProfileId] = useState(selfMember?.id ?? "");
  const [action, setAction] = useState<ClockAction | "">("");
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  const options = useMemo(() => clockable.map(toOption), [clockable]);
  const member = useMemo(() => clockable.find((m) => m.id === profileId) ?? null, [clockable, profileId]);

  /** Clocked in but not out → the natural next action is clock out. */
  const suggested: ClockAction = member?.attendance_check_in && !member?.attendance_check_out
    ? "check_out"
    : "check_in";
  const effectiveAction: ClockAction = (action || suggested) as ClockAction;
  const onBehalf = Boolean(member && member.id !== selfMember?.id);
  const alreadyDone =
    (effectiveAction === "check_in" && !!member?.attendance_check_in) ||
    (effectiveAction === "check_out" && !!member?.attendance_check_out);

  async function submit() {
    if (!member) {
      toast.error("Select the officer to clock");
      return;
    }
    if (onBehalf && !reason.trim()) {
      toast.error("A reason is required when clocking on behalf of another officer");
      return;
    }
    try {
      await clock.mutateAsync({
        profileId: member.id,
        action: effectiveAction,
        reason,
        photo,
        name: member.full_name,
      });
      setReason("");
      setPhoto(null);
      setAction("");
      if (!canClockOthers) setProfileId(selfMember?.id ?? "");
    } catch {
      /* toast raised by the hook */
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          Clock in / out — today's attendance
        </CardTitle>
        <CardDescription>
          {canClockOthers
            ? "Mark an officer present from parade. Late arrivals and early departures are flagged automatically against the shift window."
            : "Mark yourself present for today. Arrivals past your shift start plus grace are flagged late."}{" "}
          Marks post straight to the roster and the Staff attendance KPI.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="clock-form-staff">Officer</Label>
            {canClockOthers ? (
              <StaffCombobox
                staff={options}
                value={profileId}
                onValueChange={(v) => { setProfileId(v); setAction(""); }}
                placeholder="Search staff by name or ID…"
                className="w-full"
              />
            ) : (
              <Input
                id="clock-form-staff"
                readOnly
                value={selfMember ? `${selfMember.full_name} · ${selfMember.staff_id ?? "—"}` : "Your profile is not on this roster"}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="clock-form-action">Action</Label>
            <Select value={effectiveAction} onValueChange={(v) => setAction(v as ClockAction)}>
              <SelectTrigger id="clock-form-action"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="check_in">Clock in</SelectItem>
                <SelectItem value="check_out">Clock out</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={submit} disabled={clock.isPending || !member}>
            {effectiveAction === "check_out"
              ? <LogOut className="mr-1 h-4 w-4" aria-hidden="true" />
              : <LogIn className="mr-1 h-4 w-4" aria-hidden="true" />}
            {clock.isPending
              ? "Recording…"
              : effectiveAction === "check_out" ? "Clock out" : "Clock in"}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="clock-form-reason">
              Reason / remarks{onBehalf ? " (required)" : " (optional)"}
            </Label>
            <Textarea
              id="clock-form-reason"
              rows={2}
              maxLength={500}
              value={reason}
              placeholder="e.g. Reported at post, radio check completed"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clock-form-photo">Photo (optional proof of presence)</Label>
            <Input
              id="clock-form-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={async (e) => {
                const f = e.target.files?.[0] ?? null;
                if (f) {
                  const invalid = await validateClockPhoto(f);
                  if (invalid) {
                    toast.error(invalid);
                    e.target.value = "";
                    setPhoto(null);
                    return;
                  }
                }
                setPhoto(f);
              }}
            />
            {photo && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Camera className="h-3 w-3" aria-hidden="true" />
                {photo.name} attached
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
          <Badge variant="outline" className="border-primary/40 text-primary">
            {summary.rate === null ? "—" : `${summary.rate}%`} on duty today
          </Badge>
          <span className="text-muted-foreground">
            {summary.present} present · {summary.late} late ·{" "}
            {Math.max(summary.strength - summary.marked, 0)} unmarked of {summary.strength} on strength
          </span>
          {member && (
            <span className="text-muted-foreground">
              · {member.full_name}:{" "}
              {member.attendance_check_in
                ? `in ${timeOf(member.attendance_check_in)}${member.attendance_check_out ? `, out ${timeOf(member.attendance_check_out)}` : ""}`
                : "not yet clocked in"}
            </span>
          )}
          {alreadyDone && (
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Already recorded — submitting will update the existing entry.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
