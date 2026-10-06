import { CheckCircle2, ShieldCheck, XCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type DutyState = "on_duty" | "excused" | "absent" | "pending";

/** Map attendance status + clock-in to the system-wide duty colour code. */
export function dutyStateOf(status: string | null | undefined, checkIn?: string | null, scheduled = true): DutyState {
  if (status === "excused") return "excused";
  if (status === "present" || status === "late" || checkIn) return "on_duty";
  if (status === "absent") return "absent";
  return scheduled ? "absent" : "pending";
}

const META: Record<DutyState, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  on_duty: { label: "On duty", cls: "border-emerald-600/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300", Icon: CheckCircle2 },
  excused: { label: "Excused", cls: "border-amber-600/40 bg-amber-500/15 text-amber-800 dark:text-amber-300", Icon: ShieldCheck },
  absent: { label: "Absent", cls: "border-red-600/40 bg-red-500/15 text-red-800 dark:text-red-300", Icon: XCircle },
  pending: { label: "Not marked", cls: "border-border bg-muted text-muted-foreground", Icon: Clock },
};

export function DutyStatusBadge({ state, suffix }: { state: DutyState; suffix?: string }) {
  const { label, cls, Icon } = META[state];
  return (
    <Badge variant="outline" className={`gap-1 ${cls}`} aria-label={`Duty status: ${label}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}{suffix}
    </Badge>
  );
}
