import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsStorekeeperTier, type ProcurementRequest } from "@/hooks/useProcurementRequests";
import { RequestDetailDialog } from "@/components/command/ProcurementTab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ListPagination } from "@/components/ui/list-pagination";
import { usePagedList } from "@/hooks/usePagedList";
import { readRecordPages } from "@/lib/read-record-pages";
import { formatDate } from "@/lib/date-format";
import type { PortalScope } from "@/lib/command-head-portal";

export function CommandPortalProcurement({ scope }: { scope: PortalScope }) {
  const { user } = useAuth();
  const canManage = useIsStorekeeperTier();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const requests = useQuery({
    queryKey: ["command-portal-procurement", user?.id, scope.unitIds.join(",")],
    enabled: !!user && scope.unitIds.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const rows = await readRecordPages((from, to) => supabase.from("purchase_requisitions")
        .select("*").eq("status", "submitted").in("org_unit_id", scope.unitIds)
        .order("created_at", { ascending: false }).order("id").range(from, to));
      return rows.map(row => ({ ...row, items: [] })) as ProcurementRequest[];
    },
  });
  const selected = requests.isError ? undefined : requests.data?.find(row => row.id === selectedId);
  const items = useQuery({
    queryKey: ["command-portal-procurement-items", user?.id, selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      if (!selected) return [];
      return readRecordPages((from, to) => supabase.from("purchase_requisition_items")
        .select("id, requisition_id, item_name, description, quantity, unit, estimated_unit_cost, received_qty, inventory_item_id")
        .eq("requisition_id", selected.id).order("id").range(from, to));
    },
  });
  useEffect(() => {
    if (requests.isSuccess && !requests.isFetching && selectedId && !selected) setSelectedId(null);
  }, [requests.isSuccess, requests.isFetching, selectedId, selected]);
  const rows = requests.isError ? [] : (requests.data ?? []).filter(row =>
    `${row.pr_number} ${row.title} ${row.priority}`.toLowerCase().includes(search.trim().toLowerCase()));
  const pager = usePagedList(rows, { resetKey: search });
  return <section className="space-y-3" aria-label="Command procurement approvals">
    <Input value={search} onChange={event => setSearch(event.target.value)} aria-label="Search pending procurement" placeholder="Search reference or request" className="max-w-md" />
    {requests.isLoading && <p role="status">Loading procurement approvals…</p>}
    {requests.isError && <p role="alert" className="text-sm text-destructive">Procurement approvals could not be loaded. <Button variant="outline" onClick={() => void requests.refetch()}>Retry</Button></p>}
    {requests.isSuccess && !rows.length && <p className="py-6 text-sm text-muted-foreground">No procurement requests awaiting approval.</p>}
    <div className="divide-y">{pager.pageItems.map(row => <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0 flex-1 space-y-1"><p className="text-xs text-muted-foreground">{row.pr_number} · {formatDate(row.submitted_at ?? row.created_at)}</p>
        <h3 className="break-words font-medium">{row.title}</h3><div className="flex flex-wrap items-center gap-2 text-sm"><Badge variant="outline" className="capitalize">{row.priority}</Badge><span>GHS {Number(row.estimated_cost ?? 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div></div>
      <Button variant="outline" size="sm" onClick={() => setSelectedId(row.id)}>{canManage ? "Review & decide" : "View request"}</Button>
    </article>)}</div>
    <ListPagination {...pager} label="procurement approvals" />
    {selected && items.isLoading && <p role="status">Loading request items…</p>}
    {selected && items.isError && <p role="alert" className="text-sm text-destructive">Request details could not be loaded. <Button variant="outline" onClick={() => void items.refetch()}>Retry</Button></p>}
    {selected && items.isSuccess && <RequestDetailDialog key={selected.id} request={{ ...selected, items: items.data }} canManage={canManage} isOwner={selected.requested_by === user?.id} onClose={() => setSelectedId(null)} />}
  </section>;
}