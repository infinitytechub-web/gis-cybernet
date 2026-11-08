import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useRbac } from "@/hooks/useRbac";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTodayDuty, dutyFor } from "@/hooks/useTodayDuty";
import { usePagedList } from "@/hooks/usePagedList";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ListPagination } from "@/components/ui/list-pagination";
import { DutyStatusBadge } from "@/components/shared/DutyStatusBadge";
import { filterQuickUsers, maskQuickId, type QuickUserRow } from "@/lib/quick-user-search";

/** Type-to-search across officers the viewer is already allowed to see (server-scoped directory). */
export function QuickUserSearch() {
  const { role } = useAuth();
  const { canPath } = useRbac();
  const [q, setQ] = useState("");
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["quick-user-search-rows"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("staff_directory_rows");
      if (error) throw error;
      return (data ?? []) as QuickUserRow[];
    },
  });
  const { data: duty } = useTodayDuty();
  const results = filterQuickUsers(data, q);
  const pager = usePagedList(results, { resetKey: q });
  const fullIds = role === "admin" || role === "oic" || role === "2ic";
  return (
    <section aria-label="Quick user search" className="space-y-3">
      <div>
        <Label htmlFor="quick-user-search">Quick user search</Label>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input id="quick-user-search" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} className="pl-9" placeholder="Name, staff ID, rank or unit" />
        </div>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading officers…</p>}
      {error && <p className="text-sm text-destructive">Could not load officers. Please retry.</p>}
      {!isLoading && q.trim().length >= 2 && <p className="text-sm text-muted-foreground" aria-live="polite">{results.length} officer{results.length === 1 ? "" : "s"} found</p>}
      {q.trim().length < 2 && !isLoading && <p className="text-sm text-muted-foreground">Type at least two characters to search officers in your command.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pager.pageItems.map(r => {
          const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unnamed";
          return (
            <Card key={r.id}><CardContent className="flex items-center gap-3 p-3">
              <Avatar className="h-11 w-11"><AvatarImage src={r.photo_url ?? undefined} alt="" /><AvatarFallback>{name.slice(0, 2)}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1 space-y-1">
                {canPath(`/staff/${r.id}`) ? <Link to={`/staff/${r.id}`} className="block truncate font-medium hover:underline">{name}</Link> : <span className="block truncate font-medium">{name}</span>}
                <p className="truncate text-xs text-muted-foreground">{maskQuickId(r.staff_id, fullIds)} · {r.rank_abbreviation ?? r.rank_name ?? "No rank"} · {r.unit ?? "No unit"}</p>
                <DutyStatusBadge state={dutyFor(duty, r.id)} />
              </div>
            </CardContent></Card>
          );
        })}
      </div>
      {results.length > 0 && <ListPagination {...pager} label="officers" />}
    </section>
  );
}
