import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, TrendingUp, Users, Clock, Activity, History } from "lucide-react";
import { format, subDays } from "date-fns";
import {
  yearsOfService, timeUntilRetirement, transferTurnoverRate,
  medianTenureYears, retirementRiskBuckets, mobilityIndex,
} from "@/lib/postings-analytics";
import PostingsTransfersWidget from "./PostingsTransfersWidget";
import type { AppRole } from "@/lib/types";

type TabId = "overview" | "transfers" | "retirement" | "tenure" | "mobility" | "register";

const ROLE_TABS: Record<string, TabId[]> = {
  admin:                    ["overview", "transfers", "retirement", "tenure", "mobility", "register"],
  oic:                      ["overview", "transfers", "retirement", "tenure", "mobility", "register"],
  "2ic":                    ["overview", "transfers", "retirement", "tenure", "mobility", "register"],
  head_of_administration:   ["overview", "transfers", "tenure", "register"],
  chief_staff_officer:      ["overview", "transfers", "tenure", "register"],
  staff_officer:            ["overview", "transfers", "register"],
  supervisor:               ["overview"],
};

const TAB_META: Record<TabId, { label: string; icon: any }> = {
  overview:   { label: "Overview",     icon: Activity },
  transfers:  { label: "Transfers",    icon: ArrowRightLeft },
  retirement: { label: "Retirement",   icon: Clock },
  tenure:     { label: "Tenure",       icon: Users },
  mobility:   { label: "Mobility",     icon: TrendingUp },
  register:   { label: "Register",     icon: History },
};

