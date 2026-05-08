import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Clock } from "lucide-react";
import { idleStore, type IdleState } from "@/lib/idle-store";

/**
 * Inactivity warning modal. Subscribes to the singleton idle store and
 * shows a live countdown plus a "Stay signed in" button that resets the
 * inactivity timer. Closing the modal (Escape, overlay click, or button)
 * is treated as confirming presence.
 *
 * The modal is intentionally non-dismissible by ambient activity — the
 * user must explicitly click the action button to remain signed in,
 * which matches the requested confirm-to-stay behaviour.
 */
export function IdleWarningDialog() {
  const [state, setState] = useState<IdleState>(idleStore.getState());

  useEffect(() => idleStore.subscribe(setState), []);

  const { warning, secondsRemaining, warnSeconds } = state;
  const pct = warnSeconds > 0
    ? Math.max(0, Math.min(100, (secondsRemaining / warnSeconds) * 100))
    : 0;

  return (
    <AlertDialog open={warning}>
      {/* No onOpenChange handler is wired, so Esc / overlay clicks cannot
          dismiss the modal — only the action button below resets the timer. */}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-destructive" />
            Are you still there?
          </AlertDialogTitle>
          <AlertDialogDescription>
            For your security, this session will end automatically due to inactivity.
            Click <strong>Stay signed in</strong> to continue working.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Signing out in</span>
            <span className="text-2xl font-semibold tabular-nums text-destructive">
              {secondsRemaining}s
            </span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        <AlertDialogFooter>
          <AlertDialogAction
            onClick={() => idleStore.extend()}
            className="bg-primary hover:bg-primary/90"
          >
            Stay signed in
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
