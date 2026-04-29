import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck, XCircle, Pencil, RotateCcw, Ban, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

type EntityType = "leave_request" | "posting_transfer";

interface Props {
  entityType: EntityType;
  entityId: string;
  /** Rows per page. Defaults to 20 — small enough to render fast even on
   *  long histories, large enough to avoid excessive round-trips. */
  pageSize?: number;
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

const SELECT_COLS =
  "id, action, actor_role, previous_status, new_status, changed_fields, notes, created_at, actor:actor_profile_id(first_name, last_name, ranks(abbreviation))";

/**
 * Read-only timeline showing every approval, rejection, or edit performed on a
 * leave/pass request, posting, or transfer. Backed by the
 * `request_approval_audit` table; entries are written by a SECURITY DEFINER
 * trigger so the trail cannot be bypassed or tampered with from the client.
 *
 * Performance:
 *   - Server-side limit (`pageSize`, default 20) on every fetch.
 *   - Keyset pagination on `(created_at DESC, id DESC)` — stable across
 *     concurrent inserts and uses the composite index
 *     `idx_req_audit_entity (entity_type, entity_id, created_at DESC)`.
 *   - "Load older" button only renders when more rows remain.
 */
export function ApprovalAuditTrail({ entityType, entityId, pageSize = 20 }: Props) {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["approval-audit", entityType, entityId, pageSize],
    enabled: !!entityId,
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("request_approval_audit")
        .select(SELECT_COLS)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(pageSize);

      // Keyset cursor: rows strictly older than the last seen row.
      // Falls back to id-based tiebreak when timestamps collide.
      if (pageParam) {
        q = q.or(
          `created_at.lt.${pageParam.created_at},and(created_at.eq.${pageParam.created_at},id.lt.${pageParam.id})`,
        );
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < pageSize) return undefined;
      const last = lastPage[lastPage.length - 1];
      return { created_at: last.created_at, id: last.id };
    },
  });

  const rows = data?.pages.flat() ?? [];

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

  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic p-3">
        No approval activity yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ol className="relative border-l border-border ml-3 space-y-4 py-2">
        {rows.map((row) => {
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

      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            aria-label="Load older approval history"
          >
            {isFetchingNextPage ? (
              <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Loading…</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5 mr-2" /> Load older entries</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
