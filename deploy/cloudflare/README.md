# Cloudflare security-header injection

Two options. Pick **one**. Both inject the four missing headers
(`Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy`) plus the supporting headers (HSTS, COOP, CORP,
`X-Content-Type-Options`, `X-DNS-Prefetch-Control`) regardless of what the
origin returns. Mirrors `public/_headers`, `vercel.json`, and
`deploy/nginx-security-headers.conf` exactly.

## Prerequisite

The zone for `yourdomain.com` must be on Cloudflare with **proxy (orange
cloud) enabled** for the records pointing at Lovable (`185.158.133.1`).
Without the proxy, Cloudflare never sees the response and cannot inject.

---

## Option A — Transform Rule (recommended)

Free on all plans (up to 10 rules). No code, no Worker invocations.

**Dashboard**
1. Cloudflare dashboard → your zone → **Rules → Overview → Create rule →
   Modify Response Header**.
2. Name: `Cybernet — Security Headers Injection`.
3. Switch to **Edit expression** and paste:
   ```
   (http.host eq "yourdomain.com" or http.host eq "www.yourdomain.com")
   ```
4. For each entry in `transform-rule-security-headers.json` →
   `action_parameters.headers`, add a **Set static** action with that
   header name and value.
5. **Deploy**.

**API** (one-shot, requires a token with `Zone.Transform Rules: Edit`):
```bash
ZONE_ID=...
CF_API_TOKEN=...
curl -X POST \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/rulesets/phases/http_response_headers_transform/entrypoint" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data @transform-rule-security-headers.json
```

> Replace `yourdomain.com` in the expression before deploying.

---

## Option B — Worker (use if Transform Rules are unavailable)

```bash
npm i -g wrangler
cd deploy/cloudflare
wrangler login
wrangler deploy
```

Then bind the routes in the dashboard:
**Workers & Pages → `cybernet-security-headers` → Triggers → Add route**:
- `yourdomain.com/*`
- `www.yourdomain.com/*`

Or uncomment the `[[routes]]` blocks in `wrangler.toml` and re-deploy.

---

## Verify

```bash
curl -sI https://yourdomain.com \
  | grep -iE 'content-security-policy|x-frame-options|referrer-policy|permissions-policy|strict-transport-security'
```

All four target headers must appear with the exact values from
`public/_headers`. Re-run [Mozilla
Observatory](https://observatory.mozilla.org/) — grade should jump to **A+**.

## Keeping the policy in sync

If you change CSP/Permissions-Policy in `public/_headers`, also update:
- `vercel.json`
- `deploy/nginx-security-headers.conf`
- `deploy/cloudflare/transform-rule-security-headers.json`
- `deploy/cloudflare/worker-security-headers.js`

The CI security scan flags drift between these files.
