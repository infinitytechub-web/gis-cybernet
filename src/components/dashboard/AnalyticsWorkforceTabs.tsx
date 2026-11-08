import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRbac } from "@/hooks/useRbac";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DutyAvailabilitySummary } from "@/components/hr/DutyAvailabilitySummary";
import { QuickUserSearch } from "@/components/dashboard/QuickUserSearch";
import { APPRAISAL_STATES } from "@/lib/appraisal-workflow";
import { dashboardRetry } from "@/lib/dashboard-integrity";

/** Counts appraisals by workflow stage for the given officers (reads follow existing row-level access). */
export function countAppraisalStates(rows: { workflow_state: string | null }[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, r) => { const k = r.workflow_state ?? "draft"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
}

function AppraisalCounts({ profileIds }: { profileIds: string[] }) {
  const { can } = useRbac();
  const year = new Date().getFullYear();
  const allowed = can("appraisals");
  const q = useQuery({
    queryKey: ["analytics-appraisal-counts", year, profileIds.length, profileIds[0]],
    enabled: allowed && profileIds.length > 0,
    refetchInterval: 60_000,
    retry: dashboardRetry,
    queryFn: async () => {
      const rows: { workflow_state: string | null }[] = [];
      for (let i = 0; i < profileIds.length; i += 100) {
        const { data, error } = await supabase.from("staff_appraisals").select("workflow_state").eq("period_year", year).in("staff_profile_id", profileIds.slice(i, i + 100));
        if (error) throw error;
        rows.push(...((data ?? []) as { workflow_state: string | null }[]));
      }
      return { total: rows.length, byState: countAppraisalStates(rows) };
    },
  });
  if (!allowed) return <p className="text-sm text-muted-foreground">Appraisal access is not assigned to your account.</p>;
  if (q.error) return <p className="text-sm text-destructive">Appraisal figures unavailable.</p>;
  return <div className="space-y-2">
    <p className="text-sm text-muted-foreground">Appraisals for {year} · {q.isLoading ? "…" : q.data?.total ?? 0} total</p>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Object.entries(APPRAISAL_STATES).map(([k, label]) => <Card key={k}><CardContent className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold text-primary">{q.isLoading ? "…" : q.data?.byState[k] ?? 0}</p></CardContent></Card>)}
    </div>
  </div>;
}

export function AnalyticsWorkforceTabs({ unitId, profileIds }: { unitId?: string | null; profileIds: string[] }) {
  return <Tabs defaultValue="duty" className="min-w-0">
    <TabsList className="flex h-auto flex-wrap"><TabsTrigger value="duty">Leave & shifts</TabsTrigger><TabsTrigger value="appraisals">Appraisals</TabsTrigger><TabsTrigger value="quick-search">Quick User Search</TabsTrigger></TabsList>
    <TabsContent value="duty" className="mt-4"><DutyAvailabilitySummary command={unitId ?? "all"} /></TabsContent>
    <TabsContent value="appraisals" className="mt-4"><AppraisalCounts profileIds={profileIds} /></TabsContent>
    <TabsContent value="quick-search" className="mt-4"><QuickUserSearch /></TabsContent>
  </Tabs>;
}
