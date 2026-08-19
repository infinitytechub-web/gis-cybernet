/**
 * FLEET TRACKER INGEST
 *
 * Accepts GPS position batches from vehicle trackers (or a telematics gateway)
 * and writes them to `fleet_positions`, where a database trigger updates the
 * vehicle's live state and raises geofence / speeding / fuel alerts.
 *
 * Auth: `x-fleet-key: <ingest key>`. Keys are stored hashed in
 * `fleet_ingest_keys`; a key may be locked to a single vehicle. No user JWT is
 * involved, so this endpoint never reads or trusts client-side role claims.
 *
 *   POST { positions: [{ device_id | vehicle_id, lat, lng, recorded_at?,
 *                        speed_kph?, heading?, ignition?, odometer_km?,
 *                        fuel_level_pct?, satellites? }] }
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const PositionSchema = z.object({
  device_id: z.string().min(1).max(120).optional(),
  vehicle_id: z.string().uuid().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  recorded_at: z.string().datetime().optional(),
  speed_kph: z.number().min(0).max(400).optional(),
  heading: z.number().min(0).max(360).optional(),
  altitude_m: z.number().min(-500).max(10000).optional(),
  ignition: z.boolean().optional(),
  odometer_km: z.number().min(0).max(10_000_000).optional(),
  fuel_level_pct: z.number().min(0).max(100).optional(),
  satellites: z.number().int().min(0).max(64).optional(),
}).refine((p) => !!(p.device_id || p.vehicle_id), {
  message: "Each position needs a device_id or vehicle_id",
});

const BodySchema = z.object({
  positions: z.array(PositionSchema).min(1).max(500),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const presented = req.headers.get("x-fleet-key") ?? "";
    if (!presented) return json({ error: "Missing ingest key" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const keyHash = await sha256Hex(presented);
    const { data: keyRow } = await supabase
      .from("fleet_ingest_keys")
      .select("id, vehicle_id, active")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (!keyRow || !keyRow.active) return json({ error: "Invalid ingest key" }, 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }

    // Resolve device IDs to vehicles in one round trip.
    const deviceIds = [...new Set(parsed.data.positions.map((p) => p.device_id).filter(Boolean) as string[])];
    const deviceMap = new Map<string, string>();
    if (deviceIds.length > 0) {
      const { data: vehicles } = await supabase
        .from("fleet_vehicles")
        .select("id, device_id")
        .in("device_id", deviceIds);
      for (const v of vehicles ?? []) if (v.device_id) deviceMap.set(v.device_id, v.id);
    }

    const rows: Record<string, unknown>[] = [];
    const rejected: { index: number; reason: string }[] = [];

    parsed.data.positions.forEach((p, index) => {
      const vehicleId = p.vehicle_id ?? (p.device_id ? deviceMap.get(p.device_id) : undefined);
      if (!vehicleId) {
        rejected.push({ index, reason: "unknown vehicle or device" });
        return;
      }
      // A vehicle-scoped key may only report for its own vehicle.
      if (keyRow.vehicle_id && keyRow.vehicle_id !== vehicleId) {
        rejected.push({ index, reason: "key not authorised for this vehicle" });
        return;
      }
      rows.push({
        vehicle_id: vehicleId,
        recorded_at: p.recorded_at ?? new Date().toISOString(),
        lat: p.lat,
        lng: p.lng,
        speed_kph: p.speed_kph ?? null,
        heading: p.heading ?? null,
        altitude_m: p.altitude_m ?? null,
        ignition: p.ignition ?? null,
        odometer_km: p.odometer_km ?? null,
        fuel_level_pct: p.fuel_level_pct ?? null,
        satellites: p.satellites ?? null,
        source: "device",
      });
    });

    let accepted = 0;
    if (rows.length > 0) {
      // Insert sequentially per vehicle in timestamp order so the trigger sees
      // movement in the right sequence (geofence enter/exit depends on it).
      rows.sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)));
      for (const row of rows) {
        const { error } = await supabase.from("fleet_positions").insert(row);
        if (error) rejected.push({ index: accepted, reason: "insert failed" });
        else accepted += 1;
      }
    }

    await supabase
      .from("fleet_ingest_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRow.id);

    return json({ accepted, rejected });
  } catch (_error) {
    return json({ error: "Unable to process positions" }, 500);
  }
});
