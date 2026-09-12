/**
 * One row of the Staff / Employees table.
 *
 * Kept in its own memoised component on purpose: the staff page also holds the
 * large bio-data form, and without this every keystroke in that form used to
 * re-render every row (each with its own menus and confirm dialogs), which made
 * opening and typing in the form feel frozen.
 */
import { memo } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Lock, Pencil, Trash2, UserMinus, UserCheck } from "lucide-react";
import { AdminAccountActions } from "@/components/staff/AdminAccountActions";

import { staffStatusColor, staffStatusLabel } from "@/lib/staff-status";

const statusColor = staffStatusColor;

const getInitials = (first: string, last: string) =>
  `${(first ?? "").charAt(0)}${(last ?? "").charAt(0)}`.toUpperCase();

export type StaffTableRowProps = {
  staff: any;
  isAdmin: boolean;
  canManage: boolean;
  /** Directory-matrix result for this record; falls back to the role tier. */
  canEdit?: boolean;
  canDelete?: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onOpenProfile: (id: string) => void;
  onEdit: (staff: any) => void;
  onDelete: (id: string) => void;
  /** Deactivate (or reactivate) without deleting the record. */
  onDeactivate?: (staff: any) => void;
};

function StaffTableRowBase({
  staff: s, isAdmin, canManage, canEdit, canDelete, selected,
  onToggleSelect, onOpenProfile, onEdit, onDelete, onDeactivate,
}: StaffTableRowProps) {
  const showEdit = canEdit ?? canManage;
  const showDelete = canDelete ?? isAdmin;
  const showDeactivate = !!onDeactivate && showEdit;
  const showActions = showEdit || showDelete || showDeactivate || isAdmin;
  const isActive = s.status === "active";
  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      {isAdmin && (
        <TableCell>
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(s.id)}
            aria-label={`Select ${s.first_name} ${s.last_name}`}
          />
        </TableCell>
      )}
      <TableCell>
        <Avatar className="h-8 w-8">
          <AvatarImage src={s._photoUrl ?? undefined} alt={`${s.first_name} ${s.last_name}`} />
          <AvatarFallback className="text-xs bg-primary/10 text-primary">
            {getInitials(s.first_name, s.last_name)}
          </AvatarFallback>
        </Avatar>
      </TableCell>
      <TableCell className="font-mono text-xs">{s.staff_id}</TableCell>
      <TableCell>
        <button
          onClick={() => onOpenProfile(s.id)}
          className="font-medium text-primary hover:underline text-left"
        >
          {s.last_name}, {s.first_name}
        </button>
      </TableCell>
      <TableCell className="hidden md:table-cell">{s.ranks?.abbreviation ?? "—"}</TableCell>
      <TableCell className="hidden md:table-cell">{s.departments?.name ?? "—"}</TableCell>
      <TableCell className="hidden lg:table-cell">{s.shift_group ?? "—"}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className={statusColor(s.status)}>{staffStatusLabel(s.status)}</Badge>
          {s.is_minor && (
            <Badge
              variant="secondary"
              className={s.minor_status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}
              title={s.minor_status === "approved" ? "Minor — approved" : "Minor — awaiting approval"}
            >
              Minor
            </Badge>
          )}
          {s.account_locked && (
            <span title="Account locked" className="inline-flex items-center text-destructive">
              <Lock className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </TableCell>
      {showActions && (
        <TableCell>
          <div className="flex gap-1">
            {showEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(s)}
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            )}
            {showDeactivate && (
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${isActive ? "text-amber-600" : "text-emerald-600"}`}
                onClick={() => onDeactivate?.(s)}
                title={isActive ? "Deactivate" : "Reactivate"}
              >
                {isActive ? <UserMinus className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
              </Button>
            )}
            {isAdmin && (
              <AdminAccountActions
                profileId={s.id}
                staffId={s.staff_id}
                fullName={`${s.first_name} ${s.last_name}`}
                accountLocked={s.account_locked}
                hasUserId={!!s.user_id}
              />
            )}
            {showDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {s.last_name}, {s.first_name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove this staff member and all associated records.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(s.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

export const StaffTableRow = memo(StaffTableRowBase);
