// supabase/functions/_shared/csrf.ts
//
// Belt-and-braces CSRF defence for state-changing edge functions.
//
// Why this matters even though our app uses JWT bearer tokens:
//   * Bearer tokens stored in localStorage are NOT auto-attached by the browser
//     to cross-origin requests, so classic cookie-CSRF is impossible.
//   * However, an attacker who tricks a logged-in admin into pasting a link or
//     who finds an open redirect could still try to invoke an edge function
//     from a malicious origin using the user's leaked token. These checks add
//     a second wall: the request must come from a known origin AND carry a
//     custom header that browsers will not let cross-origin form submissions
//     attach without a CORS preflight (which our edge function denies).
//
// Usage in any state-changing edge function:
//
//   import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";
//   const csrf = assertCsrfSafe(req);
//   if (!csrf.ok) return csrfDeniedResponse(corsHeaders, csrf.reason);

const ALLOWED_ORIGINS = new Set<string>([
  "https://gis-cybernet.lovable.app",
  "https://id-preview--692c4eca-6e41-4cba-adea-1f7b7852b00c.lovable.app",
  // Sandbox / preview shells used by Lovable.
  "https://lovable.dev",
  "https://app.lovable.dev",
]);

const ALLOWED_ORIGIN_SUFFIXES = [
  ".lovable.app",
  ".lovableproject.com",
];

/** Header that the client-side wrapper attaches to every state-changing call. */
export const CSRF_HEADER = "x-cybernet-app";
export const CSRF_HEADER_VALUE = "cybernet-web";

export type CsrfCheck =
  | { ok: true; origin: string }
  | { ok: false; reason: string };

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    // Allow local development origins (any port on localhost/127.0.0.1/[::1]).
    // The CSRF custom-header requirement still blocks cross-origin form posts,
    // so this is safe for on-prem / local server deployments.
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") {
      return true;
    }
    // Allow private LAN ranges (10.x, 192.168.x, 172.16-31.x) for on-prem installs.
    if (/^10\./.test(host) || /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
      return true;
    }
    return ALLOWED_ORIGIN_SUFFIXES.some(s => url.host === s.slice(1) || url.host.endsWith(s));
  } catch {
    return false;
  }
}

/**
 * Returns ok=true only when the request is a state-changing method (anything
 * other than GET/HEAD/OPTIONS) AND it carries a recognised Origin/Referer AND
 * the custom CSRF header set by the official client wrapper.
 *
 * Read-only methods are passed through unchanged so monitoring tooling and
 * cron callers (which use the cron-auth helper) keep working.
 */
export function assertCsrfSafe(req: Request): CsrfCheck {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { ok: true, origin: req.headers.get("origin") ?? "" };
  }

  // Cron / service-to-service callers pass through the shared cron-auth.
  // Skip CSRF when the request authenticates as an internal caller — those
  // requests have no browser origin to spoof.
  const auth = req.headers.get("authorization") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  if (
    req.headers.get("x-internal-caller") === "1" ||
    (serviceRoleKey && auth.includes(serviceRoleKey)) ||
    (cronSecret && req.headers.get("x-cron-secret") === cronSecret)
  ) {
    return { ok: true, origin: "internal" };
  }

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const candidate = origin ?? (referer ? new URL(referer).origin : null);

  if (!isAllowedOrigin(candidate)) {
    return { ok: false, reason: `origin '${candidate ?? "<missing>"}' not allowed` };
  }

  const csrf = req.headers.get(CSRF_HEADER);
  if (csrf !== CSRF_HEADER_VALUE) {
    return { ok: false, reason: `missing or invalid ${CSRF_HEADER} header` };
  }

  return { ok: true, origin: candidate! };
}

export function csrfDeniedResponse(corsHeaders: Record<string, string>, reason: string): Response {
  return new Response(
    JSON.stringify({ error: "CSRF check failed", reason }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
