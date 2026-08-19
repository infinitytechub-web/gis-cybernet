import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/date-format";
import {
  isStatusReasonRequired,
  nextStatuses,
  statusLabelFor,
  statusMeta,
  type StatusEntity,
} from "@/lib/status-workflows";

interface StatusWorkflowControlProps {
  entity: StatusEntity;
  recordId: string;
  status: string | null | undefined;
  /** Whether the signed-in user may change the status. */
  canChange?: boolean;
  /** React Query keys to refresh after a change (dashboards, tables, analytics). */
  invalidateKeys?: unknown[][];
  /** Compact mode for dense table rows. */
  compact?: boolean;
  className?: string;
}

/**
 * Consistent, selectable status workflow used by Operations and the
 * Holding / Detention Center. Every change goes through the guarded
 * `set_record_status` RPC, which validates the transition and writes an
 * immutable audit trail entry.
 */
export function StatusWorkflowControl({
  entity,
  recordId,
  status,
  canChange,
  invalidateKeys = [],
  compact,
  className,
}: StatusWorkflowControlProps) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const meta = statusMeta(entity, status);
  const options = nextStatuses(entity, status);

  const change = useMutation({
    mutationFn: async () => {
      if (!target) return;
      if (isStatusReasonRequired(entity, target) && !reason.trim()) {
        throw new Error("A reason is required for this status change");
      }
      const { error } = await supabase.rpc("set_record_status", {
        _entity: entity,
        _id: recordId,
        _status: target,
        _reason: reason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      const keys: unknown[][] = [
        ["status-history", entity, recordId],
        ...invalidateKeys,
      ];
      keys.forEach((key) => qc.invalidateQueries({ queryKey: key as any }));
      toast.success(`Status updated to ${statusLabelFor(entity, target!)}`);
      setTarget(null);
      setReason("");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not update status"),
  });

  const badge = (
    <Badge className={meta.badgeClass}>
      {meta.label}
      {canChange && options.length > 0 && <ChevronDown className="ml-1 h-3 w-3" aria-hidden="true" />}
    </Badge>
  );

  return (
    <div className={className}>
      <div className="flex items-center gap-1">
        {canChange && options.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Change status — currently ${meta.label}`}
                className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {badge}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel className="text-xs">Change status to</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {options.map((o) => (
                <DropdownMenuItem
                  key={o.value}
                  onSelect={() => {
                    setReason("");
                    setTarget(o.value);
                  }}
                  className="gap-2"
                >
                  <span className={`h-2 w-2 rounded-full ${o.dotClass}`} aria-hidden="true" />
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          badge
        )}
        {!compact && <StatusHistoryButton entity={entity} recordId={recordId} />}
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Mark as {target ? statusLabelFor(entity, target) : ""}
            </DialogTitle>
            <DialogDescription>
              This change is recorded in the status audit trail with your name and the time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="status-reason">
              Reason {target && isStatusReasonRequired(entity, target) ? "*" : "(optional)"}
            </Label>
            <Textarea
              id="status-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Briefly explain why the status is changing…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => change.mutate()}
              disabled={
                change.isPending ||
                (!!target && isStatusReasonRequired(entity, target) && !reason.trim())
              }
              className="gap-2"
            >
              {change.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusHistoryButton({ entity, recordId }: { entity: StatusEntity; recordId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        aria-label="View status history"
        onClick={() => setOpen(true)}
      >
        <History className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Status audit trail</DialogTitle>
            <DialogDescription>Every recorded status change for this record.</DialogDescription>
          </DialogHeader>
          <StatusHistoryList entity={entity} recordId={recordId} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function StatusHistoryList({
  entity,
  recordId,
}: {
  entity: StatusEntity;
  recordId: string;
}) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["status-history", entity, recordId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("status_change_audit")
        .select("id, from_status, to_status, reason, created_at, changed_by")
        .eq("entity_table", entity)
        .eq("record_id", recordId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((r) => r.changed_by).filter(Boolean))] as string[];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: people } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", ids);
        names = Object.fromEntries(
          (people ?? []).map((p: any) => [p.user_id, `${p.first_name} ${p.last_name}`]),
        );
      }
      return (data ?? []).map((r) => ({ ...r, actor: names[r.changed_by ?? ""] ?? "—" }));
    },
  });

  if (isLoading) {
    return (
      <p className="py-4 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
      </p>
    );
  }
  if (data.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">No status changes recorded yet.</p>;
  }
  return (
    <ol className="space-y-3 max-h-80 overflow-y-auto">
      {data.map((r) => (
        <li key={r.id} className="border-l-2 border-primary/40 pl-3">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Badge variant="outline" className="text-[10px]">
              {statusLabelFor(entity, r.from_status)}
            </Badge>
            <span className="text-muted-foreground">→</span>
            <Badge className={`text-[10px] ${statusMeta(entity, r.to_status).badgeClass}`}>
              {statusLabelFor(entity, r.to_status)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {r.actor} · {formatDateTime(r.created_at)}
          </p>
          {r.reason && <p className="text-xs mt-1">{r.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
