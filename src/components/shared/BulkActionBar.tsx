import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, X, Loader2 } from "lucide-react";

interface Props {
  count: number;
  itemLabel?: string;
  onClear: () => void;
  onConfirmDelete: () => void | Promise<void>;
  deleting?: boolean;
  destructiveLabel?: string;
  description?: string;
}

/**
 * Floating action bar shown when one or more rows are selected.
 * Used by bulk-delete features across Staff, Documents, and other lists.
 */
export function BulkActionBar({
  count,
  itemLabel = "item",
  onClear,
  onConfirmDelete,
  deleting = false,
  destructiveLabel = "Delete selected",
  description,
}: Props) {
  if (count === 0) return null;
  const plural = count === 1 ? itemLabel : `${itemLabel}s`;

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-md border bg-card/95 backdrop-blur px-3 py-2 shadow-sm">
      <span className="text-sm font-medium">
        {count} {plural} selected
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear} className="gap-1">
          <X className="h-4 w-4" /> Clear
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={deleting} className="gap-1">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {destructiveLabel}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {destructiveLabel} ({count} {plural})?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {description ??
                  `This will remove ${count} ${plural}. Records moved to the Recycle Bin can be restored by an administrator within 30 days.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void onConfirmDelete();
                }}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Deleting…" : "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
