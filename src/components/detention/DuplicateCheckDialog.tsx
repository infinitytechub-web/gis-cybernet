import { format } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { DuplicateMatch } from "@/lib/detention-duplicates";

/**
 * Shown before a new intake is created when the duplicate check finds existing
 * records. A blocking match (same ID/passport already in custody) cannot be
 * overridden; a warning can be acknowledged and the intake continued.
 */
export function DuplicateCheckDialog({
  open, matches, blocked, statusLabel, onCancel, onProceed, proceeding,
}: {
  open: boolean;
  matches: DuplicateMatch[];
  blocked: boolean;
  statusLabel: (s?: string | null) => string;
  onCancel: () => void;
  onProceed: () => void;
  proceeding?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {blocked
              ? <><ShieldAlert className="h-5 w-5 text-destructive" />Duplicate intake blocked</>
              : <><AlertTriangle className="h-5 w-5 text-warning" />Possible duplicate detainee</>}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {blocked
              ? "A detainee with the same ID/passport number is already in custody. Update the existing record instead of creating a new one."
              : `${matches.length} existing record${matches.length === 1 ? "" : "s"} match this intake on key identifiers. Review them before continuing.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="max-h-72 overflow-y-auto space-y-2 text-sm">
          {matches.map((m) => (
            <li key={m.id} className="rounded-md border p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {[m.first_name, m.last_name].filter(Boolean).join(" ") || "Unnamed record"}
                  {m.alias ? <span className="text-muted-foreground font-normal"> (alias {m.alias})</span> : null}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={m.severity === "block" ? "destructive" : "secondary"}>
                    {m.severity === "block" ? "Blocking" : "Warning"}
                  </Badge>
                  <Badge variant="outline">{statusLabel(m.status)}</Badge>
                </div>
              </div>
              <p className="text-muted-foreground">{m.match_reason}</p>
              <p className="text-muted-foreground">
                {m.id_type ? `${m.id_type}: ${m.id_number || "—"} · ` : ""}
                {m.date_of_birth ? `DOB ${m.date_of_birth} · ` : ""}
                {m.intake_at ? `Booked in ${format(new Date(m.intake_at), "dd MMM yyyy")}` : "Intake date unknown"}
                {m.cell_number ? ` · Cell ${m.cell_number}` : ""}
              </p>
            </li>
          ))}
        </ul>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{blocked ? "Close" : "Cancel"}</AlertDialogCancel>
          {!blocked && (
            <AlertDialogAction onClick={onProceed} disabled={proceeding}>
              {proceeding ? "Booking…" : "Not a duplicate — book in"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
