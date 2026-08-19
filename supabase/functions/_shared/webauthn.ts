// Shared helpers for the WebAuthn / FIDO2 (biometric passkey) edge functions.
//
// Security notes:
//   * No biometric data ever reaches the server. Only the device-held public
//     key, credential id and signature counter are persisted.
//   * The Relying Party ID is derived from the request Origin, so the same
//     functions work on the preview URL, the published URL and the custom
//     domain without configuration.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, authorization, x-client-info, apikey, content-type, x-cybernet-app",
};

export const RP_NAME = "Cybernet HRM System";

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return (fwd.split(",")[0] || req.headers.get("cf-connecting-ip") || "unknown").trim();
}

/** Origin + RP ID for this request. Rejects anything that is not https (or localhost). */
export function relyingParty(req: Request): { origin: string; rpID: string } | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !isLocal) return null;
  return { origin, rpID: url.hostname };
}

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Validates the caller's JWT and returns their user id, or null. */
export async function authenticatedUser(req: Request): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}

export function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function bytesFromB64url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type AuditEvent =
  | "enroll"
  | "authenticate_success"
  | "authenticate_failure"
  | "revoke"
  | "settings_change"
  | "stepup_success"
  | "stepup_failure";

// deno-lint-ignore no-explicit-any
export async function audit(db: any, req: Request, event: AuditEvent, fields: Record<string, unknown> = {}) {
  try {
    await db.from("webauthn_audit").insert({
      event,
      ip_address: clientIp(req),
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 400),
      ...fields,
    });
  } catch (_e) { /* audit is best-effort, never blocks the flow */ }
}

/** Stores a challenge and returns it. */
// deno-lint-ignore no-explicit-any
export async function storeChallenge(db: any, params: {
  challenge: string;
  purpose: "register" | "login" | "stepup";
  userId?: string | null;
  staffId?: string | null;
  ttlSeconds?: number;
}) {
  const expires = new Date(Date.now() + (params.ttlSeconds ?? 120) * 1000).toISOString();
  await db.from("webauthn_challenges").insert({
    challenge: params.challenge,
    purpose: params.purpose,
    user_id: params.userId ?? null,
    staff_id: params.staffId ?? null,
    expires_at: expires,
  });
}

/** Consumes a challenge once. Returns the row or null when invalid/expired. */
// deno-lint-ignore no-explicit-any
export async function consumeChallenge(db: any, challenge: string, purpose: string) {
  const { data } = await db
    .from("webauthn_challenges")
    .select("*")
    .eq("challenge", challenge)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  await db.from("webauthn_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", data.id);
  return data;
}

export function deviceLabelFromUserAgent(ua: string): string {
  const s = ua || "";
  const platform = /iPhone/.test(s)
    ? "iPhone"
    : /iPad/.test(s)
    ? "iPad"
    : /Android/.test(s)
    ? "Android device"
    : /Macintosh|Mac OS X/.test(s)
    ? "Mac"
    : /Windows/.test(s)
    ? "Windows PC"
    : /Linux/.test(s)
    ? "Linux PC"
    : "Device";
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /OPR\//.test(s)
    ? "Opera"
    : /Chrome\//.test(s)
    ? "Chrome"
    : /Firefox\//.test(s)
    ? "Firefox"
    : /Safari\//.test(s)
    ? "Safari"
    : "Browser";
  return `${platform} — ${browser}`;
}
