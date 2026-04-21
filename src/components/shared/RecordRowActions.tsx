import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal, Edit, Trash2, Download, Printer, Mail } from "lucide-react";
import { toast } from "sonner";
import { softDelete, type RecyclableTable } from "@/lib/recycle-bin";
import {
  downloadRecordPdf,
  printRecordPdf,
  type RecordKind,
  RECORD_TITLES,
} from "@/lib/record-pdf";
import { EmailShareDialog } from "./EmailShareDialog";
import { logRowAction } from "@/lib/row-action-audit";

export interface RecordRowActionsProps {
  kind: RecordKind;
  /** DB table name for soft-delete. */
  table: RecyclableTable;
  /** Full record row (used for PDF + email). */
  record: Record<string, any>;
  /** Called when the user clicks Edit. */
  onEdit: () => void;
  /** Cache keys to invalidate on delete. */
  invalidateKeys?: string[][];
  /** Show Delete entry. Defaults true. */
  canDelete?: boolean;
}

export function RecordRowActions({
  kind,
  table,
  record,
  onEdit,
  invalidateKeys = [],
  canDelete = true,
}: RecordRowActionsProps) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await softDelete({
        table,
        id: record.id,
        label: record.applicant_name ?? RECORD_TITLES[kind],
        context: record.passport_number || record.reference_number || undefined,
      });
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success("Moved to Recycle Bin");
      setConfirmOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = () => {
    try {
      downloadRecordPdf(kind, record);
      toast.success("PDF downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Download failed");
    }
  };

  const handlePrint = () => {
    try {
      printRecordPdf(kind, record);
    } catch (e: any) {
      toast.error(e?.message || "Print failed");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Record actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onEdit}>
            <Edit className="mr-2 h-4 w-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEmailOpen(true)}>
            <Mail className="mr-2 h-4 w-4" /> Send via Email
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to Recycle Bin?</AlertDialogTitle>
            <AlertDialogDescription>
              This {RECORD_TITLES[kind].toLowerCase()} for{" "}
              <span className="font-medium">{record.applicant_name ?? "record"}</span> will be
              moved to the Recycle Bin and can be restored by an administrator within 30 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EmailShareDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        kind={kind}
        record={record}
      />
    </>
  );
}
