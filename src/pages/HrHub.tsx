/**
 * SMART HR — one centralised Human Resource workspace for administrators and
 * command tier, spanning every command in the caller's reach.
 *
 * Tabs:
 *   Establishment — the hierarchy (Directorate → Controls) with staff posted
 *                   and appointments held, plus the positions register.
 *   Personnel     — record completeness across the eight bio-data modules.
 *   Availability  — leave balances and approved-leave usage by location.
 *
 * Everything here reads scoped reports, so an officer only ever sees the
 * commands they are entitled to see. Medical and bank details are never
 * surfaced — only whether the module has been completed.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgUnits } from "@/hooks/useOrgScope";
import { useOrgPositions } from "@/components/org/OrgPositionsAdmin";
import { OrgPositionsAdmin } from "@/components/org/OrgPositionsAdmin";
import { EstablishmentBrowser } from "@/components/hr/EstablishmentBrowser";
import { BioDataCompletenessPanel } from "@/components/hr/BioDataCompletenessPanel";
import { LeaveBalanceDashboard } from "@/components/leave/LeaveBalanceDashboard";
import { LeaveUsageDashboard } from "@/components/leave/LeaveUsageDashboard";
import { QuickScroll } from "@/components/ui/quick-scroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  BriefcaseBusiness,
  CalendarClock,
  Crown,
  Network,
  UserCheck,
  Users,
} from "lucide-react";

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "text-primary",
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold leading-tight">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function HrHub() {
  const { data: units = [] } = useOrgUnits();
  const { data: positions = [] } = useOrgPositions();

  const staffStats = useQuery({
    queryKey: ["hr-hub-staff-stats"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, status, org_unit_id, department_id");
      if (error) throw error;
      const rows = (data ?? []) as {
        id: string;
        status: string | null;
        org_unit_id: string | null;
        department_id: string | null;
      }[];
      return {
        total: rows.length,
        active: rows.filter((r) => r.status === "active").length,
        unposted: rows.filter((r) => r.status === "active" && !r.org_unit_id).length,
      };
    },
  });

  const vacancies = useMemo(() => positions.filter((p) => p.is_vacant).length, [positions]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BriefcaseBusiness className="h-6 w-6 text-primary" aria-hidden="true" />
          Human Resource
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Establishment, personnel records and staff availability across every
          command in your reach.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Staff on strength"
          value={staffStats.data?.active ?? "—"}
          hint={`${staffStats.data?.total ?? 0} records in total`}
        />
        <StatCard
          icon={Network}
          label="Commands & units"
          value={units.length}
          hint="Directorate down to controls"
          tone="text-blue-700 dark:text-blue-300"
        />
        <StatCard
          icon={Crown}
          label="Appointments recorded"
          value={positions.length}
          hint={`${vacancies} vacant`}
          tone="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          icon={UserCheck}
          label="Awaiting a posting"
          value={staffStats.data?.unposted ?? "—"}
          hint="Active staff with no command"
          tone="text-destructive"
        />
      </div>

      <Tabs defaultValue="establishment" className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="establishment">
              <Network className="mr-2 h-4 w-4" aria-hidden="true" /> Establishment
            </TabsTrigger>
            <TabsTrigger value="positions">
              <Crown className="mr-2 h-4 w-4" aria-hidden="true" /> Positions
              {vacancies > 0 && (
                <Badge variant="destructive" className="ml-2">{vacancies}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="personnel">
              <Users className="mr-2 h-4 w-4" aria-hidden="true" /> Personnel records
            </TabsTrigger>
            <TabsTrigger value="availability">
              <CalendarClock className="mr-2 h-4 w-4" aria-hidden="true" /> Availability
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="establishment" className="space-y-4">
          <EstablishmentBrowser />
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          <OrgPositionsAdmin />
        </TabsContent>

        <TabsContent value="personnel" className="space-y-4">
          <BioDataCompletenessPanel />
        </TabsContent>

        <TabsContent value="availability" className="space-y-4">
          <LeaveBalanceDashboard />
          <LeaveUsageDashboard />
        </TabsContent>
      </Tabs>

      <QuickScroll label="HR page" position="fixed" />
    </div>
  );
}