export default function CommandTierAnalyticsTabs() {
  const { isAdminOrSupervisor, role } = useAuth();
  const navigate = useNavigate();
  const allowed = ROLE_TABS[role as AppRole] ?? ["overview"];
  const [tab, setTab] = useState<TabId>(allowed[0]);

  const since = subDays(new Date(), 90);
  const yearAgo = subDays(new Date(), 365);

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["command-analytics"],
    enabled: isAdminOrSupervisor,
    queryFn: async () => {
      const [profilesRes, transfersRes, ninetyRes, yearRes] = await Promise.all([
        supabase.from("profiles").select("id, date_of_birth, date_joined_service, retirement_age, status").eq("status", "active"),
        supabase.from("postings_transfers").select("id, effective_date, status").eq("status", "approved" as any),
        supabase.from("postings_transfers").select("id, effective_date, status").eq("status", "approved" as any).gte("effective_date", since.toISOString().slice(0, 10)),
        supabase.from("postings_transfers").select("id, effective_date, status").eq("status", "approved" as any).gte("effective_date", yearAgo.toISOString().slice(0, 10)),
      ]);
      return {
        profiles: profilesRes.data ?? [],
        allTransfers: transfersRes.data ?? [],
        last90: ninetyRes.data ?? [],
        last365: yearRes.data ?? [],
      };
    },
  });

  const stats = useMemo(() => {
    const profiles = data?.profiles ?? [];
    const headcount = profiles.length;
    const sep90 = data?.last90.length ?? 0;
    const sep365 = data?.last365.length ?? 0;
    return {
      headcount,
      turnover90: transferTurnoverRate(sep90, headcount, 90),
      turnover365: transferTurnoverRate(sep365, headcount, 365),
      median: medianTenureYears(profiles.map((p: any) => p.date_joined_service)),
      buckets: retirementRiskBuckets(profiles.map((p: any) => ({ dob: p.date_of_birth, retirementAge: p.retirement_age }))),
      mobility: mobilityIndex(sep365, headcount, 365),
      sep90, sep365,
    };
  }, [data]);

  const drillTo = (params: Record<string, string>) => {
    const sp = new URLSearchParams(params);
    navigate(`/postings/history?${sp.toString()}`);
  };

  if (!isAdminOrSupervisor) return null;

  const renderTabContent = () => {
    if (tab === "register") return <PostingsTransfersWidget />;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {tab === "overview" && (
          <>
            <button onClick={() => drillTo({})} className="text-left">
              <Card className="hover:border-primary/50 transition-colors"><CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Active headcount</div>
                <div className="text-2xl font-bold">{stats.headcount}</div>
              </CardContent></Card>
            </button>
            <button onClick={() => drillTo({ from: format(since, "yyyy-MM-dd"), status: "approved" })} className="text-left">
              <Card className="hover:border-primary/50 transition-colors"><CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Transfers (90 days)</div>
                <div className="text-2xl font-bold">{stats.sep90}</div>
                <div className="text-xs text-muted-foreground">{stats.turnover90.toFixed(2)}% annualized (ILO)</div>
              </CardContent></Card>
            </button>
            <button onClick={() => drillTo({ from: format(yearAgo, "yyyy-MM-dd"), status: "approved" })} className="text-left">
              <Card className="hover:border-primary/50 transition-colors"><CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Transfers (12 months)</div>
                <div className="text-2xl font-bold">{stats.sep365}</div>
                <div className="text-xs text-muted-foreground">Mobility index: {stats.mobility.toFixed(3)} / staff·yr</div>
              </CardContent></Card>
            </button>
          </>
        )}

        {tab === "transfers" && (
          <>
            <button onClick={() => drillTo({ from: format(since, "yyyy-MM-dd"), status: "approved" })} className="text-left">
              <Card className="hover:border-primary/50"><CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Last 90 days</div>
                <div className="text-2xl font-bold">{stats.sep90}</div>
              </CardContent></Card>
            </button>
            <button onClick={() => drillTo({ from: format(yearAgo, "yyyy-MM-dd"), status: "approved" })} className="text-left">
              <Card className="hover:border-primary/50"><CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Last 12 months</div>
                <div className="text-2xl font-bold">{stats.sep365}</div>
              </CardContent></Card>
            </button>
            <button onClick={() => drillTo({ status: "pending" })} className="text-left">
              <Card className="hover:border-primary/50"><CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Annualized turnover (90d ILO)</div>
                <div className="text-2xl font-bold">{stats.turnover90.toFixed(2)}%</div>
              </CardContent></Card>
            </button>
          </>
        )}

        {tab === "retirement" && (
          <>
            {[
              { label: "Already retired", v: stats.buckets.retired, key: "retired" },
              { label: "≤ 1 year",  v: stats.buckets.le1y, key: "le1y" },
              { label: "1 – 3 years", v: stats.buckets.oneToThree, key: "13" },
              { label: "3 – 5 years", v: stats.buckets.threeToFive, key: "35" },
              { label: "> 5 years", v: stats.buckets.over5, key: "5+" },
            ].map((b) => (
              <button key={b.key} onClick={() => drillTo({})} className="text-left">
                <Card className="hover:border-primary/50"><CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">{b.label}</div>
                  <div className="text-2xl font-bold">{b.v}</div>
                </CardContent></Card>
              </button>
            ))}
          </>
        )}

        {tab === "tenure" && (
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Median tenure (workforce)</div>
            <div className="text-3xl font-bold">{stats.median.toFixed(1)} <span className="text-base font-normal">years</span></div>
            <p className="text-xs text-muted-foreground mt-2">50th percentile of years of service for active staff.</p>
          </CardContent></Card>
        )}

        {tab === "mobility" && (
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Mobility index</div>
            <div className="text-3xl font-bold">{stats.mobility.toFixed(3)}</div>
            <p className="text-xs text-muted-foreground mt-2">Approved transfers per staff per year (rolling 365 days).</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => drillTo({ from: format(yearAgo, "yyyy-MM-dd"), status: "approved" })}>
              View underlying records
            </Button>
          </CardContent></Card>
        )}
      </div>
    );
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <TrendingUp className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          Postings & Transfers — HR Analytics
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            Data as of: {dataUpdatedAt ? format(new Date(dataUpdatedAt), "dd MMM yyyy HH:mm:ss") : "—"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
          <TabsList className="flex flex-wrap h-auto">
            {allowed.map((t) => {
              const Icon = TAB_META[t].icon;
              return <TabsTrigger key={t} value={t} className="gap-1"><Icon className="h-3 w-3" />{TAB_META[t].label}</TabsTrigger>;
            })}
          </TabsList>
          <TabsContent value={tab} className="mt-4">
            {isLoading ? <p className="text-sm text-muted-foreground">Loading analytics…</p> : renderTabContent()}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
