// Upload a generated GPS CSV to Supabase Storage (S3-style backend) and return
// a time-limited signed URL for command-tier download.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_ROLES = new Set(["admin", "oic", "2ic", "staff_officer"]);
const BUCKET = "command-vault";
const PREFIX = "gps-exports";

interface ExportPayload {
  filename?: string;
  csv: string;
  expiresIn?: number; // seconds
  recordCount?: number;
  filtersSummary?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // CSRF defence — verifies same-app origin + custom header for state-changing calls.
  // Internal/service-role/cron callers bypass automatically (see _shared/csrf.ts).
  const __csrf = assertCsrfSafe(req);
  if (!__csrf.ok) return csrfDeniedResponse(corsHeaders, __csrf.reason);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Server configuration missing");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Missing bearer token" }, 401);
    }

    // Verify caller and role using anon-key client + provided JWT.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    // Service-role client for role check + storage write (bypasses RLS).
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roles, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) return json({ error: "Role lookup failed" }, 500);
    const allowed = (roles ?? []).some((r: { role: string }) => ALLOWED_ROLES.has(r.role));
    if (!allowed) {
      return json({ error: "Forbidden — command-tier role required" }, 403);
    }

    const body = (await req.json()) as ExportPayload;
    if (!body || typeof body.csv !== "string" || body.csv.length === 0) {
      return json({ error: "csv body is required" }, 400);
    }
    if (body.csv.length > 5_000_000) {
      return json({ error: "Export too large (max 5MB)" }, 413);
    }

    const expiresIn = clampInt(body.expiresIn ?? 3600, 300, 86_400); // 5 min – 24 h
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = sanitiseFilename(body.filename ?? `gps_addresses_${stamp}.csv`);
    const objectPath = `${PREFIX}/${userId}/${stamp}_${safeName}`;

    const { error: upErr } = await admin.storage.from(BUCKET).upload(objectPath, body.csv, {
      contentType: "text/csv; charset=utf-8",
      upsert: false,
    });
    if (upErr) {
      console.error("Upload error", upErr);
      return json({ error: `Upload failed: ${upErr.message}` }, 500);
    }

    const { data: signed, error: sErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, expiresIn, { download: safeName });
    if (sErr || !signed?.signedUrl) {
      return json({ error: `Sign failed: ${sErr?.message ?? "unknown"}` }, 500);
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Best-effort audit trail.
    try {
      await admin.from("front_desk_audit_log").insert({
        action: "gps_cloud_export",
        entity_type: "gps_addresses",
        entity_id: userId,
        performed_by: userId,
        details: {
          object_path: objectPath,
          expires_at: expiresAt,
          record_count: body.recordCount ?? null,
          filters: body.filtersSummary ?? null,
          filename: safeName,
        },
      });
    } catch (e) {
      console.warn("Audit log skipped", e);
    }

    return json({
      success: true,
      url: signed.signedUrl,
      object_path: objectPath,
      expires_in: expiresIn,
      expires_at: expiresAt,
      filename: safeName,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("gps-cloud-export error", msg);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampInt(v: unknown, min: number, max: number) {
  const n = typeof v === "number" ? Math.floor(v) : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function sanitiseFilename(name: string) {
  const trimmed = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  return trimmed.endsWith(".csv") ? trimmed : `${trimmed}.csv`;
}
