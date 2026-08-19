/**
 * FLEET MANAGEMENT — GPS tracking, geofencing, panic/SOS and fuel monitoring.
 *
 * All data services are real time: the tracker ingest endpoint writes positions,
 * a database trigger updates each vehicle's live state and raises alerts, and
 * this page subscribes to those tables so the map and alert centre follow along.
 */
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Truck, Radio, MapPinned, BellRing, Fuel, Siren, Route, MessageSquare, ShieldAlert, BarChart3, Wrench, Satellite } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRbac } from "@/hooks/useRbac";
import {
  useFleetAlerts, useFleetGeofences, useFleetRealtime, useFleetSummary, useFleetVehicles,
} from "@/hooks/useFleet";
import { FleetLiveTab } from "@/components/fleet/FleetLiveTab";
import { FleetVehiclesTab } from "@/components/fleet/FleetVehiclesTab";
import { FleetGeofencesTab } from "@/components/fleet/FleetGeofencesTab";
import { FleetAlertsTab } from "@/components/fleet/FleetAlertsTab";
import { FleetFuelTab } from "@/components/fleet/FleetFuelTab";
import { FleetReplayTab } from "@/components/fleet/FleetReplayTab";
import { FleetOfflineStatus } from "@/components/fleet/FleetOfflineStatus";
import { FleetCommsTab } from "@/components/fleet/FleetCommsTab";
import { FleetImmobilizerTab } from "@/components/fleet/FleetImmobilizerTab";
import { FleetDashboardTab } from "@/components/fleet/FleetDashboardTab";
import { FleetMaintenanceTab } from "@/components/fleet/FleetMaintenanceTab";
import { FleetGpsFeedTab } from "@/components/fleet/FleetGpsFeedTab";
import { useFleetMessages, useFleetMessagesRealtime, unreadFor } from "@/hooks/useFleetComms";

