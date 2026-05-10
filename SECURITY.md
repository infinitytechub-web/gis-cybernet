# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in GAR-Cybernet, please email the
security officer at **security@gis.local** with a description of the issue
and steps to reproduce. Please **do not** open a public GitHub issue for
suspected vulnerabilities.

We aim to acknowledge new reports within **2 business days** and to provide a
remediation timeline within **5 business days**.

## Automated Security Scanning

Every push to `main` and every pull request runs the
[`security-scan.yml`](.github/workflows/security-scan.yml) workflow, which
performs four independent checks:

| Check | Tool | What it catches |
|-------|------|-----------------|
| Secrets leak scan | [gitleaks](https://github.com/gitleaks/gitleaks) | API keys, tokens, private keys committed to the repo. Allow-list lives in [`.gitleaks.toml`](.gitleaks.toml). |
| Static analysis | [Semgrep](https://semgrep.dev) (`p/owasp-top-ten`, `p/xss`, `p/react`, `p/secrets`) + ESLint with `eslint-plugin-security` and `eslint-plugin-no-unsanitized` | XSS sinks (`dangerouslySetInnerHTML`, `innerHTML`, unescaped templating), `eval`, child-process spawns, weak RNG, regex DoS. |
| Supabase RLS hygiene | Custom shell linter over `supabase/migrations/*.sql` | New tables that forget `ENABLE ROW LEVEL SECURITY`, permissive `USING (true)` / `WITH CHECK (true)` policies on writes, `SECURITY DEFINER` functions missing `SET search_path`, `GRANT … TO PUBLIC`. |
| Dependency audit | `npm audit --audit-level=high` | High/critical vulnerabilities in production dependencies. |

The workflow also runs **weekly on Mondays at 04:30 UTC** to catch newly
disclosed vulnerabilities in dependencies that were previously clean.

### Failing builds

- Secrets, Semgrep, and dependency checks fail the build on any high/critical
  finding.
- The RLS linter fails on missing-RLS or permissive write policies; it warns
  (without failing) on `SECURITY DEFINER` functions that omit `SET search_path`.
- ESLint security rules fail only on error-level rules; warning-level rules
  (e.g., non-literal filesystem access) surface as annotations.

### Local equivalents

- `npx gitleaks detect --redact` — secrets scan against the working tree.
- `npx semgrep --config p/owasp-top-ten --config p/xss src/` — XSS / OWASP scan.
- `npm audit` — dependency audit.

## Runtime Defences

Beyond CI, the application enforces the following at runtime:

- Strict Content-Security-Policy in [`index.html`](index.html) (no inline
  scripts, allow-listed `connect-src`, `frame-ancestors` self-only).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`.
- Multi-layer firewall (file/url/auth/WAF) with quarantine + admin review.
- Hash-chained immutable audit log with daily anchor.
- Server-side IP discovery and geolocation proxy
  (`supabase/functions/client-ip-info`) — staff browsers never call third-party
  IP services directly.
- Row-Level Security on every public table; SECURITY DEFINER RPCs gate writes
  to sensitive tables (e.g., `recycle_bin`, `firewall_threat_entries`).

## Server-side HTTP security headers

The same policy that ships in the `<meta>` fallback in `index.html` is also
delivered as **HTTP response headers** so directives that browsers ignore in
meta form (notably `frame-ancestors`, `X-Frame-Options`, and HSTS) are
enforced at the transport layer. Pick the file that matches your host:

| Host | File | How it is consumed |
|------|------|--------------------|
| Cloudflare Pages, Netlify, Render static sites | [`public/_headers`](public/_headers) | Copied verbatim into the build output and applied per route. |
| Vercel | [`vercel.json`](vercel.json) | `headers[]` block applied to every path. |
| Self-hosted nginx | [`deploy/nginx-security-headers.conf`](deploy/nginx-security-headers.conf) | `include` from your `server { … }` block. |

### Headers sent

- `Content-Security-Policy` — same allow-list as the meta tag (no inline
  scripts, scoped `connect-src`, `frame-ancestors 'self'`).
- `X-Frame-Options: SAMEORIGIN` — legacy clickjacking protection for browsers
  that pre-date CSP `frame-ancestors`.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` —
  forces HTTPS for a year, eligible for HSTS preload submission.
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — disables camera/mic/payment/USB/sensors by default;
  geolocation limited to same origin.
- `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Resource-Policy: same-site` — isolates the browsing context
  from cross-origin popup tampering.

### Verifying

After deploying, run:

```bash
curl -sSI https://gis-cybernet.lovable.app/ | grep -iE 'content-security|frame|hsts|referrer|permissions'
```

or paste the URL into <https://securityheaders.com>. Target grade: **A**.


## Cross-Site Request Forgery (CSRF)

Cybernet uses **Supabase JWT Bearer tokens** stored in `localStorage` for all
authenticated calls. Browsers do not auto-attach `localStorage` values to
cross-site requests, so the **classic cookie-CSRF threat does not apply** to
the REST/RPC/Storage/Functions surface.

Two additional defences are in place anyway:

1. **Custom request header on every state-changing call.**
   `src/lib/csrf-fetch.ts` patches `window.fetch` at startup to attach
   `x-cybernet-app: cybernet-web` to every non-GET/HEAD/OPTIONS request. Because
   browsers refuse to send custom headers on cross-origin form submissions
   without a CORS preflight (which our edge functions deny for unknown
   origins), a third-party page that somehow obtained a user's bearer token
   still cannot trigger a write.

2. **Origin + custom-header verification on the edge.**
   `supabase/functions/_shared/csrf.ts` exports `assertCsrfSafe(req)` for any
   state-changing edge function:

   ```ts
   import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";

   const csrf = assertCsrfSafe(req);
   if (!csrf.ok) return csrfDeniedResponse(corsHeaders, csrf.reason);
   ```

   The check rejects any non-safe method whose `Origin`/`Referer` is not on
   the allow-list (`*.lovable.app`, `*.lovableproject.com`, the published
   Cybernet domain) **or** that lacks the `x-cybernet-app` header. Cron and
   service-role callers (already authenticated via
   `_shared/cron-auth.ts`) bypass the check automatically.

   **Currently protected** (browser-invokable, state-changing):
   `admin-delete-staff-account`, `admin-reset-password`,
   `bulk-create-accounts`, `bulk-upload-staff`,
   `interlink-resend-notification`, `reset-and-create-accounts`,
   `send-record-email`, `send-transactional-email`, `sign-export`,
   `system-backup`, `system-backup-restore`, `verify-shift-auth`,
   `gps-cloud-export`, `preview-transactional-email`. Each function also
   adds `x-cybernet-app` to its `Access-Control-Allow-Headers` so the
   browser preflight succeeds.

   **Intentionally exempt**: cron-only handlers (`run-*`,
   `*-scheduler`, `*-dispatcher`, `process-email-queue`,
   `refresh-threat-feeds`, `system-backup-cleanup`,
   `attendance-compliance-report`, `generate-scheduled-report`,
   `email-domain-recheck`, `role-based-notifier`), public webhooks
   (`handle-email-suppression`, `handle-email-unsubscribe`), and read-only
   GET endpoints (`client-ip-info`, `maps-tile-proxy`).


3. **SameSite cookies.**
   The only application cookie (`sidebar:state`, set in `components/ui/sidebar.tsx`)
   uses `SameSite=Lax; Secure`. No other cookies are issued by client code;
   Supabase's auth tokens live in `localStorage`, not cookies.

### Adding CSRF protection to a new edge function

```ts
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { assertCsrfSafe, csrfDeniedResponse } from "../_shared/csrf.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const csrf = assertCsrfSafe(req);
  if (!csrf.ok) return csrfDeniedResponse(corsHeaders, csrf.reason);
  // … your handler …
});
```

## Subresource Integrity (SRI) for third-party assets

We follow a **"self-host first, SRI second"** policy:

1. **Self-host all executable third-party code.** The Cybernet app loads zero
   `<script>` or `<link rel="stylesheet">` tags from external CDNs. Every JS
   bundle (including the `pdfjs-dist` worker used by the duty-roster importer)
   is bundled by Vite and served from our own origin under `/assets/…` with a
   content-hashed filename. This is strictly stronger than SRI: there is no
   third-party origin to compromise in the first place.

2. **CSP allow-list is origin-locked.** `script-src` and `script-src-elem` are
   restricted to `'self'` only — `cdnjs.cloudflare.com` and similar CDNs were
   removed once the pdf.js worker was self-hosted. The browser will refuse to
   execute any injected `<script src="https://attacker.tld/…">` tag.

3. **If you ever add a `<script>` or `<link rel="stylesheet">` from a CDN**,
   you MUST attach both `integrity="sha384-…"` and `crossorigin="anonymous"`
   attributes, AND add the CDN host to `script-src-elem` / `style-src-elem`
   in `index.html`, `public/_headers`, `vercel.json`, and
   `deploy/nginx-security-headers.conf`. Generate the hash with:

   ```bash
   curl -sSL https://cdn.example.com/lib.js | openssl dgst -sha384 -binary | openssl base64 -A
   ```

   Then:

   ```html
   <script
     src="https://cdn.example.com/lib.js"
     integrity="sha384-<hash>"
     crossorigin="anonymous"
     referrerpolicy="no-referrer"
   ></script>
   ```

4. **Tile/image hosts (OSM, CartoCDN, ArcGIS, qrserver) are not in scope** for
   SRI — SRI only applies to `<script>`, `<link rel="stylesheet">`, and
   `<link rel="preload" as="script|style">`. Map tiles and QR images are
   constrained instead by `img-src` in CSP and rendered as non-executable
   raster data.

## Realtime (postgres_changes) RLS enforcement

Supabase Realtime v2+ runs every `postgres_changes` subscription **through the
subscriber's RLS policies** using the JWT we bind via `supabase.realtime.setAuth`
on every auth state change (see `src/contexts/AuthContext.tsx`). A row only
appears on the wire if the subscriber's JWT would be allowed to `SELECT` it.

### Hardening rules for any table added to `supabase_realtime`

1. **`ENABLE ROW LEVEL SECURITY`** is mandatory. Realtime fails closed when RLS
   is off — no rows are streamed.
2. **At least one `SELECT` (or `ALL`) policy must exist**, scoped to
   `authenticated` (not `public`/`anon`) unless the table is genuinely meant
   to broadcast to logged-out clients (currently: none).
3. **Never combine `USING (true)` with a role list containing `anon` or
   `public`.** That would leak every row to every socket. The
   `get_realtime_rls_coverage()` RPC flags this as `permissive_select = true`.
4. **Service-role writes still go through subscriber RLS.** Edge functions
   write as service-role, but Realtime re-evaluates each row against every
   subscriber's JWT before delivery.

### Verifying coverage

Admins (admin / OIC / 2IC) can call:

```sql
SELECT * FROM public.get_realtime_rls_coverage();
```

It returns one row per realtime-published table with `rls_enabled`,
`rls_forced`, `total_policies`, `select_policies`, `anon_reachable`, and
`permissive_select`. Any row where `rls_enabled = false`,
`select_policies = 0`, or `permissive_select = true` is a finding to fix
immediately. Non-admins receive `42501 access denied`.

