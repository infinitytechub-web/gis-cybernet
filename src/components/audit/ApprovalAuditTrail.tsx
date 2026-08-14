import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck, XCircle, Pencil, RotateCcw, Ban, ChevronDown, Filter, Download, FileText, Sheet, X, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  exportAuditAsCSV,
  exportAuditAsPDF,
  type AuditFilters,
} from "@/lib/approval-audit-export";

type EntityType = "leave_request" | "posting_transfer";

interface Props {
  entityType: EntityType;
  entityId: string;
  /** Rows per page. Defaults to 20. */
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
  actor_first_name: string | null;
  actor_last_name: string | null;
  actor_rank_abbrev: string | null;
}

const ACTION_META: Record<string, { label: string; icon: typeof ShieldCheck; tone: string }> = {
  approved:            { label: "Approved",            icon: ShieldCheck, tone: "text-emerald-600 dark:text-emerald-400" },
  rejected:            { label: "Rejected",            icon: XCircle,     tone: "text-destructive" },
  edited:              { label: "Edited",              icon: Pencil,      tone: "text-amber-600 dark:text-amber-400" },
  reverted_to_pending: { label: "Reverted to pending", icon: RotateCcw,   tone: "text-muted-foreground" },
  cancelled:           { label: "Cancelled",           icon: Ban,         tone: "text-muted-foreground" },
};

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "approved",            label: "Approved" },
  { value: "rejected",            label: "Rejected" },
  { value: "edited",              label: "Edited" },
  { value: "reverted_to_pending", label: "Reverted to pending" },
  { value: "cancelled",           label: "Cancelled" },
];

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "admin",         label: "Admin" },
  { value: "oic",           label: "OIC" },
  { value: "2ic",           label: "2IC" },
  { value: "staff_officer", label: "Staff Officer" },
  { value: "supervisor",    label: "Supervisor" },
];

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/**
 * Read-only timeline for the approval audit trail with filters and exports.
 *
 * Reads go through the `search_approval_audit` SECURITY DEFINER RPC, which
 * re-checks the same access rules as the underlying RLS policy
 * (command tier or the request's department supervisor) and caps page size
 * server-side at 200 rows.
 */
export function ApprovalAuditTrail({ entityType, entityId, pageSize = 20 }: Props) {
  const [filterActions, setFilterActions] = useState<string[]>([]);
  const [filterRoles, setFilterRoles] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);
  const [exporting, setExporting] = useState<null | "csv" | "pdf">(null);

  const filters: AuditFilters = useMemo(
    () => ({
      actions: filterActions.length ? filterActions : null,
      actorRoles: filterRoles.length ? filterRoles : null,
      from: fromDate ?? null,
      to: toDate ?? null,
    }),
    [filterActions, filterRoles, fromDate, toDate],
  );

  const filterKey = useMemo(
    () => JSON.stringify({
      actions: filters.actions,
      actorRoles: filters.actorRoles,
      from: filters.from?.toISOString() ?? null,
      to: filters.to?.toISOString() ?? null,
    }),
    [filters],
  );

  const activeCount =
    filterActions.length + filterRoles.length + (fromDate ? 1 : 0) + (toDate ? 1 : 0);

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["approval-audit", entityType, entityId, pageSize, filterKey],
    enabled: !!entityId,
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await (supabase as any).rpc("search_approval_audit", {
        _entity_type: entityType,
        _entity_id: entityId,
        _actions: filters.actions,
        _actor_roles: filters.actorRoles,
        _from: filters.from ? filters.from.toISOString() : null,
        _to: filters.to ? filters.to.toISOString() : null,
        _cursor_created: pageParam?.created_at ?? null,
        _cursor_id: pageParam?.id ?? null,
        _limit: pageSize,
      });
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < pageSize) return undefined;
      const last = lastPage[lastPage.length - 1];
      return { created_at: last.created_at, id: last.id };
    },
  });

  const rows = data?.pages.flat() ?? [];

  const toggleFromArray = (arr: string[], setter: (v: string[]) => void, value: string) => {
    setter(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);
  };

  const clearFilters = () => {
    setFilterActions([]);
    setFilterRoles([]);
    setFromDate(undefined);
    setToDate(undefined);
  };

  const handleExport = async (kind: "csv" | "pdf") => {
    setExporting(kind);
    try {
      const fn = kind === "csv" ? exportAuditAsCSV : exportAuditAsPDF;
      const { count, truncated } = await fn(entityType, entityId, filters);
      if (count === 0) {
        toast.info("No matching audit entries to export.");
      } else if (truncated) {
        toast.warning(`Exported ${count} rows (capped). Narrow your filters to include the rest.`);
      } else {
        toast.success(`Exported ${count} audit ${count === 1 ? "entry" : "entries"}.`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Filter className="h-3.5 w-3.5 mr-2" />
              Filters
              {activeCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5">{activeCount}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3 space-y-3" align="start">
            <div>
              <Label className="text-xs font-semibold">Action</Label>
              <div className="mt-1 grid grid-cols-1 gap-1">
                {ACTION_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={filterActions.includes(opt.value)}
                      onCheckedChange={() => toggleFromArray(filterActions, setFilterActions, opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <Separator />
            <div>
              <Label className="text-xs font-semibold">Actor role</Label>
              <div className="mt-1 grid grid-cols-1 gap-1">
                {ROLE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={filterRoles.includes(opt.value)}
                      onCheckedChange={() => toggleFromArray(filterRoles, setFilterRoles, opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold">From</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn("w-full justify-start mt-1", !fromDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                      {fromDate ? format(fromDate, "dd/MM/yyyy") : "Any"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={setFromDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs font-semibold">To</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn("w-full justify-start mt-1", !toDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                      {toDate ? format(toDate, "dd/MM/yyyy") : "Any"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={setToDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {activeCount > 0 && (
              <Button type="button" variant="ghost" size="sm" className="w-full" onClick={clearFilters}>
                <X className="h-3.5 w-3.5 mr-2" /> Clear all filters
              </Button>
            )}
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={!!exporting || rows.length === 0}>
              {exporting ? (
                <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Exporting…</>
              ) : (
                <><Download className="h-3.5 w-3.5 mr-2" /> Export</>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => handleExport("csv")}>
              <Sheet className="h-4 w-4 mr-2" /> CSV (spreadsheet)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("pdf")}>
              <FileText className="h-4 w-4 mr-2" /> PDF (printable)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {activeCount > 0 && (
          <span className="text-xs text-muted-foreground">
            Filtered · {rows.length}{hasNextPage ? "+" : ""} entries
          </span>
        )}
      </div>

      {/* Timeline / states */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading approval history…
        </div>
      ) : isError ? (
        <div className="text-sm text-destructive p-3">Couldn't load approval history.</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground italic p-3">
          {activeCount > 0 ? "No entries match the current filters." : "No approval activity yet."}
        </div>
      ) : (
        <ol className="relative border-l border-border ml-3 space-y-4 py-2">
          {rows.map((row) => {
            const meta = ACTION_META[row.action] ?? { label: row.action, icon: Pencil, tone: "text-muted-foreground" };
            const Icon = meta.icon;
            const actorName = (row.actor_first_name || row.actor_last_name)
              ? `${row.actor_rank_abbrev ? row.actor_rank_abbrev + " " : ""}${row.actor_first_name ?? ""} ${row.actor_last_name ?? ""}`.trim()
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
                  {format(new Date(row.created_at), "dd/MM/yyyy HH:mm")}
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
      )}

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