function Kpi({
  icon: Icon, label, value, hint, tone,
}: { icon: any; label: string; value: string | number; hint?: string; tone?: "default" | "danger" }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className={`rounded-md p-2 ${tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <div className="text-2xl font-semibold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Fleet() {
  const { role } = useAuth();
  const { can } = useRbac();
  const isAdmin = role === "admin";
  const canManage = can("fleet");

  const [tab, setTab] = useState("live");
  const [focusVehicleId, setFocusVehicleId] = useState<string | null>(null);

  useFleetRealtime(true);
  const vehiclesQuery = useFleetVehicles();
  const geofencesQuery = useFleetGeofences(canManage);
  const alertsQuery = useFleetAlerts("all");
  const summaryQuery = useFleetSummary(canManage);
  useFleetMessagesRealtime(true);
  const messagesQuery = useFleetMessages("all");

  const vehicles = vehiclesQuery.data ?? [];
  const geofences = geofencesQuery.data ?? [];
  const alerts = alertsQuery.data ?? [];
  const summary = summaryQuery.data ?? {};

  const unreadFromDrivers = unreadFor(messagesQuery.data ?? [], "driver_to_command");
  const immobilised = vehicles.filter((v) => v.immobilized).length;

  const openAlerts = alerts.filter((a) => a.status === "new").length;
  const openPanic = alerts.filter((a) => a.status === "new" && a.alert_type === "panic").length;

  // Jump straight to the alert centre when a panic comes in while the page is open.
  useEffect(() => {
    if (openPanic > 0 && tab === "live") setTab((t) => t);
  }, [openPanic, tab]);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Truck className="h-6 w-6 text-primary" aria-hidden="true" />
            Fleet Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time vehicle tracking, geofencing, emergency response and fuel oversight.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FleetOfflineStatus />
          {immobilised > 0 && (
            <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
              <ShieldAlert className="mr-1 h-4 w-4" aria-hidden="true" />
              {immobilised} immobilised
            </Badge>
          )}
          {openPanic > 0 && (
            <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
              <Siren className="mr-1 h-4 w-4 animate-pulse" aria-hidden="true" />
              {openPanic} active SOS
            </Badge>
          )}
        </div>

      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={Truck} label="Vehicles on strength" value={vehicles.length}
          hint={`${summary.vehicles_active ?? vehicles.filter((v) => v.status === "active").length} active`} />
        <Kpi icon={Radio} label="Reporting now" value={summary.reporting_now ?? 0}
          hint={`${summary.moving_now ?? 0} moving`} />
        <Kpi icon={Route} label="Distance (24 h)" value={`${summary.distance_24h_km ?? 0} km`} />
        <Kpi icon={Fuel} label="Average fuel" value={summary.avg_fuel_pct != null ? `${summary.avg_fuel_pct}%` : "—"}
          hint={`${summary.low_fuel ?? 0} low`} />
        <Kpi icon={BellRing} label="Open alerts" value={openAlerts}
          hint={`${summary.alerts_24h ?? 0} in last 24 h`} tone={openAlerts > 0 ? "danger" : "default"} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="live"><Radio className="mr-1 h-4 w-4" aria-hidden="true" />Live tracking</TabsTrigger>
            {canManage && (
              <TabsTrigger value="dashboard"><BarChart3 className="mr-1 h-4 w-4" aria-hidden="true" />Dashboard</TabsTrigger>
            )}
            <TabsTrigger value="replay"><Route className="mr-1 h-4 w-4" aria-hidden="true" />Route replay</TabsTrigger>
            <TabsTrigger value="vehicles"><Truck className="mr-1 h-4 w-4" aria-hidden="true" />Vehicles</TabsTrigger>
            {canManage && (
              <TabsTrigger value="geofences"><MapPinned className="mr-1 h-4 w-4" aria-hidden="true" />Geofences</TabsTrigger>
            )}
            <TabsTrigger value="alerts">
              <BellRing className="mr-1 h-4 w-4" aria-hidden="true" />Alerts
              {openAlerts > 0 && <Badge variant="outline" className="ml-2">{openAlerts}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="fuel"><Fuel className="mr-1 h-4 w-4" aria-hidden="true" />Fuel</TabsTrigger>
            <TabsTrigger value="maintenance">
              <Wrench className="mr-1 h-4 w-4" aria-hidden="true" />Maintenance
            </TabsTrigger>
            <TabsTrigger value="comms">
              <MessageSquare className="mr-1 h-4 w-4" aria-hidden="true" />In-cab comms
              {unreadFromDrivers > 0 && <Badge variant="outline" className="ml-2">{unreadFromDrivers}</Badge>}
            </TabsTrigger>
            {canManage && (
              <TabsTrigger value="immobiliser">
                <ShieldAlert className="mr-1 h-4 w-4" aria-hidden="true" />Immobiliser
              </TabsTrigger>
            )}
            {canManage && (
              <TabsTrigger value="gps-feed">
                <Satellite className="mr-1 h-4 w-4" aria-hidden="true" />GPS feed
              </TabsTrigger>
            )}
          </TabsList>
        </div>


        <TabsContent value="live" className="mt-4">
          <FleetLiveTab
            vehicles={vehicles}
            geofences={geofences}
            focusVehicleId={focusVehicleId}
            onFocusVehicle={setFocusVehicleId}
            canManage={canManage}
          />
        </TabsContent>

        {canManage && (
          <TabsContent value="dashboard" className="mt-4">
            <FleetDashboardTab canManage={canManage} />
          </TabsContent>
        )}

        <TabsContent value="replay" className="mt-4">
          <FleetReplayTab vehicles={vehicles} geofences={geofences} initialVehicleId={focusVehicleId} />
        </TabsContent>

        <TabsContent value="vehicles" className="mt-4">
          <FleetVehiclesTab vehicles={vehicles} canManage={canManage} isAdmin={isAdmin} />
        </TabsContent>

        {canManage && (
          <TabsContent value="geofences" className="mt-4">
            <FleetGeofencesTab geofences={geofences} canManage={canManage} />
          </TabsContent>
        )}

        <TabsContent value="alerts" className="mt-4">
          <FleetAlertsTab
            alerts={alerts}
            vehicles={vehicles}
            canManage={canManage}
            onFocusVehicle={(id) => { setFocusVehicleId(id); setTab("live"); }}
          />
        </TabsContent>

        <TabsContent value="fuel" className="mt-4">
          <FleetFuelTab vehicles={vehicles} canManage={canManage} />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-4">
          <FleetMaintenanceTab vehicles={vehiclesQuery.data ?? []} canManage={canManage} />
        </TabsContent>

        <TabsContent value="comms" className="mt-4">
          <FleetCommsTab vehicles={vehicles} canManage={canManage} initialVehicleId={focusVehicleId} />
        </TabsContent>

        {canManage && (
          <TabsContent value="immobiliser" className="mt-4">
            <FleetImmobilizerTab vehicles={vehicles} canManage={canManage} />
          </TabsContent>
        )}

        {canManage && (
          <TabsContent value="gps-feed" className="mt-4">
            <FleetGpsFeedTab vehicles={vehicles} canManage={canManage} isAdmin={isAdmin} />
          </TabsContent>
        )}

      </Tabs>
    </div>
  );
}
