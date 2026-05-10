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
