import { calculateAge } from "@/lib/date-format";
import { cn } from "@/lib/utils";

/**
 * Live age read-out shown beside a Date of Birth input. Recomputes on every
 * render, so the value appears the moment a DoB is entered.
 */
export function AgeDisplay({ dob, className }: { dob: string | Date | null | undefined; className?: string }) {
  const age = calculateAge(dob);

  if (!age.ok) {
    if (age.reason === "empty") {
      return <span className={cn("text-xs text-muted-foreground", className)}>Age auto-calculates from DoB</span>;
    }
    return (
      <span className={cn("text-xs text-destructive", className)}>
        {age.reason === "future" ? "Date of birth cannot be in the future" : "Enter a valid date of birth"}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground",
        className,
      )}
      aria-live="polite"
    >
      Age: {age.label}
    </span>
  );
}

/** DoB label row: "Date of Birth (DD/MM/YYYY)" plus the calculated age. */
export function DobLabelWithAge({ dob, label = "Date of Birth" }: { dob: string | Date | null | undefined; label?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-medium leading-none">{label}</span>
      <AgeDisplay dob={dob} />
    </div>
  );
}
