// Private GPS exports: every download checks current creator and recipient access.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";
import { exportAccessAllowed, GPS_EXPORT_ROLES, parseExportPath } from "./access.ts";

const BUCKET = "command-vault";
const responseHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"]}, x-cybernet-app`,
};
export async function handleGpsExport(req: Request) {
  if (req.method === "OPTIONS") return new Response(null, { headers: responseHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const csrf = assertCsrfSafe(req);
  if (!csrf.ok) return csrfDeniedResponse(responseHeaders, csrf.reason);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) throw new Error("Server configuration missing");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Sign-in required" }, 401);
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: identity, error: authError } = await caller.auth.getUser();
    if (authError || !identity.user) return json({ error: "Sign-in required" }, 401);
    const userId = identity.user.id;
    const admin = createClient(url, serviceKey);
    const readRoles = async (id: string): Promise<string[]> => {
      const { data, error } = await admin.from("user_roles").select("role").eq("user_id", id);
      if (error) return []; // Fail closed; never trust a cached role.
      return (data ?? []).map((row: { role: string }) => row.role);
    };
    const callerRoles = await readRoles(userId);
    if (!callerRoles.some((role) => GPS_EXPORT_ROLES.has(role))) return json({ error: "Not permitted" }, 403);
    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "Invalid request" }, 400);
      body = parsed;
    } catch { return json({ error: "Invalid request" }, 400); }
    const scopeAllowed = async (id: string, roles: string[], unitId: string) => {
      if (unitId === "global") return roles.includes("admin");
      const { data, error } = await admin.rpc("command_vault_can_access", { _user_id: id, _org_unit_id: unitId });
      return !error && data === true;
    };
    if (body.action === "download") {
      const target = parseExportPath(body.objectPath);
      if (!target || typeof body.objectPath !== "string") return json({ error: "Download unavailable or expired" }, 404);
      const ownerRoles = await readRoles(target.ownerId);
      const [ownerScope, callerScope] = await Promise.all([
        scopeAllowed(target.ownerId, ownerRoles, target.unitId),
        scopeAllowed(userId, callerRoles, target.unitId),
      ]);
      if (!exportAccessAllowed(ownerRoles, ownerScope) || !exportAccessAllowed(callerRoles, callerScope)) {
        return json({ error: "Download access removed or not permitted" }, 403);
      }
      const { data: file, error } = await admin.storage.from(BUCKET).download(body.objectPath);
      if (error || !file) return json({ error: "Download unavailable" }, 404);
      return new Response(file, { headers: {
        ...responseHeaders, "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${target.filename}"`,
        "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff",
      } });
    }
    if (body.action !== undefined) return json({ error: "Invalid action" }, 400);
    if (typeof body.csv !== "string" || !body.csv.length) return json({ error: "CSV required" }, 400);
    if (new TextEncoder().encode(body.csv).length > 5_000_000) return json({ error: "Export too large" }, 413);
    if (body.filename !== undefined && (typeof body.filename !== "string" || body.filename.length > 255)) return json({ error: "Invalid filename" }, 400);
    if (body.expiresIn !== undefined && (typeof body.expiresIn !== "number" || !Number.isFinite(body.expiresIn))) return json({ error: "Invalid expiry" }, 400);
    if (body.recordCount !== undefined && (typeof body.recordCount !== "number" || !Number.isSafeInteger(body.recordCount) || body.recordCount < 0)) return json({ error: "Invalid record count" }, 400);
    if (body.filtersSummary !== undefined && (typeof body.filtersSummary !== "string" || body.filtersSummary.length > 2000)) return json({ error: "Invalid filters" }, 400);
    const { data: profile, error: profileError } = await admin.from("profiles").select("org_unit_id")
      .eq("user_id", userId).is("deleted_at", null).maybeSingle();
    if (profileError) return json({ error: "Export unavailable" }, 403);
    const unitId = profile?.org_unit_id ?? (callerRoles.includes("admin") ? "global" : null);
    if (!unitId || !await scopeAllowed(userId, callerRoles, unitId)) return json({ error: "Command permission required" }, 403);
    const expiresIn = Math.min(86400, Math.max(300, Math.floor(typeof body.expiresIn === "number" ? body.expiresIn : 3600)));
    const expiresAtMs = Date.now() + expiresIn * 1000;
    const expiresAt = new Date(expiresAtMs).toISOString();
    const name = typeof body.filename === "string" ? body.filename : "gps_export.csv";
    const trimmed = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 116) || "gps_export";
    const filename = trimmed.endsWith(".csv") ? trimmed : `${trimmed}.csv`;
    const objectPath = `gps-auth-exports/${userId}/${unitId}/${expiresAtMs}/${crypto.randomUUID()}_${filename}`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(objectPath, body.csv, {
      contentType: "text/csv; charset=utf-8", upsert: false,
    });
    if (uploadError) return json({ error: "Upload failed" }, 500);
    // Preserve the existing export audit without logging CSV contents.
    await admin.from("front_desk_audit_log").insert({
      action: "gps_cloud_export", entity_type: "gps_addresses", entity_id: userId, performed_by: userId,
      details: { object_path: objectPath, expires_at: expiresAt, record_count: body.recordCount ?? null,
        filters: body.filtersSummary ?? null, filename },
    });
    return json({ success: true, object_path: objectPath, expires_in: expiresIn, expires_at: expiresAt, filename });
  } catch (error) {
    console.error("gps-cloud-export failed", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Download service unavailable" }, 500);
  }
}
if (import.meta.main) Deno.serve(handleGpsExport);
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status,
    headers: { ...responseHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
