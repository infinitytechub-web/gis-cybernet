import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck, XCircle, Pencil, RotateCcw, Ban } from "lucide-react";
import { format } from "date-fns";

type EntityType = "leave_request" | "posting_transfer";

interface Props {
  entityType: EntityType;
  entityId: string;
}

type ChangedField = { old: unknown; new: unknown };

interface AuditRow {
  id: string;
  action: string;
  actor_role: string | null;
  previous_status: string | null;
  new_status: string | null;
  changed_fields: Record<string, ChangedField> | null;
  notes: string | null;
  created_at: string;
  actor: {
    first_name: string;
    last_name: string;
    ranks: { abbreviation: string } | null;
  } | null;
}

const ACTION_META: Record<string, { label: string; icon: typeof ShieldCheck; tone: string }> = {
  approved: { label: "Approved", icon: ShieldCheck, tone: "text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "Rejected", icon: XCircle, tone: "text-destructive" },
  edited: { label: "Edited", icon: Pencil, tone: "text-amber-600 dark:text-amber-400" },
  reverted_to_pending: { label: "Reverted to pending", icon: RotateCcw, tone: "text-muted-foreground" },
  cancelled: { label: "Cancelled", icon: Ban, tone: "text-muted-foreground" },
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/**
 * Read-only timeline showing every approval, rejection, or edit performed on a
 * leave/pass request, posting, or transfer. Backed by the
 * `request_approval_audit` table; entries are written by a SECURITY DEFINER
 * trigger so the trail cannot be bypassed or tampered with from the client.
 */
export function ApprovalAuditTrail({ entityType, entityId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["approval-audit", entityType, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_approval_audit")
        .select("id, action, actor_role, previous_status, new_status, changed_fields, notes, created_at, actor:actor_profile_id(first_name, last_name, ranks(abbreviation))")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading approval history…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-sm text-destructive p-3">Couldn't load approval history.</div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic p-3">
        No approval activity yet.
      </div>
    );
  }

  return (
    <ol className="relative border-l border-border ml-3 space-y-4 py-2">
      {data.map((row) => {
        const meta = ACTION_META[row.action] ?? { label: row.action, icon: Pencil, tone: "text-muted-foreground" };
        const Icon = meta.icon;
        const actorName = row.actor
          ? `${row.actor.ranks?.abbreviation ? row.actor.ranks.abbreviation + " " : ""}${row.actor.first_name} ${row.actor.last_name}`
          : "Unknown actor";
        const role = row.actor_role ? row.actor_role.toUpperCase() : "";
        const fields = row.changed_fields ?? {};
        const fieldEntries = Object.entries(fields).filter(([k]) => k !== "status");

        return (
          <li key={row.id} className="ml-4">
            <span className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-background border border-border ${meta.tone}`}>
              <Icon className="h-3 w-3" />
            </span>
            <div className="text-sm">
              <span className={`font-medium ${meta.tone}`}>{meta.label}</span>
              <span className="text-muted-foreground"> by </span>
              <span className="font-medium">{actorName}</span>
              {role && <span className="text-xs text-muted-foreground"> ({role})</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              {format(new Date(row.created_at), "PPp")}
              {row.previous_status && row.new_status && row.previous_status !== row.new_status && (
                <> · status: <span className="font-mono">{row.previous_status}</span> → <span className="font-mono">{row.new_status}</span></>
              )}
            </div>
            {fieldEntries.length > 0 && (
              <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                {fieldEntries.map(([k, v]) => (
                  <li key={k}>
                    <span className="font-medium text-foreground">{k}:</span>{" "}
                    <span className="font-mono">{formatValue(v.old)}</span>
                    {" → "}
                    <span className="font-mono">{formatValue(v.new)}</span>
                  </li>
                ))}
              </ul>
            )}
            {row.notes && (
              <p className="mt-1 text-sm bg-muted/40 border border-border rounded px-2 py-1 whitespace-pre-wrap">
                {row.notes}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
