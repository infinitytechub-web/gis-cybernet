/**
 * FLEET MANAGEMENT — shared types, labels and helpers.
 *
 * The database is the source of truth: `fleet_positions` inserts are processed
 * by a trigger that maintains each vehicle's last-known state and raises
 * geofence / speeding / fuel alerts. The UI only reads that state and actions
 * alerts through the authorised RPCs (`fleet_raise_panic`,
 * `fleet_set_alert_status`).
 */
import type { Tables } from "@/integrations/supabase/types";

export type FleetVehicle = Tables<"fleet_vehicles">;
export type FleetPosition = Tables<"fleet_positions">;
export type FleetGeofence = Tables<"fleet_geofences">;
export type FleetAlert = Tables<"fleet_alerts">;
export type FleetFuelReading = Tables<"fleet_fuel_readings">;

export type VehicleStatus = FleetVehicle["status"];
export type AlertType = FleetAlert["alert_type"];
export type AlertSeverity = FleetAlert["severity"];
export type AlertStatus = FleetAlert["status"];

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  active: "Active",
  maintenance: "In maintenance",
  grounded: "Grounded",
  decommissioned: "Decommissioned",
};

export const VEHICLE_STATUS_CLASSES: Record<VehicleStatus, string> = {
  active: "bg-success/15 text-success border-success/30",
  maintenance: "bg-warning/15 text-warning-foreground border-warning/30",
  grounded: "bg-destructive/15 text-destructive border-destructive/30",
  decommissioned: "bg-muted text-muted-foreground border-border",
};

export const VEHICLE_TYPES = [
  "patrol",
  "pickup",
  "saloon",
  "bus",
  "motorcycle",
  "escort",
  "prisoner transport",
  "utility",
] as const;

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  panic: "Panic / SOS",
  geofence_enter: "Zone entry",
  geofence_exit: "Zone exit",
  speeding: "Speeding",
  fuel_drop: "Fuel drop",
  fuel_low: "Low fuel",
  device_offline: "Tracker offline",
  ignition_on: "Ignition on",
  harsh_driving: "Harsh driving",
  door_open: "Door opened",
  boot_open: "Boot opened",
};

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

export const SEVERITY_CLASSES: Record<AlertSeverity, string> = {
  info: "bg-info/15 text-info border-info/30",
  warning: "bg-warning/15 text-warning-foreground border-warning/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

/** A vehicle counts as reporting when its tracker checked in recently. */
export const ONLINE_WINDOW_MS = 15 * 60 * 1000;
/** Moving threshold — filters out GPS jitter while parked. */
export const MOVING_SPEED_KPH = 5;

export type MotionState = "moving" | "idle" | "offline";

export function motionState(vehicle: Pick<FleetVehicle, "last_seen_at" | "last_speed_kph">): MotionState {
  if (!vehicle.last_seen_at) return "offline";
  const age = Date.now() - new Date(vehicle.last_seen_at).getTime();
  if (age > ONLINE_WINDOW_MS) return "offline";
  return Number(vehicle.last_speed_kph ?? 0) > MOVING_SPEED_KPH ? "moving" : "idle";
}

export const MOTION_LABELS: Record<MotionState, string> = {
  moving: "Moving",
  idle: "Stationary",
  offline: "Offline",
};

/** Marker / badge colours per motion state (design tokens only). */
export const MOTION_CLASSES: Record<MotionState, string> = {
  moving: "bg-success/15 text-success border-success/30",
  idle: "bg-info/15 text-info border-info/30",
  offline: "bg-muted text-muted-foreground border-border",
};

export const MOTION_HEX: Record<MotionState, string> = {
  moving: "hsl(142 72% 32%)",
  idle: "hsl(217 91% 45%)",
  offline: "hsl(215 16% 47%)",
};

export function fuelLitres(vehicle: FleetVehicle): number | null {
  if (vehicle.last_fuel_level_pct == null || vehicle.fuel_capacity_litres == null) return null;
  return Number(vehicle.last_fuel_level_pct) / 100 * Number(vehicle.fuel_capacity_litres);
}

export function isLowFuel(vehicle: FleetVehicle): boolean {
  return vehicle.last_fuel_level_pct != null
    && Number(vehicle.last_fuel_level_pct) <= Number(vehicle.low_fuel_threshold_pct ?? 20);
}

export function vehicleLabel(vehicle: Pick<FleetVehicle, "registration_number" | "call_sign">): string {
  return vehicle.call_sign
    ? `${vehicle.registration_number} · ${vehicle.call_sign}`
    : vehicle.registration_number;
}

/** Metres between two coordinates (haversine) — mirrors `fleet_distance_m`. */
export function distanceMetres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Total distance of an ordered track, in kilometres. */
export function trackDistanceKm(points: Array<{ lat: number; lng: number }>): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distanceMetres(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return total / 1000;
}

/** Point-in-polygon test — mirrors `fleet_point_in_polygon` ([lat, lng] pairs). */
export function pointInPolygon(lat: number, lng: number, polygon: Array<[number, number]>): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function parsePolygon(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2)
    .map((p) => [Number(p[0]), Number(p[1])] as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
}

export function geofenceContains(
  fence: Pick<FleetGeofence, "kind" | "center_lat" | "center_lng" | "radius_m" | "polygon">,
  lat: number,
  lng: number,
): boolean {
  if (fence.kind === "circle") {
    if (fence.center_lat == null || fence.center_lng == null) return false;
    return distanceMetres(fence.center_lat, fence.center_lng, lat, lng) <= Number(fence.radius_m ?? 0);
  }
  return pointInPolygon(lat, lng, parsePolygon(fence.polygon));
}

/** Ghana (Greater Accra) fallback view for an empty fleet. */
export const FLEET_DEFAULT_CENTER: [number, number] = [5.6037, -0.187];
